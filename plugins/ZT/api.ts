/**
 * Appels réseau pour le plugin ZT.
 * Toutes les fonctions fetch sont ici ; le parsing reste dans parser.ts.
 */

export async function fetchSearchResults(baseUrl: string, query: string): Promise<string> {
    const url = `${baseUrl}/engine/ajax/controller.php?mod=filter&catid=0&q=${encodeURIComponent(query)}&art=0&AiffchageMode=0&inputTirePar=0&cstart=0`;
    const res = await fetch(url, {
        headers: {
            'User-Agent': 'Mozilla/5.0',
            'Accept': 'text/html, */*',
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': baseUrl
        }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
}

export async function fetchTrendingMovies(baseUrl: string): Promise<string> {
    const res = await fetch(`${baseUrl}/nouveaux-films/`, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
}

export async function fetchTrendingSeries(baseUrl: string): Promise<string> {
    const url = `${baseUrl}/engine/ajax/controller.php?mod=filter&catid=15&q=&art=0&AiffchageMode=0&inputTirePar=1&cstart=0`;
    const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
}

export async function fetchContentPage(pageUrl: string): Promise<string> {
    const res = await fetch(pageUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0' }
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
}
