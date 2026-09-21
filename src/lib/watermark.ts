/**
 * Watermarking.
 *
 * Two forms, both real:
 *  - a live overlay in the protected viewer, tiled across the content so a
 *    phone photograph still carries the recipient's fingerprint;
 *  - a baked-in watermark burned into released image copies via canvas.
 *
 * A determined person can crop or clone-stamp a visible watermark out. This is
 * attribution pressure, not prevention, and the app says so.
 */

import { shortPrint } from './crypto';

export interface WatermarkIdentity {
  recipientLabel: string;
  grantId: string;
  seed: string;
  openedAt: number;
}

export function watermarkLines(identity: WatermarkIdentity): string[] {
  return [
  identity.recipientLabel,
  `${shortPrint(identity.grantId, 2)} · ${shortPrint(identity.seed, 1)}`,
  new Date(identity.openedAt).toISOString().replace('T', ' ').slice(0, 16)];

}

export function watermarkText(identity: WatermarkIdentity): string {
  return watermarkLines(identity).join('  ·  ');
}

/** Burns a tiled diagonal watermark into an image and returns a PNG blob. */
export async function watermarkImage(
source: Blob,
identity: WatermarkIdentity)
: Promise<Blob> {
  const url = URL.createObjectURL(source);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Image could not be decoded for watermarking.'));
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth || image.width;
    canvas.height = image.naturalHeight || image.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable for watermarking.');
    ctx.drawImage(image, 0, 0);

    const text = watermarkText(identity);
    const size = Math.max(12, Math.round(Math.min(canvas.width, canvas.height) / 34));
    ctx.font = `600 ${size}px "Geist Mono", monospace`;
    ctx.textBaseline = 'middle';
    const metrics = ctx.measureText(text);
    const stepX = metrics.width + size * 5;
    const stepY = size * 7;

    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(-28 * Math.PI / 180);
    ctx.translate(-canvas.width, -canvas.height);
    for (let y = 0; y < canvas.height * 2.2; y += stepY) {
      for (let x = 0; x < canvas.width * 2.4; x += stepX) {
        ctx.fillStyle = '#000000';
        ctx.fillText(text, x + 1, y + 1);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(text, x, y);
      }
    }
    ctx.restore();

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error('Watermarked image could not be encoded.')),
        'image/png'
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}