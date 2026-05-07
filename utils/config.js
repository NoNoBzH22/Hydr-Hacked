require('dotenv').config();

const CONFIG = {
    // Hydracker (optionnel)
    BASE_URL: process.env.BASE_URL,
    DW_API_KEY: process.env.DW_API_KEY,

    // Zone-Telechargement (source par défaut)
    ZT_BASE_URL: process.env.ZT_BASE_URL,

    // App
    API_PASSWORD: process.env.API_PASSWORD || 'hydracker',
    JD_HOST: process.env.JD_HOST,
    JD_API_PORT: process.env.JD_API_PORT,
    SECRET: process.env.SECRET || 'hydracker-secret-key-12345',
    MIN_MINUTES: parseInt(process.env.MIN_MINUTES, 10) || 15,
    MAX_MINUTES: parseInt(process.env.MAX_MINUTES, 10) || 30,
    PORT: process.env.PORT || 3000,
};

// Déterminer si Hydracker est disponible (les deux sont requis)
const HYDRACKER_AVAILABLE = !!(CONFIG.BASE_URL && CONFIG.DW_API_KEY);
const ZT_AVAILABLE = !!CONFIG.ZT_BASE_URL;

const PATHS = {
    JD_WATCH: '/downloads',
};

module.exports = {
    CONFIG,
    PATHS,
    HYDRACKER_AVAILABLE,
    ZT_AVAILABLE
};
