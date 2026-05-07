import { ISource, SearchResult, MediaType, ContentLinks, VideoLink, SelectionData } from '../types/source.js';
import { CONFIG } from '../utils/config.js';
import { sourceRegistry } from './registry.js';

export class ZoneTelechargementAPI implements ISource {
    name = 'zt';
    private baseUrl: string | undefined;

    constructor(baseUrl?: string) {
        this.baseUrl = baseUrl;
    }

    async healthCheck(): Promise<boolean> {
        if (!this.baseUrl) {
            console.warn('[ZT-API] ⚠️ ZT_BASE_URL non définie.');
            return false;
        }
        try {
            const res = await fetch(this.baseUrl, {
                method: 'HEAD',
                headers: { 'User-Agent': 'Mozilla/5.0' },
                signal: AbortSignal.timeout(5000)
            });
            return res.ok;
        } catch {
            return false;
        }
    }

    private static decodeZoneursLink(fullUrl: string): string | null {
        try {
            const parsed = new URL(fullUrl);
            let encoded = parsed.searchParams.get('url');
            if (!encoded) return null;
            encoded = decodeURIComponent(encoded);
            return Buffer.from(encoded, 'base64').toString('utf-8');
        } catch (e) {
            return null;
        }
    }

    private parseSearchHTML(html: string): SearchResult[] {
        const results: SearchResult[] = [];
        const coverRegex = /<div class="cover_global"[^>]*>([\s\S]*?)(?=<div class="cover_global"|$)/g;
        let match: RegExpExecArray | null;

        while ((match = coverRegex.exec(html)) !== null) {
            const block = match[1]!;

            const titleMatch = block.match(/<div class="cover_infos_title"[^>]*>\s*<a href="([^"]+)"[^>]*>\s*([^<]+)/);
            if (!titleMatch) continue;

            const href = titleMatch[1]!.trim();
            const title = titleMatch[2]!.trim();

            const imgMatch = block.match(/<img class="mainimg"[^>]*src="([^"]+)"/);
            let image = imgMatch ? imgMatch[1]! : null;
            if (image && image.startsWith('/') && this.baseUrl) {
                image = this.baseUrl + image;
            }

            let type: MediaType = 'movie';
            if (href.includes('/telecharger-serie/') || href.includes('/serie-')) {
                type = 'series';
            } else if (href.includes('/animes')) {
                type = 'anime';
            }

            results.push({
                title,
                image,
                hrefPath: href,
                year: null,
                type,
                source: 'zt'
            });
        }

        return results;
    }

    private parseContentHTML(html: string): ContentLinks {
        const links: VideoLink[] = [];

        const releaseNames: string[] = [];
        const releaseRegex = /<font color=red>([^<]+)<\/font>/g;
        let releaseMatch: RegExpExecArray | null;
        while ((releaseMatch = releaseRegex.exec(html)) !== null) {
            releaseNames.push(releaseMatch[1]!.trim());
        }

        const sections = html.split(/<img src='\/img\/([^']+)'/);
        
        for (let i = 1; i < sections.length; i += 2) {
            const hostImg = sections[i]!;
            const hostName = hostImg.replace('.png', '').replace('.jpg', '').replace('.webp', '');
            const sectionHtml = sections[i + 1] || '';

            const linkRegex = /<a class="btnToLink"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
            let linkMatch: RegExpExecArray | null;

            while ((linkMatch = linkRegex.exec(sectionHtml)) !== null) {
                const zoneursUrl = linkMatch[1]!;
                const label = linkMatch[2]!.trim();
                
                const decodedUrl = ZoneTelechargementAPI.decodeZoneursLink(zoneursUrl);
                if (!decodedUrl) continue;

                links.push({
                    id: zoneursUrl, // Use URL as ID for ZT
                    host: hostName,
                    label,
                    url: decodedUrl,
                    quality: releaseNames.length > 0 ? releaseNames[0] : 'Inconnu',
                });
            }
        }

        const relatedSeasons: { href: string; label: string }[] = [];
        const seasonSectionMatch = html.match(/galement disponibles[\s\S]*?<\/h3>([\s\S]*?)(?:<\/div>|<div[^>]*class="postinfo")/);
        if (seasonSectionMatch) {
            const seasonBlock = seasonSectionMatch[1]!;
            const seasonRegex = /<a[^>]*href="([^"]+)"[^>]*><span class="otherquality">([\s\S]*?)<\/span><\/a>/g;
            let sMatch: RegExpExecArray | null;
            while ((sMatch = seasonRegex.exec(seasonBlock)) !== null) {
                const label = sMatch[2]!.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
                relatedSeasons.push({
                    href: sMatch[1]!.trim(),
                    label
                });
            }
        }

        return { links, releaseNames, relatedSeasons };
    }

    async search(query: string, mediaType: MediaType = 'movie'): Promise<SearchResult[]> {
        if (!this.baseUrl) throw new Error('ZT_BASE_URL non configurée.');
        if (!query || query.length < 4) throw new Error('La recherche nécessite au moins 4 caractères.');

        const url = `${this.baseUrl}/engine/ajax/controller.php?mod=filter&catid=0&q=${encodeURIComponent(query)}&art=0&AiffchageMode=0&inputTirePar=0&cstart=0`;
        
        try {
            const res = await fetch(url, {
                headers: { 
                    'User-Agent': 'Mozilla/5.0', 
                    'Accept': 'text/html, */*',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Referer': this.baseUrl || ''
                }
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const html = await res.text();
            
            if (html.includes('Aucun résultat')) return [];

            let results = this.parseSearchHTML(html);

            if (mediaType === 'movie') {
                results = results.filter(r => r.type === 'movie' || r.type === 'anime');
            } else {
                results = results.filter(r => r.type === 'series' || r.type === 'anime');
            }

            return results;
        } catch (e: any) {
            console.error(`[ZT-API] ❌ Erreur recherche:`, e.message);
            throw e;
        }
    }

    async getTrending(mediaType: MediaType): Promise<SearchResult[]> {
        if (!this.baseUrl) return [];

        let url = '';
        if (mediaType === 'movie') {
            url = `${this.baseUrl}/nouveaux-films/`;
        } else {
            url = `${this.baseUrl}/engine/ajax/controller.php?mod=filter&catid=15&q=&art=0&AiffchageMode=0&inputTirePar=1&cstart=0`;
        }

        try {
            const res = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            if (!res.ok) return [];
            const html = await res.text();
            return this.parseSearchHTML(html).slice(0, 20);
        } catch (e: any) {
            console.error(`[ZT-API] ❌ Erreur trending ${mediaType}:`, e.message);
            return [];
        }
    }

    async getContentLinks(pageUrl: string): Promise<ContentLinks> {
        if (!this.baseUrl) throw new Error('ZT_BASE_URL non configurée.');

        try {
            const res = await fetch(pageUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const html = await res.text();

            return this.parseContentHTML(html);
        } catch (e: any) {
            console.error(`[ZT-API] ❌ Erreur content links:`, e.message);
            throw e;
        }
    }

    async getSelection(identifier: string, type?: string, seasonValue?: string | number): Promise<SelectionData> {
        const targetUrl = seasonValue ? String(seasonValue) : identifier;
        const content = await this.getContentLinks(targetUrl);

        const isSeries = identifier.includes('/telecharger-serie/') || (content.relatedSeasons?.length || 0) > 0;

        const formattedSeasons = (content.relatedSeasons || []).map(s => ({
            label: s.label,
            value: s.href
        }));

        return {
            links: content.links,
            seasons: formattedSeasons,
            isSeries
        };
    }
}

// ── Auto-registration ──
sourceRegistry.register(new ZoneTelechargementAPI(CONFIG.ZT_BASE_URL));
