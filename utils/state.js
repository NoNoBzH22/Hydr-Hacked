const { DarkiWorldAPI } = require('../darkiworld-api');
const dwApi = new DarkiWorldAPI();

const globalState = {
    currentTitleId: null,
    currentTitleName: null,
    currentSeason: 1,
    currentLiens: [],
    directUrlMap: {},
    isSeries: false,
    isSiteOffline: true,
    siteOfflineMessage: "Vérification du statut du site en cours...",
    isCheckingStatus: false,
    trendingFilms: [],
    trendingSeries: []
};

module.exports = {
    dwApi,
    globalState
};
