/** Small server-side thumbnail for an uploaded image (blob:/data: URLs are returned as-is). */
export const small = (url) => (url?.startsWith('/uploads/') ? `${url}?s=1` : url);

/** Pixel size from the file header, without decoding the whole photo. */
async function headerSize(file) {
  const b = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
  if (b.byteLength > 24 && b.getUint32(0) === 0x89504e47) return [b.getUint32(16), b.getUint32(20)];
  if (b.byteLength < 4 || b.getUint16(0) !== 0xffd8) return null;
  for (let i = 2; i + 9 < b.byteLength; ) {
    if (b.getUint8(i) !== 0xff) return null;
    const m = b.getUint8(i + 1);
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [b.getUint16(i + 7), b.getUint16(i + 5)];
    i += 2 + b.getUint16(i + 2);
  }
  return null;
}

/**
 * Decode already shrunk: phone photos (50–200MP on Samsung) decoded at full size
 * take seconds and hundreds of MB. Only the width is given so the browser keeps the
 * aspect ratio itself (EXIF-rotated photos stay correct); the canvas trims the rest.
 */
async function decode(file, max) {
  const size = await headerSize(file).catch(() => null);
  if (size && Math.min(...size) > max) {
    try {
      return await createImageBitmap(file, { resizeWidth: max, resizeQuality: 'high' });
    } catch {
      /* older browsers: fall back to a full decode */
    }
  }
  return createImageBitmap(file);
}

/** Resize an image file/blob to fit `max` px and re-encode as JPEG. */
export async function compressImage(file, max = 1600, quality = 0.82) {
  const bmp = await decode(file, max);
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

// Decode manually: fetch(data:) is blocked by our CSP (connect-src 'self').
export async function dataURLToBlob(url) {
  const [head, b64] = url.split(',', 2);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: /^data:([^;]+)/.exec(head)?.[1] || 'application/octet-stream' });
}

/** Image files from a paste / drop event. */
export function imagesFromTransfer(dt) {
  return [...(dt?.files || [])].filter((f) => /^image\/(jpeg|png|webp|gif|heic|heif)$/.test(f.type));
}
