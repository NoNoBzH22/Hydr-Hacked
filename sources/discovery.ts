import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { sourceRegistry } from './registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Scanne le dossier sources/ et importe dynamiquement tous les fichiers *-api.*.
 * Chaque fichier s'auto-enregistre dans le registry au chargement du module.
 * Ensuite, les health checks sont lancés pour ne garder que les sources fonctionnelles.
 */
export async function discoverSources(): Promise<void> {
    console.log('[Discovery] Scan du dossier sources/...');

    const files = fs.readdirSync(__dirname).filter(f => {
        return /^.+-api\.(js|ts)$/.test(f) && !f.endsWith('.d.ts');
    });

    if (!files.length) {
        console.warn('[Discovery] Aucun fichier source trouvé.');
        return;
    }

    for (const file of files) {
        const filePath = pathToFileURL(path.join(__dirname, file)).href;
        try {
            await import(filePath);
            console.log(`[Discovery] 📦 ${file} chargé`);
        } catch (err: any) {
            console.error(`[Discovery] ⚠️ Erreur chargement ${file}:`, err.message);
        }
    }

    // Lance les health checks et ne garde que les sources fonctionnelles
    await sourceRegistry.initialize();
}
