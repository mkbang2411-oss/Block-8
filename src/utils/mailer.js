// Gửi email. Ưu tiên theo biến môi trường:
//   1) RESEND_API_KEY  -> gọi HTTPS API của Resend (dùng được cả khi host chặn cổng SMTP)
//   2) SMTP_HOST...    -> nodemailer qua SMTP (Gmail App Password, Brevo, Mailtrap...)
//   3) không cấu hình  -> không gửi; chỉ khi NODE_ENV != production VÀ DEV_PRINT_MAIL=1 mới in nội dung thư (OTP/link) ra console
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
  // Mặc định KHÔNG ghi nội dung thư (có OTP / link đặt lại) vào log. Dev muốn xem mã thì chủ động đặt DEV_PRINT_MAIL=1 (không có tác dụng ở production).
  if (process.env.DEV_PRINT_MAIL === "1")
    console.log(
      `\n[DEV - DEV_PRINT_MAIL=1] Gửi tới ${to}\n${subject}\n${text}\n`,
    );
  else
    console.log(
      `[DEV] Chưa cấu hình email: thư "${subject}" tới ${to} KHÔNG được gửi. Đặt DEV_PRINT_MAIL=1 trong .env để in nội dung thư ra console khi dev.`,
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

// Khung email chung. `khoi` là phần giữa (HTML) + `khoiText` là bản chữ thường của nó cho trình đọc mail không hiện HTML.
// Email theo mẫu Hội An (otp-email.html), dùng chung cho: OTP đăng ký, link đặt lại mật khẩu, thông báo "email đã có tài khoản", thông báo "mật khẩu đã thay đổi". Viết lại cho trình đọc mail (Gmail, Outlook...): bố cục bằng <table>, CSS inline,
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
function renderMail({
  subject,
  name,
  heading,
  lead,
  khoi,
  hanHtml,
  hanText,
  textBody,
  baseUrl = "",
  minutes = 0,
  // câu cuối thư: mặc định dành cho thư người dùng tự yêu cầu (OTP, link); thư thông báo (vd. đã đổi mật khẩu) truyền câu khác
  footer = "Nếu bạn không yêu cầu, hãy bỏ qua email này.",
}) {
  const who = name ? esc(name) : "bạn";
  const bg = baseUrl ? `${baseUrl}/img/email/hoian-bg.jpg` : "";
  if (bg && !isPublicUrl(baseUrl) && !warnedBg) {
    warnedBg = true;
    console.warn(
      `[mail] APP_URL=${baseUrl} không phải địa chỉ https công khai: Gmail/Outlook sẽ không tải được ảnh nền Hội An (chỉ thấy nền gradient thay cho ảnh). Đặt APP_URL=https://... khi chạy thật.`,
    );
  }
  const scene =
    "linear-gradient(180deg,#dbe8f8 0%,#e7d6ea 33%,#f4dfd3 52%,#f2dcba 57%,#9dc4a5 58%,#7bbdb0 64%,#2d7a85 100%)";
  const bgStyle = bg
    ? `background-color:#7bbdb0;background-image:url('${esc(bg)}'),${scene};background-position:center center;background-repeat:no-repeat;background-size:cover;`
    : `background-color:#7bbdb0;background-image:${scene};`;
  const serif =
    "'Palatino Linotype',Palatino,'Times New Roman','DejaVu Serif',serif";
  const html = `<!DOCTYPE html>
<html lang="vi" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(heading)}</title></head>
<body style="margin:0;padding:0;background-color:#7bbdb0;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#7bbdb0"${bg ? ` background="${esc(bg)}"` : ""} style="${bgStyle}">
<tr><td align="center" valign="top" bgcolor="#7bbdb0"${bg ? ` background="${esc(bg)}"` : ""} style="${bgStyle}padding:32px 14px;">
${bg ? `<!--[if gte mso 9]><v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:640pt;"><v:fill type="frame" src="${esc(bg)}" color="#7bbdb0"/><v:textbox inset="0,0,0,0"><![endif]-->` : ""}
  <table role="presentation" width="520" cellpadding="0" cellspacing="0" border="0" bgcolor="#fffaf6" style="width:100%;max-width:520px;background-color:#fffaf6;border-radius:20px;box-shadow:0 14px 40px rgba(20,70,80,0.28);">
  <tr><td height="8" style="height:8px;line-height:8px;font-size:0;border-radius:20px 20px 0 0;background-color:#d4507f;background-image:linear-gradient(90deg,#d4507f,#8fb7a0 50%,#4fa67f);">&nbsp;</td></tr>
  <tr><td align="center" style="padding:30px 30px 28px;font-family:${serif};color:#3a2214;">
    <div style="font-size:12px;line-height:16px;letter-spacing:4px;text-transform:uppercase;font-weight:bold;color:#4f8f7a;">Cái Quán Ăn</div>
    <div style="font-size:34px;line-height:46px;margin-top:6px;">🪷</div>
    <h1 style="margin:4px 0 10px;font-family:${serif};font-size:30px;line-height:1.25;font-weight:bold;color:#3a2214;">${esc(heading)}</h1>
    <p style="margin:0;font-size:16px;line-height:1.6;color:#5b4a44;">Chào <b style="color:#3a2214;">${who}</b>, ${lead}</p>
    ${khoi}
    ${hanHtml ? `<p style="margin:0;font-size:14px;line-height:1.55;color:#6f5e58;">${hanHtml}</p>` : ""}
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="60%" style="margin:18px auto 14px;"><tr><td height="1" style="height:1px;line-height:1px;font-size:0;background-color:#ecd9d3;">&nbsp;</td></tr></table>
    <p style="margin:0;font-size:13px;line-height:1.5;color:#8a7a74;">${footer}</p>
  </td></tr></table>
${bg ? "<!--[if gte mso 9]></v:textbox></v:rect><![endif]-->" : ""}
</td></tr></table>
</body></html>`;
  return {
    subject,
    text: `Chào ${name || "bạn"},\n\n${textBody}\n\n${footer.replace(/<[^>]+>/g, "")}`,
    html,
  };
}

// giờ hết hạn (giờ Việt Nam): vừa hữu ích vừa làm mỗi thư khác nhau để Gmail không tự thu gọn phần cuối thành "..."
const hanLucStr = (minutes) =>
  new Date(Date.now() + minutes * 60 * 1000).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
  });

// nút bấm (link) trong email
const nutLink = (href, chu) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px auto 18px;"><tr><td align="center" bgcolor="#d4507f" style="background-color:#d4507f;border-radius:999px;"><a href="${esc(href)}" target="_blank" style="display:inline-block;padding:14px 30px;font-family:'Palatino Linotype',Palatino,'Times New Roman','DejaVu Serif',serif;font-size:17px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:999px;">${esc(chu)}</a></td></tr></table>`;
const linkTho = (href) =>
  `<p style="margin:0 0 14px;font-size:12px;line-height:1.5;color:#8a7a74;word-break:break-all;">Nếu nút không bấm được, dán địa chỉ này vào trình duyệt:<br>${esc(href)}</p>`;

// 1) OTP 6 số xác thực email khi ĐĂNG KÝ
function otpEmailContent({ name, otp, minutes, baseUrl = "" }) {
  const hien = `${otp.slice(0, 3)} ${otp.slice(3)}`; // 483 192
  const han = hanLucStr(minutes);
  const serif =
    "'Palatino Linotype',Palatino,'Times New Roman','DejaVu Serif',serif";
  return renderMail({
    subject: "Mã xác thực đăng ký - Cái Quán Ăn",
    name,
    baseUrl,
    minutes,
    heading: "Mã xác thực của bạn",
    lead: "mời bạn nhập mã bên dưới để xác thực email và tiếp tục đăng ký.",
    khoi: `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:22px 0 16px;">
    <tr><td align="center" bgcolor="#ffffff" style="padding:18px 8px;background-color:#ffffff;border:2px solid #efc6d4;border-radius:16px;">
      <span style="font-family:${serif};font-size:46px;line-height:1;font-weight:bold;letter-spacing:10px;color:#3a2214;">${hien}</span>
    </td></tr></table>`,
    hanHtml: `Mã có hiệu lực trong <b>${minutes} phút</b> (đến ${han}).<br>Vui lòng không chia sẻ mã này cho bất kỳ ai.`,
    textBody: `Mã xác thực của bạn: ${otp}\nMã có hiệu lực ${minutes} phút (đến ${han}). Tuyệt đối không chia sẻ mã này cho bất kỳ ai.`,
  });
}

// 2) LINK đặt lại mật khẩu (quên mật khẩu): link chứa token ngẫu nhiên dùng 1 lần
function resetLinkEmailContent({ name, link, minutes, baseUrl = "" }) {
  const han = hanLucStr(minutes);
  return renderMail({
    subject: "Đặt lại mật khẩu - Cái Quán Ăn",
    name,
    baseUrl,
    minutes,
    heading: "Đặt lại mật khẩu",
    lead: "bấm nút bên dưới để chọn mật khẩu mới cho tài khoản của bạn.",
    khoi: nutLink(link, "Đặt lại mật khẩu") + linkTho(link),
    hanHtml: `Link có hiệu lực trong <b>${minutes} phút</b> (đến ${han}) và chỉ dùng được 1 lần.<br>Vui lòng không chuyển tiếp email này cho bất kỳ ai.`,
    textBody: `Bấm vào link để đặt lại mật khẩu: ${link}\nLink có hiệu lực ${minutes} phút (đến ${han}) và chỉ dùng được 1 lần. Không chuyển tiếp email này cho ai.`,
  });
}

// 3) Ai đó đăng ký bằng email ĐÃ CÓ tài khoản: gửi thư này thay cho OTP (giao diện vẫn báo "đã gửi" như email mới,
//    nên người ngoài không dò được email nào đã đăng ký; chủ tài khoản thì biết mà đăng nhập / quên mật khẩu)
function existsEmailContent({ name, baseUrl = "" }) {
  const login = `${baseUrl}/login`;
  return renderMail({
    subject: "Email này đã có tài khoản - Cái Quán Ăn",
    name,
    baseUrl,
    heading: "Bạn đã có tài khoản",
    lead: 'vừa có yêu cầu đăng ký tài khoản mới bằng email này, nhưng email này đã có tài khoản rồi. Hãy đăng nhập, hoặc dùng "Quên mật khẩu" nếu bạn quên mật khẩu.',
    khoi: nutLink(login, "Đăng nhập"),
    hanHtml: "",
    textBody: `Vừa có yêu cầu đăng ký tài khoản mới bằng email này, nhưng email này đã có tài khoản rồi. Hãy đăng nhập tại ${login} hoặc dùng "Quên mật khẩu" nếu bạn quên mật khẩu.`,
  });
}

// 4) THÔNG BÁO sau khi mật khẩu đã được đổi (đặt lại qua link quên mật khẩu): để chủ tài khoản biết ngay nếu người khác làm việc này.
//    Không chứa mật khẩu / token; chỉ nêu thời điểm và hướng xử lý khi không phải do chính chủ.
function passwordChangedEmailContent({
  name,
  baseUrl = "",
  when = new Date(),
}) {
  const luc = new Date(when).toLocaleString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  });
  const login = `${baseUrl}/login`;
  const quen = `${baseUrl}/login?quen=1`;
  return renderMail({
    subject: "Mật khẩu đã được thay đổi - Cái Quán Ăn",
    name,
    baseUrl,
    heading: "Mật khẩu đã thay đổi",
    lead: `mật khẩu tài khoản của bạn vừa được đặt lại thành công lúc <b>${luc}</b> (giờ Việt Nam). Mọi thiết bị đang đăng nhập đã bị đăng xuất.`,
    khoi: nutLink(login, "Đăng nhập"),
    hanHtml: `Nếu <b>không phải bạn</b> làm việc này, hãy <a href="${esc(quen)}" style="color:#d4507f;">đặt lại mật khẩu ngay</a> để lấy lại quyền kiểm soát tài khoản.`,
    textBody: `Mật khẩu tài khoản của bạn vừa được đặt lại thành công lúc ${luc} (giờ Việt Nam). Mọi thiết bị đang đăng nhập đã bị đăng xuất.\nNếu KHÔNG phải bạn làm việc này, hãy đặt lại mật khẩu ngay tại ${quen} để lấy lại quyền kiểm soát tài khoản.`,
    footer: "Email này chỉ để thông báo, bạn không cần trả lời.",
  });
}

module.exports = {
  sendMail,
  otpEmailContent,
  resetLinkEmailContent,
  existsEmailContent,
  passwordChangedEmailContent,
};
