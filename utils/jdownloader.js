const fs = require('fs');
const path = require('path');
const { PATHS } = require('./config');

async function sendToJDownloader(link, title, isSeries) {
    const fileName = `link_${Date.now()}.crawljob`;
    const filePath = path.join(PATHS.JD_WATCH, fileName);
    const lineEnding = '\r\n';

    const safeLink = link.replace(/[\r\n]/g, '').trim();
    let fileContent = `text=${safeLink}${lineEnding}`;
    fileContent += `autoStart=TRUE${lineEnding}`;

    if (title) {
        const safeTitle = title.replace(/[\r\n<>:"/\\|?*]+/g, '').replace(/\.$/, '').trim();
        fileContent += `packageName=${safeTitle}${lineEnding}`;

        if (isSeries) {
            console.log(`Série (${title}), configuration chemin JD...`);
            const seriesDownloadFolder = `/output/Séries/${safeTitle}`;
            fileContent += `downloadFolder=${seriesDownloadFolder}${lineEnding}`;
            console.log(` -> DownloadFolder: ${seriesDownloadFolder}`);
        } else {
            console.log(`Film (${title}), configuration paquet JD...`);
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
    } catch (error) {
        console.error(`❌ Erreur JDownloader (${fileName}):`, error.message);
    }
}

module.exports = { sendToJDownloader };
