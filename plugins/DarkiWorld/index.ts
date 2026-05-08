import { ISource, SearchResult, MediaType, ContentLinks, VideoLink, SelectionData } from '../../src/types/source.js';
import { CONFIG } from '../../src/utils/config.js';
import { sourceRegistry } from '../../src/core/registry.js';

const CONFIG_DW = {
    BASE_URL: CONFIG.BASE_URL,
    API_KEY: CONFIG.DW_API_KEY,
};

const QUALITY_MAP: Record<number, string> = {
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

export class DarkiWorldAPI implements ISource {
    name = 'hydracker';

    constructor() { }

    async healthCheck(): Promise<boolean> {
        if (!CONFIG_DW.BASE_URL || !CONFIG_DW.API_KEY) {
            console.warn('[DW-API] ⚠️ BASE_URL ou DW_API_KEY manquante.');
            return false;
        }
        try {
            const res = await fetch(`${CONFIG_DW.BASE_URL}/api/v1/titles?page=1&paginate=lengthAware`, {
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${CONFIG_DW.API_KEY}`
                },
                signal: AbortSignal.timeout(5000)
            });
            return res.ok;
        } catch {
            return false;
        }
    }

    private async apiGet(urlPath: string, params: Record<string, any> = {}) {
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
        } catch (e: any) {
            console.error(`[DW-API] apiGet Error on ${urlPath}:`, e.message);
            return null;
        }
    }

    private async apiPost(urlPath: string, body: any = {}) {
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
        } catch (e: any) {
            console.error(`[DW-API] apiPost Error on ${urlPath}:`, e.message);
            return null;
        }
    }

    async search(query: string, mediaType: MediaType = 'movie'): Promise<SearchResult[]> {
        const url = `${CONFIG_DW.BASE_URL}/api/v1/search/${encodeURIComponent(query)}?loader=searchAutocomplete`;
        try {
            const res = await fetch(url, {
                headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
            });
            const data = await res.json();

            const EXCLUDED_TYPES = ['games', 'music', 'app', 'ebook', 'emulation'];
            const results = (data.results || []).filter((r: any) =>
                r.model_type === 'title' && !EXCLUDED_TYPES.includes((r.type || '').toLowerCase())
            );

            const filtered = results.filter((r: any) => {
                const rType = (r.type || (r.is_series ? 'series' : 'movie')).toLowerCase();
                if (mediaType === 'movie') {
                    return rType === 'movie' || rType === 'animes' || rType === 'doc' || rType === 'other';
                }
                return rType === 'series' || rType === 'serie' || rType === 'animes' || rType === 'doc' || rType === 'other';
            });

            return filtered.map((r: any) => ({
                title: r.name,
                year: r.year || (r.release_date ? r.release_date.substring(0, 4) : 'N/A'),
                image: r.poster || r.image || null,
                hrefPath: String(r.id),
                type: r.type || (r.is_series ? 'series' : 'movie'),
                source: 'hydracker',
                dwId: String(r.id)
            }));
        } catch (e: any) {
            console.error('[DW-API] Search failed:', e.message);
            return [];
        }
    }

    async getTrending(mediaType: MediaType): Promise<SearchResult[]> {
        const type = mediaType === 'series' ? 'series' : 'movie';
        try {
            const data = await this.apiGet('titles', {
                order: 'trending:desc',
                type,
                page: 1,
                paginate: 'lengthAware'
            });

            if (!data) return [];
            const results = (data.pagination || {}).data || data.data || [];
            return results.map((r: any) => ({
                title: r.name,
                year: r.year || (r.release_date ? r.release_date.substring(0, 4) : 'N/A'),
                image: r.poster || r.image || null,
                hrefPath: String(r.id),
                type: r.type || (r.is_series ? 'series' : 'movie'),
                source: 'hydracker',
                dwId: String(r.id)
            })).slice(0, 19);
        } catch (e: any) {
            console.error(`[DW-API] getTrending Error for ${type}:`, e.message);
            return [];
        }
    }

    async getSelection(identifier: string, type?: string, seasonValue?: string | number): Promise<SelectionData> {
        const titleId = identifier;
        const seasonsList = await this.getSeasons(titleId);

        let isSeries = false;
        if (type) {
            isSeries = (type === 'series' || type === 'serie' || type === 'tv');
        } else {
            isSeries = seasonsList.length > 0;
        }

        const currentSeason = seasonValue ? parseInt(String(seasonValue), 10) : 1;
        const content = await this.getContentLinks(titleId, currentSeason);

        const formattedSeasons = seasonsList.map(num => ({ label: `Saison ${num}`, value: num }));

        return {
            links: content.links,
            seasons: isSeries ? formattedSeasons : [],
            isSeries
        };
    }

    async getContentLinks(titleId: string, season: number = 1): Promise<ContentLinks> {
        // TODO:
        // - Vérifier si le contenu est un film ou une série
        // - Essayer d’abord de récupérer les liens des films, puis ceux des séries
        // - Améliorer la logique pour déterminer directement le type à partir du résultat de recherche

        // Movie check
        const movieLinks = await this.getMovieLinks(titleId);
        if (movieLinks.length > 0) {
            return { links: movieLinks };
        }

        // Series check
        const seriesLiens = await this.getLiens(titleId, season);
        return {
            links: seriesLiens.map(l => ({
                id: l.id,
                host: (l.host && l.host.name) || '?',
                size: this.formatSize(l.taille),
                sizeBytes: l.taille || 0,
                quality: QUALITY_MAP[l.qualite] || `id:${l.qualite}`,
                langs: (l.langues_compact || []).map((la: any) => la.name || ''),
                episode: (l.episode === 0 || l.episode === "0" || l.episode === "00") ? 'Saison complète' : (l.episode ? String(l.episode) : null),
                url: null // passer par downloadLien
            }))
        };
    }

    private async getMovieLinks(titleId: string): Promise<VideoLink[]> {
        const url = `${CONFIG_DW.BASE_URL}/api/v1/titles/${titleId}/download`;
        try {
            const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
            if (!res.ok) return [];
            const data = await res.json();

            const all: any[] = [];
            if (data.video) all.push(data.video);
            if (Array.isArray(data.alternative_videos)) all.push(...data.alternative_videos);

            return all.filter(l => {
                const host = (l.host && l.host.name) || '';
                return host.toLowerCase().includes('1fichier') && l.lien && l.lien.includes('1fichier.com');
            }).map(l => ({
                id: l.id,
                host: '1fichier',
                url: l.lien,
                size: this.formatSize(l.taille),
                sizeBytes: l.taille || 0,
                quality: l.quality || QUALITY_MAP[l.qualite] || 'Inconnu',
                langs: (l.langues_compact || []).map((la: any) => la.name || ''),
            }));
        } catch (e: any) {
            return [];
        }
    }

    private async getLiens(titleId: string, season: number = 1) {
        const allLiens: any[] = [];
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
        return allLiens;
    }

    async getSeasons(titleId: string): Promise<number[]> {
        const result = await this.apiGet(`titles/${titleId}/seasons`);
        if (result && !result.error) {
            const seasons = result.seasons || (result.pagination || {}).data || [];
            if (Array.isArray(seasons) && seasons.length) {
                return seasons
                    .map((s: any) => typeof s === 'object' ? (s.number || s) : s)
                    .filter((n: any) => typeof n === 'number' && n > 0)
                    .sort((a: number, b: number) => a - b);
            }
        }
        return [];
    }

    async resolveLink(linkId: string): Promise<string | null> {
        return this.downloadLien(linkId);
    }

    async downloadLien(lienId: string | number): Promise<string | null> {
        try {
            const result = await this.apiPost(`download-premium/${lienId}`);
            if (!result) return null;

            let data;
            try { data = JSON.parse(result.body); } catch { return null; }

            let lienData = null;
            if (data.liens && Array.isArray(data.liens) && data.liens.length > 0) {
                lienData = data.liens[0];
            } else {
                lienData = data.lien || data;
            }

            return lienData.lien || lienData.url || lienData.link || null;
        } catch (e) {
            return null;
        }
    }

    private formatSize(bytes: number): string {
        if (!bytes || bytes === 0) return 'N/A';
        const gb = bytes / (1024 ** 3);
        if (gb >= 1) return `${gb.toFixed(2)} Go`;
        const mb = bytes / (1024 ** 2);
        return `${mb.toFixed(0)} Mo`;
    }
}

// ── Auto-registration ──
sourceRegistry.register(new DarkiWorldAPI());
