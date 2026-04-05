import Jimp from 'jimp';

async function main() {
  try {
    const image = await Jimp.read('C:/Users/KO/.gemini/antigravity/brain/e0515b23-afa2-450e-9ce0-a3786453600f/media__1775346801783.png');
    console.log(`__DIMENSIONS__:${image.bitmap.width}:${image.bitmap.height}`);
    
    // Assume 2 rows, 5 columns
    const cols = 5;
    const rows = 2;
    const emojiWidth = Math.floor(image.bitmap.width / cols);
    const emojiHeight = Math.floor(image.bitmap.height / rows);
    
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const index = r * cols + c + 1;
        const x = c * emojiWidth;
        const y = r * emojiHeight;
        
        const clone = image.clone().crop({ x, y, w: emojiWidth, h: emojiHeight });
        await clone.write(`public/emojis/emoji${index}.png`);
        console.log(`Saved emoji${index}.png`);
      }
    }
  } catch (err) {
    console.error('Error during cropping:', err);
  }
}

main();
