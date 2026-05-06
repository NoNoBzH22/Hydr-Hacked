const express = require('express');
const { CONFIG } = require('../utils/config');
const apiLimiter = require('../utils/rateLimiter');
const authMiddleware = require('../utils/authMiddleware');
const { sendToJDownloader } = require('../utils/jdownloader');

const router = express.Router();

// Statut téléchargements JDownloader
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
    } catch (error) {
        console.error('[JD] Erreur suppression:', error.message);
        res.status(500).json({ error: 'Erreur lors de la suppression JDownloader.' });
    }
});

// Direct download (manual)
router.post('/direct-download', apiLimiter, authMiddleware, async (req, res) => {
    const { link, title, type, size } = req.body;
    if (!link) return res.status(400).json({ error: "Lien manquant." });
    const safeTitle = title ? title.trim() : "Ajout_Manuel_" + Date.now();
    const isSeries = (type === 'serie');
    try {
        await sendToJDownloader(link, safeTitle, isSeries);
        res.json({ message: "Lien envoyé à JDownloader !" });
    } catch (error) { res.status(500).json({ error: "Erreur JDownloader." }); }
});

module.exports = router;
