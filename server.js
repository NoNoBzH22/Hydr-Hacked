const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

require('dotenv').config();

// DarkiWorld API module (remplace le scraping Puppeteer)
const { DarkiWorldAPI, formatSize } = require('./darkiworld-api');
const dwApi = new DarkiWorldAPI();

// --- Configuration ---
const CONFIG = {
    BASE_URL: process.env.BASE_URL || 'https://hydracker.com',
    API_PASSWORD: process.env.API_PASSWORD || 'hydracker',
    JD_HOST: process.env.JD_HOST,
    JD_API_PORT: process.env.JD_API_PORT,
    SECRET: process.env.SECRET || 'hydracker-secret-key-12345',
    MIN_MINUTES: parseInt(process.env.MIN_MINUTES, 10) || 15,
    MAX_MINUTES: parseInt(process.env.MAX_MINUTES, 10) || 30,

};

const PATHS = {
    JD_WATCH: '/downloads',
};

const app = express();
const PORT = 3000;
const SERVER_SALT = crypto.randomBytes(16).toString('hex');

const hashPassword = (password, salt) => {
    return crypto.scryptSync(password, salt, 64);
};

const CORRECT_HASH_BUFFER = hashPassword(CONFIG.API_PASSWORD, SERVER_SALT);


// --- Middlewares ---
app.use(cors());
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'"],
        }
    }
}));
app.use(express.json());
app.set('trust proxy', 1);
app.use(cookieParser());
app.use(session({
    store: new FileStore({
        path: './sessions',
        ttl: 48 * 60 * 60,
        retries: 5
    }),
    secret: CONFIG.SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: 'auto',
        maxAge: 48 * 60 * 60 * 1000
    }
}));

const apiLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    max: 100,
    message: { error: 'Trop de requêtes, veuillez réessayer plus tard.' },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
        console.warn(`[Securite] Rate Limit dépassé pour IP: ${req.ip}`);
        res.status(options.statusCode).send(options.message);
    }
});

// --- MIDDLEWARE AUTH ---
const authMiddleware = (req, res, next) => {
    if (req.session.isLoggedIn) {
        next();
    } else {
        res.status(401).json({ error: "Session expirée ou invalide. Veuillez vous reconnecter." });
    }
};



// --- État Global ---
let globalState = {
    currentTitleId: null,
    currentTitleName: null,
    currentSeason: 1,
    currentLiens: [],    // les objets lien bruts de l'API
    directUrlMap: {},    // lienId -> URL directe (films via /download)
    isSeries: false,
    // Trending (conservé)
    isSiteOffline: true,
    siteOfflineMessage: "Vérification du statut du site en cours...",
    isCheckingStatus: false,
    trendingFilms: [],
    trendingSeries: []
};

// --- FONCTIONS UTILITAIRES ---
function parseSizeToMB(sizeStr) {
    if (!sizeStr || sizeStr === 'N/A') return 0;
    const match = sizeStr.match(/([\d.,]+)\s*(gb|mb|ko|kb|tb|go|mo)/i);
    if (!match) return 0;
    let size = parseFloat(match[1].replace(',', '.'));
    const unit = match[2].toLowerCase();
    if (unit.includes('gb') || unit.includes('go')) size *= 1024;
    else if (unit.includes('tb')) size *= 1024 * 1024;
    else if (unit.includes('kb') || unit.includes('ko')) size /= 1024;
    return size;
}

// --- JDownloader ---
async function sendToJDownloader(link, title, isSeries) {
    const fileName = `link_${Date.now()}.crawljob`;
    const filePath = path.join(PATHS.JD_WATCH, fileName);
    const lineEnding = '\r\n';

    const safeLink = link.replace(/[\r\n]/g, '').trim();
    let fileContent = `text=${safeLink}${lineEnding}`;
    fileContent += `autoStart=TRUE${lineEnding}`;

    if (title) {
        const safeTitle = title.replace(/[\r\n<>:"/\\|?*]+/g, '').replace(/\.$/, '').trim();
        fileContent += `packageName=${safeTitle}${lineEnding}`;

        if (isSeries) {
            console.log(`Série (${title}), configuration chemin JD...`);
            const seriesDownloadFolder = `/output/Séries/${safeTitle}`;
            fileContent += `downloadFolder=${seriesDownloadFolder}${lineEnding}`;
            console.log(` -> DownloadFolder: ${seriesDownloadFolder}`);
        } else {
            console.log(`Film (${title}), configuration paquet JD...`);
        }
        console.log(` -> PackageName: ${safeTitle}`);
    }

    try {
        await fs.promises.writeFile(filePath, fileContent);
        await fs.promises.chmod(filePath, 0o666);
        try {
            await fs.promises.chown(filePath, 1000, 1000);
        } catch (e) {
            console.log("Note: Impossible de changer le propriétaire (chown).");
        }
        console.log(`✅ Fichier .crawljob (${fileName}) créé.`);
    } catch (error) {
        console.error(`❌ Erreur JDownloader (${fileName}):`, error.message);
    }
}

// --- Check Site Status (simplifié, HTTP fetch au lieu de Puppeteer) ---
async function checkSiteStatus() {
    if (globalState.isCheckingStatus) return;
    globalState.isCheckingStatus = true;
    console.log("[Vérification] Test du site source...");
    console.log(`[DEBUG] DW_API_KEY: ${process.env.DW_API_KEY ? process.env.DW_API_KEY.substring(0, 10) + '...' : 'NON DÉFINIE'}`);

    try {
        const trendingFilms = await dwApi.getTrending('movie');
        console.log(`[DEBUG] getTrending('movie') a renvoyé: ${JSON.stringify(trendingFilms?.length)} résultats`);
        if (trendingFilms && trendingFilms.length > 0) {
            console.log(`[DEBUG] Premier film: ${JSON.stringify(trendingFilms[0]?.title)}`);
        }
        
        globalState.trendingFilms = trendingFilms;
        
        if (globalState.trendingFilms && globalState.trendingFilms.length > 0) {
            globalState.isSiteOffline = false;
            globalState.siteOfflineMessage = "";
            console.log(`[API] ${globalState.trendingFilms.length} films tendances trouvés.`);

            globalState.trendingSeries = await dwApi.getTrending('series');
            console.log(`[API] ${globalState.trendingSeries.length} séries tendances trouvées.`);
        } else {
            globalState.isSiteOffline = true;
            globalState.siteOfflineMessage = "L'API source est indisponible ou a bloqué la requête.";
            globalState.trendingFilms = [];
            globalState.trendingSeries = [];
            console.log("[DEBUG] Aucun film trending reçu. Le site est marqué offline.");
        }
    } catch (error) {
        console.error(`[ERREUR FATALE API] ${error.message}`);
        globalState.isSiteOffline = true;
        globalState.siteOfflineMessage = "Le site source ne répond pas.";
        globalState.trendingFilms = [];
        globalState.trendingSeries = [];
    } finally {
        globalState.isCheckingStatus = false;
        console.log("[Vérification] Terminée.");
    }
}

// ========================= ROUTES API =========================

// Authentification
app.post('/login', (req, res) => {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: "Mot de passe manquant." });

    try {
        const userHashBuffer = hashPassword(password, SERVER_SALT);
        const passwordMatch = crypto.timingSafeEqual(CORRECT_HASH_BUFFER, userHashBuffer);
        if (passwordMatch) {
            req.session.isLoggedIn = true;
            console.log(`[Auth] Connexion réussie pour ${req.ip}`);
            res.json({ success: true });
        } else {
            setTimeout(() => {
                console.warn(`[Auth] Tentative échouée pour ${req.ip}`);
                res.status(401).json({ error: "Mot de passe API invalide." });
            }, 500);
        }
    } catch (e) {
        res.status(500).json({ error: "Erreur interne du serveur." });
    }
});

app.get('/check-session', (req, res) => {
    res.json({ isLoggedIn: req.session.isLoggedIn || false });
});

app.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) return res.status(500).json({ error: "Échec de la déconnexion." });
        res.clearCookie('connect.sid');
        res.json({ success: true });
    });
});

// Status & Trending
app.get('/status', (req, res) => {
    res.json({ isOffline: globalState.isSiteOffline, message: globalState.siteOfflineMessage });
});

app.get('/trending', (req, res) => {
    res.json({ films: globalState.trendingFilms || [], series: globalState.trendingSeries || [] });
});

// ========================= DARKIWORLD ROUTES (API-BASED) =========================

// Recherche — publique, pas d'auth requise
app.post('/search', async (req, res) => {
    const { title, mediaType = 'film' } = req.body;
    if (!title) return res.status(400).json({ error: "Titre manquant." });

    console.log(`\n--- Recherche API: "${title}" (${mediaType}) ---`);
    const EXCLUDED_TYPES = ['games', 'music', 'app', 'ebook', 'emulation'];
    try {
        let results = await dwApi.search(title);
        results = results.filter(r => !EXCLUDED_TYPES.includes((r.type || '').toLowerCase()));
        const filtered = results.filter(r => {
            const rType = (r.type || (r.is_series ? 'series' : 'movie')).toLowerCase();
            if (mediaType === 'film') {
                return rType === 'movie' || rType === 'animes' || rType === 'doc' || rType === 'other';
            }
            return rType === 'series' || rType === 'serie' || rType === 'animes' || rType === 'doc' || rType === 'other';
        });
        const cards = dwApi.searchResultsToCards(filtered);

        if (!cards.length) return res.status(404).json({ error: "Aucun résultat trouvé." });
        console.log(`Recherche OK. ${cards.length} résultats.`);
        res.json(cards);
    } catch (error) {
        console.error("Erreur /search:", error.message);
        res.status(500).json({ error: `Erreur serveur: ${error.message}` });
    }
});


// Sélection film/série
app.post('/select-movie', apiLimiter, authMiddleware, async (req, res) => {
    const { hrefPath, title, type } = req.body;
    if (!hrefPath || !title) return res.status(400).json({ error: "Données manquantes." });

    console.log(`\n--- Sélection: "${title}" (${hrefPath}) [Type fourni: ${type}] ---`);

    try {
        const match = hrefPath.match(/\/titles\/(\d+)/);
        if (!match) return res.status(400).json({ error: "Format de chemin invalide." });
        const titleId = parseInt(match[1]);

        globalState.currentTitleId = titleId;
        globalState.currentTitleName = title;
        globalState.directUrlMap = {};

        // Détecter si c'est une série
        const seasons = await dwApi.getSeasons(titleId);
        if (type) {
            globalState.isSeries = (type === 'series' || type === 'serie' || type === 'tv');
        } else {
            globalState.isSeries = seasons.length > 0;
        }

        let liens;
        let clientOptions;

        if (!globalState.isSeries) {
            // 🎥 FILM : endpoint gratuit /titles/{id}/download, liens déjà résolus
            liens = await dwApi.getMovieLinks(titleId);
            globalState.currentLiens = liens;
            // Stocker les URLs directes
            liens.forEach(l => { globalState.directUrlMap[l.id] = l.lien; });
            clientOptions = dwApi.liensToClientOptions(liens, false, true);
            console.log(`🎥 Film "${title}" : ${clientOptions.length} liens directs 1fichier (mode gratuit)`);
        } else {
            // 📺 SÉRIE : endpoint authéntifié /liens
            globalState.currentSeason = 1;
            liens = await dwApi.getLiens(titleId, 1);
            globalState.currentLiens = liens;
            clientOptions = dwApi.liensToClientOptions(liens, true, false);
            console.log(`📺 Série "${title}" : ${clientOptions.length} options trouvées`);
        }

        if (!clientOptions.length) return res.status(404).json({ error: "Aucune option 1fichier trouvée." });

        const formattedSeasons = seasons.map(num => ({ label: `Saison ${num}`, value: num }));
        res.json({ clientOptions, hasNextPage: false, seasons: globalState.isSeries ? formattedSeasons : [] });
    } catch (error) {
        console.error("Erreur /select-movie:", error.message);
        res.status(500).json({ error: `Erreur serveur: ${error.message}` });
    }
});

// Sélection tendance
app.post('/select-trending', apiLimiter, authMiddleware, async (req, res) => {
    if (globalState.isCheckingStatus) return res.status(503).json({ error: "Vérification en cours." });
    if (globalState.isSiteOffline) return res.status(503).json({ error: globalState.siteOfflineMessage });

    const { hrefPath, title, type } = req.body;
    if (!hrefPath || !title) return res.status(400).json({ error: "Données manquantes." });

    console.log(`\n--- Sélection Tendance: "${title}" [Type fourni: ${type}] ---`);

    try {
        const match = hrefPath.match(/\/titles\/(\d+)/);
        if (!match) return res.status(400).json({ error: "Format de chemin invalide." });
        const titleId = parseInt(match[1]);

        globalState.currentTitleId = titleId;
        globalState.currentTitleName = title;
        globalState.directUrlMap = {};

        const seasons = await dwApi.getSeasons(titleId);
        if (type) {
            globalState.isSeries = (type === 'series' || type === 'serie' || type === 'tv');
        } else {
            globalState.isSeries = seasons.length > 0;
        }

        let liens;
        let clientOptions;

        if (!globalState.isSeries) {
            // 🎥 FILM : endpoint gratuit
            liens = await dwApi.getMovieLinks(titleId);
            globalState.currentLiens = liens;
            liens.forEach(l => { globalState.directUrlMap[l.id] = l.lien; });
            clientOptions = dwApi.liensToClientOptions(liens, false, true);
            console.log(`🎥 Film tendance "${title}" : ${clientOptions.length} liens directs`);
        } else {
            // 📺 SÉRIE
            globalState.currentSeason = 1;
            liens = await dwApi.getLiens(titleId, 1);
            globalState.currentLiens = liens;
            clientOptions = dwApi.liensToClientOptions(liens, true, false);
            console.log(`📺 Série tendance "${title}" : ${clientOptions.length} options`);
        }

        if (!clientOptions.length) return res.status(404).json({ error: "Aucune option 1fichier trouvée." });

        const formattedSeasons = seasons.map(num => ({ label: `Saison ${num}`, value: num }));
        res.json({ clientOptions, hasNextPage: false, seasons: globalState.isSeries ? formattedSeasons : [] });
    } catch (error) {
        console.error("Erreur /select-trending:", error.message);
        res.status(500).json({ error: `Erreur serveur: ${error.message}` });
    }
});

// Récupération lien final
app.post('/get-link', apiLimiter, authMiddleware, async (req, res) => {
    if (req.body.chosenId == null) return res.status(400).json({ error: "ID manquant." });
    const chosenId = parseInt(req.body.chosenId, 10);
    const useJD = req.body.useJD !== false;

    const { currentTitleName, isSeries, currentLiens, directUrlMap } = globalState;

    const chosenLien = currentLiens.find(l => l.id === chosenId);
    if (!chosenLien) return res.status(400).json({ error: "Lien introuvable. Session expirée ?" });

    console.log(`\n--- Get Link: lien ${chosenId} pour "${currentTitleName}" (JD: ${useJD}) ---`);

    try {
        let finalLink;

        // Si l'URL est déjà résolue (film via /download), on la récupère directement
        if (directUrlMap[chosenId]) {
            finalLink = directUrlMap[chosenId];
            console.log(`🎥 Film — lien direct (sans débridage): ${finalLink.substring(0, 80)}...`);
        } else {
            // Série : appel à downloadLien()
            finalLink = await dwApi.downloadLien(chosenId);
            if (!finalLink) throw new Error("Impossible de résoudre le lien 1fichier.");
        }

        console.log(`🎉 Lien final: ${finalLink}`);

        if (useJD) {
            await sendToJDownloader(finalLink, currentTitleName, isSeries);
            res.json({ status: 'succès', message: 'Lien envoyé à JDownloader !', link: finalLink });
        } else {
            res.json({ status: 'succès', message: 'Lien récupéré !', link: finalLink });
        }
    } catch (error) {
        console.error("Erreur /get-link:", error.message);
        res.status(500).json({ error: `Erreur serveur: ${error.message}` });
    }
});

// Changement de page (pagination) — via API
app.post('/change-page', apiLimiter, authMiddleware, async (req, res) => {
    res.json({ clientOptions: [], hasNextPage: false });
});

// Changement de Saison — via API
app.post('/select-season', apiLimiter, authMiddleware, async (req, res) => {
    const { seasonValue } = req.body;
    const { currentTitleId } = globalState;

    if (!currentTitleId) return res.status(500).json({ error: "Session expirée." });

    console.log(`\n--- Changement de Saison (${seasonValue}) ---`);

    try {
        const season = parseInt(seasonValue, 10);
        globalState.currentSeason = season;

        const liens = await dwApi.getLiens(currentTitleId, season);
        globalState.currentLiens = liens;

        const clientOptions = dwApi.liensToClientOptions(liens, true);

        console.log(`${clientOptions.length} options pour saison ${season}.`);
        res.json({ clientOptions, hasNextPage: false });
    } catch (error) {
        console.error("Erreur /select-season:", error.message);
        res.status(500).json({ error: "Erreur lors du changement de saison." });
    }
});

// ========================= ROUTES CONSERVÉES =========================

// Statut téléchargements JDownloader
app.get('/download-status', apiLimiter, authMiddleware, async (req, res) => {
    const jdQuery = {
        params: [{ "running": true, "name": true, "bytesLoaded": true, "bytesTotal": true, "uuid": true, "packageUUID": true, "finished": true }],
        id: Date.now(), methodName: "queryLinks"
    };
    try {
        const response = await fetch(`http://${CONFIG.JD_HOST}:${CONFIG.JD_API_PORT}/downloadsV2/queryLinks`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(jdQuery)
        });
        if (!response.ok) throw new Error(`API JD non-OK: ${response.status}`);
        const data = await response.json();
        let items = [];
        if (data && data.data) {
            items = data.data.map(item => {
                let percent = 0;
                if (item.bytesTotal > 0) percent = (item.bytesLoaded / item.bytesTotal) * 100;
                if (item.bytesLoaded > 0 && item.bytesLoaded === item.bytesTotal) percent = 100;
                return { name: item.name, percent, uuid: item.uuid, packageUUID: item.packageUUID, finished: item.finished || percent >= 100 };
            });
        }
        res.json(items);
    } catch (error) {
        if (error.code === 'ECONNREFUSED') { res.json([]); }
        else { res.status(500).json({ error: "Erreur API JDownloader" }); }
    }
});

// Suppression d'un lien JDownloader
app.post('/jd/remove-link', apiLimiter, authMiddleware, async (req, res) => {
    const { linkIds } = req.body;
    if (!linkIds || !linkIds.length) return res.status(400).json({ error: 'linkIds requis.' });
    try {
        const response = await fetch(`http://${CONFIG.JD_HOST}:${CONFIG.JD_API_PORT}/downloadsV2/removeLinks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ params: [linkIds, []] })
        });
        if (!response.ok) throw new Error(`API JD non-OK: ${response.status}`);
        console.log(`[JD] Suppression de ${linkIds.length} lien(s).`);
        res.json({ success: true, message: `${linkIds.length} lien(s) supprimé(s).` });
    } catch (error) {
        console.error('[JD] Erreur suppression:', error.message);
        res.status(500).json({ error: 'Erreur lors de la suppression JDownloader.' });
    }
});

// Direct download (manual)
app.post('/direct-download', apiLimiter, authMiddleware, async (req, res) => {
    const { link, title, type, size } = req.body;
    if (!link) return res.status(400).json({ error: "Lien manquant." });
    const safeTitle = title ? title.trim() : "Ajout_Manuel_" + Date.now();
    const isSeries = (type === 'serie');
    const sizeMb = parseSizeToMB(size);
    try {
        await sendToJDownloader(link, safeTitle, isSeries);
        res.json({ message: "Lien envoyé à JDownloader !" });
    } catch (error) { res.status(500).json({ error: "Erreur JDownloader." }); }
});


// --- PROXY IMAGE (HTTP → HTTPS) ---
// Permet au frontend HTTP de charger les posters HTTPS via le serveur
const ALLOWED_IMAGE_HOSTS = [
    'image.tmdb.org',
    'm.media-amazon.com',
    'images-na.ssl-images-amazon.com',
    'ia.media-imdb.com',
    'img.omdbapi.com',
    'cdn.darkiworld.com',
    'hydracker.com',
];

app.get('/proxy-image', async (req, res) => {
    const imageUrl = req.query.url;
    if (!imageUrl) {
        console.warn(`[Proxy Image] ❌ Requête sans URL (query vide)`);
        return res.status(400).send('URL manquante.');
    }

    // Extraire un nom court pour les logs (dernier segment du path)
    let shortName = imageUrl;
    try { shortName = imageUrl.split('/').pop().split('?')[0] || imageUrl; } catch {}

    console.log(`[Proxy Image] 📥 Demande poster: ${shortName} (${imageUrl.substring(0, 100)}...)`);

    try {
        const parsed = new URL(imageUrl);

        // Vérifier protocole
        if (parsed.protocol !== 'https:') {
            console.warn(`[Proxy Image] ❌ Refusé — protocole non-HTTPS: ${parsed.protocol} (${shortName})`);
            return res.status(403).send('Seules les URLs HTTPS sont autorisées.');
        }

        // Vérifier whitelist domaine
        const isAllowed = ALLOWED_IMAGE_HOSTS.some(h => parsed.hostname === h || parsed.hostname.endsWith('.' + h));
        if (!isAllowed) {
            console.warn(`[Proxy Image] ❌ Refusé — domaine non autorisé: ${parsed.hostname} (${shortName})`);
            return res.status(403).send('Domaine non autorisé.');
        }

        const response = await fetch(imageUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
            console.warn(`[Proxy Image] ❌ Refusé — réponse upstream HTTP ${response.status} (${shortName})`);
            return res.status(response.status).send('Erreur upstream.');
        }

        const contentType = response.headers.get('content-type') || 'image/jpeg';
        if (!contentType.startsWith('image/')) {
            console.warn(`[Proxy Image] ❌ Refusé — content-type invalide: ${contentType} (${shortName})`);
            return res.status(403).send('Le contenu n\'est pas une image.');
        }

        // Limiter la taille (5 Mo max)
        const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
        if (contentLength > 5 * 1024 * 1024) {
            console.warn(`[Proxy Image] ❌ Refusé — taille excessive: ${(contentLength / 1024 / 1024).toFixed(1)} Mo (${shortName})`);
            return res.status(413).send('Image trop volumineuse.');
        }

        res.set('Content-Type', contentType);
        res.set('Cache-Control', 'public, max-age=86400'); // Cache 24h
        res.set('X-Proxy-Source', parsed.hostname);

        // Stream la réponse
        const arrayBuffer = await response.arrayBuffer();
        const sizeKo = (arrayBuffer.byteLength / 1024).toFixed(1);
        console.log(`[Proxy Image] ✅ OK — ${shortName} (${contentType}, ${sizeKo} Ko) via ${parsed.hostname}`);
        res.send(Buffer.from(arrayBuffer));
    } catch (error) {
        console.error(`[Proxy Image] ❌ Erreur pour ${shortName}: ${error.message}`);
        res.status(500).send('Erreur proxy image.');
    }
});

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'public')));

// --- Démarrage ---
app.listen(PORT, async () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  Hydr'Hacked — API Server`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Serveur API démarré sur http://localhost:${PORT}`);

    console.log('\n[init] Initialisation API Hydr\'Hacked...');

    // Check site status & trending
    const scheduleNextCheck = () => {
        const randomMinutes = Math.floor(Math.random() * (CONFIG.MAX_MINUTES - CONFIG.MIN_MINUTES + 1)) + CONFIG.MIN_MINUTES;
        console.log(`[Timer] Prochaine vérification dans ${randomMinutes} minutes.`);
        setTimeout(async () => { await checkSiteStatus(); scheduleNextCheck(); }, randomMinutes * 60 * 1000);
    };

    console.log("Lancement de la première vérification...");
    await checkSiteStatus();
    scheduleNextCheck();
});

process.on('SIGINT', async () => { console.log('\nArrêt SIGINT...'); process.exit(0); });
process.on('SIGTERM', async () => { console.log('\nArrêt SIGTERM...'); process.exit(0); });