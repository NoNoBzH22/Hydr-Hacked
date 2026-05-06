const express = require('express');

const router = express.Router();

const ALLOWED_IMAGE_HOSTS = [
    'image.tmdb.org',
    'm.media-amazon.com',
    'images-na.ssl-images-amazon.com',
    'ia.media-imdb.com',
    'img.omdbapi.com',
    'cdn.darkiworld.com',
    'hydracker.com',
];

router.get('/proxy-image', async (req, res) => {
    const imageUrl = req.query.url;
    if (!imageUrl) {
        console.warn(`[Proxy Image] ❌ Requête sans URL (query vide)`);
        return res.status(400).send('URL manquante.');
    }

    let shortName = imageUrl;
    try { shortName = imageUrl.split('/').pop().split('?')[0] || imageUrl; } catch { }

    console.log(`[Proxy Image] 📥 Demande poster: ${shortName} (${imageUrl.substring(0, 100)}...)`);

    try {
        const parsed = new URL(imageUrl);

        if (parsed.protocol !== 'https:') {
            console.warn(`[Proxy Image] ❌ Refusé — protocole non-HTTPS: ${parsed.protocol} (${shortName})`);
            return res.status(403).send('Seules les URLs HTTPS sont autorisées.');
        }

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

        const contentLength = parseInt(response.headers.get('content-length') || '0', 10);
        if (contentLength > 5 * 1024 * 1024) {
            console.warn(`[Proxy Image] ❌ Refusé — taille excessive: ${(contentLength / 1024 / 1024).toFixed(1)} Mo (${shortName})`);
            return res.status(413).send('Image trop volumineuse.');
        }

        res.set('Content-Type', contentType);
        res.set('Cache-Control', 'public, max-age=86400');
        res.set('X-Proxy-Source', parsed.hostname);

        const arrayBuffer = await response.arrayBuffer();
        const sizeKo = (arrayBuffer.byteLength / 1024).toFixed(1);
        console.log(`[Proxy Image] ✅ OK — ${shortName} (${contentType}, ${sizeKo} Ko) via ${parsed.hostname}`);
        res.send(Buffer.from(arrayBuffer));
    } catch (error) {
        console.error(`[Proxy Image] ❌ Erreur pour ${shortName}: ${error.message}`);
        res.status(500).send('Erreur proxy image.');
    }
});

module.exports = router;
