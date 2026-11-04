// ===== ĐĂNG KÝ (3 bước, OTP email) + ĐĂNG NHẬP (cookie + session trong DB) + QUÊN MẬT KHẨU (link token) + ĐĂNG XUẤT =====
// Giao diện (views/login.ejs + public/js/dang-nhap.js):
//   GET  /login, /register      trang đăng nhập / đăng ký (cùng 1 view, khác tab mở sẵn)
//   POST /login                 FORM thường (email, password, next?, g-recaptcha-response? khi đã sai >= 3 lần)
//                               -> đúng: tạo session, đặt cookie `sid`, redirect 303 tới `next` hoặc "/"
//                               -> sai: render lại trang đăng nhập kèm thông báo (401/400/429), KHÔNG trả JSON
//                               Sai từ 3 lần TRONG 15 PHÚT (tính từ lần sai đầu tiên, cột windowStart): bắt CAPTCHA. Sai đủ 10 lần: khóa 5 phút.
//                               Quá 15 phút kể từ lần sai đầu thì bộ đếm về 0 (sai 3 lần cách nhau nhiều ngày KHÔNG bị đòi CAPTCHA).
//   POST /register/otp          {email, recaptcha}   JSON -> bước 1: xác minh CAPTCHA TRƯỚC, rồi mới gửi OTP 6 số tới email.
//                               Email đã có tài khoản vẫn trả y hệt email mới ({ok:true,cooldown}) -> không dò được email nào đã đăng ký
//   POST /register/verify       {email, otp}         JSON -> bước 2: kiểm tra OTP, trả `ticket` dùng 1 lần
//   POST /register              {email, ticket, hoTen, matKhau, matKhau2, inviteCode?} JSON -> bước 3: tạo tài khoản.
//                               Server TỰ gán role ít quyền nhất (customer), BỎ QUA mọi `role` do client gửi.
//                               Chỉ khi có `inviteCode` đúng (env CHEF_INVITE_CODE) mới được role chef; hoặc admin cấp bằng scripts/set-role.js
//   POST /forgot-password       {email}              JSON -> gửi EMAIL CHỨA LINK /reset-password?token=... (luôn báo thành công NGAY; việc tra DB + gửi mail chạy nền
//                               nên thời gian phản hồi như nhau dù email có tài khoản hay không)
//   GET  /reset-password?token= trang nhập mật khẩu mới (token sai / hết hạn / đã dùng -> báo lỗi). Chỉ ĐỌC DB, không ghi/xóa gì.
//   POST /reset-password        FORM (token, matKhau, matKhau2) -> đổi mật khẩu, đánh dấu token đã dùng (usedAt), đăng xuất mọi thiết bị, gửi email thông báo "mật khẩu đã thay đổi", redirect 303 /login?reset=1
//   POST /chon-vai              form role=user|admin -> chọn vai ở trang phố (cần đã đăng nhập)
//   POST /avatar                multipart image      -> đổi ảnh đại diện (vé hành khách ở trang phố)
//   POST /logout                xóa session trong DB + xóa cookie, redirect 303 /login
// API JSON: thành công {ok:true,...}; lỗi {ok:false, error:"thông báo", field?:"tên ô lỗi"} kèm mã HTTP 4xx.
const crypto = require("crypto");
const express = require("express");
const bcrypt = require("bcryptjs");
const { Op } = require("sequelize");
const {
  sequelize,
  User,
  Session,
  PasswordReset,
  RegisterOtp,
} = require("../models");
const {
  ROLES,
  canUseRole,
  SESSION_COOKIE,
  SESSION_MS,
  requireAuth,
} = require("../middleware/auth");
const {
  randomToken,
  sha256,
  safeEqual,
  cookieOptions,
  safeNext,
} = require("../utils/security");
const {
  sendMail,
  otpEmailContent,
  resetLinkEmailContent,
  existsEmailContent,
  passwordChangedEmailContent,
} = require("../utils/mailer");
const { verifyRecaptcha } = require("../utils/recaptcha");
const { rateLimit } = require("../utils/rateLimit");
const { asyncHandler } = require("../utils/format");
const V = require("../utils/validators");
const { normEmail } = V;

const multer = require("multer");
const {
  uploadAvatar,
  removeImage,
  thumbPath,
  EXT,
} = require("../utils/storage");

const router = express.Router();

const BCRYPT_COST = 12; // 2^12 vòng băm: đủ chậm để chặn dò mật khẩu, vẫn < 0.5s/lần
const RESEND_COOLDOWN_MS = 60 * 1000;
const REGISTER_OTP_MINUTES = 5;
const RESET_LINK_MINUTES = 30; // link đặt lại mật khẩu có hiệu lực 30 phút, dùng 1 lần
const OTP_MAX_TRIES = 5;
const OTP_LOCK_MINUTES = 15; // sai đủ OTP_MAX_TRIES lần: khóa xác thực email này 15 phút (xin mã mới KHÔNG mở khóa)
const OTP_MAX_SENDS = 5; // tối đa 5 lần gửi mã / email ...
const OTP_SEND_WINDOW_MS = 60 * 60 * 1000; // ... trong 1 giờ
const DEFAULT_ACCOUNT_ROLE = "customer"; // role ít quyền nhất: mọi tài khoản mới đều bắt đầu từ đây
const CHEF_ACCOUNT_ROLE = "chef"; // chỉ cấp qua mã mời (inviteCode) hoặc do admin cấp (scripts/set-role.js)
const TICKET_MINUTES = 15; // từ lúc nhập đúng OTP đến lúc phải bấm "Hoàn tất đăng ký"
const FAIL_WINDOW_MS = 15 * 60 * 1000; // cửa sổ đếm đăng nhập sai: 15 phút kể từ lần sai ĐẦU TIÊN; hết cửa sổ thì bộ đếm về 0
const CAPTCHA_AFTER = 3; // đăng nhập sai từ 3 lần trong cửa sổ: bắt CAPTCHA
const LOCK_AFTER = 10; // đăng nhập sai đủ 10 lần: khóa
const LOCK_MS = 5 * 60 * 1000; // ... trong 5 phút
const TOKEN_RE = /^[a-f0-9]{64}$/;
// hash giả: so sánh khi email không tồn tại để thời gian phản hồi không lộ email nào có tài khoản
const DUMMY_HASH = bcrypt.hashSync("khong-ton-tai", BCRYPT_COST);

// Email KHÔNG có tài khoản cũng bị đếm lần sai (trong RAM) để hành vi y hệt email có tài khoản (cùng lúc đòi CAPTCHA, cùng lúc khóa)
// -> người ngoài không dò được email nào đã đăng ký qua việc "có đòi CAPTCHA hay không".
const ghostFails = new Map(); // email -> { fails, windowStart, lockedUntil, at }
setInterval(
  () => {
    const now = Date.now();
    for (const [k, v] of ghostFails)
      if (
        (!v.lockedUntil || v.lockedUntil <= now) &&
        now - v.at > 60 * 60 * 1000
      )
        ghostFails.delete(k);
  },
  15 * 60 * 1000,
).unref();

// số lần sai CÒN TÍNH: nếu lần sai đầu của cửa sổ đã quá 15 phút (hoặc chưa có mốc) thì coi như 0
const activeFails = (st) =>
  st.windowStart &&
  Date.now() - new Date(st.windowStart).getTime() < FAIL_WINDOW_MS
    ? st.fails
    : 0;

const HOUR = 60 * 60 * 1000;
const limitLogin = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });
const limitOtp = rateLimit({ windowMs: HOUR, max: 15 });
const limitVerify = rateLimit({ windowMs: 15 * 60 * 1000, max: 30 });
const limitRegister = rateLimit({ windowMs: HOUR, max: 10 });
const limitForgot = rateLimit({ windowMs: HOUR, max: 10 });
const limitReset = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

const baseUrl = (req) =>
  process.env.APP_URL
    ? process.env.APP_URL.replace(/\/+$/, "")
    : `${req.protocol}://${req.get("host")}`;

const ok = (res, data = {}) => res.json({ ok: true, ...data });
const fail = (res, status, error, field) =>
  res.status(status).json({ ok: false, error, ...(field ? { field } : {}) });

const newOtp = () => String(crypto.randomInt(0, 1000000)).padStart(6, "0"); // CSPRNG, 6 chữ số
const otpHashReg = (email, otp) => sha256(`reg:${email}:${otp}`);

// đã đăng nhập thì khỏi vào lại trang đăng nhập / đăng ký
const guestOnly = (req, res, next) =>
  req.user ? res.redirect(303, "/") : next();
// API chỉ nhận JSON (form HTML thuần không dùng được các bước OTP)
const jsonOnly = (req, res, next) =>
  req.is("json") ? next() : fail(res, 415, "Yêu cầu không hợp lệ.");

const pageData = () => ({
  recaptchaSiteKey: process.env.RECAPTCHA_SITE_KEY || "",
});

// ---------------------------------------------------------------- TRANG
// locals của login.ejs: error | notice | email (điền lại) | needCaptcha (hiện CAPTCHA ở form đăng nhập) | lockedSeconds (số giây còn bị khóa, 0 = không khóa) | tab | next | reset*
const loginView = (extra = {}) => ({
  error: null,
  notice: null,
  email: "",
  needCaptcha: false,
  lockedSeconds: 0,
  tab: "login",
  next: "",
  ...pageData(),
  ...extra,
});
router.get("/login", guestOnly, (req, res) =>
  res.render(
    "login",
    loginView({
      next: safeNext(req.query.next, ""),
      notice:
        req.query.reset === "1"
          ? "Đặt lại mật khẩu thành công, hãy đăng nhập bằng mật khẩu mới."
          : null,
    }),
  ),
);
router.get("/register", guestOnly, (req, res) =>
  res.render("login", loginView({ tab: "register" })),
);

// ---------------------------------------------------------------- ĐĂNG NHẬP (form thường -> 303)
router.post(
  "/login",
  guestOnly,
  limitLogin,
  asyncHandler(async (req, res) => {
    const email = normEmail(req.body.email);
    const password = String(req.body.password || "");
    const next = safeNext(req.body.next, "");
    // đăng nhập sai: vẽ lại trang đăng nhập kèm thông báo, điền lại email, giữ `next`
    // Không JS (form thường): vẽ lại cả trang. Có JS (fetch gửi Accept: application/json): trả JSON để trang tự hiện lỗi tại chỗ.
    // Đăng nhập ĐÚNG thì cả hai đều nhận redirect 303.
    // lockedSeconds > 0: đang bị khóa -> giao diện khóa ô mật khẩu + CAPTCHA + nút và đếm ngược (khỏi tốn token reCAPTCHA vô ích)
    const back = (status, error, needCaptcha = false, lockedSeconds = 0) =>
      /application\/json/.test(req.get("accept") || "")
        ? res
            .status(status)
            .json({ ok: false, error, needCaptcha, lockedSeconds })
        : res
            .status(status)
            .render(
              "login",
              loginView({ error, email, next, needCaptcha, lockedSeconds }),
            );

    if (!email || !password || password.length > 200)
      return back(400, "Vui lòng nhập email và mật khẩu.");

    const user = await User.findOne({ where: { email } });
    const raw = user
      ? {
          fails: user.failedLogins,
          windowStart: user.windowStart,
          lockedUntil: user.lockedUntil,
        }
      : ghostFails.get(email) || {
          fails: 0,
          windowStart: null,
          lockedUntil: null,
        };
    // bộ đếm chỉ có giá trị trong cửa sổ 15 phút; quá cửa sổ -> bắt đầu đếm lại từ 0
    const st = { ...raw, fails: activeFails(raw) };

    // đang khóa: từ chối ngay (dù mật khẩu đúng hay sai)
    if (st.lockedUntil && st.lockedUntil > new Date()) {
      const giay = Math.max(1, Math.ceil((st.lockedUntil - Date.now()) / 1000));
      const phut = Math.ceil(giay / 60);
      return back(
        429,
        `Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau khoảng ${phut} phút.`,
        false,
        giay,
      );
    }

    // đã sai từ 3 lần: PHẢI qua CAPTCHA trước khi server kiểm tra mật khẩu (bot không dò được mật khẩu nếu không có token)
    if (st.fails >= CAPTCHA_AFTER) {
      const token = req.body["g-recaptcha-response"] || req.body.recaptcha;
      if (!(await verifyRecaptcha(token, req.ip, req.hostname)))
        return back(400, "Vui lòng xác nhận bạn không phải người máy.", true);
    }

    // luôn chạy bcrypt.compare (kể cả email không tồn tại) để thời gian xử lý như nhau
    const match = await bcrypt.compare(
      password,
      user ? user.passwordHash : DUMMY_HASH,
    );

    if (!user || !match) {
      const fails = st.fails + 1;
      const khoa = fails >= LOCK_AFTER;
      const lockedUntil = khoa ? new Date(Date.now() + LOCK_MS) : null;
      // lần sai đầu tiên của cửa sổ mới (st.fails = 0 nghĩa là chưa có cửa sổ hoặc cửa sổ cũ đã hết) -> ghi mốc bắt đầu = bây giờ
      const windowStart = st.fails === 0 ? new Date() : raw.windowStart;
      if (user)
        await user.update({
          failedLogins: khoa ? 0 : fails,
          windowStart: khoa ? null : windowStart,
          lockedUntil,
        });
      else {
        if (ghostFails.size > 20000) ghostFails.clear(); // chặn phình RAM khi bị spam email lạ
        ghostFails.set(email, {
          fails: khoa ? 0 : fails,
          windowStart: khoa ? null : windowStart,
          lockedUntil,
          at: Date.now(),
        });
      }
      if (khoa)
        return back(
          429,
          "Bạn đã nhập sai 10 lần. Đăng nhập tạm khóa 5 phút, vui lòng thử lại sau.",
          false,
          LOCK_MS / 1000,
        );
      // cùng 1 thông báo cho "email không tồn tại" và "sai mật khẩu"
      return back(
        401,
        "Email hoặc mật khẩu không đúng.",
        !khoa && fails >= CAPTCHA_AFTER,
      );
    }
    if (!user.emailVerifiedAt) {
      return back(
        403,
        "Email này chưa được xác thực. Hãy đăng ký lại bằng email này để nhận mã xác thực.",
      );
    }

    // đăng nhập đúng: tạo session MỚI (đổi token mỗi lần đăng nhập -> chống session fixation)
    const oldToken = req.cookies[SESSION_COOKIE];
    if (oldToken) await Session.destroy({ where: { id: sha256(oldToken) } });
    await user.update({
      failedLogins: 0,
      windowStart: null,
      lockedUntil: null,
      lastLoginAt: new Date(),
    });
    const token = randomToken();
    await Session.create({
      id: sha256(token), // DB chỉ giữ hash của token
      userId: user.id,
      expiresAt: new Date(Date.now() + SESSION_MS),
      ip: String(req.ip || "").slice(0, 64),
      userAgent: String(req.get("user-agent") || "").slice(0, 255),
    });
    res.cookie(SESSION_COOKIE, token, cookieOptions(SESSION_MS));
    res.clearCookie("role"); // vào phố rồi chọn vai lại từ đầu
    res.redirect(303, next || "/"); // Post/Redirect/Get: F5 không gửi lại mật khẩu
  }),
);

// ---------------------------------------------------------------- ĐĂNG KÝ: BƯỚC 1 (xác minh CAPTCHA rồi gửi OTP)
// Giới hạn THEO EMAIL (lưu trong DB, bảng register_otps), ngoài giới hạn theo IP:
//   - sai OTP đủ OTP_MAX_TRIES lần -> khóa OTP_LOCK_MINUTES phút; xin mã mới KHÔNG làm `attempts` về 0
//   - tối đa OTP_MAX_SENDS lần gửi / email / OTP_SEND_WINDOW_MINUTES phút
//   - vượt giới hạn trả 429 (+ Retry-After)
// Email ĐÃ có tài khoản cũng có 1 dòng giữ chỗ (OTP ngẫu nhiên, không ai biết) -> cùng giới hạn, cùng phản hồi như email mới.
const tooMany = (res, ms, msg) => {
  res.setHeader("Retry-After", Math.max(1, Math.ceil(ms / 1000)));
  return fail(
    res,
    429,
    `${msg} Vui lòng thử lại sau ${Math.max(1, Math.ceil(ms / 60000))} phút.`,
  );
};

router.post(
  "/register/otp",
  guestOnly,
  limitOtp,
  jsonOnly,
  asyncHandler(async (req, res) => {
    const email = normEmail(req.body.email);
    const eEmail = V.validateEmail(email);
    if (eEmail) return fail(res, 400, eEmail, "email");

    // CAPTCHA phải qua TRƯỚC mọi thao tác khác (tra DB, tạo OTP, gửi email):
    // bot không có token hợp lệ thì không thể bắt server gửi email.
    // Mỗi token reCAPTCHA chỉ dùng được 1 lần -> mỗi lần gửi / gửi lại mã đều phải xác nhận lại.
    if (!(await verifyRecaptcha(req.body.recaptcha, req.ip, req.hostname))) {
      return fail(
        res,
        400,
        "Vui lòng xác nhận bạn không phải người máy.",
        "captcha",
      );
    }

    const SEND_FAIL = "Không gửi được email xác thực, vui lòng thử lại sau.";
    const now = new Date();
    const nowMs = now.getTime();
    const COOLDOWN = { cooldown: RESEND_COOLDOWN_MS / 1000 };

    // 1) giới hạn theo email (khóa sai OTP, cooldown, tổng số lần gửi)
    let old = await RegisterOtp.findOne({ where: { email } });
    let resetAttempts = false;
    let sendCount = 1;
    let windowStart = now;
    if (old) {
      if (old.lockedUntil && old.lockedUntil.getTime() > nowMs)
        return tooMany(
          res,
          old.lockedUntil.getTime() - nowMs,
          "Bạn đã nhập sai mã quá nhiều lần.",
        );
      // hết thời gian khóa -> mới được xóa số lần sai (chỉ đường duy nhất để attempts về 0 là chờ hết khóa)
      resetAttempts = !!old.lockedUntil;

      // đang trong thời gian chờ: không gửi thêm nhưng vẫn báo như bình thường
      if (nowMs - old.sentAt.getTime() < RESEND_COOLDOWN_MS)
        return ok(res, COOLDOWN);

      const ws = (old.sendWindowStart || old.sentAt).getTime();
      if (nowMs - ws < OTP_SEND_WINDOW_MS) {
        if (old.sendCount >= OTP_MAX_SENDS)
          return tooMany(
            res,
            ws + OTP_SEND_WINDOW_MS - nowMs,
            "Bạn đã yêu cầu mã quá nhiều lần.",
          );
        sendCount = old.sendCount + 1;
        windowStart = new Date(ws);
      }
    }

    // 2) Email đã có tài khoản: không có OTP thật, chỉ gửi thư "bạn đã có tài khoản". Email mới: tạo OTP thật.
    const existing = await User.findOne({ where: { email } });
    const hasAccount = !!(existing && existing.emailVerifiedAt);
    const otp = hasAccount ? null : newOtp();
    const fields = {
      otpHash: otp ? otpHashReg(email, otp) : sha256(randomToken()), // chỉ lưu hash, không lưu OTP
      expiresAt: new Date(nowMs + REGISTER_OTP_MINUTES * 60 * 1000),
      sentAt: now,
      ticketHash: null,
      ticketExpires: null,
      sendCount,
      sendWindowStart: windowStart,
    };
    // `attempts` KHÔNG nằm trong `fields`: gửi lại mã giữ nguyên số lần đã sai.
    if (resetAttempts) {
      fields.attempts = 0;
      fields.lockedUntil = null;
    }

    // 3) ghi nguyên tử: 2 request song song chỉ 1 request giành được lượt gửi
    if (old) {
      const [claimed] = await RegisterOtp.update(fields, {
        where: { id: old.id, sentAt: old.sentAt },
      });
      if (!claimed) return ok(res, COOLDOWN);
    } else {
      try {
        await RegisterOtp.create({ email, ...fields });
      } catch (err) {
        if (err.name === "SequelizeUniqueConstraintError")
          return ok(res, COOLDOWN);
        throw err;
      }
    }

    // 4) gửi thư. Email mới và email đã có tài khoản nhận CÙNG phản hồi ({ok:true, cooldown}).
    try {
      if (hasAccount)
        await sendMail({
          to: email,
          ...existsEmailContent({
            name: existing.name,
            baseUrl: baseUrl(req),
          }),
        });
      else
        await sendMail({
          to: email,
          ...otpEmailContent({
            name: "",
            otp,
            minutes: REGISTER_OTP_MINUTES,
            baseUrl: baseUrl(req),
          }),
        });
    } catch (err) {
      console.error("Gửi email đăng ký thất bại:", err.message);
      // KHÔNG xóa dòng (xóa sẽ làm attempts/sendCount về 0): chỉ vô hiệu OTP vừa tạo, cho phép gửi lại ngay
      await RegisterOtp.update(
        { otpHash: sha256(randomToken()), expiresAt: now, sentAt: new Date(0) },
        { where: { email } },
      );
      return fail(res, 502, SEND_FAIL, "email");
    }
    ok(res, COOLDOWN);
  }),
);

// ---------------------------------------------------------------- ĐĂNG KÝ: BƯỚC 2 (kiểm tra OTP)
router.post(
  "/register/verify",
  guestOnly,
  limitVerify,
  jsonOnly,
  asyncHandler(async (req, res) => {
    const email = normEmail(req.body.email);
    const otp = String(req.body.otp || "").trim();
    if (V.validateEmail(email)) return fail(res, 400, "Email không hợp lệ.");
    if (!V.OTP_RE.test(otp)) return fail(res, 400, "Vui lòng nhập đủ 6 số.");

    const BAD = "Mã chưa đúng hoặc đã hết hạn. Bạn có thể yêu cầu mã mới.";
    const LOCKED = "Bạn đã nhập sai mã quá nhiều lần.";
    const now = new Date();
    // KHÔNG xóa dòng khi hết hạn / sai: xóa sẽ làm `attempts` và `sendCount` về 0 (cleanup.js sẽ dọn sau)
    const row = await RegisterOtp.findOne({ where: { email } });
    if (!row) return fail(res, 400, BAD);
    if (row.lockedUntil && row.lockedUntil > now)
      return tooMany(res, row.lockedUntil - now, LOCKED);
    if (row.ticketHash || row.expiresAt < now || row.attempts >= OTP_MAX_TRIES)
      return fail(res, 400, BAD);

    // Giành 1 lượt thử bằng MỘT câu UPDATE nguyên tử (attempts = attempts + 1 ... WHERE attempts < 5):
    // 100 request song song cũng chỉ có tối đa 5 request được so OTP, không đọc-rồi-ghi nên không thử vượt được.
    const qi = sequelize.getQueryInterface();
    const col = qi.quoteIdentifier("attempts");
    const [claimed] = await RegisterOtp.update(
      { attempts: sequelize.literal(`${col} + 1`) },
      {
        where: {
          id: row.id,
          otpHash: row.otpHash,
          ticketHash: null,
          attempts: { [Op.lt]: OTP_MAX_TRIES },
        },
      },
    );
    if (!claimed) {
      await row.reload();
      if (row.lockedUntil && row.lockedUntil > now)
        return tooMany(res, row.lockedUntil - now, LOCKED);
      return fail(res, 400, BAD);
    }

    if (!safeEqual(row.otpHash, otpHashReg(email, otp))) {
      await row.reload();
      if (row.attempts >= OTP_MAX_TRIES) {
        // đủ 5 lần sai: khóa (giữ nguyên dòng, attempts = 5)
        const until = new Date(Date.now() + OTP_LOCK_MINUTES * 60 * 1000);
        await RegisterOtp.update(
          { lockedUntil: until },
          { where: { id: row.id, lockedUntil: null } },
        );
        return tooMany(res, OTP_LOCK_MINUTES * 60 * 1000, LOCKED);
      }
      return fail(res, 400, BAD);
    }

    // OTP đúng: vô hiệu OTP (dùng 1 lần), cấp vé cho bước 3. Điều kiện ticketHash=null: chỉ 1 request song song nhận được vé.
    const ticket = randomToken();
    const [issued] = await RegisterOtp.update(
      {
        otpHash: sha256(randomToken()),
        ticketHash: sha256(ticket),
        ticketExpires: new Date(Date.now() + TICKET_MINUTES * 60 * 1000),
      },
      { where: { id: row.id, ticketHash: null } },
    );
    if (!issued) return fail(res, 400, BAD);
    ok(res, { ticket });
  }),
);

// ---------------------------------------------------------------- ĐĂNG KÝ: BƯỚC 3 (tạo tài khoản)
router.post(
  "/register",
  guestOnly,
  limitRegister,
  jsonOnly,
  asyncHandler(async (req, res) => {
    const email = normEmail(req.body.email);
    const ticket = String(req.body.ticket || "");
    const name = String(req.body.hoTen || "")
      .trim()
      .replace(/\s+/g, " ");
    const password = String(req.body.matKhau || "");
    const password2 = String(req.body.matKhau2 || "");
    // KHÔNG đọc req.body.role: role không bao giờ do client quyết định.
    const inviteCode = String(req.body.inviteCode || "").trim();

    // 1) vé từ bước 2: chứng minh email này đã nhập đúng OTP
    const row = V.validateEmail(email)
      ? null
      : await RegisterOtp.findOne({ where: { email } });
    if (
      !row ||
      !row.ticketHash ||
      !row.ticketExpires ||
      row.ticketExpires < new Date() ||
      !/^[a-f0-9]{64}$/.test(ticket) ||
      !safeEqual(row.ticketHash, sha256(ticket))
    ) {
      return fail(
        res,
        400,
        "Phiên xác thực email đã hết hạn, vui lòng xác thực lại email.",
        "phien",
      );
    }

    // 2) kiểm tra dữ liệu phía server
    const eName = V.validateName(name);
    if (eName) return fail(res, 400, eName, "hoTen");
    // Mặc định customer. Chỉ khi nhập ĐÚNG mã mời của quán (CHEF_INVITE_CODE) mới thành chef.
    // Nhập mã mà sai (hoặc server chưa cấu hình mã) -> báo lỗi chứ không âm thầm hạ xuống customer.
    let accountRole = DEFAULT_ACCOUNT_ROLE;
    if (inviteCode) {
      const expected = process.env.CHEF_INVITE_CODE || "";
      // so sánh băm SHA-256 của 2 chuỗi (độ dài bằng nhau) bằng timingSafeEqual -> không lộ độ dài / không timing attack
      if (!expected || !safeEqual(sha256(inviteCode), sha256(expected)))
        return fail(res, 400, "Mã mời không đúng.", "inviteCode");
      accountRole = CHEF_ACCOUNT_ROLE;
    }
    const ePass = V.validatePassword(password, { email, name });
    if (ePass) return fail(res, 400, ePass, "matKhau");
    if (password !== password2)
      return fail(res, 400, "Mật khẩu nhập lại chưa khớp.", "matKhau2");

    // 3) (CAPTCHA đã được kiểm tra ở bước 1 trước khi gửi OTP; bước này đã có vé từ bước 2)

    // 4) tạo tài khoản ĐÃ xác minh email. Lưu bcrypt hash, KHÔNG lưu mật khẩu gốc.
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    const user = await User.findOne({ where: { email } });
    if (user && user.emailVerifiedAt)
      return fail(res, 409, "Email này đã có tài khoản.", "phien");
    if (user)
      await user.update({
        name,
        role: accountRole,
        passwordHash,
        emailVerifiedAt: new Date(),
        failedLogins: 0,
        windowStart: null,
        lockedUntil: null,
      });
    else
      await User.create({
        name,
        email,
        role: accountRole,
        passwordHash,
        emailVerifiedAt: new Date(),
      });
    await row.destroy(); // vé dùng 1 lần
    ok(res);
  }),
);

// ---------------------------------------------------------------- QUÊN MẬT KHẨU (link token qua email)
// B1: POST /forgot-password {email} -> email chứa link /reset-password?token=<256 bit>; DB chỉ lưu SHA-256 của token.
// B2: GET  /reset-password?token=   -> form mật khẩu mới (chỉ đọc DB).   B3: POST /reset-password -> đổi mật khẩu rồi 303 /login?reset=1.

// Phần tốn thời gian (tra DB, tạo token, GỬI MAIL) chạy NỀN sau khi đã trả lời client. Nhờ vậy email có tài khoản và email không có
// tài khoản nhận phản hồi cùng nội dung VÀ cùng thời gian (người ngoài không dò được qua độ trễ). Lỗi chỉ ghi log, không ảnh hưởng phản hồi.
async function guiLinkDatLai(email, base) {
  const user = await User.findOne({ where: { email } });
  if (!user || !user.emailVerifiedAt) return;
  const old = await PasswordReset.findOne({
    where: { userId: user.id, usedAt: null },
    order: [["sentAt", "DESC"]],
  });
  if (old && Date.now() - old.sentAt.getTime() < RESEND_COOLDOWN_MS) return;
  const token = randomToken();
  // mỗi người chỉ có 1 link CHƯA DÙNG còn hiệu lực (link cũ chết); dòng ĐÃ DÙNG (usedAt) được giữ lại làm bằng chứng
  await PasswordReset.destroy({ where: { userId: user.id, usedAt: null } });
  await PasswordReset.create({
    userId: user.id,
    tokenHash: sha256(token), // chỉ lưu hash, không lưu token
    expiresAt: new Date(Date.now() + RESET_LINK_MINUTES * 60 * 1000),
    sentAt: new Date(),
  });
  await sendMail({
    to: user.email,
    ...resetLinkEmailContent({
      name: user.name,
      link: `${base}/reset-password?token=${token}`,
      minutes: RESET_LINK_MINUTES,
      baseUrl: base,
    }),
  });
}

router.post(
  "/forgot-password",
  guestOnly,
  limitForgot,
  jsonOnly,
  asyncHandler(async (req, res) => {
    const email = normEmail(req.body.email);
    const eEmail = V.validateEmail(email);
    if (eEmail) return fail(res, 400, eEmail, "email");
    // không await: trả lời ngay, việc còn lại làm nền (fire-and-forget)
    guiLinkDatLai(email, baseUrl(req)).catch((err) =>
      console.error("Gửi link đặt lại mật khẩu thất bại:", err.message),
    );
    // luôn báo thành công, dù email có tồn tại hay không (không lộ email nào có tài khoản)
    ok(res, { cooldown: RESEND_COOLDOWN_MS / 1000 });
  }),
);

// token còn hiệu lực -> dòng PasswordReset; sai định dạng / không có / hết hạn / ĐÃ DÙNG -> null.
// CHỈ ĐỌC (GET /reset-password gọi hàm này nên không được ghi/xóa gì); dòng hết hạn do utils/cleanup.js dọn.
async function findReset(token) {
  if (!TOKEN_RE.test(token)) return null;
  return PasswordReset.findOne({
    where: {
      tokenHash: sha256(token),
      usedAt: null,
      expiresAt: { [Op.gt]: new Date() },
    },
  });
}
// trang chứa token trên URL: không cache, KHÔNG gửi Referer đi đâu cả (no-referrer). Form POST ở trang này gửi Origin "null",
// vẫn được nhận vì đã có CSRF token (middleware/csrf.js).
const khongLuuVet = (req, res, next) => {
  res.set({ "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" });
  next();
};
const resetView = (res, status, extra = {}) =>
  res.status(status).render(
    "login",
    loginView({
      tab: "reset",
      resetToken: "",
      resetValid: true,
      resetErrors: {},
      ...extra,
    }),
  );

router.get(
  "/reset-password",
  khongLuuVet,
  asyncHandler(async (req, res) => {
    const token = String(req.query.token || "");
    const row = await findReset(token);
    if (!row) return resetView(res, 400, { resetValid: false });
    resetView(res, 200, { resetToken: token });
  }),
);

router.post(
  "/reset-password",
  limitReset,
  khongLuuVet,
  asyncHandler(async (req, res) => {
    const token = String(req.body.token || "");
    const password = String(req.body.matKhau || "");
    const password2 = String(req.body.matKhau2 || "");
    const row = await findReset(token);
    if (!row) return resetView(res, 400, { resetValid: false });
    const user = await User.findByPk(row.userId);
    if (!user) return resetView(res, 400, { resetValid: false });

    const errors = {};
    const ePass = V.validatePassword(password, {
      email: user.email,
      name: user.name,
    });
    if (ePass) errors.matKhau = ePass;
    else if (password !== password2)
      errors.matKhau2 = "Mật khẩu nhập lại chưa khớp.";
    if (errors.matKhau || errors.matKhau2)
      return resetView(res, 400, { resetToken: token, resetErrors: errors });

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    // token đúng: trong 1 giao dịch -> "chiếm" token (UPDATE có điều kiện usedAt IS NULL nên 2 request cùng lúc chỉ 1 request thắng),
    // đổi mật khẩu, mở khóa, đăng xuất mọi thiết bị. Dòng token được GIỮ LẠI với usedAt để còn bằng chứng.
    const dungDuoc = await sequelize.transaction(async (t) => {
      const [soDong] = await PasswordReset.update(
        { usedAt: new Date() },
        {
          where: {
            id: row.id,
            usedAt: null,
            expiresAt: { [Op.gt]: new Date() },
          },
          transaction: t,
        },
      );
      if (soDong !== 1) return false;
      await user.update(
        { passwordHash, failedLogins: 0, windowStart: null, lockedUntil: null },
        { transaction: t },
      );
      await Session.destroy({ where: { userId: user.id }, transaction: t });
      return true;
    });
    if (!dungDuoc) return resetView(res, 400, { resetValid: false });

    // thông báo cho chủ tài khoản (không chờ, lỗi gửi mail không làm hỏng việc đổi mật khẩu đã xong)
    sendMail({
      to: user.email,
      ...passwordChangedEmailContent({
        name: user.name,
        baseUrl: baseUrl(req),
        when: new Date(),
      }),
    }).catch((err) =>
      console.error("Gửi email 'mật khẩu đã thay đổi' thất bại:", err.message),
    );
    res.redirect(303, "/login?reset=1");
  }),
);

// ---------------------------------------------------------------- CHỌN VAI (hộp "Bạn vào quán với vai gì?" ở trang phố)
router.post("/chon-vai", requireAuth, (req, res) => {
  const role = req.body.role;
  if (!ROLES.includes(role)) {
    return res.status(400).render("error", {
      status: 400,
      message: "Vui lòng chọn vai hợp lệ (khách hoặc đầu bếp).",
    });
  }
  // tài khoản đăng ký là khách hàng thì không được vào quán với vai đầu bếp
  if (!canUseRole(req.user.role, role)) {
    return res.status(403).render("error", {
      status: 403,
      message:
        "Vai trò không hợp lệ: tài khoản của bạn đăng ký là khách hàng nên không thể vào với vai đầu bếp.",
    });
  }
  res.cookie("role", role, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  res.redirect(303, role === "admin" ? "/admin/dishes" : "/khach");
});

// ---------------------------------------------------------------- ĐĂNG XUẤT
router.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await Session.destroy({ where: { id: sha256(token) } }); // hủy phiên ngay trong DB
    res.clearCookie(SESSION_COOKIE, cookieOptions());
    res.clearCookie("role");
    res.redirect(303, "/login");
  }),
);

// ---------------------------------------------------------------- ẢNH ĐẠI DIỆN (vé hành khách)
//   POST /avatar   multipart, trường `image` (JPG/PNG/WEBP, tối đa 3MB) -> {ok:true, url, thumb}
// Trình duyệt đã cắt vuông 512px theo vùng người dùng chọn nên file thường chỉ vài chục KB.
const upAvatar = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => cb(null, !!EXT[file.mimetype]),
}).single("image");
const limitAvatar = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

router.post(
  "/avatar",
  requireAuth,
  limitAvatar,
  (req, res, next) =>
    upAvatar(req, res, (err) =>
      err
        ? fail(
            res,
            400,
            err.code === "LIMIT_FILE_SIZE"
              ? "Ảnh tối đa 3MB."
              : "Không đọc được ảnh, vui lòng thử lại.",
          )
        : next(),
    ),
  asyncHandler(async (req, res) => {
    if (!req.file) return fail(res, 400, "Chỉ nhận ảnh JPG, PNG hoặc WEBP.");
    let img;
    try {
      img = await uploadAvatar(req.file);
    } catch (e) {
      console.error("Lỗi lưu ảnh đại diện:", e.message);
      return fail(res, 500, "Không lưu được ảnh, vui lòng thử lại.");
    }
    const cu = req.user.avatarPath;
    await req.user.update({ avatarUrl: img.url, avatarPath: img.path });
    if (cu) removeImage(cu).catch(() => {}); // xóa ảnh cũ, lỗi cũng không sao
    ok(res, { url: img.url, thumb: thumbPath(img.url) });
  }),
);

module.exports = router;
