/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export async function imageToAscii(file: File, width: number = 40): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject('No context');

        const height = (img.height / img.width) * width * 0.55; // Adjust for character aspect ratio
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;
        const chars = '@%#*+=-:. ';
        let ascii = '';

        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const offset = (y * width + x) * 4;
            const r = data[offset];
            const g = data[offset + 1];
            const b = data[offset + 2];
            const avg = (r + g + b) / 3;
            const charIdx = Math.floor((avg / 255) * (chars.length - 1));
            ascii += chars[charIdx];
          }
          ascii += '\n';
        }
        resolve(ascii);
      };
      img.onerror = reject;
      img.src = e.target?.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
