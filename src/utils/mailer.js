// Gửi email. Ưu tiên theo biến môi trường:
//   1) RESEND_API_KEY  -> gọi HTTPS API của Resend (dùng được cả khi host chặn cổng SMTP)
//   2) SMTP_HOST...    -> nodemailer qua SMTP (Gmail App Password, Brevo, Mailtrap...)
//   3) không cấu hình  -> chỉ in link ra console (chỉ khi NODE_ENV != production)
const nodemailer = require("nodemailer");
const { isProd } = require("./security");

const FROM = () =>
  process.env.MAIL_FROM ||
  process.env.SMTP_USER ||
  "Cái Quán Ăn <onboarding@resend.dev>";

let transporter;
function getTransporter() {
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT) || 587;
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
    });
  }
  return transporter;
}

async function sendMail({ to, subject, html, text }) {
  if (process.env.RESEND_API_KEY) {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ from: FROM(), to: [to], subject, html, text }),
    });
    if (!r.ok) throw new Error(`Resend lỗi ${r.status}: ${await r.text()}`);
    return;
  }
  if (process.env.SMTP_HOST) {
    await getTransporter().sendMail({ from: FROM(), to, subject, html, text });
    return;
  }
  if (isProd)
    throw new Error("Chưa cấu hình gửi email (RESEND_API_KEY hoặc SMTP_HOST)");
  console.log(
    `\n[DEV - chưa cấu hình email] Gửi tới ${to}\n${subject}\n${text}\n`,
  );
}

const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

// Nội dung từng loại OTP
const OTP_KIND = {
  register: {
    subject: "Mã xác thực đăng ký - Cái Quán Ăn",
    lead: "mời bạn nhập mã bên dưới để xác thực email và tiếp tục đăng ký.",
  },
  reset: {
    subject: "Mã OTP đặt lại mật khẩu - Cái Quán Ăn",
    lead: "mời bạn nhập mã bên dưới để đặt lại mật khẩu.",
  },
};

// Email OTP theo mẫu Hội An (otp-email.html). Viết lại cho trình đọc mail (Gmail, Outlook...): bố cục bằng <table>, CSS inline,
// font có dự phòng, KHÔNG dùng JS / biến CSS / SVG.
// Ảnh nền hoian-bg.jpg (dựng từ hoian-bg.svg) được tải từ APP_URL, và PHẢI là địa chỉ công khai (https://...):
//   - Gmail/Outlook.com tải ảnh qua máy chủ của họ nên KHÔNG thấy được http://localhost.
//   - Để ảnh hiện ở nhiều trình đọc mail, nền được khai báo 4 lớp: thuộc tính background + bgcolor (mail cũ),
//     background-image + background-size trong style (Gmail, Apple Mail), và VML (Outlook desktop).
//   Mail nào chặn ảnh thì vẫn còn nền gradient trời/biển vẽ bằng CSS.
const isPublicUrl = (u) =>
  /^https:\/\//i.test(u) &&
  !/^https:\/\/(localhost|127\.|10\.|192\.168\.)/i.test(u);
let warnedBg = false;
function otpEmailContent({ name, otp, minutes, kind = "reset", baseUrl = "" }) {
  const k = OTP_KIND[kind] || OTP_KIND.reset;
  const who = name ? esc(name) : "bạn";
  const hien = `${otp.slice(0, 3)} ${otp.slice(3)}`; // 483 192 (dấu cách không ngắt dòng)
  const bg = baseUrl ? `${baseUrl}/img/email/hoian-bg.jpg` : "";
  if (bg && !isPublicUrl(baseUrl) && !warnedBg) {
    warnedBg = true;
    console.warn(
      `[mail] APP_URL=${baseUrl} không phải địa chỉ https công khai: Gmail/Outlook sẽ không tải được ảnh nền Hội An (chỉ thấy nền gradient thay cho ảnh). Đặt APP_URL=https://... khi chạy thật.`,
    );
  }
  // Lớp gradient vẽ lại cảnh Hội An (trời pastel + biển xanh): hiện khi ảnh bị chặn (mail trong Spam, localhost, tắt ảnh)
  const scene =
    "linear-gradient(180deg,#dbe8f8 0%,#e7d6ea 33%,#f4dfd3 52%,#f2dcba 57%,#9dc4a5 58%,#7bbdb0 64%,#2d7a85 100%)";
  const bgStyle = bg
    ? `background-color:#7bbdb0;background-image:url('${esc(bg)}'),${scene};background-position:center center;background-repeat:no-repeat;background-size:cover;`
    : `background-color:#7bbdb0;background-image:${scene};`;
  // Georgia thiếu vài tổ hợp dấu tiếng Việt (ế, ấ, ề...) nên dùng Palatino/Times; DejaVu Serif cho máy Linux/ChromeOS
  const serif =
    "'Palatino Linotype',Palatino,'Times New Roman','DejaVu Serif',serif";
  // giờ hết hạn (giờ Việt Nam): vừa hữu ích vừa làm mỗi thư khác nhau để Gmail không tự thu gọn phần cuối thành "..."
  const hanLuc = new Date(Date.now() + minutes * 60 * 1000).toLocaleTimeString(
    "vi-VN",
    { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Ho_Chi_Minh" },
  );
  const html = `<!DOCTYPE html>
<html lang="vi" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mã xác thực OTP</title></head>
<body style="margin:0;padding:0;background-color:#7bbdb0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#7bbdb0"${bg ? ` background="${esc(bg)}"` : ""} style="${bgStyle}">
<tr><td align="center" valign="top" bgcolor="#7bbdb0"${bg ? ` background="${esc(bg)}"` : ""} style="${bgStyle}padding:32px 14px;">
${bg ? `<!--[if gte mso 9]><v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:640pt;"><v:fill type="frame" src="${esc(bg)}" color="#7bbdb0"/><v:textbox inset="0,0,0,0"><![endif]-->` : ""}
  <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" bgcolor="#fffaf6" style="width:100%;max-width:520px;background-color:#fffaf6;border-radius:20px;box-shadow:0 14px 40px rgba(20,70,80,0.28);">
  <tr><td height="8" style="height:8px;line-height:8px;font-size:0;border-radius:20px 20px 0 0;background-color:#d4507f;background-image:linear-gradient(90deg,#d4507f,#8fb7a0 50%,#4fa67f);">&nbsp;</td></tr>
  <tr><td align="center" style="padding:30px 30px 28px;font-family:${serif};color:#3a2214;">
    <div style="font-size:12px;line-height:16px;letter-spacing:4px;text-transform:uppercase;font-weight:bold;color:#4f8f7a;">Cái Quán Ăn</div>
    <div style="font-size:34px;line-height:46px;margin-top:6px;">🪷</div>
    <h1 style="margin:4px 0 10px;font-family:${serif};font-size:30px;line-height:1.25;font-weight:bold;color:#3a2214;">Mã xác thực của bạn</h1>
    <p style="margin:0;font-size:16px;line-height:1.6;color:#5b4a44;">Chào <b style="color:#3a2214;">${who}</b>, ${k.lead}</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:22px 0 16px;">
    <tr><td align="center" bgcolor="#ffffff" style="padding:18px 8px;background-color:#ffffff;border:2px solid #efc6d4;border-radius:16px;">
      <span style="font-family:${serif};font-size:46px;line-height:1;font-weight:bold;letter-spacing:10px;color:#3a2214;">${hien}</span>
    </td></tr></table>
    <p style="margin:0;font-size:14px;line-height:1.55;color:#6f5e58;">Mã có hiệu lực trong <b>${minutes} phút</b> (đến ${hanLuc}).<br>Vui lòng không chia sẻ mã này cho bất kỳ ai.</p>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="60%" style="margin:18px auto 14px;"><tr><td height="1" style="height:1px;line-height:1px;font-size:0;background-color:#ecd9d3;">&nbsp;</td></tr></table>
    <p style="margin:0;font-size:13px;line-height:1.5;color:#8a7a74;">Nếu bạn không yêu cầu, hãy bỏ qua email này.</p>
  </td></tr></table>
${bg ? "<!--[if gte mso 9]></v:textbox></v:rect><![endif]-->" : ""}
</td></tr></table>
</body></html>`;
  return {
    subject: k.subject,
    text: `Chào ${name || "bạn"},\n\nMã xác thực của bạn: ${otp}\nMã có hiệu lực ${minutes} phút (đến ${hanLuc}). Tuyệt đối không chia sẻ mã này cho bất kỳ ai.\n\nNếu bạn không yêu cầu, hãy bỏ qua email này.`,
    html,
  };
}

module.exports = { sendMail, otpEmailContent };
