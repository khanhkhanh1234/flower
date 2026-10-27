export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export function parse(schema, data) {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw new HttpError(400, 'Dữ liệu không hợp lệ', details);
  }
  return result.data;
}

export function errorHandler(err, _req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON không hợp lệ' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Dữ liệu quá lớn' });
  }
  console.error(err);
  res.status(500).json({ error: 'Lỗi máy chủ' });
}
