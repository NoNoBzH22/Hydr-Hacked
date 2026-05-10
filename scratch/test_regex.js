const label = "THE.BATMAN.2022.MULTI.TRUEFRENCH.1080P.WEB.H264-ALLDAYIN (11.5 GO)";
const sizeMatch = label.match(/\(([^)]+(?:go|gb|mo|mb|ko|kb|to|tb)[^)]*)\)\s*$/i);
const size = sizeMatch ? sizeMatch[1].trim().toUpperCase() : undefined;
console.log(`Label: "${label}"`);
console.log(`Size: "${size}"`);
