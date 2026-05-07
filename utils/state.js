const { CONFIG, HYDRACKER_AVAILABLE, ZT_AVAILABLE } = require('./config');
const { DarkiWorldAPI } = require('../darkiworld-api');
const { ZoneTelechargementAPI } = require('../zt-api');

// Instancier les APIs disponibles
const dwApi = HYDRACKER_AVAILABLE ? new DarkiWorldAPI() : null;
const ztApi = ZT_AVAILABLE ? new ZoneTelechargementAPI(CONFIG.ZT_BASE_URL) : null;

// Source active par défaut : ZT si disponible, sinon Hydracker
// L'utilisateur peut switcher via le frontend (toggle Hydracker)
let activeSource = ZT_AVAILABLE ? 'zt' : (HYDRACKER_AVAILABLE ? 'hydracker' : 'none');

const globalState = {
    currentTitleId: null,
    currentTitleName: null,
    currentSeason: 1,
    currentLiens: [],
    directUrlMap: {},
    isSeries: false,
    // Source tracking
    currentSource: activeSource,
    // Site status
    isSiteOffline: true,
    siteOfflineMessage: "Vérification du statut du site en cours...",
    isCheckingStatus: false,
    trendingFilms: [],
    trendingSeries: [],
    // ZT-specific: store the current page URL for content fetching
    currentZtPageUrl: null,
    currentZtRelatedSeasons: [],
};

console.log(`[Init] Sources disponibles — ZT: ${ZT_AVAILABLE ? '✅' : '❌'} | Hydracker: ${HYDRACKER_AVAILABLE ? '✅' : '❌'}`);
console.log(`[Init] Source active par défaut: ${activeSource.toUpperCase()}`);

module.exports = {
    dwApi,
    ztApi,
    globalState,
    HYDRACKER_AVAILABLE,
    ZT_AVAILABLE
};
