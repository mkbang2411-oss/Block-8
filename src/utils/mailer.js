// Gửi email. Ưu tiên theo biến môi trường:
//   1) RESEND_API_KEY  -> gọi HTTPS API của Resend (dùng được cả khi host chặn cổng SMTP)
//   2) SMTP_HOST...    -> nodemailer qua SMTP (Gmail App Password, Brevo, Mailtrap...)
//   3) không cấu hình  -> chỉ in link ra console (chỉ khi NODE_ENV != production)
const nodemailer = require('nodemailer');
const { isProd } = require('./security');

const FROM = () => process.env.MAIL_FROM || process.env.SMTP_USER || 'Cái Quán Ăn <onboarding@resend.dev>';

let transporter;
function getTransporter() {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT) || 587;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

async function sendMail({ to, subject, html, text }) {
  if (process.env.RESEND_API_KEY) {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM(), to: [to], subject, html, text }),
    });
    if (!r.ok) throw new Error(`Resend lỗi ${r.status}: ${await r.text()}`);
    return;
  }
  if (process.env.SMTP_HOST) {
    await getTransporter().sendMail({ from: FROM(), to, subject, html, text });
    return;
  }
  if (isProd) throw new Error('Chưa cấu hình gửi email (RESEND_API_KEY hoặc SMTP_HOST)');
  console.log(`\n[DEV - chưa cấu hình email] Gửi tới ${to}\n${subject}\n${text}\n`);
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function verifyEmailContent({ name, link, hours }) {
  return {
    subject: 'Xác nhận email đăng ký - Cái Quán Ăn',
    text: `Chào ${name},\n\nBấm vào liên kết sau để xác nhận email và kích hoạt tài khoản đầu bếp (hiệu lực ${hours} giờ):\n${link}\n\nNếu bạn không đăng ký, hãy bỏ qua email này.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:480px">
      <h2>Cái Quán Ăn</h2>
      <p>Chào <b>${esc(name)}</b>,</p>
      <p>Bấm nút bên dưới để xác nhận email và kích hoạt tài khoản đầu bếp (hiệu lực ${hours} giờ).</p>
      <p><a href="${esc(link)}" style="display:inline-block;padding:10px 18px;background:#b5301f;color:#fff;border-radius:8px;text-decoration:none">Xác nhận email</a></p>
      <p style="font-size:12px;color:#666">Hoặc dán liên kết này vào trình duyệt:<br>${esc(link)}</p>
      <p style="font-size:12px;color:#666">Nếu bạn không đăng ký, hãy bỏ qua email này.</p></div>`,
  };
}

function otpEmailContent({ name, otp, minutes }) {
  return {
    subject: 'Mã OTP đặt lại mật khẩu - Cái Quán Ăn',
    text: `Chào ${name},\n\nMã OTP đặt lại mật khẩu của bạn: ${otp}\nMã có hiệu lực ${minutes} phút. Tuyệt đối không chia sẻ mã này.\n\nNếu bạn không yêu cầu, hãy bỏ qua email này.`,
    html: `<div style="font-family:Arial,sans-serif;max-width:480px">
      <h2>Cái Quán Ăn</h2>
      <p>Chào <b>${esc(name)}</b>, mã OTP đặt lại mật khẩu của bạn là:</p>
      <p style="font-size:32px;letter-spacing:8px;font-weight:bold">${esc(otp)}</p>
      <p>Mã có hiệu lực ${minutes} phút. Không chia sẻ mã này cho bất kỳ ai.</p>
      <p style="font-size:12px;color:#666">Nếu bạn không yêu cầu, hãy bỏ qua email này.</p></div>`,
  };
}

module.exports = { sendMail, verifyEmailContent, otpEmailContent };
