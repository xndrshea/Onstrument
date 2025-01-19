import sharp from 'sharp';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateAppleIcon() {
    try {
        await sharp(path.join(__dirname, 'favicon.ico'))
            .resize(180, 180)
            .extend({
                top: 0,
                bottom: 0,
                left: 0,
                right: 0,
                background: { r: 0, g: 0, b: 0, alpha: 1 } // Black background, adjust color as needed
            })
            .toFormat('png')
            .toFile(path.join(__dirname, 'apple-touch-icon.png'));

        console.log('Generated apple-touch-icon.png');
    } catch (error) {
        console.error('Error generating apple icon:', error);
    }
}

// Execute the function
generateAppleIcon(); 