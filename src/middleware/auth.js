const { Session, User } = require("../models");
const { sha256, cookieOptions } = require("../utils/security");
const { thumbPath } = require("../utils/storage");

const SESSION_COOKIE = "sid";
const SESSION_MS = 7 * 24 * 60 * 60 * 1000; // 7 ngày
const ROLES = ["user", "admin"]; // vai chọn ở trang phố sau khi đăng nhập: khách (user) | đầu bếp (admin)
// Vai của TÀI KHOẢN (chọn lúc đăng ký, lưu ở users.role): "chef" vào được cả 2 vai, "customer" chỉ được vào vai khách.
const canUseRole = (account, role) =>
  role === "user" || (role === "admin" && account === "chef");
// Đọc cookie `sid` -> băm SHA-256 -> tra bảng sessions trong DB. Hợp lệ thì gắn req.user.
// Chưa đăng nhập vẫn đi tiếp bình thường: chỉ các route bọc requireAuth / requireAdmin mới bắt đăng nhập.
// Cookie `role` chỉ là vai đang chọn (giao diện), KHÔNG phải quyền: nó chỉ có nghĩa khi đã có phiên đăng nhập thật.
async function attachUser(req, res, next) {
  req.user = null;
  req.role = null;
  res.locals.user = null;
  res.locals.role = null;
  res.locals.daDangNhap = false;
  if (req.cookies && req.cookies.dn) res.clearCookie("dn"); // cờ đăng nhập giả lập của bản giao diện cũ (không còn dùng)

  const token = req.cookies && req.cookies[SESSION_COOKIE];
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    if (req.cookies && req.cookies.role) res.clearCookie("role");
    return next();
  }
  try {
    const session = await Session.findByPk(sha256(token), {
      include: [{ model: User, as: "user" }],
    });
    if (!session) {
      res.clearCookie(SESSION_COOKIE, cookieOptions());
      res.clearCookie("role");
      return next();
    }
    if (
      session.expiresAt < new Date() ||
      !session.user ||
      !session.user.emailVerifiedAt
    ) {
      await session.destroy();
      res.clearCookie(SESSION_COOKIE, cookieOptions());
      res.clearCookie("role");
      return next();
    }
    req.user = session.user;
    req.sessionId = session.id;
    const role = req.cookies.role;
      // cookie `role` bị sửa tay thành admin mà tài khoản là khách thì vẫn không có quyền
    req.role =
      ROLES.includes(role) && canUseRole(session.user.role, role) ? role : null;
    // avatar: URL thumbnail (240px) của ảnh đại diện, rỗng nếu chưa có
    res.locals.user = {
      name: session.user.name,
      email: session.user.email,
      role: session.user.role, // "chef" | "customer" (vai của tài khoản)
      avatar: session.user.avatarUrl ? thumbPath(session.user.avatarUrl) : "",
    };
    res.locals.role = req.role;
    res.locals.daDangNhap = true; // trang chủ dựa vào cờ này để hiện cô gái + 2 bảng
    next();
  } catch (err) {
    next(err);
  }
}

// Bắt buộc đăng nhập. Chưa đăng nhập -> về /login (GET thì nhớ trang đang vào).
function requireAuth(req, res, next) {
  if (req.user) return next();
  const back =
    req.method === "GET" ? `?next=${encodeURIComponent(req.originalUrl)}` : "";
  res.redirect(303, `/login${back}`);
}

// Khu quản trị /admin/**: phải đăng nhập (phiên thật) và đang ở vai "Đầu bếp".
function requireAdmin(req, res, next) {
  if (!req.user) return requireAuth(req, res, next);
  if (!req.role) return res.redirect(303, "/"); // đã đăng nhập nhưng chưa chọn vai: ra phố chọn
    if (req.role !== "admin" || req.user.role !== "chef") {
    return res.status(403).render("error", {
      status: 403,
      message: "Trang này chỉ dành cho role admin.",
    });
  }
  next();
}

// Chặn CSRF: request đổi dữ liệu (POST/PATCH/DELETE) phải đến từ chính website này.
// Cùng với SameSite=Lax của cookie là đủ cho form HTML thuần và fetch cùng nguồn.
function sameOriginOnly(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const src = req.get("origin") || req.get("referer");
  if (src) {
    let host = null;
    try {
      host = new URL(src).host;
    } catch (e) {}
    if (host !== req.get("host")) {
      if (req.is("json"))
        return res
          .status(403)
          .json({ ok: false, error: "Yêu cầu bị từ chối (không cùng nguồn)." });
      return res.status(403).render("error", {
        status: 403,
        message: "Yêu cầu bị từ chối (không cùng nguồn).",
      });
    }
  }
  next();
}

module.exports = {
  ROLES,
  SESSION_COOKIE,
  SESSION_MS,
  attachUser,
  requireAuth,
  requireAdmin,
  sameOriginOnly,
  canUseRole
};
