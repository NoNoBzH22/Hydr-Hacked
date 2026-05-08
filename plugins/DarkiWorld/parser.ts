import { SearchResult, MediaType, VideoLink } from '../../src/types/source.js';

export const QUALITY_MAP: Record<number, string> = {
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

export function formatSize(bytes: number): string {
    if (!bytes || bytes === 0) return 'N/A';
    const gb = bytes / (1024 ** 3);
    if (gb >= 1) return `${gb.toFixed(2)} Go`;
    const mb = bytes / (1024 ** 2);
    return `${mb.toFixed(0)} Mo`;
}

export function parseSearchResults(data: any, mediaType: MediaType): SearchResult[] {
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
}

export function parseTrendingResults(data: any): SearchResult[] {
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
}

export function parseMovieLinks(data: any): VideoLink[] {
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
        size: formatSize(l.taille),
        sizeBytes: l.taille || 0,
        quality: l.quality || QUALITY_MAP[l.qualite] || 'Inconnu',
        langs: (l.langues_compact || []).map((la: any) => la.name || ''),
    }));
}

export function parseSeasons(result: any): number[] {
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

export function parsePremiumLink(body: string): string | null {
    let data;
    try { data = JSON.parse(body); } catch { return null; }

    let lienData = null;
    if (data.liens && Array.isArray(data.liens) && data.liens.length > 0) {
        lienData = data.liens[0];
    } else {
        lienData = data.lien || data;
    }

    return lienData.lien || lienData.url || lienData.link || null;
}
