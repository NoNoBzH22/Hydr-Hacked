import express from 'express';
import { sendToJDownloader } from '../utils/jdownloader.js';
import authMiddleware from '../utils/authMiddleware.js';

const router = express.Router();

router.post('/jd/add', authMiddleware, async (req, res) => {
    const { link, packageName, isSeries } = req.body;
    if (!link) return res.status(400).json({ error: "Lien manquant." });

    try {
        await sendToJDownloader(link, packageName || 'Manual Add', !!isSeries);
        res.json({ success: true });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
