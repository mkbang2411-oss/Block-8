// Chặn CSRF cho mọi request đổi dữ liệu (POST/PUT/PATCH/DELETE) bằng CSRF TOKEN (double-submit cookie), kèm kiểm tra Origin/Referer.
//   - Mỗi trình duyệt có 1 cookie ngẫu nhiên 256 bit (httpOnly, SameSite=Lax; production dùng tiền tố __Host-: chỉ gắn được từ chính host này, bắt buộc Secure).
//   - Cùng giá trị đó được nhúng vào trang (res.locals.csrfToken -> <meta name="csrf-token"> và ô ẩn `_csrf` của từng <form>).
//   - Request đổi dữ liệu PHẢI gửi lại token ở header `X-CSRF-Token`, hoặc trường `_csrf` trong body/query (multipart/form-data thì dùng query, vì body chưa đọc được ở bước này).
//     Thiếu token hoặc token không khớp cookie -> 403. KHÔNG còn trường hợp "không có gì để kiểm tra thì cho qua" (fail-closed).
//   - Lớp phụ: nếu có Origin/Referer thì host phải trùng website này. Origin "null" (xảy ra khi trang đặt Referrer-Policy: no-referrer, như trang đặt lại
//     mật khẩu) vẫn được nhận vì token đã chứng minh request cùng nguồn; Origin/Referer vắng mặt cũng không sao vì token là điều kiện bắt buộc.
//   - Trang GET không bao giờ bị chặn; chỉ cấp cookie nếu chưa có.
const { randomToken, safeEqual, isProd } = require("../utils/security");

const COOKIE = isProd ? "__Host-csrf" : "csrf";
const TOKEN_RE = /^[a-f0-9]{64}$/;
const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

const deny = (req, res, msg) =>
  req.is("json") || /application\/json/.test(req.get("accept") || "")
    ? res.status(403).json({ ok: false, error: msg })
    : res.status(403).render("error", { status: 403, message: msg });

function csrf(req, res, next) {
  let token = req.cookies && req.cookies[COOKIE];
  if (!TOKEN_RE.test(token || "")) {
    token = randomToken();
    res.cookie(COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: isProd,
      path: "/",
    });
    req.cookies = { ...(req.cookies || {}), [COOKIE]: token };
    // request đổi dữ liệu mà chưa có cookie token (cookie bị xóa / chưa từng vào trang) -> từ chối, trang sẽ cấp token mới ở lần GET kế
    if (!SAFE.has(req.method))
      return deny(req, res, "Phiên làm việc đã hết hạn, vui lòng tải lại trang rồi thử lại.");
  }
  res.locals.csrfToken = token;
  if (SAFE.has(req.method)) return next();

  const sent =
    req.get("x-csrf-token") ||
    (req.body && typeof req.body._csrf === "string" && req.body._csrf) ||
    (typeof req.query._csrf === "string" && req.query._csrf) ||
    "";
  if (!TOKEN_RE.test(sent) || !safeEqual(sent, token))
    return deny(req, res, "Yêu cầu bị từ chối (thiếu hoặc sai mã CSRF). Vui lòng tải lại trang rồi thử lại.");

  const src = req.get("origin") || req.get("referer");
  if (src && src !== "null") {
    let host = null;
    try {
      host = new URL(src).host;
    } catch (e) {}
    if (host !== req.get("host"))
      return deny(req, res, "Yêu cầu bị từ chối (không cùng nguồn).");
  }
  next();
}

module.exports = { csrf, CSRF_COOKIE: COOKIE };
