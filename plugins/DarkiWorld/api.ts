import { CONFIG } from '../../src/utils/config.js';

export const CONFIG_DW = {
    BASE_URL: (CONFIG.BASE_URL || '').replace(/\/$/, ''), // Supprime le slash final
    API_KEY: CONFIG.DW_API_KEY,
};

const DW_HEADERS = {
    'Accept': 'application/json',
    'Authorization': `Bearer ${CONFIG_DW.API_KEY}`,
    'User-Agent': 'Mozilla/5.0'
};

const TIMEOUT = 10_000; // 10 secondes max par requête

export async function apiGet(urlPath: string, params: Record<string, any> = {}) {
    const qs = Object.entries(params).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
    const url = `${CONFIG_DW.BASE_URL}/api/v1/${urlPath}` + (qs ? `?${qs}` : '');
    try {
        const res = await fetch(url, {
            headers: DW_HEADERS,
            signal: AbortSignal.timeout(TIMEOUT)
        });
        if (!res.ok) {
            console.error(`[DW-API] apiGet HTTP ${res.status} on ${urlPath}`);
            return null;
        }
        return await res.json();
    } catch (e: any) {
        console.error(`[DW-API] apiGet Error on ${urlPath}:`, e.message);
        return null;
    }
}

export async function apiPost(urlPath: string, body: any = {}) {
    const url = `${CONFIG_DW.BASE_URL}/api/v1/${urlPath}`;
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { ...DW_HEADERS, 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(TIMEOUT)
        });
        return { status: res.status, body: await res.text() };
    } catch (e: any) {
        console.error(`[DW-API] apiPost Error on ${urlPath}:`, e.message);
        return null;
    }
}

export async function fetchSearch(query: string) {
    const url = `${CONFIG_DW.BASE_URL}/api/v1/search/${encodeURIComponent(query)}?loader=searchAutocomplete`;
    try {
        const res = await fetch(url, {
            headers: DW_HEADERS,
            signal: AbortSignal.timeout(TIMEOUT)
        });
        if (!res.ok) {
            console.error(`[DW-API] Search HTTP ${res.status} for "${query}"`);
            return null;
        }
        return await res.json();
    } catch (e: any) {
        console.error('[DW-API] Search failed:', e.message);
        return null;
    }
}

export async function fetchMovieLinks(titleId: string) {
    const url = `${CONFIG_DW.BASE_URL}/api/v1/titles/${titleId}/download`;
    try {
        const res = await fetch(url, {
            headers: DW_HEADERS,
            signal: AbortSignal.timeout(TIMEOUT)
        });
        if (!res.ok) return null;
        return await res.json();
    } catch (e: any) {
        return null;
    }
}

export async function fetchSeriesLiens(titleId: string, season: number = 1) {
    const allLiens: any[] = [];
    let page = 1;
    while (true) {
        const result = await apiGet('liens', {
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
