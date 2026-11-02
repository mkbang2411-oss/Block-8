// Xác minh Google reCAPTCHA v2 ("Tôi không phải là người máy") ở bước 1 của đăng ký, TRƯỚC khi server gửi OTP.
//   RECAPTCHA_SITE_KEY   -> view hiện widget thật (thay ô giả lập)
//   RECAPTCHA_SECRET_KEY -> server gọi Google kiểm tra token; để trống = bỏ qua kiểm tra (chỉ nên dùng khi dev)
async function verifyRecaptcha(token, ip) {
  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) return true;
  if (typeof token !== 'string' || !token || token.length > 4096) return false;
  try {
    const r = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret, response: token, remoteip: String(ip || '') }),
    });
    const j = await r.json();
    return j.success === true;
  } catch (err) {
    console.error('Gọi reCAPTCHA lỗi:', err.message);
    return false;
  }
}

module.exports = { verifyRecaptcha };
