// Xác minh Google reCAPTCHA v2 ("Tôi không phải là người máy"): ở bước 1 đăng ký (TRƯỚC khi server gửi OTP)
// và ở đăng nhập (khi đã nhập sai từ 3 lần).
//   RECAPTCHA_SITE_KEY   -> view hiện widget thật (thay ô giả lập)
//   RECAPTCHA_SECRET_KEY -> server gọi Google kiểm tra token.
//     Để trống: dev (NODE_ENV != production) bỏ qua kiểm tra; PRODUCTION thì TỪ CHỐI (fail-closed), vì ô giả lập không chặn được bot.
//   RECAPTCHA_HOSTNAMES  -> (tùy chọn) thêm các tên miền khác được chấp nhận, cách nhau dấu phẩy (vd. tên miền riêng + *.onrender.com)
// Ngoài `success`, server còn kiểm tra `hostname` Google trả về: token do widget chạy trên trang KHÁC (site khác dùng chung site key,
// hoặc token bot lấy ở nơi khác) có hostname khác -> bị từ chối.
const { isProd } = require("./security");

// tên miền hợp lệ: hostname của APP_URL (nếu đặt) hoặc `fallbackHost` (hostname của request), cộng RECAPTCHA_HOSTNAMES
function allowedHostnames(fallbackHost) {
  const set = new Set();
  try {
    if (process.env.APP_URL)
      set.add(new URL(process.env.APP_URL).hostname.toLowerCase());
  } catch (e) {}
  if (!set.size && fallbackHost) set.add(String(fallbackHost).toLowerCase());
  for (const h of String(process.env.RECAPTCHA_HOSTNAMES || "").split(","))
    if (h.trim()) set.add(h.trim().toLowerCase());
  return set;
}

async function verifyRecaptcha(token, ip, requestHost) {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) {
    if (isProd)
      console.error(
        "Thiếu RECAPTCHA_SECRET_KEY khi chạy production: CAPTCHA bị từ chối.",
      );
    return !isProd;
  }
  if (typeof token !== "string" || !token || token.length > 4096) return false;
  try {
    const r = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret,
        response: token,
        remoteip: String(ip || ""),
      }),
    });
    const j = await r.json();
    if (j.success !== true) return false;
    const host = String(j.hostname || "").toLowerCase();
    // khóa thử của Google (chỉ dùng khi dev) luôn trả hostname "testkey.google.com"
    if (!isProd && host === "testkey.google.com") return true;
    if (!host || !allowedHostnames(requestHost).has(host)) {
      console.error(
        `reCAPTCHA: hostname "${host}" không khớp (mong đợi: ${[...allowedHostnames(requestHost)].join(", ") || "không xác định"}).`,
      );
      return false;
    }
    return true;
  } catch (err) {
    console.error("Gọi reCAPTCHA lỗi:", err.message);
    return false;
  }
}

module.exports = { verifyRecaptcha };
