const { Session, User } = require('../models');
const { sha256, cookieOptions } = require('../utils/security');

const SESSION_COOKIE = 'sid';
const SESSION_MS = 7 * 24 * 60 * 60 * 1000; // 7 ngày

// Đọc cookie `sid` -> băm SHA-256 -> tra bảng sessions trong DB. Hợp lệ thì gắn req.user.
// Khách (không có cookie) vẫn đi tiếp bình thường: chỉ các route bọc requireAuth mới bắt đăng nhập.
async function attachUser(req, res, next) {
  req.user = null;
  res.locals.role = null;
  res.locals.user = null;
  res.clearCookie('role'); // cookie `role` của bản demo cũ (không còn dùng)

  const token = req.cookies && req.cookies[SESSION_COOKIE];
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return next();
  try {
    const session = await Session.findByPk(sha256(token), { include: [{ model: User, as: 'user' }] });
    if (!session) {
      res.clearCookie(SESSION_COOKIE, cookieOptions());
      return next();
    }
    if (session.expiresAt < new Date() || !session.user || !session.user.emailVerifiedAt) {
      await session.destroy();
      res.clearCookie(SESSION_COOKIE, cookieOptions());
      return next();
    }
    req.user = session.user;
    req.sessionId = session.id;
    res.locals.role = session.user.role; // 'chef' -> view hiểu là đã đăng nhập
    res.locals.user = { name: session.user.name, email: session.user.email };
    next();
  } catch (err) {
    next(err);
  }
}

// Bắt buộc đăng nhập (dùng cho toàn bộ /admin = CRUD). Chưa đăng nhập -> về /login (GET thì nhớ trang đang vào).
function requireAuth(req, res, next) {
  if (req.user) return next();
  const back = req.method === 'GET' ? `?next=${encodeURIComponent(req.originalUrl)}` : '';
  res.redirect(303, `/login${back}`);
}

// Chặn CSRF: request đổi dữ liệu (POST/PATCH/DELETE) phải đến từ chính website này.
// Cùng với SameSite=Lax của cookie là đủ cho form HTML thuần, không phải sửa view.
function sameOriginOnly(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const src = req.get('origin') || req.get('referer');
  if (src) {
    let host = null;
    try {
      host = new URL(src).host;
    } catch (e) {}
    if (host !== req.get('host')) {
      return res.status(403).render('error', { status: 403, message: 'Yêu cầu bị từ chối (không cùng nguồn).' });
    }
  }
  next();
}

module.exports = { SESSION_COOKIE, SESSION_MS, attachUser, requireAuth, sameOriginOnly };
