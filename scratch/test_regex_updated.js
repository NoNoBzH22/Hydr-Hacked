const label = "THE.BATMAN.2022.MULTI.TRUEFRENCH.1080P.WEB.H264-ALLDAYIN (11.5 GO)";
const sizeRegex = /\s*\(([\d.,]+\s*(?:go|gb|mo|mb|ko|kb|to|tb))\)/i;
const sizeMatch = label.match(sizeRegex);
const size = sizeMatch ? sizeMatch[1].trim().toUpperCase() : undefined;
const cleanedLabel = label.replace(sizeRegex, "").trim();

console.log(`Original: "${label}"`);
console.log(`Extracted Size: "${size}"`);
console.log(`Cleaned Label: "${cleanedLabel}"`);

const label2 = "SERIE.S01E01.VOSTFR.720P (500 MO)";
const sizeMatch2 = label2.match(sizeRegex);
const size2 = sizeMatch2 ? sizeMatch2[1].trim().toUpperCase() : undefined;
const cleanedLabel2 = label2.replace(sizeRegex, "").trim();

console.log(`\nOriginal: "${label2}"`);
console.log(`Extracted Size: "${size2}"`);
console.log(`Cleaned Label: "${cleanedLabel2}"`);
