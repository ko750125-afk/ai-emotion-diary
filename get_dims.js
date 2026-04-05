import Jimp from 'jimp';

async function main() {
  try {
    const image = await Jimp.read('C:/Users/KO/.gemini/antigravity/brain/e0515b23-afa2-450e-9ce0-a3786453600f/media__1775346801783.png');
    console.log(`Width: ${image.bitmap.width}, Height: ${image.bitmap.height}`);
  } catch (err) {
    console.error(err);
  }
}

main();
