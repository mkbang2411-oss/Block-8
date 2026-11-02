// Giới hạn số lần gọi theo IP (lưu RAM, đủ cho 1 instance; khóa theo tài khoản nằm trong DB ở bảng users)
const { isProd } = require('./security');

const MSG = 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.';

function rateLimit({ windowMs, max, message }) {
  const hits = new Map(); // ip -> { count, reset }
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, windowMs);
  timer.unref();

  return (req, res, next) => {
    const now = Date.now();
    let h = hits.get(req.ip);
    if (!h || h.reset <= now) h = { count: 0, reset: now + windowMs };
    h.count += 1;
    hits.set(req.ip, h);
    if (h.count > max) {
      res.setHeader('Retry-After', Math.ceil((h.reset - now) / 1000));
      // giao diện đăng nhập/đăng ký gọi bằng fetch JSON -> trả JSON; còn lại render trang lỗi
      if (req.is('json')) return res.status(429).json({ ok: false, error: message || MSG });
      return res.status(429).render('error', { status: 429, message: message || MSG });
    }
    next();
  };
}

module.exports = { rateLimit, isProd };
