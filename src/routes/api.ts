import express from 'express';
import { globalState, getActiveSources, checkSiteStatus } from '../utils/state.js';
import { sourceRegistry } from '../core/registry.js';
import apiLimiter from '../utils/rateLimiter.js';
import authMiddleware from '../utils/authMiddleware.js';
import { sendToJDownloader } from '../utils/jdownloader.js';
import { MediaType, SearchResult } from '../types/source.js';

const router = express.Router();

// ========================= STATUS & CONFIG =========================

router.get('/status', (req, res) => {
    res.json({
        isOffline: globalState.isSiteOffline,
        message: globalState.siteOfflineMessage,
        activeSources: globalState.activeSources,
        availableSources: sourceRegistry.getAvailableNames()
    });
});

router.get('/trending', (req, res) => {
    res.json({ 
        films: globalState.trendingFilms || [], 
        series: globalState.trendingSeries || [],
        isOffline: globalState.isSiteOffline,
        message: globalState.siteOfflineMessage
    });
});

// Toggle sources
router.post('/set-sources', authMiddleware, async (req, res) => {
    const { sources } = req.body;
    if (!Array.isArray(sources)) {
        return res.status(400).json({ error: "Format invalide, un tableau de sources est attendu." });
    }

    const validSources = sources.filter(s => sourceRegistry.has(s));
    globalState.activeSources = validSources;
    console.log(`[Source] Sources actives mises à jour: ${validSources.map(s => s.toUpperCase()).join(', ')}`);

    // Force a status check to update trending films/series and online status for the new sources
    await checkSiteStatus();

    res.json({ success: true, activeSources: globalState.activeSources });
});

// ========================= RECHERCHE =========================

router.post('/search', async (req, res) => {
    const { title, mediaType: rawType = 'film' } = req.body;
    if (!title) return res.status(400).json({ error: "Titre manquant." });

    const mediaType = rawType === 'film' ? 'movie' : (rawType === 'serie' ? 'series' : rawType);

    const sources = getActiveSources();
    if (sources.length === 0) return res.status(500).json({ error: "Aucune source active." });

    console.log(`\n--- Recherche [${sources.map(s => s.name.toUpperCase()).join(', ')}]: "${title}" (${mediaType}) ---`);

    try {
        const resultsPromises = sources.map(async (source) => {
            try {
                return await source.search(title, mediaType as MediaType);
            } catch (e: any) {
                console.error(`Erreur recherche sur ${source.name}:`, e.message);
                return e.message; // Return error message instead of empty array
            }
        });

        const allResultsArrays = await Promise.all(resultsPromises);
        const errors: string[] = [];
        let allResults: SearchResult[] = [];
        
        allResultsArrays.forEach((res, idx) => {
            if (Array.isArray(res)) {
                allResults = allResults.concat(res);
            } else {
                errors.push(`${sources[idx].name}: ${res}`);
            }
        });
        
        if (!allResults.length) {
            if (errors.length > 0) {
                return res.status(500).json({ error: `Erreur(s): ${errors.join(', ')}` });
            }
            return res.status(404).json({ error: "Aucun résultat trouvé." });
        }
        res.json(allResults);
    } catch (error: any) {
        console.error("Erreur /search:", error.message);
        res.status(500).json({ error: `Erreur serveur: ${error.message}` });
    }
});

// ========================= SÉLECTION =========================

const handleSelectContent: express.RequestHandler = async (req, res) => {
    const { hrefPath, title, type, source } = req.body;
    if (!hrefPath || !title || !source) return res.status(400).json({ error: "Données manquantes." });

    const activeSource = sourceRegistry.get(source);
    if (!activeSource) return res.status(500).json({ error: `Source "${source}" introuvable ou inactive.` });

    console.log(`\n--- Sélection [${activeSource.name.toUpperCase()}]: "${title}" ---`);

    try {
        globalState.currentTitleName = title;
        globalState.currentIdentifier = hrefPath;
        globalState.currentSelectionSource = source; // On enregistre la source de cette sélection
        globalState.directUrlMap = {};

        const selection = await activeSource.getSelection(hrefPath, type);

        globalState.isSeries = selection.isSeries;
        globalState.currentLiens = selection.links;
        
        selection.links.forEach((link: any, i: number) => {
            const key = link.id != null ? String(link.id) : String(i);
            if (link.url) globalState.directUrlMap[key] = link.url;
        });

        res.json({ 
            clientOptions: selection.links, 
            hasNextPage: false, 
            seasons: selection.seasons 
        });

    } catch (error: any) {
        console.error("Erreur sélection:", error.message);
        res.status(500).json({ error: `Erreur serveur: ${error.message}` });
    }
};

router.post('/select-movie', apiLimiter, authMiddleware, handleSelectContent);
router.post('/select-trending', apiLimiter, authMiddleware, handleSelectContent);

// ========================= GET LINK =========================

router.post('/get-link', apiLimiter, authMiddleware, async (req, res) => {
    if (req.body.chosenId == null) return res.status(400).json({ error: "ID manquant." });
    const chosenId = String(req.body.chosenId);
    const useJD = req.body.useJD !== false;

    const { currentTitleName, isSeries, directUrlMap, currentSelectionSource } = globalState;
    const activeSource = currentSelectionSource ? sourceRegistry.get(currentSelectionSource) : null;

    console.log(`\n--- Get Link [${activeSource?.name.toUpperCase()}]: ID ${chosenId} pour "${currentTitleName}" (JD: ${useJD}) ---`);

    try {
        let finalLink: string | null = null;

        if (directUrlMap[chosenId]) {
            finalLink = directUrlMap[chosenId];
        } else if (activeSource?.resolveLink) {
            finalLink = await activeSource.resolveLink(chosenId);
        }

        if (!finalLink) throw new Error("Impossible de résoudre le lien.");

        console.log(`🎉 Lien final: ${finalLink}`);

        if (useJD) {
            await sendToJDownloader(finalLink, currentTitleName || 'Unknown', isSeries);
            res.json({ status: 'succès', message: 'Lien envoyé à JDownloader !', link: finalLink });
        } else {
            res.json({ status: 'succès', message: 'Lien récupéré !', link: finalLink });
        }
    } catch (error: any) {
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
    const activeSource = globalState.currentSelectionSource ? sourceRegistry.get(globalState.currentSelectionSource) : null;

    console.log(`\n--- Changement de Saison [${activeSource?.name.toUpperCase()}] (${seasonValue}) ---`);

    try {
        if (!activeSource) throw new Error("Aucune source active.");

        const selection = await activeSource.getSelection(
            globalState.currentIdentifier!,
            undefined,
            seasonValue
        );

        globalState.directUrlMap = {};
        selection.links.forEach((link: any, i: number) => {
            const key = link.id != null ? String(link.id) : String(i);
            if (link.url) globalState.directUrlMap[key] = link.url;
        });
        globalState.currentLiens = selection.links;

        res.json({ clientOptions: selection.links, hasNextPage: false });
    } catch (error: any) {
        console.error("Erreur /select-season:", error.message);
        res.status(500).json({ error: "Erreur lors du changement de saison." });
    }
});

export default router;
