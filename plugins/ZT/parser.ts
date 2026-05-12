import { SearchResult, MediaType, ContentLinks, VideoLink } from '../../src/types/source.js';

/**
 * Décode un lien obfusqué de type zoneurs.
 */
export function decodeZoneursLink(fullUrl: string): string | null {
    try {
        const parsed = new URL(fullUrl);
        let encoded = parsed.searchParams.get('url');
        if (!encoded) return null;
        encoded = decodeURIComponent(encoded);
        return Buffer.from(encoded, 'base64').toString('utf-8');
    } catch {
        return null;
    }
}

/**
 * Parse le HTML de résultats de recherche ZT.
 */
export function parseSearchHTML(html: string, baseUrl: string | undefined): SearchResult[] {
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
        if (image && image.startsWith('/') && baseUrl) {
            image = baseUrl + image;
        }

        let type: 'movie' | 'series' | 'anime' = 'movie';
        if (href.includes('/telecharger-serie/') || href.includes('/serie-')) {
            type = 'series';
        } else if (href.includes('/animes')) {
            type = 'anime';
        }

        results.push({ title, image, hrefPath: href, year: null, type, source: 'zt' });
    }

    return results;
}

/**
 * Parse le HTML d'une page de contenu ZT pour en extraire les liens et saisons.
 */
export function parseContentHTML(html: string): ContentLinks {
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

            const decodedUrl = decodeZoneursLink(zoneursUrl);
            if (!decodedUrl) continue;

            // Extraire la taille depuis le label : "NOM.FICHIER (11.5 GO)" → "11.5 GO"
            const sizeRegex = /\s*\(([\d.,]+\s*(?:go|gb|mo|mb|ko|kb|to|tb))\)/i;
            let sizeMatch = label.match(sizeRegex);
            let size = sizeMatch ? sizeMatch[1]!.trim().toUpperCase() : undefined;

            // Si non trouvé dans le label, on cherche dans le nom de la release (qualité)
            if (!size && releaseNames.length > 0) {
                const qualityMatch = releaseNames[0].match(sizeRegex);
                if (qualityMatch) size = qualityMatch[1]!.trim().toUpperCase();
            }
            
            // Nettoyer le label pour enlever la taille
            const cleanedLabel = label.replace(sizeRegex, "").trim();

            // On n'utilise le label comme "épisode" que si c'est un vrai nom de fichier/épisode (pas juste "Télécharger")
            const isGenericLabel = /^(t\u00e9l\u00e9charger|download|cliquez ici|lien|turbobit|1fichier|uptobox|rapidgator|nitroflare|send.now)/i.test(cleanedLabel);
            let episode = (!isGenericLabel && cleanedLabel.length > 3) ? cleanedLabel : undefined;

            // SI le label est générique, on cherche un texte juste avant (ex: "Episode 1")
            if (isGenericLabel || !episode) {
                const index = linkMatch.index;
                const prevHtml = sectionHtml.substring(Math.max(0, index - 100), index);
                // Cherche "Episode X", "Saison complète", etc.
                const epMatch = prevHtml.match(/(?:<b>|<strong>)?(Episode\s*\d+|Saison\s*compl\u00e8te)(?:<\/b>|<\/strong>)?/i);
                if (epMatch) {
                    episode = epMatch[1].trim();
                }
            }

            links.push({
                id: zoneursUrl,
                host: hostName,
                label: cleanedLabel,
                url: decodedUrl,
                size,
                quality: releaseNames.length > 0 ? releaseNames[0] : 'Inconnu',
                episode: episode,
            });
        }

    }

    const relatedSeasons: { href: string; label: string }[] = [];
    // Chercher toutes les sections "également disponibles"
    const sectionRegex = /galement disponibles[\s\S]*?<\/h3>([\s\S]*?)(?:<h3|<\/div>|<div[^>]*class="postinfo")/g;
    let sSectionMatch: RegExpExecArray | null;
    while ((sSectionMatch = sectionRegex.exec(html)) !== null) {
        const seasonBlock = sSectionMatch[1]!;
        const seasonRegex = /<a[^>]*href="([^"]+)"[^>]*><span class="otherquality">([\s\S]*?)<\/span><\/a>/g;
        let sMatch: RegExpExecArray | null;
        while ((sMatch = seasonRegex.exec(seasonBlock)) !== null) {
            const label = sMatch[2]!.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
            // Eviter les doublons si une même saison apparaît dans plusieurs sections
            if (!relatedSeasons.find(rs => rs.href === sMatch![1].trim())) {
                relatedSeasons.push({ href: sMatch[1]!.trim(), label });
            }
        }
    }


    return { links, releaseNames, relatedSeasons };
}
