import { sourceRegistry } from '../core/registry.js';
import { ISource, SearchResult } from '../types/source.js';

export interface GlobalState {
    currentTitleId: string | null;
    currentTitleName: string | null;
    currentIdentifier: string | null; // hrefPath du contenu sélectionné (source-agnostic)
    currentSelectionSource: string | null; // Nom de la source ayant fourni le contenu sélectionné
    currentLiens: any[];
    directUrlMap: Record<string, string>;
    isSeries: boolean;
    activeSources: string[]; // Liste des sources actives
    isSiteOffline: boolean;
    siteOfflineMessage: string;
    isCheckingStatus: boolean;
    trendingFilms: SearchResult[];
    trendingSeries: SearchResult[];
}

export const globalState: GlobalState = {
    currentTitleId: null,
    currentTitleName: null,
    currentIdentifier: null,
    currentSelectionSource: null,
    currentLiens: [],
    directUrlMap: {},
    isSeries: false,
    activeSources: [],
    isSiteOffline: true,
    siteOfflineMessage: "Vérification du statut du site en cours...",
    isCheckingStatus: false,
    trendingFilms: [],
    trendingSeries: [],
};

/**
 * Retourne les instances des sources actives via le registry.
 */
export function getActiveSources(): ISource[] {
    return globalState.activeSources
        .map(name => sourceRegistry.get(name))
        .filter((source): source is ISource => source !== null);
}

/**
 * Met à jour le statut du site (offline/online) et charge les tendances de toutes les sources actives.
 */
export async function checkSiteStatus() {
    if (globalState.isCheckingStatus) return;
    globalState.isCheckingStatus = true;

    const sources = getActiveSources();
    if (sources.length === 0) {
        globalState.isSiteOffline = true;
        globalState.siteOfflineMessage = "Aucune source configurée.";
        globalState.trendingFilms = [];
        globalState.trendingSeries = [];
        globalState.isCheckingStatus = false;
        return;
    }

    console.log(`[Vérification] Test de ${sources.length} sources actives...`);

    let allFilms: SearchResult[] = [];
    let allSeries: SearchResult[] = [];
    let onlineSourcesCount = 0;

    try {
        const results = await Promise.allSettled(sources.map(async (source) => {
            const films = await source.getTrending('movie');
            const series = await source.getTrending('series');
            return { source, films, series };
        }));

        for (const result of results) {
            if (result.status === 'fulfilled' && result.value.films && result.value.films.length > 0) {
                const { source, films, series } = result.value;
                onlineSourcesCount++;
                allFilms = allFilms.concat(films);
                if (series) allSeries = allSeries.concat(series);
                console.log(`[${source.name.toUpperCase()}] ${films.length} films, ${series?.length || 0} séries.`);
            } else if (result.status === 'rejected') {
                console.error(`[Erreur] Source indisponible: ${result.reason}`);
            }
        }

        globalState.trendingFilms = allFilms;
        globalState.trendingSeries = allSeries;

        if (onlineSourcesCount > 0) {
            globalState.isSiteOffline = false;
            globalState.siteOfflineMessage = "";
        } else {
            globalState.isSiteOffline = true;
            globalState.siteOfflineMessage = "Toutes les sources actives sont indisponibles.";
        }
    } catch (error: any) {
        console.error(`[ERREUR FATALE] ${error.message}`);
        globalState.isSiteOffline = true;
        globalState.siteOfflineMessage = "Erreur lors de la vérification des sources.";
    } finally {
        globalState.isCheckingStatus = false;
        console.log("[Vérification] Terminée.");
    }
}
