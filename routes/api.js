const express = require('express');
const { globalState, dwApi } = require('../utils/state');
const apiLimiter = require('../utils/rateLimiter');
const authMiddleware = require('../utils/authMiddleware');
const { sendToJDownloader } = require('../utils/jdownloader');

const router = express.Router();

// Status & Trending
router.get('/status', (req, res) => {
    res.json({ isOffline: globalState.isSiteOffline, message: globalState.siteOfflineMessage });
});

router.get('/trending', (req, res) => {
    res.json({ films: globalState.trendingFilms || [], series: globalState.trendingSeries || [] });
});

// Recherche
router.post('/search', async (req, res) => {
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
router.post('/select-movie', apiLimiter, authMiddleware, async (req, res) => {
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
            console.log(`🎥 Film "${title}" : ${clientOptions.length} liens directs 1fichier (mode gratuit)`);
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
    } catch (error) {
        console.error("Erreur /select-movie:", error.message);
        res.status(500).json({ error: `Erreur serveur: ${error.message}` });
    }
});

// Sélection tendance
router.post('/select-trending', apiLimiter, authMiddleware, async (req, res) => {
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
            liens = await dwApi.getMovieLinks(titleId);
            globalState.currentLiens = liens;
            liens.forEach(l => { globalState.directUrlMap[l.id] = l.lien; });
            clientOptions = dwApi.liensToClientOptions(liens, false, true);
            console.log(`🎥 Film tendance "${title}" : ${clientOptions.length} liens directs`);
        } else {
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
router.post('/get-link', apiLimiter, authMiddleware, async (req, res) => {
    if (req.body.chosenId == null) return res.status(400).json({ error: "ID manquant." });
    const chosenId = parseInt(req.body.chosenId, 10);
    const useJD = req.body.useJD !== false;

    const { currentTitleName, isSeries, currentLiens, directUrlMap } = globalState;

    const chosenLien = currentLiens.find(l => l.id === chosenId);
    if (!chosenLien) return res.status(400).json({ error: "Lien introuvable. Session expirée ?" });

    console.log(`\n--- Get Link: lien ${chosenId} pour "${currentTitleName}" (JD: ${useJD}) ---`);

    try {
        let finalLink;

        if (directUrlMap[chosenId]) {
            finalLink = directUrlMap[chosenId];
            console.log(`🎥 Film — lien direct (sans débridage): ${finalLink.substring(0, 80)}...`);
        } else {
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

// Changement de page (pagination)
router.post('/change-page', apiLimiter, authMiddleware, async (req, res) => {
    res.json({ clientOptions: [], hasNextPage: false });
});

// Changement de Saison
router.post('/select-season', apiLimiter, authMiddleware, async (req, res) => {
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

module.exports = router;
