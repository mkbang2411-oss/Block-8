// ===== ĐĂNG KÝ (3 bước, OTP email) + ĐĂNG NHẬP (cookie + session trong DB) + QUÊN MẬT KHẨU (OTP) + ĐĂNG XUẤT =====
// Giao diện (views/login.ejs + public/js/dang-nhap.js) gọi các API dưới đây bằng fetch JSON:
//   GET  /login, /register      trang đăng nhập / đăng ký (cùng 1 view, khác tab mở sẵn)
//   POST /login                 {email, password, next?}          -> tạo session, đặt cookie `sid`
//   POST /register/otp          {email, recaptcha}                -> bước 1: xác minh CAPTCHA TRƯỚC, rồi mới gửi OTP 6 số tới email
//   POST /register/verify       {email, otp}                      -> bước 2: kiểm tra OTP, trả `ticket` dùng 1 lần
//   POST /register              {email, ticket, hoTen, role, matKhau, matKhau2} -> bước 3: tạo tài khoản (đã xác minh email + CAPTCHA ở bước 1)
//   POST /forgot-password       {email}                           -> gửi OTP đặt lại mật khẩu
//   POST /forgot-password/verify {email, otp}                     -> kiểm tra mã (bước 2, chưa hủy mã)
//   POST /reset-password        {email, otp, matKhau, matKhau2}   -> đổi mật khẩu, đăng xuất mọi thiết bị
//   POST /chon-vai              form role=user|admin              -> chọn vai ở trang phố (cần đã đăng nhập)
//   POST /avatar                multipart image                   -> đổi ảnh đại diện (vé hành khách ở trang phố)
//   POST /logout                xóa session trong DB + xóa cookie
// Thành công: {ok:true,...}; lỗi: {ok:false, error:"thông báo", field?:"tên ô lỗi"} kèm mã HTTP 4xx.
const crypto = require("crypto");
const express = require("express");
const bcrypt = require("bcryptjs");
const { User, Session, PasswordReset, RegisterOtp } = require("../models");
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
const { sendMail, otpEmailContent } = require("../utils/mailer");
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
const RESET_OTP_MINUTES = 10;
const OTP_MAX_TRIES = 5;
const ACCOUNT_ROLES = ["customer", "chef"]; // vai chọn lúc đăng ký: khách hàng | đầu bếp
const TICKET_MINUTES = 15; // từ lúc nhập đúng OTP đến lúc phải bấm "Hoàn tất đăng ký"
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
// hash giả: so sánh khi email không tồn tại để thời gian phản hồi không lộ email nào có tài khoản
const DUMMY_HASH = bcrypt.hashSync("khong-ton-tai", BCRYPT_COST);

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
const otpHashReset = (userId, otp) => sha256(`${userId}:${otp}`);

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
router.get("/login", guestOnly, (req, res) =>
  res.render("login", {
    error: null,
    tab: "login",
    next: safeNext(req.query.next, ""),
    ...pageData(),
  }),
);
router.get("/register", guestOnly, (req, res) =>
  res.render("login", {
    error: null,
    tab: "register",
    next: "",
    ...pageData(),
  }),
);

// ---------------------------------------------------------------- ĐĂNG NHẬP
router.post(
  "/login",
  guestOnly,
  limitLogin,
  jsonOnly,
  asyncHandler(async (req, res) => {
    const email = normEmail(req.body.email);
    const password = String(req.body.password || "");
    if (!email || !password || password.length > 200)
      return fail(res, 400, "Vui lòng nhập email và mật khẩu.");

    const user = await User.findOne({ where: { email } });
    // luôn chạy bcrypt.compare (kể cả email không tồn tại) để thời gian xử lý như nhau
    const match = await bcrypt.compare(
      password,
      user ? user.passwordHash : DUMMY_HASH,
    );

    if (user && user.lockedUntil && user.lockedUntil > new Date()) {
      return fail(
        res,
        429,
        "Tài khoản tạm khóa do nhập sai nhiều lần, vui lòng thử lại sau ít phút.",
      );
    }
    if (!user || !match) {
      if (user) {
        const fails = user.failedLogins + 1;
        await user.update(
          fails >= MAX_FAILS
            ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MS) }
            : { failedLogins: fails },
        );
      }
      return fail(res, 401, "Email hoặc mật khẩu không đúng.", "password"); // cùng 1 thông báo cho 2 trường hợp
    }
    if (!user.emailVerifiedAt) {
      return fail(
        res,
        403,
        "Email này chưa được xác thực. Hãy đăng ký lại bằng email này để nhận mã xác thực.",
      );
    }

    // đăng nhập đúng: tạo session MỚI (đổi token mỗi lần đăng nhập -> chống session fixation)
    const oldToken = req.cookies[SESSION_COOKIE];
    if (oldToken) await Session.destroy({ where: { id: sha256(oldToken) } });
    await user.update({
      failedLogins: 0,
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
    ok(res, { next: safeNext(req.body.next, "/") });
  }),
);

// ---------------------------------------------------------------- ĐĂNG KÝ: BƯỚC 1 (xác minh CAPTCHA rồi gửi OTP)
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
    if (!(await verifyRecaptcha(req.body.recaptcha, req.ip))) {
      return fail(
        res,
        400,
        "Vui lòng xác nhận bạn không phải người máy.",
        "captcha",
      );
    }

    const existing = await User.findOne({ where: { email } });
    if (existing && existing.emailVerifiedAt) {
      return fail(
        res,
        409,
        'Email này đã có tài khoản. Hãy đăng nhập, hoặc dùng "Quên mật khẩu" nếu bạn quên mật khẩu.',
        "email",
      );
    }
    const old = await RegisterOtp.findOne({ where: { email } });
    if (old && Date.now() - old.sentAt.getTime() < RESEND_COOLDOWN_MS) {
      const wait = Math.ceil(
        (RESEND_COOLDOWN_MS - (Date.now() - old.sentAt.getTime())) / 1000,
      );
      return fail(
        res,
        429,
        `Vui lòng đợi ${wait} giây trước khi yêu cầu mã mới.`,
        "email",
      );
    }

    const otp = newOtp();
    await RegisterOtp.destroy({ where: { email } }); // mỗi email chỉ có 1 OTP còn hiệu lực
    const keptAttempts = old ? old.attempts : 0;
    const row = await RegisterOtp.create({
      email,
      otpHash: otpHashReg(email, otp), // chỉ lưu hash, không lưu OTP
      expiresAt: new Date(Date.now() + REGISTER_OTP_MINUTES * 60 * 1000),
      attempts: keptAttempts,
      sentAt: new Date(),
    });
    try {
      await sendMail({
        to: email,
        ...otpEmailContent({
          name: "",
          otp,
          minutes: REGISTER_OTP_MINUTES,
          kind: "register",
          baseUrl: baseUrl(req),
        }),
      });
    } catch (err) {
      console.error("Gửi OTP đăng ký thất bại:", err.message);
      await row.destroy();
      return fail(
        res,
        502,
        "Không gửi được email xác thực, vui lòng thử lại sau.",
        "email",
      );
    }
    ok(res, { cooldown: RESEND_COOLDOWN_MS / 1000 });
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
    const row = await RegisterOtp.findOne({ where: { email } });
    if (!row || row.expiresAt < new Date() || row.ticketHash) {
      if (row && !row.ticketHash) await row.destroy();
      return fail(res, 400, BAD);
    }
    if (!safeEqual(row.otpHash, otpHashReg(email, otp))) {
      // quá 5 lần sai thì hủy OTP (chặn dò 1 triệu khả năng)
      if (row.attempts + 1 >= OTP_MAX_TRIES) await row.destroy();
      else await row.update({ attempts: row.attempts + 1 });
      return fail(res, 400, BAD);
    }

    // OTP đúng: hủy OTP (dùng 1 lần), cấp vé cho bước 3
    const ticket = randomToken();
    await row.update({
      otpHash: sha256(randomToken()),
      ticketHash: sha256(ticket),
      ticketExpires: new Date(Date.now() + TICKET_MINUTES * 60 * 1000),
    });
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
      const accountRole = String(req.body.role || "");

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
    if (!ACCOUNT_ROLES.includes(accountRole))
    return fail(res, 400, "Vui lòng chọn vai trò (khách hàng hoặc đầu bếp).", "role");
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

// ---------------------------------------------------------------- QUÊN MẬT KHẨU (OTP)
router.post(
  "/forgot-password",
  guestOnly,
  limitForgot,
  jsonOnly,
  asyncHandler(async (req, res) => {
    const email = normEmail(req.body.email);
    const eEmail = V.validateEmail(email);
    if (eEmail) return fail(res, 400, eEmail, "email");
    const user = await User.findOne({ where: { email } });
    if (user && user.emailVerifiedAt) {
      const old = await PasswordReset.findOne({ where: { userId: user.id } });
      const cooling =
        old && Date.now() - old.sentAt.getTime() < RESEND_COOLDOWN_MS;
      if (!cooling) {
        const otp = newOtp();
        const keptAttempts = old ? old.attempts : 0;
        await PasswordReset.destroy({ where: { userId: user.id } }); // mỗi người chỉ có 1 OTP còn hiệu lực
        await PasswordReset.create({
          userId: user.id,
          otpHash: otpHashReset(user.id, otp), // chỉ lưu hash, không lưu OTP
          expiresAt: new Date(Date.now() + RESET_OTP_MINUTES * 60 * 1000),
          attempts: keptAttempts,
          sentAt: new Date(),
        });
        try {
          await sendMail({
            to: user.email,
            ...otpEmailContent({
              name: user.name,
              otp,
              minutes: RESET_OTP_MINUTES,
              kind: "reset",
              baseUrl: baseUrl(req),
            }),
          });
        } catch (err) {
          console.error("Gửi OTP đặt lại mật khẩu thất bại:", err.message);
        }
      }
    }
    // luôn báo thành công, dù email có tồn tại hay không (không lộ email nào có tài khoản)
    ok(res, { cooldown: RESEND_COOLDOWN_MS / 1000 });
  }),
);

// Bước 2 của quên mật khẩu: chỉ KIỂM TRA mã (không hủy mã), để giao diện có đủ 3 bước giống đăng ký.
// Bước 3 (/reset-password) kiểm tra lại mã lần nữa trước khi đổi mật khẩu. Sai quá 5 lần thì hủy mã.
router.post(
  "/forgot-password/verify",
  guestOnly,
  limitReset,
  jsonOnly,
  asyncHandler(async (req, res) => {
    const email = normEmail(req.body.email);
    const otp = String(req.body.otp || "").trim();
    if (V.validateEmail(email)) return fail(res, 400, "Email không hợp lệ.");
    if (!V.OTP_RE.test(otp)) return fail(res, 400, "Vui lòng nhập đủ 6 số.");
    const BAD = "Mã chưa đúng hoặc đã hết hạn. Bạn có thể yêu cầu mã mới.";
    const user = await User.findOne({ where: { email } });
    const row = user
      ? await PasswordReset.findOne({ where: { userId: user.id } })
      : null;
    if (!user || !row || row.expiresAt < new Date()) {
      if (row) await row.destroy();
      return fail(res, 400, BAD);
    }
    if (!safeEqual(row.otpHash, otpHashReset(user.id, otp))) {
      if (row.attempts + 1 >= OTP_MAX_TRIES) await row.destroy();
      else await row.update({ attempts: row.attempts + 1 });
      return fail(res, 400, BAD);
    }
    ok(res);
  }),
);

router.post(
  "/reset-password",
  guestOnly,
  limitReset,
  jsonOnly,
  asyncHandler(async (req, res) => {
    const email = normEmail(req.body.email);
    const otp = String(req.body.otp || "").trim();
    const password = String(req.body.matKhau || "");
    const password2 = String(req.body.matKhau2 || "");

    if (V.validateEmail(email)) return fail(res, 400, "Email không hợp lệ.");
    if (!V.OTP_RE.test(otp))
      return fail(res, 400, "Vui lòng nhập đủ 6 số.", "otp");
    const user = await User.findOne({ where: { email } });
    const ePass = V.validatePassword(password, {
      email,
      name: user ? user.name : "",
    });
    if (ePass) return fail(res, 400, ePass, "matKhau");
    if (password !== password2)
      return fail(res, 400, "Mật khẩu nhập lại chưa khớp.", "matKhau2");

    const BAD = "Mã chưa đúng hoặc đã hết hạn. Bạn có thể yêu cầu mã mới.";
    const row = user
      ? await PasswordReset.findOne({ where: { userId: user.id } })
      : null;
    if (!user || !row || row.expiresAt < new Date()) {
      if (row) await row.destroy();
      return fail(res, 400, BAD, "otp");
    }
    if (!safeEqual(row.otpHash, otpHashReset(user.id, otp))) {
      // quá 5 lần sai thì hủy OTP (chặn dò 1 triệu khả năng)
      if (row.attempts + 1 >= OTP_MAX_TRIES) await row.destroy();
      else await row.update({ attempts: row.attempts + 1 });
      return fail(res, 400, BAD, "otp");
    }

    // OTP đúng: đổi mật khẩu, hủy OTP, mở khóa, đăng xuất mọi thiết bị
    await user.update({
      passwordHash: await bcrypt.hash(password, BCRYPT_COST),
      failedLogins: 0,
      lockedUntil: null,
    });
    await PasswordReset.destroy({ where: { userId: user.id } });
    await Session.destroy({ where: { userId: user.id } });
    ok(res);
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
