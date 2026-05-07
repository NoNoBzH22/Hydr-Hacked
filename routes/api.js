const express = require('express');
const { globalState, dwApi, ztApi, HYDRACKER_AVAILABLE, ZT_AVAILABLE } = require('../utils/state');
const apiLimiter = require('../utils/rateLimiter');
const authMiddleware = require('../utils/authMiddleware');
const { sendToJDownloader } = require('../utils/jdownloader');

const router = express.Router();

// ========================= STATUS & CONFIG =========================

router.get('/status', (req, res) => {
    res.json({
        isOffline: globalState.isSiteOffline,
        message: globalState.siteOfflineMessage,
        source: globalState.currentSource,
        hydrackerAvailable: HYDRACKER_AVAILABLE,
        ztAvailable: ZT_AVAILABLE
    });
});

router.get('/trending', (req, res) => {
    res.json({ films: globalState.trendingFilms || [], series: globalState.trendingSeries || [] });
});

// Toggle source (frontend can switch between ZT and Hydracker)
router.post('/set-source', authMiddleware, (req, res) => {
    const { source } = req.body;
    if (source === 'hydracker' && !HYDRACKER_AVAILABLE) {
        return res.status(400).json({ error: "Hydracker non disponible (BASE_URL ou DW_API_KEY manquant)." });
    }
    if (source === 'zt' && !ZT_AVAILABLE) {
        return res.status(400).json({ error: "Zone-Telechargement non disponible (ZT_BASE_URL manquant)." });
    }
    if (source !== 'zt' && source !== 'hydracker') {
        return res.status(400).json({ error: "Source invalide." });
    }
    globalState.currentSource = source;
    console.log(`[Source] Basculé vers: ${source.toUpperCase()}`);
    res.json({ success: true, source });
});

// ========================= RECHERCHE =========================

router.post('/search', async (req, res) => {
    const { title, mediaType = 'film' } = req.body;
    if (!title) return res.status(400).json({ error: "Titre manquant." });

    const source = globalState.currentSource;
    console.log(`\n--- Recherche [${source.toUpperCase()}]: "${title}" (${mediaType}) ---`);

    try {
        if (source === 'zt') {
            // ============ ZONE-TELECHARGEMENT ============
            if (!ztApi) throw new Error("ZT_BASE_URL non configurée.");
            if (title.length < 4) return res.status(400).json({ error: "La recherche nécessite au moins 4 caractères." });

            const results = await ztApi.search(title, mediaType);
            if (!results.length) return res.status(404).json({ error: "Aucun résultat trouvé." });
            res.json(results);

        } else {
            // ============ HYDRACKER ============
            if (!dwApi) throw new Error("Hydracker non configuré (BASE_URL ou DW_API_KEY manquant).");
            const EXCLUDED_TYPES = ['games', 'music', 'app', 'ebook', 'emulation'];
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
        }
    } catch (error) {
        console.error("Erreur /search:", error.message);
        res.status(500).json({ error: `Erreur serveur: ${error.message}` });
    }
});

// ========================= SÉLECTION =========================

// Shared selection handler for both /select-movie and /select-trending
const handleSelectContent = async (req, res) => {
    const { hrefPath, title, type } = req.body;
    if (!hrefPath || !title) return res.status(400).json({ error: "Données manquantes." });

    const source = globalState.currentSource;
    console.log(`\n--- Sélection [${source.toUpperCase()}]: "${title}" ---`);

    try {
        if (source === 'zt') {
            // ============ ZONE-TELECHARGEMENT ============
            if (!ztApi) throw new Error("ZT_BASE_URL non configurée.");

            globalState.currentTitleName = title;
            globalState.currentZtPageUrl = hrefPath;
            globalState.directUrlMap = {};

            const content = await ztApi.getContentLinks(hrefPath);

            // Store direct URLs
            const clientOptions = ztApi.linksToClientOptions(content.fichierLinks, content.releaseNames);
            clientOptions.forEach((opt, i) => {
                globalState.directUrlMap[i] = content.fichierLinks[i].url;
            });
            globalState.currentLiens = clientOptions;
            globalState.currentZtRelatedSeasons = content.relatedSeasons || [];

            // Determine if series based on URL or related seasons
            globalState.isSeries = hrefPath.includes('/telecharger-serie/') || content.relatedSeasons.length > 0;

            if (!clientOptions.length) return res.status(404).json({ error: "Aucun lien 1fichier trouvé pour ce contenu." });

            // Format related seasons as the frontend expects
            const formattedSeasons = content.relatedSeasons.map((s, i) => ({
                label: s.label,
                value: s.href // For ZT, the "season value" is the page URL
            }));

            console.log(`📦 [ZT] "${title}" : ${clientOptions.length} liens 1fichier, ${formattedSeasons.length} saisons liées`);
            res.json({ clientOptions, hasNextPage: false, seasons: formattedSeasons });

        } else {
            // ============ HYDRACKER ============
            if (!dwApi) throw new Error("Hydracker non configuré.");

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
                liens = await dwApi.getMovieLinks(titleId);
                globalState.currentLiens = liens;
                liens.forEach(l => { globalState.directUrlMap[l.id] = l.lien; });
                clientOptions = dwApi.liensToClientOptions(liens, false, true);
                console.log(`🎥 Film "${title}" : ${clientOptions.length} liens directs 1fichier`);
            } else {
                globalState.currentSeason = 1;
                liens = await dwApi.getLiens(titleId, 1);
                globalState.currentLiens = liens;
                clientOptions = dwApi.liensToClientOptions(liens, true, false);
                console.log(`📺 Série "${title}" : ${clientOptions.length} options trouvées`);
            }

            if (!clientOptions.length) return res.status(404).json({ error: "Aucune option 1fichier trouvée." });

            const formattedSeasons = seasons.map(num => ({ label: `Saison ${num}`, value: num }));
            res.json({ clientOptions, hasNextPage: false, seasons: globalState.isSeries ? formattedSeasons : [] });
        }
    } catch (error) {
        console.error("Erreur sélection:", error.message);
        res.status(500).json({ error: `Erreur serveur: ${error.message}` });
    }
};

router.post('/select-movie', apiLimiter, authMiddleware, handleSelectContent);
router.post('/select-trending', apiLimiter, authMiddleware, handleSelectContent);

// ========================= GET LINK =========================

router.post('/get-link', apiLimiter, authMiddleware, async (req, res) => {
    if (req.body.chosenId == null) return res.status(400).json({ error: "ID manquant." });
    const chosenId = parseInt(req.body.chosenId, 10);
    const useJD = req.body.useJD !== false;

    const { currentTitleName, isSeries, directUrlMap } = globalState;
    const source = globalState.currentSource;

    console.log(`\n--- Get Link [${source.toUpperCase()}]: ID ${chosenId} pour "${currentTitleName}" (JD: ${useJD}) ---`);

    try {
        let finalLink;

        if (source === 'zt') {
            // ZT: links are already decoded and stored in directUrlMap
            finalLink = directUrlMap[chosenId];
            if (!finalLink) throw new Error("Lien introuvable. Refaites la sélection.");
            console.log(`📦 [ZT] Lien direct: ${finalLink}`);
        } else {
            // Hydracker
            if (directUrlMap[chosenId]) {
                finalLink = directUrlMap[chosenId];
                console.log(`🎥 Film — lien direct: ${finalLink.substring(0, 80)}...`);
            } else {
                if (!dwApi) throw new Error("Hydracker non configuré.");
                finalLink = await dwApi.downloadLien(chosenId);
                if (!finalLink) throw new Error("Impossible de résoudre le lien 1fichier.");
            }
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

// ========================= SAISONS =========================

router.post('/change-page', apiLimiter, authMiddleware, async (req, res) => {
    res.json({ clientOptions: [], hasNextPage: false });
});

router.post('/select-season', apiLimiter, authMiddleware, async (req, res) => {
    const { seasonValue } = req.body;
    const source = globalState.currentSource;

    console.log(`\n--- Changement de Saison [${source.toUpperCase()}] (${seasonValue}) ---`);

    try {
        if (source === 'zt') {
            // ZT: seasonValue is a page URL
            if (!ztApi) throw new Error("ZT_BASE_URL non configurée.");

            const content = await ztApi.getContentLinks(seasonValue);
            const clientOptions = ztApi.linksToClientOptions(content.fichierLinks, content.releaseNames);
            
            globalState.directUrlMap = {};
            clientOptions.forEach((opt, i) => {
                globalState.directUrlMap[i] = content.fichierLinks[i].url;
            });
            globalState.currentLiens = clientOptions;

            console.log(`📦 [ZT] ${clientOptions.length} liens pour cette saison.`);
            res.json({ clientOptions, hasNextPage: false });

        } else {
            // Hydracker
            if (!dwApi) throw new Error("Hydracker non configuré.");
            const { currentTitleId } = globalState;
            if (!currentTitleId) return res.status(500).json({ error: "Session expirée." });

            const season = parseInt(seasonValue, 10);
            globalState.currentSeason = season;

            const liens = await dwApi.getLiens(currentTitleId, season);
            globalState.currentLiens = liens;

            const clientOptions = dwApi.liensToClientOptions(liens, true);

            console.log(`${clientOptions.length} options pour saison ${season}.`);
            res.json({ clientOptions, hasNextPage: false });
        }
    } catch (error) {
        console.error("Erreur /select-season:", error.message);
        res.status(500).json({ error: "Erreur lors du changement de saison." });
    }
});

module.exports = router;
