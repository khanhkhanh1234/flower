export async function api(path, { method = 'GET', body, raw, type } = {}) {
  const opts = { method, headers: {}, credentials: 'same-origin' };
  if (raw) {
    opts.headers['content-type'] = type;
    opts.body = raw;
  } else if (body !== undefined) {
    opts.headers['content-type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(`/api${path}`, opts);
  } catch {
    throw new Error('Không kết nối được máy chủ');
  }
  const data = (res.headers.get('content-type') || '').includes('json') ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('fm:unauthorized'));
    throw new Error(data?.error || `Lỗi ${res.status}`);
  }
  return data;
}

export const uploadImage = (path, blob) => api(path, { method: 'POST', raw: blob, type: blob.type || 'image/jpeg' });
