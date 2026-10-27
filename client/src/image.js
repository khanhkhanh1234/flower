/** Resize an image file/blob to fit `max` px and re-encode as JPEG. */
export async function compressImage(file, max = 1600, quality = 0.82) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close?.();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Không nén được ảnh'))), 'image/jpeg', quality),
  );
}

export const blobToDataURL = (blob) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

export async function dataURLToBlob(url) {
  return (await fetch(url)).blob();
}

/** Image files from a paste / drop event. */
export function imagesFromTransfer(dt) {
  return [...(dt?.files || [])].filter((f) => /^image\/(jpeg|png|webp|gif|heic|heif)$/.test(f.type));
}
