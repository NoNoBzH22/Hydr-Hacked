import express from 'express';
import authMiddleware from '../utils/authMiddleware.js';

const router = express.Router();

function isBlockedHost(hostname: string) {
    if (hostname === 'localhost' || hostname.endsWith('.local')) return true;
    if (hostname === '[::1]' || hostname === '::1') return true;
    
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const match = hostname.match(ipv4Regex);
    if (match) {
        const p1 = parseInt(match[1]);
        const p2 = parseInt(match[2]);
        if (p1 === 10) return true; // 10.x.x.x
        if (p1 === 127) return true; // 127.x.x.x
        if (p1 === 192 && p2 === 168) return true; // 192.168.x.x
        if (p1 === 172 && p2 >= 16 && p2 <= 31) return true; // 172.16.x.x - 172.31.x.x
        if (p1 === 169 && p2 === 254) return true; // APIPA
        if (p1 === 0) return true; // 0.0.0.0
    }
    return false;
}

router.get('/proxy-image', authMiddleware, async (req, res) => {
    const { url } = req.query;
    if (!url || typeof url !== 'string') return res.status(400).send('URL manquante ou invalide');

    try {
        const parsedUrl = new URL(url);
        
        // 1. Vérification du protocole
        if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
            return res.status(403).send('Protocole non autorisé');
        }

        // 2. Vérification de l'hôte (Black Liste IPs privées / localhost)
        const hostname = parsedUrl.hostname.toLowerCase();
        if (isBlockedHost(hostname)) {
            console.warn(`[Proxy] Tentative bloquée (SSRF) pour l'hôte local ou privé : ${hostname}`);
            return res.status(403).send('Hôte non autorisé pour le proxy');
        }

        const response = await fetch(url);
        if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);

        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const contentType = response.headers.get('content-type') || 'image/jpeg';

        res.set('Content-Type', contentType);
        res.set('Cache-Control', 'public, max-age=86400'); // 24h cache
        res.send(buffer);
    } catch (error: any) {
        res.status(500).send('Erreur lors du chargement de l\'image');
    }
});

export default router;
