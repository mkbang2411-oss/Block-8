// Giới hạn số lần gọi theo IP (lưu RAM, đủ cho 1 instance; khóa theo tài khoản nằm trong DB ở bảng users)
const { isProd } = require("./security");

const MSG = "Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút.";

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
      res.setHeader("Retry-After", Math.ceil((h.reset - now) / 1000));
      // giao diện đăng nhập/đăng ký gọi bằng fetch JSON -> trả JSON; còn lại render trang lỗi
      if (req.is("json"))
        return res.status(429).json({ ok: false, error: message || MSG });
      return res
        .status(429)
        .render("error", { status: 429, message: message || MSG });
    }
    next();
  };
}

// Giới hạn theo một KHÓA bất kỳ (vd. email), lưu RAM. Dùng cho email KHÔNG phân biệt có tài khoản hay không
// -> người ngoài không dò được email nào đã đăng ký qua việc có bị 429 hay không.
function keyLimiter({ windowMs, max }) {
  const hits = new Map(); // key -> { count, reset }
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, windowMs);
  timer.unref();
  // trả số ms phải chờ nếu đã vượt giới hạn, ngược lại 0 (và tính thêm 1 lượt)
  return (key) => {
    const now = Date.now();
    if (hits.size > 50000) hits.clear(); // chặn phình RAM khi bị spam email lạ
    let h = hits.get(key);
    if (!h || h.reset <= now) h = { count: 0, reset: now + windowMs };
    h.count += 1;
    hits.set(key, h);
    return h.count > max ? h.reset - now : 0;
  };
}

module.exports = { rateLimit, keyLimiter, isProd };
