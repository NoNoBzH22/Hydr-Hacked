import express from 'express';
import { globalState, getActiveSources, checkSiteStatus } from '../utils/state.js';
import { sourceRegistry } from '../core/registry.js';
import apiLimiter from '../utils/rateLimiter.js';
import authMiddleware from '../utils/authMiddleware.js';
import { sendToJDownloader } from '../utils/jdownloader.js';
import { MediaType, SearchResult } from '../types/source.js';
import { CONFIG } from '../utils/config.js';

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
    const { 
        title, 
        mediaType: rawTypeInput, 
        type: typeInput,
        source: reqSource, 
        src: reqSrc, 
        sources: reqSources,
        mergeResults: reqMergeResults,
        mergeresult: reqMergeResult
    } = req.body;

    // Handle both naming conventions and stringified booleans
    const mergeResults = (reqMergeResults !== undefined ? reqMergeResults : reqMergeResult) !== false && 
                         (reqMergeResults !== 'false' && reqMergeResult !== 'false');

    const rawType = rawTypeInput || typeInput || 'film';
    const mediaType = rawType === 'film' ? 'movie' : (rawType === 'serie' ? 'series' : rawType);

    if (!title) return res.status(400).json({ error: "Titre manquant." });

    // Determine which sources to query
    let sources = getActiveSources();
    const filterSources = reqSources || reqSource || reqSrc;
    
    if (filterSources) {
        const targetNames = Array.isArray(filterSources) ? filterSources : [filterSources];
        sources = sources.filter(s => targetNames.includes(s.name));
    }

    if (sources.length === 0) return res.status(500).json({ error: "Aucune source active correspondant à la demande." });

    console.log(`\n--- Recherche [${sources.map(s => s.name.toUpperCase()).join(', ')}]: "${title}" (${mediaType}) ---`);

    try {
        const resultsPromises = sources.map(async (source) => {
            try {
                const results = await source.search(title, mediaType as MediaType);
                return { sourceName: source.name, results };
            } catch (e: any) {
                console.error(`Erreur recherche sur ${source.name}:`, e.message);
                return { sourceName: source.name, error: e.message };
            }
        });

        const allResultsRaw = await Promise.all(resultsPromises);
        
        if (mergeResults) {
            let allResults: SearchResult[] = [];
            const errors: string[] = [];
            
            allResultsRaw.forEach(item => {
                if (item.results) {
                    allResults = allResults.concat(item.results);
                } else if (item.error) {
                    errors.push(`${item.sourceName}: ${item.error}`);
                }
            });

            if (!allResults.length) {
                if (errors.length > 0) {
                    return res.status(500).json({ error: `Erreur(s): ${errors.join(', ')}` });
                }
                return res.status(404).json({ error: "Aucun résultat trouvé." });
            }
            res.json(allResults);
        } else {
            // Return grouped results
            const grouped: Record<string, SearchResult[] | { error: string }> = {};
            allResultsRaw.forEach(item => {
                grouped[item.sourceName] = item.results || { error: item.error! };
            });
            res.json(grouped);
        }
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

// ========================= JD DOWNLOAD STATUS =========================

router.get('/download-status', apiLimiter, authMiddleware, async (req, res) => {
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
        let items: any[] = [];
        if (data && data.data) {
            items = data.data.map((item: any) => {
                let percent = 0;
                if (item.bytesTotal > 0) percent = (item.bytesLoaded / item.bytesTotal) * 100;
                if (item.bytesLoaded > 0 && item.bytesLoaded === item.bytesTotal) percent = 100;
                return { name: item.name, percent, uuid: item.uuid, packageUUID: item.packageUUID, finished: item.finished || percent >= 100 };
            });
        }
        res.json(items);
    } catch (error: any) {
        if (error.code === 'ECONNREFUSED') { res.json([]); }
        else { res.status(500).json({ error: "Erreur API JDownloader" }); }
    }
});

// Suppression d'un lien JDownloader
router.post('/jd/remove-link', apiLimiter, authMiddleware, async (req, res) => {
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
    } catch (error: any) {
        console.error('[JD] Erreur suppression:', error.message);
        res.status(500).json({ error: 'Erreur lors de la suppression JDownloader.' });
    }
});

export default router;