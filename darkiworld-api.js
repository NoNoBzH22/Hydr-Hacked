/**
 * DarkiWorld API Module
 * Replaces Puppeteer page scraping with direct API calls.
 * Uses a persistent browser session for authenticated endpoints (Turnstile bypass).
 */

const path = require('path');
require('dotenv').config();

const CONFIG_DW = {
    BASE_URL: process.env.BASE_URL',
    API_KEY: process.env.DW_API_KEY,
};

// Quality maps ( By Hand ) 
const QUALITY_MAP = {
    89: "REMUX UHD", 57: "REMUX BLURAY", 92: "REMUX DVD",
    17: "Blu-Ray 1080p", 76: "Blu-Ray 1080p (x265)", 16: "Blu-Ray 720p", 18: "Blu-Ray 3D",
    52: "HD 1080p", 31: "HD 720p",
    50: "HDLight 1080p", 86: "HDLight 1080p (x265)", 49: "HDLight 720p",
    60: "Ultra HDLight (x265)", 53: "ULTRA HD (x265)",
    55: "WEB 1080p", 83: "WEB 1080p (x265)", 94: "WEB 1080p Light", 54: "WEB 720p", 4: "WEB",
    62: "HDTV 1080p", 61: "HDTV 720p", 14: "HDTV",
    15: "HDRip", 1: "DVDRIP", 51: "DVDRIP MKV",
    13: "ISO", 12: "IMG", 10: "DVD-R", 11: "Full-DVD",
};


function getQualityName(lien) {
    return QUALITY_MAP[lien.qualite] || `id:${lien.qualite}`;
}

function getHostName(lien) {
    const h = lien.host;
    if (typeof h === 'object' && h) return h.name || '?';
    return String(h || '?');
}

function getLangs(lien) {
    return (lien.langues_compact || []).map(la => la.name || '');
}

function formatSize(bytes) {
    if (!bytes || bytes === 0) return 'N/A';
    const gb = bytes / (1024 ** 3);
    if (gb >= 1) return `${gb.toFixed(2)} Go`;
    const mb = bytes / (1024 ** 2);
    return `${mb.toFixed(0)} Mo`;
}

class DarkiWorldAPI {
    constructor() {
        if (!CONFIG_DW.API_KEY) {
            console.warn('[DW-API] Attention: DW_API_KEY manquante. Les séries ne seront pas disponibles.');
        }
    }

    // Authenticated GET via fetch and Bearer token
    async apiGet(urlPath, params = {}) {
        const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
        const url = `${CONFIG_DW.BASE_URL}/api/v1/${urlPath}` + (qs ? `?${qs}` : '');
        try {
            const res = await fetch(url, {
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${CONFIG_DW.API_KEY}`
                }
            });
            return await res.json();
        } catch (e) {
            console.error(`[DW-API] apiGet Error on ${urlPath}:`, e.message);
            return null;
        }
    }

    // Authenticated POST via fetch and Bearer token
    async apiPost(urlPath, body = {}) {
        const url = `${CONFIG_DW.BASE_URL}/api/v1/${urlPath}`;
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${CONFIG_DW.API_KEY}`
                },
                body: JSON.stringify(body)
            });
            return { status: res.status, body: await res.text() };
        } catch (e) {
            console.error(`[DW-API] apiPost Error on ${urlPath}:`, e.message);
            return null;
        }
    }

    // Fetch trending — pas d'auth requise (endpoint public)
    async getTrending(type) {
        try {
            const url = `${CONFIG_DW.BASE_URL}/api/v1/titles?order=trending:desc&type=${type}&page=1&paginate=lengthAware`;
            const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
            if (!res.ok) return [];
            const data = await res.json();
            const results = (data.pagination || {}).data || data.data || [];
            return this.searchResultsToCards(results).slice(0, 19);
        } catch (e) {
            console.error(`[DW-API] getTrending Error for ${type}:`, e.message);
            return [];
        }
    }

    // ===================== PUBLIC API (no auth) =====================

    async search(query) {
        const url = `${CONFIG_DW.BASE_URL}/api/v1/search/${encodeURIComponent(query)}?loader=searchAutocomplete`;
        try {
            const res = await fetch(url, {
                headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
            });
            const data = await res.json();
            return (data.results || []).filter(r => r.model_type === 'title');
        } catch (e) {
            console.error('[DW-API] Search failed:', e.message);
            return [];
        }
    }

    // ===================== AUTH API (séries) =====================

    async getLiens(titleId, season = 1) {
        const allLiens = [];
        let page = 1;
        while (true) {
            const result = await this.apiGet('liens', {
                title_id: titleId, loader: 'linksdl', season,
                perPage: 500, page, filters: '', paginate: 'lengthAware'
            });
            if (!result || result.error) break;
            const pagination = result.pagination || {};
            const data = pagination.data || [];
            if (!data.length) break;
            allLiens.push(...data);
            const lastPage = pagination.last_page || pagination.lastPage || 1;
            if (page >= lastPage) break;
            page++;
        }
        console.log(`[DW-API] Got ${allLiens.length} liens for title ${titleId} season ${season}`);
        return allLiens;
    }

    // ===================== FREE API (films) =====================
    // Utilise GET /titles/{id}/download — fonctionne sans compte Premium.
    // Les liens 1fichier sont directement dans la réponse (alternative_videos).

    async getMovieLinks(titleId) {
        const url = `${CONFIG_DW.BASE_URL}/api/v1/titles/${titleId}/download`;
        try {
            const res = await fetch(url, {
                headers: { 'Accept': 'application/json' }
            });
            if (!res.ok) {
                console.error(`[DW-API] getMovieLinks HTTP ${res.status} for title ${titleId}`);
                return [];
            }
            const data = await res.json();

            // Collecter video + alternative_videos
            const all = [];
            if (data.video) all.push(data.video);
            if (Array.isArray(data.alternative_videos)) all.push(...data.alternative_videos);

            // Garder uniquement les liens 1fichier avec une URL valide
            const fichierLinks = all.filter(l => {
                const host = (l.host && l.host.name) || '';
                return host.toLowerCase().includes('1fichier') && l.lien && l.lien.includes('1fichier.com');
            });

            console.log(`[DW-API] getMovieLinks: ${fichierLinks.length} liens 1fichier directs pour title ${titleId}`);
            return fichierLinks;
        } catch (e) {
            console.error(`[DW-API] getMovieLinks Error for title ${titleId}:`, e.message);
            return [];
        }
    }

    async getSeasons(titleId) {
        const result = await this.apiGet(`titles/${titleId}/seasons`);
        if (result && !result.error) {
            const seasons = result.seasons || (result.pagination || {}).data || [];
            if (Array.isArray(seasons) && seasons.length) {
                const nums = seasons
                    .map(s => typeof s === 'object' ? (s.number || s) : s)
                    .filter(n => typeof n === 'number' && n > 0)
                    .sort((a, b) => a - b);
                if (nums.length) return nums;
            }
        }
        return [];
    }

    async getEpisodes(titleId, season) {
        const result = await this.apiGet(`titles/${titleId}/seasons/${season}/episodes`);
        if (!result || result.error) return [];
        return (result.pagination || {}).data || [];
    }

    // Resolve a lien to the actual 1fichier URL
    async downloadLien(lienId, maxRetries = 3) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                if (attempt > 1) {
                    console.log(`[DW-API] Retry ${attempt}/${maxRetries} for lien ${lienId}`);
                    await new Promise(r => setTimeout(r, 5000));
                }

                const result = await this.apiPost(`download-premium/${lienId}`);
                if (!result) continue;

                let data;
                try { data = JSON.parse(result.body); } catch { continue; }

                let lienData = null;
                if (data.liens && Array.isArray(data.liens) && data.liens.length > 0) {
                    lienData = data.liens[0];
                } else {
                    lienData = data.lien || data;
                }

                const finalUrl = lienData.lien || lienData.url || lienData.link || '';
                if (!finalUrl) continue;

                console.log(`[DW-API] Got final URL: ${finalUrl.substring(0, 80)}...`);

                return finalUrl;
            } catch (e) {
                console.error(`[DW-API] Exception resolving lien ${lienId} (attempt ${attempt}):`, e.message);
            }
        }
        return null;
    }

    // ===================== HELPERS =====================

    // Convert API liens to the client format expected by the frontend
    // Pour les films via getMovieLinks(), passer isMovieDirect=true : le lien 1fichier est déjà dans l.lien
    liensToClientOptions(liens, isSeries = false, isMovieDirect = false) {
        // Filter for 1fichier host only (host id = 5)
        const filtered = isMovieDirect ? liens : liens.filter(l => {
            const hostName = getHostName(l).toLowerCase();
            return hostName.includes('1fichier');
        });

        return filtered.map(l => ({
            id: l.id,
            // Pour les films directs, le lien final est déjà dans l.lien
            finalUrl: isMovieDirect ? l.lien : null,
            size: formatSize(l.taille),
            sizeBytes: l.taille || 0,
            quality: l.quality || getQualityName(l),
            langs: getLangs(l),
            episode: (isSeries && (l.episode === 0 || l.episode === "0" || l.episode === "00")) ? 'Saison complète' : (l.episode ? String(l.episode) : null),
        }));
    }

    // Format search results to match the existing frontend format
    searchResultsToCards(results) {
        return results.map(r => ({
            title: r.name,
            year: r.year || (r.release_date ? r.release_date.substring(0, 4) : 'N/A'),
            image: r.poster || r.image || null,
            hrefPath: `/titles/${r.id}/download`, // Encode DW ID in hrefPath for compatibility
            type: r.type || (r.is_series ? 'series' : 'movie'),
            dwId: r.id,
        }));
    }
}

module.exports = { DarkiWorldAPI, getQualityName, getHostName, getLangs, formatSize, QUALITY_MAP };
