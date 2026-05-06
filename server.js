const express = require('express');
const session = require('express-session');
const FileStore = require('session-file-store')(session);
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const cors = require('cors');
const path = require('path');

const { CONFIG } = require('./utils/config');
const { globalState, dwApi } = require('./utils/state');

// Import routes
const authRoutes = require('./routes/auth');
const apiRoutes = require('./routes/api');
const jdRoutes = require('./routes/jd');
const proxyRoutes = require('./routes/proxy');

const app = express();
const PORT = CONFIG.PORT;

// Configuration EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middlewares
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

// Route principale EJS
app.get('/', (req, res) => {
    res.render('index');
});

// Enregistrement des routes
app.use('/', authRoutes);
app.use('/', apiRoutes);
app.use('/', jdRoutes);
app.use('/', proxyRoutes);

// Serve frontend static files
app.use(express.static(path.join(__dirname, 'public')));

// Check Site Status
async function checkSiteStatus() {
    if (globalState.isCheckingStatus) return;
    globalState.isCheckingStatus = true;
    console.log("[Vérification] Test du site source...");

    try {
        const trendingFilms = await dwApi.getTrending('movie');
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

// Démarrage
app.listen(PORT, async () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  Hydr'Hacked — API Server`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Serveur API démarré sur http://localhost:${PORT}`);

    console.log('\n[init] Initialisation API Hydr\'Hacked...');

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