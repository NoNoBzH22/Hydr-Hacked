require('dotenv').config();

const CONFIG = {
    BASE_URL: process.env.BASE_URL,
    API_PASSWORD: process.env.API_PASSWORD || 'hydracker',
    JD_HOST: process.env.JD_HOST,
    JD_API_PORT: process.env.JD_API_PORT,
    SECRET: process.env.SECRET || 'hydracker-secret-key-12345',
    MIN_MINUTES: parseInt(process.env.MIN_MINUTES, 10) || 15,
    MAX_MINUTES: parseInt(process.env.MAX_MINUTES, 10) || 30,
    PORT: process.env.PORT || 3000
};



module.exports = {
    CONFIG
};
