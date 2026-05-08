import { ISource, SearchResult, MediaType, ContentLinks, VideoLink, SelectionData } from '../../src/types/source.js';
import { sourceRegistry } from '../../src/core/registry.js';
import { CONFIG_DW, apiGet, apiPost, fetchSearch, fetchMovieLinks, fetchSeriesLiens } from './api.js';
import {
    QUALITY_MAP, formatSize,
    parseSearchResults, parseTrendingResults,
    parseMovieLinks, parseSeasons, parsePremiumLink
} from './parser.js';

export class DarkiWorldAPI implements ISource {
    name = 'hydracker';

    async healthCheck(): Promise<boolean> {
        if (!CONFIG_DW.BASE_URL || !CONFIG_DW.API_KEY) {
            console.warn('[DW] ⚠️ BASE_URL ou DW_API_KEY manquante.');
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

    async search(query: string, mediaType: MediaType = 'movie'): Promise<SearchResult[]> {
        const data = await fetchSearch(query);
        if (!data) return [];
        return parseSearchResults(data, mediaType);
    }

    async getTrending(mediaType: MediaType): Promise<SearchResult[]> {
        const type = mediaType === 'series' ? 'series' : 'movie';
        try {
            const data = await apiGet('titles', { order: 'trending:desc', type, page: 1, paginate: 'lengthAware' });
            return parseTrendingResults(data);
        } catch (e: any) {
            console.error(`[DW] getTrending Error for ${type}:`, e.message);
            return [];
        }
    }

    async getSelection(identifier: string, type?: string, seasonValue?: string | number): Promise<SelectionData> {
        const seasonsList = await this.getSeasons(identifier);

        let isSeries = false;
        if (type) {
            isSeries = (type === 'series' || type === 'serie' || type === 'tv');
        } else {
            isSeries = seasonsList.length > 0;
        }

        const currentSeason = seasonValue ? parseInt(String(seasonValue), 10) : 1;
        const content = await this.getContentLinks(identifier, currentSeason);
        const formattedSeasons = seasonsList.map(num => ({ label: `Saison ${num}`, value: num }));

        return {
            links: content.links,
            seasons: isSeries ? formattedSeasons : [],
            isSeries
        };
    }

    async getContentLinks(titleId: string, season: number = 1): Promise<ContentLinks> {
        // Essai film en premier
        const movieData = await fetchMovieLinks(titleId);
        if (movieData) {
            const movieLinks = parseMovieLinks(movieData);
            if (movieLinks.length > 0) return { links: movieLinks };
        }

        // Fallback série
        const rawLiens = await fetchSeriesLiens(titleId, season);
        const links: VideoLink[] = rawLiens.map(l => ({
            id: l.id,
            host: (l.host && l.host.name) || '?',
            size: formatSize(l.taille),
            sizeBytes: l.taille || 0,
            quality: QUALITY_MAP[l.qualite] || `id:${l.qualite}`,
            langs: (l.langues_compact || []).map((la: any) => la.name || ''),
            episode: (l.episode === 0 || l.episode === "0" || l.episode === "00")
                ? 'Saison complète'
                : (l.episode ? String(l.episode) : null),
            url: null
        }));

        return { links };
    }

    async getSeasons(titleId: string): Promise<number[]> {
        const result = await apiGet(`titles/${titleId}/seasons`);
        return parseSeasons(result);
    }

    async resolveLink(linkId: string): Promise<string | null> {
        const result = await apiPost(`download-premium/${linkId}`);
        if (!result) return null;
        return parsePremiumLink(result.body);
    }
}

// ── Auto-registration ──
sourceRegistry.register(new DarkiWorldAPI());
