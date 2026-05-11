import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { sourceRegistry } from './registry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Scanne le dossier plugins.
 * Chaque fichier s'auto-enregistre dans le registry au chargement du module.
 * Ensuite, les health checks sont lancés pour ne garder que les sources fonctionnelles.
 */
export async function discoverSources(): Promise<void> {
    const pluginsDir = path.join(__dirname, '../../plugins');
    console.log(`[Discovery] Scan du dossier plugins/... (${pluginsDir})`);

    if (!fs.existsSync(pluginsDir)) {
        console.warn('[Discovery] Aucun dossier plugins trouvé.');
        return;
    }

    const pluginFolders = fs.readdirSync(pluginsDir, { withFileTypes: true })
        .filter(dirent => dirent.isDirectory())
        .map(dirent => dirent.name);

    if (!pluginFolders.length) {
        console.warn('[Discovery] Aucun plugin trouvé.');
        return;
    }

    for (const folder of pluginFolders) {
        // En ES modules TypeScript compile, ce sera index.js (ou index.ts si on utilise ts-node)
        // On essaie d'importer le dossier directement, Node (avec moduleResolution: NodeNext) 
        // ou la configuration devrait trouver le index.js s'il est là. 
        // Plus sûr : importer explicitement le fichier index.js
        const indexPath = pathToFileURL(path.join(pluginsDir, folder, 'index.js')).href;
        try {
            await import(indexPath);
            console.log(`[Discovery] 📦 Plugin ${folder} chargé`);
        } catch (err: any) {
            console.error(`[Discovery] ⚠️ Erreur chargement plugin ${folder}:`, err.message);
        }
    }

    // Lance les health checks et ne garde que les sources fonctionnelles
    await sourceRegistry.initialize();
}
