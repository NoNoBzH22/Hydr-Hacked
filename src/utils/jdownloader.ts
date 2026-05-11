import { CONFIG } from './config.js';
import * as fs from 'fs';
import * as path from 'path';

// --- JDownloader ---
export async function sendToJDownloader(link: string, titleName: string, isSeries: boolean = false) {
    if (!CONFIG.PATHS_JD_WATCH) {
        console.error("Erreur JDownloader: PATHS_JD_WATCH non configuré.");
        return;
    }
    if (!CONFIG.PATHS_JD_FILMS) {
        console.error("Erreur JDownloader: PATHS_JD_FILMS non configuré.");
        return;
    }
    if (!CONFIG.PATHS_JD_SERIES) {
        console.error("Erreur JDownloader: PATHS_JD_SERIES non configuré.");
        return;
    }

    const fileName = `link_${Date.now()}.crawljob`;
    const filePath = path.join(CONFIG.PATHS_JD_WATCH, fileName);
    const lineEnding = '\n';

    const safeLink = link.trim() + "#movie.mkv"; 
    
    let fileContent = `text=${safeLink}${lineEnding}`;
    fileContent += `packageName=${titleName}${lineEnding}`;
    fileContent += `enabled=TRUE${lineEnding}`;
    fileContent += `autoStart=TRUE${lineEnding}`;
    fileContent += `forcedStart=TRUE${lineEnding}`;
    fileContent += `deepAnalyse=TRUE${lineEnding}`;
    fileContent += `autoConfirm=TRUE${lineEnding}`;
    
    if (titleName) {
        const safeTitle = titleName.replace(/[\r\n<>:"/\\|?*]+/g, '').replace(/\.$/, '').trim();
        fileContent += `packageName=${safeTitle}${lineEnding}`;

        if (isSeries) {
            console.log(`Série (${titleName}), configuration chemin JD...`);
            const seriesDownloadFolder = `${CONFIG.PATHS_JD_SERIES}${safeTitle}`;
            fileContent += `downloadFolder=${seriesDownloadFolder}${lineEnding}`;
            console.log(` -> DownloadFolder: ${seriesDownloadFolder}`);
        } else {
            console.log(`Film (${titleName}), configuration paquet JD...`);
        }
        console.log(` -> PackageName: ${safeTitle}`);
    }

    try {
        await fs.promises.writeFile(filePath, fileContent);
        await fs.promises.chmod(filePath, 0o666);
        try {
            await fs.promises.chown(filePath, 1000, 1000);
        } catch (e) {
            console.log("Note: Impossible de changer le propriétaire (chown).");
        }
        console.log(`✅ Fichier .crawljob (${fileName}) créé.`);
    } catch (error: any) {
        console.error(`❌ Erreur JDownloader (${fileName}):`, error.message);
    }
}
