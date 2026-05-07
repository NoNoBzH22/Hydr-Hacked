/**
 * Zone-Telechargement Scraper Module
 * Scrapes zone-telechargement.org via simple HTTP GET requests.
 * No headless browser needed — pure HTML parsing with regex.
 */

require('dotenv').config();

class ZoneTelechargementAPI {
    constructor(baseUrl) {
        this.baseUrl = baseUrl;
        if (!this.baseUrl) {
            console.warn('[ZT-API] ⚠️ ZT_BASE_URL non définie. Le scraping ZT ne fonctionnera pas.');
        }
    }

    // ===================== UTILS =====================

    /**
     * Decode a zoneurs.net link: extract the base64-encoded URL param and decode it.
     * The URL param may be URL-encoded (e.g. %3D for =).
     */
    static decodeZoneursLink(fullUrl) {
        try {
            const parsed = new URL(fullUrl);
            let encoded = parsed.searchParams.get('url');
            if (!encoded) return null;
            // URL-decode first (handles %3D etc)
            encoded = decodeURIComponent(encoded);
            // Base64 decode
            return Buffer.from(encoded, 'base64').toString('utf-8');
        } catch (e) {
            return null;
        }
    }

    /**
     * Parse a search/trending HTML response into an array of card objects.
     * Each <div class="cover_global"> contains one result.
     */
    parseSearchHTML(html) {
        const results = [];
        // Match each cover_global block
        const coverRegex = /<div class="cover_global"[^>]*>([\s\S]*?)(?=<div class="cover_global"|$)/g;
        let match;

        while ((match = coverRegex.exec(html)) !== null) {
            const block = match[1];

            // Extract link and title from cover_infos_title
            const titleMatch = block.match(/<div class="cover_infos_title"[^>]*>\s*<a href="([^"]+)"[^>]*>\s*([^<]+)/);
            if (!titleMatch) continue;

            const href = titleMatch[1].trim();
            const title = titleMatch[2].trim();

            // Extract image
            const imgMatch = block.match(/<img class="mainimg"[^>]*src="([^"]+)"/);
            let image = imgMatch ? imgMatch[1] : null;
            // Make image URL absolute if relative
            if (image && image.startsWith('/')) {
                image = this.baseUrl + image;
            }

            // Extract quality and language from detail_release
            // HTML structure: <span class="detail_release size_11"><span style="color:#1ba100"><b>HDLight 1080p</span><span style="color:#ffad0a"> (MULTI)</span></b></span><br>
            const qualityMatch = block.match(/<span class="detail_release[^"]*">([\s\S]*?)<\/span>\s*<br/);
            let quality = '';
            let lang = '';
            if (qualityMatch) {
                // Clean HTML tags to get text
                const raw = qualityMatch[1].replace(/<[^>]+>/g, '').trim();
                // Format: "HDLight 1080p (MULTI)" or "ULTRA HD (x265) (MULTI)"
                const langMatch = raw.match(/\(([^)]+)\)\s*$/);
                if (langMatch) {
                    lang = langMatch[1].trim();
                    quality = raw.replace(langMatch[0], '').trim();
                } else {
                    quality = raw;
                }
            }

            // Determine type from URL path
            let type = 'movie';
            if (href.includes('/telecharger-serie/') || href.includes('/serie-')) {
                type = 'series';
            } else if (href.includes('/animes')) {
                type = 'anime';
            }

            results.push({
                title,
                image,
                hrefPath: href,
                quality,
                lang,
                type,
                source: 'zt',
                year: null // ZT doesn't provide year in search results
            });
        }

        return results;
    }

    /**
     * Parse a content page HTML to extract download links.
     * Returns grouped links by host with decoded URLs.
     */
    parseContentHTML(html) {
        const links = [];

        // Extract the release name(s) from <font color=red>...</font>
        const releaseNames = [];
        const releaseRegex = /<font color=red>([^<]+)<\/font>/g;
        let releaseMatch;
        while ((releaseMatch = releaseRegex.exec(html)) !== null) {
            releaseNames.push(releaseMatch[1].trim());
        }

        // Find all host sections: each host image followed by its links
        // Structure: <img src='/img/1fichier.png'> followed by <a class="btnToLink" href="...">Label</a>
        const sections = html.split(/<img src='\/img\/([^']+)'/);
        
        for (let i = 1; i < sections.length; i += 2) {
            const hostImg = sections[i]; // e.g. "1fichier.png"
            const hostName = hostImg.replace('.png', '').replace('.jpg', '').replace('.webp', '');
            const sectionHtml = sections[i + 1] || '';

            // Extract all btnToLink links in this section until next host image
            const linkRegex = /<a class="btnToLink"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/g;
            let linkMatch;

            while ((linkMatch = linkRegex.exec(sectionHtml)) !== null) {
                const zoneursUrl = linkMatch[1];
                const label = linkMatch[2].trim();
                
                // Decode the base64 URL
                const decodedUrl = ZoneTelechargementAPI.decodeZoneursLink(zoneursUrl);
                if (!decodedUrl) continue;

                links.push({
                    host: hostName,
                    label, // e.g. "Episode 1" or "Télécharger"
                    url: decodedUrl,
                    zoneursUrl
                });
            }
        }

        // Parse related seasons
        const relatedSeasons = [];
        // HTML structure: <h3>Saisons également disponibles...</h3><a href="..."><span class="otherquality">Saison <b>1<span>HD 720p</span><span>(FRENCH)</span></b></span></a>
        const seasonSectionMatch = html.match(/galement disponibles[\s\S]*?<\/h3>([\s\S]*?)(?:<\/div>|<div[^>]*class="postinfo")/);
        if (seasonSectionMatch) {
            const seasonBlock = seasonSectionMatch[1];
            const seasonRegex = /<a[^>]*href="([^"]+)"[^>]*><span class="otherquality">([\s\S]*?)<\/span><\/a>/g;
            let sMatch;
            while ((sMatch = seasonRegex.exec(seasonBlock)) !== null) {
                const label = sMatch[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
                relatedSeasons.push({
                    href: sMatch[1].trim(),
                    label
                });
            }
        }

        return { links, releaseNames, relatedSeasons };
    }

    // ===================== API METHODS =====================

    /**
     * Search for titles on Zone-Telechargement.
     * @param {string} query - Search query (min 4 characters)
     * @param {string} mediaType - 'film' or 'serie'
     * @returns {Array} Array of card objects
     */
    async search(query, mediaType = 'film') {
        if (!this.baseUrl) throw new Error('ZT_BASE_URL non configurée.');
        if (!query || query.length < 4) throw new Error('La recherche nécessite au moins 4 caractères.');

        const url = `${this.baseUrl}/engine/ajax/controller.php?mod=filter&catid=0&q=${encodeURIComponent(query)}&art=0&AiffchageMode=0&inputTirePar=0&cstart=0`;
        
        console.log(`[ZT-API] 🔍 Recherche: "${query}" (${mediaType})`);

        try {
            const res = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'text/html' }
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const html = await res.text();

            let results = this.parseSearchHTML(html);

            // Filter by media type
            if (mediaType === 'film') {
                results = results.filter(r => r.type === 'movie' || r.type === 'anime');
            } else {
                results = results.filter(r => r.type === 'series' || r.type === 'anime');
            }

            console.log(`[ZT-API] ✅ ${results.length} résultats pour "${query}" (${mediaType})`);
            return results;
        } catch (e) {
            console.error(`[ZT-API] ❌ Erreur recherche:`, e.message);
            throw e;
        }
    }

    /**
     * Fetch trending films from the "nouveaux-films" page.
     * @returns {Array} Array of card objects
     */
    async getTrendingFilms() {
        if (!this.baseUrl) return [];

        const url = `${this.baseUrl}/nouveaux-films/`;
        console.log(`[ZT-API] 🔥 Chargement films tendances...`);

        try {
            const res = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            if (!res.ok) return [];
            const html = await res.text();
            const results = this.parseSearchHTML(html).slice(0, 20);
            console.log(`[ZT-API] ✅ ${results.length} films tendances chargés`);
            return results;
        } catch (e) {
            console.error(`[ZT-API] ❌ Erreur trending films:`, e.message);
            return [];
        }
    }

    /**
     * Fetch trending series.
     * @returns {Array} Array of card objects
     */
    async getTrendingSeries() {
        if (!this.baseUrl) return [];

        const url = `${this.baseUrl}/engine/ajax/controller.php?mod=filter&catid=15&q=&art=0&AiffchageMode=0&inputTirePar=1&cstart=0`;
        console.log(`[ZT-API] 🔥 Chargement séries tendances...`);

        try {
            const res = await fetch(url, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            if (!res.ok) return [];
            const html = await res.text();
            const results = this.parseSearchHTML(html).slice(0, 20);
            console.log(`[ZT-API] ✅ ${results.length} séries tendances chargées`);
            return results;
        } catch (e) {
            console.error(`[ZT-API] ❌ Erreur trending séries:`, e.message);
            return [];
        }
    }

    /**
     * Fetch content page and extract download links.
     * @param {string} pageUrl - Full URL to the content page
     * @returns {Object} { links, releaseNames, relatedSeasons }
     */
    async getContentLinks(pageUrl) {
        if (!this.baseUrl) throw new Error('ZT_BASE_URL non configurée.');

        console.log(`[ZT-API] 📥 Chargement liens: ${pageUrl}`);

        try {
            const res = await fetch(pageUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const html = await res.text();

            const parsed = this.parseContentHTML(html);

            // Filter for 1fichier links only
            const fichierLinks = parsed.links.filter(l => 
                l.url && l.url.includes('1fichier.com')
            );

            console.log(`[ZT-API] ✅ ${fichierLinks.length} liens 1fichier trouvés (${parsed.links.length} total, ${parsed.releaseNames.length} releases)`);
            
            return {
                fichierLinks,
                allLinks: parsed.links,
                releaseNames: parsed.releaseNames,
                relatedSeasons: parsed.relatedSeasons
            };
        } catch (e) {
            console.error(`[ZT-API] ❌ Erreur content links:`, e.message);
            throw e;
        }
    }

    /**
     * Convert ZT content links to the client format expected by the frontend.
     * Compatible with the existing clientOptions format.
     */
    linksToClientOptions(fichierLinks, releaseNames = []) {
        return fichierLinks.map((link, index) => ({
            id: index,
            finalUrl: link.url,
            size: 'N/A',
            sizeBytes: 0,
            quality: releaseNames.length > 0 ? releaseNames[0] : 'Inconnu',
            langs: [],
            episode: link.label || null,
        }));
    }
}

module.exports = { ZoneTelechargementAPI };
