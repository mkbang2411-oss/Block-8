const crypto = require('crypto');

// Token ngẫu nhiên an toàn mật mã (256 bit, dạng hex 64 ký tự)
const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString('hex');

// SHA-256 dạng hex: dùng để lưu token/phiên/đáp án captcha (giá trị ngẫu nhiên entropy cao nên không cần salt/chậm như mật khẩu)
const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

// So sánh hai chuỗi hex theo thời gian không đổi (chống timing attack)
const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

const isProd = process.env.NODE_ENV === 'production';

// Cookie phiên: httpOnly (JS không đọc được), SameSite=Lax (chặn gửi kèm từ site khác với POST), Secure khi chạy production (HTTPS)
const cookieOptions = (maxAgeMs) => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: isProd,
  path: '/',
  ...(maxAgeMs ? { maxAge: maxAgeMs } : {}),
});

// Chỉ cho phép redirect về đường dẫn nội bộ (chống open redirect)
const safeNext = (value, fallback = '/') =>
  typeof value === 'string' && /^\/(?![/\\])[\w\-./?=&%]*$/.test(value) && value.length < 300 ? value : fallback;

module.exports = { randomToken, sha256, safeEqual, cookieOptions, safeNext, isProd };
