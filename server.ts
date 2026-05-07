import express from 'express';
import session from 'express-session';
import connectSessionFileStore from 'session-file-store';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FileStore = connectSessionFileStore(session);

import { CONFIG } from './utils/config.js';
import { globalState, checkSiteStatus } from './utils/state.js';
import { discoverSources } from './sources/discovery.js';
import { sourceRegistry } from './sources/registry.js';

import authRoutes from './routes/auth.js';
import apiRoutes from './routes/api.js';
import jdRoutes from './routes/jd.js';
import proxyRoutes from './routes/proxy.js';

const app = express();
const PORT = CONFIG.PORT;

// Configuration EJS
app.set('view engine', 'ejs');
app.set('views', path.join(process.cwd(), 'views'));

// Middlewares
app.use(cors());
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'"],
        }
    }
}));
app.use(express.json());
app.set('trust proxy', 1);
app.use(cookieParser());
app.use(session({
    store: new FileStore({
        path: './sessions',
        ttl: 48 * 60 * 60,
        retries: 5
    }),
    secret: CONFIG.SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: 'auto',
        maxAge: 48 * 60 * 60 * 1000
    }
}));

// Route principale EJS
app.get('/', (req, res) => {
    res.render('index');
});

// Enregistrement des routes
app.use('/', authRoutes);
app.use('/', apiRoutes);
app.use('/', jdRoutes);
app.use('/', proxyRoutes);

// Serve frontend static files
app.use(express.static(path.join(process.cwd(), 'public')));

// ========================= DÉMARRAGE =========================

app.listen(PORT, async () => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`  Hydr'Hacked — API Server`);
    console.log(`${'='.repeat(60)}`);
    console.log(`Serveur API démarré sur http://localhost:${PORT}\n`);

    // Auto-discovery : scan sources/, import, health check
    await discoverSources();

    // Sélectionne ZT par défaut si disponible, sinon la première source saine
    if (sourceRegistry.has('zt')) {
        globalState.activeSources = ['zt'];
    } else {
        const defaultSource = sourceRegistry.getDefault();
        if (defaultSource) {
            globalState.activeSources = [defaultSource.name];
        }
    }
    console.log(`\nSource(s) par défaut: ${globalState.activeSources.map(s => s.toUpperCase()).join(', ') || 'Aucune'}`);

    const scheduleNextCheck = () => {
        const randomMinutes = Math.floor(Math.random() * (CONFIG.MAX_MINUTES - CONFIG.MIN_MINUTES + 1)) + CONFIG.MIN_MINUTES;
        console.log(`[Timer] Prochaine vérification dans ${randomMinutes} minutes.`);
        setTimeout(async () => { await checkSiteStatus(); scheduleNextCheck(); }, randomMinutes * 60 * 1000);
    };

    console.log("Lancement de la première vérification...");
    await checkSiteStatus();
    scheduleNextCheck();
});

process.on('SIGINT', () => { console.log('\nArrêt SIGINT...'); process.exit(0); });
process.on('SIGTERM', () => { console.log('\nArrêt SIGTERM...'); process.exit(0); });
