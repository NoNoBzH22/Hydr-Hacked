import dotenv from 'dotenv';
dotenv.config();

export const CONFIG = {
    // Plugin Zone-Telechargement (par défaut)
    ZT_URL: process.env.ZT_URL,

    // Plugin Hydracker (optionnel)
    HYDRACKER_URL: process.env.HYDRACKER_URL,
    HYDRACKER_API_KEY: process.env.HYDRACKER_API_KEY,

    // App
    API_PASSWORD: process.env.API_PASSWORD || 'hydracked',
    JD_HOST: process.env.JD_HOST,
    JD_API_PORT: process.env.JD_API_PORT,
    PATHS_JD_SERIES: process.env.PATHS_JD_SERIES,
    PATHS_JD_FILMS: process.env.PATHS_JD_FILMS,
    PATHS_JD_WATCH: process.env.PATHS_JD_WATCH,
    SECRET: process.env.SECRET || 'hydracked-secret-key-12345',
    MIN_MINUTES: parseInt(process.env.MIN_MINUTES || '15', 10),
    MAX_MINUTES: parseInt(process.env.MAX_MINUTES || '30', 10),
    PORT: parseInt(process.env.PORT || '3067', 10),
};