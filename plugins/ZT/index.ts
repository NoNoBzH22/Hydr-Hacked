import { ISource, SearchResult, MediaType, ContentLinks, SelectionData } from '../../src/types/source.js';
import { CONFIG } from '../../src/utils/config.js';
import { sourceRegistry } from '../../src/core/registry.js';
import { fetchSearchResults, fetchTrendingMovies, fetchTrendingSeries, fetchContentPage } from './api.js';
import { parseSearchHTML, parseContentHTML } from './parser.js';

/**
 * Normalise un titre pour la comparaison (minuscules, sans accents, sans ponctuation).
 */
function normalizeTitle(title: string): string {
    return title
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');
}

/**
 * Déduplique les résultats par titre normalisé, en gardant la première occurrence.
 */
function deduplicateByTitle(results: SearchResult[]): SearchResult[] {
    const seen = new Set<string>();
    return results.filter(r => {
        const key = normalizeTitle(r.title);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export class ZoneTelechargementAPI implements ISource {
    name = 'zt';
    private baseUrl: string | undefined;

    constructor(baseUrl?: string) {
        this.baseUrl = baseUrl;
    }

    async healthCheck(): Promise<boolean> {
        if (!this.baseUrl) {
            console.warn('[ZT] ⚠️ ZT_URL non définie.');
            return false;
        }
        try {
            const testUrl = `${this.baseUrl}`;
            const res = await fetch(testUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' },
                signal: AbortSignal.timeout(8000)
            });
            return res.ok || res.status === 403;
        } catch {
            return false;
        }
    }

    async search(query: string, mediaType: MediaType = 'movie'): Promise<SearchResult[]> {
        if (!this.baseUrl) throw new Error('ZT_URL non configurée.');
        if (!query || query.length < 4) throw new Error('La recherche nécessite au moins 4 caractères.');

        const html = await fetchSearchResults(this.baseUrl, query);
        if (html.includes('Aucun résultat')) return [];

        let results = parseSearchHTML(html, this.baseUrl);

        if (mediaType === 'movie') {
            results = results.filter(r => r.type === 'movie' || r.type === 'anime');
        } else {
            results = results.filter(r => r.type === 'series' || r.type === 'anime');
        }

        return deduplicateByTitle(results);
    }

    async getTrending(mediaType: MediaType): Promise<SearchResult[]> {
        if (!this.baseUrl) return [];
        try {
            const html = mediaType === 'movie'
                ? await fetchTrendingMovies(this.baseUrl)
                : await fetchTrendingSeries(this.baseUrl);
            const results = parseSearchHTML(html, this.baseUrl).slice(0, 40);
            return deduplicateByTitle(results).slice(0, 20);
        } catch (e: any) {
            console.error(`[ZT] ❌ Erreur trending ${mediaType}:`, e.message);
            return [];
        }
    }

    async getContentLinks(pageUrl: string): Promise<ContentLinks> {
        if (!this.baseUrl) throw new Error('ZT_URL non configurée.');
        const fullUrl = pageUrl.startsWith('http') ? pageUrl : (this.baseUrl + (pageUrl.startsWith('/') ? '' : '/') + pageUrl);
        const html = await fetchContentPage(fullUrl);
        return parseContentHTML(html);
    }


    async getSelection(identifier: string, type?: string, seasonValue?: string | number): Promise<SelectionData> {
        const targetUrl = seasonValue ? String(seasonValue) : identifier;
        const content = await this.getContentLinks(targetUrl);

        const isSeries = identifier.includes('/telecharger-serie/') || (content.relatedSeasons?.length || 0) > 0;
        const formattedSeasons = (content.relatedSeasons || []).map(s => ({
            label: s.label,
            value: s.href
        }));

        return { links: content.links, seasons: formattedSeasons, isSeries };
    }
}

// ── Auto-registration ──
sourceRegistry.register(new ZoneTelechargementAPI(CONFIG.ZT_URL));
