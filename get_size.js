import fs from 'fs';

try {
    const buffer = fs.readFileSync('C:/Users/KO/Desktop/input_file_0.png');
    // PNG header: 8 bytes
    // IHDR block: 4 bytes (Length: 00 00 00 0D), 4 bytes (Type: IHDR), 4 bytes (Width), 4 bytes (Height)
    const width = buffer.readUInt32BE(16);
    const height = buffer.readUInt32BE(20);
    console.log(`WIDTH:${width},HEIGHT:${height}`);
} catch (e) {
    console.error(e);
}
