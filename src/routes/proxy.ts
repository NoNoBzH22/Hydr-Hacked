import express from 'express';

const router = express.Router();

router.get('/proxy-image', async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).send('URL manquante');

    try {
        const response = await fetch(url as string);
        if (!response.ok) throw new Error('Fetch failed');

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const contentType = response.headers.get('content-type') || 'image/jpeg';

        res.set('Content-Type', contentType);
        res.set('Cache-Control', 'public, max-age=86400'); // 24h cache
        res.send(buffer);
    } catch (error) {
        res.status(500).send('Erreur lors du chargement de l\'image');
    }
});

export default router;
