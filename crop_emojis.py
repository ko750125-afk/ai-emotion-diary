from PIL import Image
import os

def crop_emojis(image_path, output_dir, rows, cols):
    img = Image.open(image_path)
    width, height = img.size
    
    emoji_w = width // cols
    emoji_h = height // rows
    
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        
    count = 1
    for r in range(rows):
        for c in range(cols):
            left = c * emoji_w
            top = r * emoji_h
            right = (c + 1) * emoji_w
            bottom = (r + 1) * emoji_h
            
            emoji = img.crop((left, top, right, bottom))
            emoji.save(os.path.join(output_dir, f"emoji{count}.png"))
            print(f"Saved emoji{count}.png")
            count += 1
            if count > 10:
                break
        if count > 10:
            break

if __name__ == "__main__":
    crop_emojis("source_emojis.png", "public/emojis", 2, 5)
