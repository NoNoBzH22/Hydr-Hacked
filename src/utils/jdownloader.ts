import { CONFIG, PATHS } from './config.js';

export async function sendToJDownloader(link: string, titleName: string, isSeries: boolean = false) {
    if (!CONFIG.JD_HOST) {
        console.warn('[JD] JD_HOST non configuré. Envoi ignoré.');
        return;
    }

    const jdUrl = `http://${CONFIG.JD_HOST}:${CONFIG.JD_API_PORT || 3128}/adlinks`;
    
    // Clean name for folder
    const folderName = titleName.replace(/[\\/:*?"<>|]/g, '').trim();
    const downloadPath = isSeries 
        ? `${PATHS.JD_WATCH}/${folderName}`
        : `${PATHS.JD_WATCH}`;

    const params = new URLSearchParams();
    params.append('links', link);
    params.append('packageName', folderName);
    params.append('destinationFolder', downloadPath);
    params.append('autostart', 'true');

    try {
        console.log(`[JD] Envoi vers ${jdUrl} (Folder: ${folderName})...`);
        const res = await fetch(jdUrl, {
            method: 'POST',
            body: params
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        console.log(`[JD] ✅ Lien envoyé avec succès.`);
    } catch (e: any) {
        console.error(`[JD] ❌ Erreur JDownloader:`, e.message);
        throw e;
    }
}
