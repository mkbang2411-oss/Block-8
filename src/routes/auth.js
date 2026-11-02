// ===== ĐĂNG KÝ + XÁC MINH EMAIL + CAPTCHA + ĐĂNG NHẬP (cookie + session trong DB) + ĐĂNG XUẤT =====
//   GET  /register              form đăng ký (kèm captcha)
//   POST /register              tạo tài khoản CHƯA kích hoạt + gửi email xác nhận
//   GET  /verify-email?token=   bấm link trong email -> kích hoạt tài khoản
//   GET/POST /resend-verification  gửi lại email xác nhận
//   GET  /captcha               ảnh captcha (SVG, dùng 1 lần)
//   GET  /login, POST /login    đăng nhập (email + mật khẩu + captcha) -> tạo session, đặt cookie `sid`
//   GET/POST /forgot-password   nhập email -> gửi OTP 6 số
//   GET/POST /reset-password    nhập OTP + mật khẩu mới
//   POST /logout                xóa session trong DB + xóa cookie
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');
const { User, Session, PasswordReset } = require('../models');
const { SESSION_COOKIE, SESSION_MS } = require('../middleware/auth');
const { randomToken, sha256, safeEqual, cookieOptions, safeNext } = require('../utils/security');
const { issueCaptcha, verifyCaptcha } = require('../utils/captcha');
const { sendMail, verifyEmailContent, otpEmailContent } = require('../utils/mailer');
const { rateLimit } = require('../utils/rateLimit');
const { asyncHandler } = require('../utils/format');

const router = express.Router();

const BCRYPT_COST = 12; // 2^12 vòng băm: đủ chậm để chặn dò mật khẩu, vẫn < 0.5s/lần
const VERIFY_HOURS = 24;
const RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MINUTES = 10;
const OTP_MAX_TRIES = 5;
const MAX_FAILS = 5;
const LOCK_MS = 15 * 60 * 1000;
// hash giả: so sánh khi email không tồn tại để thời gian phản hồi không lộ email nào có tài khoản
const DUMMY_HASH = bcrypt.hashSync('khong-ton-tai', BCRYPT_COST);

const MIN15 = 15 * 60 * 1000;
const limitLogin = rateLimit({ windowMs: MIN15, max: 20 });
const limitRegister = rateLimit({ windowMs: 60 * 60 * 1000, max: 10 });
const limitResend = rateLimit({ windowMs: 60 * 60 * 1000, max: 10 });
const limitForgot = rateLimit({ windowMs: 60 * 60 * 1000, max: 10 });
const limitReset = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
const limitCaptcha = rateLimit({ windowMs: 10 * 60 * 1000, max: 60 });

// thông báo cố định cho trang đăng nhập (chỉ nhận khóa có sẵn, không in lại nội dung từ URL)
const INFO = {
  registered: `Đăng ký thành công! Chúng tôi đã gửi email xác nhận (hiệu lực ${VERIFY_HOURS} giờ). Hãy bấm liên kết trong email rồi đăng nhập tại đây.`,
  mailfail: 'Tài khoản đã được tạo nhưng chưa gửi được email xác nhận. Hãy bấm "Chưa nhận được email xác nhận?" bên dưới để gửi lại.',
  reset: 'Đặt lại mật khẩu thành công. Hãy đăng nhập bằng mật khẩu mới.',
};

const V = require('../utils/validators');
const { normEmail } = V;

function baseUrl(req) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  return `${req.protocol}://${req.get('host')}`;
}

// tạo token xác minh mới (chỉ lưu hash) rồi gửi email
async function sendVerification(req, user) {
  const token = randomToken();
  await user.update({
    verifyTokenHash: sha256(token),
    verifyTokenExpires: new Date(Date.now() + VERIFY_HOURS * 3600 * 1000),
    verifySentAt: new Date(),
  });
  const link = `${baseUrl(req)}/verify-email?token=${token}`;
  await sendMail({ to: user.email, ...verifyEmailContent({ name: user.name, link, hours: VERIFY_HOURS }) });
}

const notice = (res, { status = 200, title, message, ok = true, links = [] }) =>
  res.status(status).render('auth/thong-bao', { title, message, ok, links });

// đã đăng nhập thì khỏi vào lại form đăng nhập/đăng ký
const guestOnly = (req, res, next) => (req.user ? res.redirect(303, '/admin/dishes') : next());

router.get('/captcha', limitCaptcha, asyncHandler(issueCaptcha));

// ---------------------------------------------------------------- ĐĂNG KÝ
router.get('/register', guestOnly, (req, res) =>
  res.render('auth/register', { values: { name: '', email: '' }, errors: {}, error: null }),
);

router.post(
  '/register',
  guestOnly,
  limitRegister,
  asyncHandler(async (req, res) => {
    const name = String(req.body.name || '').trim();
    const email = normEmail(req.body.email);
    const password = String(req.body.password || '');
    const password2 = String(req.body.password2 || '');
    const values = { name, email };
    const fail = (errors, error = null) => res.status(400).render('auth/register', { values, errors, error });

    // 1) captcha trước (rẻ nhất), dùng 1 lần
    if (!(await verifyCaptcha(req, res, req.body.captcha))) {
      return fail({ captcha: 'Mã captcha sai hoặc đã hết hạn, hãy nhập mã ở ảnh mới.' });
    }

    // 2) kiểm tra dữ liệu phía server
    const errors = {};
    const eName = V.validateName(name);
    const eEmail = V.validateEmail(email);
    const ePass = V.validatePassword(password, { email, name });
    if (eName) errors.name = eName;
    if (eEmail) errors.email = eEmail;
    if (ePass) errors.password = ePass;
    else if (password !== password2) errors.password2 = 'Mật khẩu nhập lại không khớp.';
    if (Object.keys(errors).length) return fail(errors);

    // 3) tạo tài khoản CHƯA kích hoạt. Lưu bcrypt hash, KHÔNG lưu mật khẩu gốc.
    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
    let user = await User.findOne({ where: { email } });
    let mailFailed = false;
    if (!user) {
      user = await User.create({ name, email, passwordHash });
    } else if (!user.emailVerifiedAt) {
      // đăng ký lại khi chưa xác minh: lần đăng ký mới nhất được tính
      await user.update({ name, passwordHash });
    } else {
      user = null; // email đã có tài khoản kích hoạt: không gửi gì, không tiết lộ ra ngoài
    }
    if (user) {
      try {
        await sendVerification(req, user);
      } catch (err) {
        console.error('Gửi email xác nhận thất bại:', err.message);
        mailFailed = true;
      }
    }

    // xong -> chuyển sang trang đăng nhập (thông báo giống nhau cho mọi trường hợp, chống dò email đã đăng ký)
    res.redirect(303, mailFailed ? '/login?info=mailfail' : '/login?info=registered');
  }),
);

// ---------------------------------------------------------------- XÁC MINH EMAIL
router.get(
  '/verify-email',
  limitLogin,
  asyncHandler(async (req, res) => {
    const token = String(req.query.token || '');
    const user = /^[a-f0-9]{64}$/.test(token) ? await User.findOne({ where: { verifyTokenHash: sha256(token) } }) : null;
    if (!user || !user.verifyTokenExpires || user.verifyTokenExpires < new Date()) {
      return notice(res, {
        status: 400,
        ok: false,
        title: 'Liên kết không hợp lệ',
        message: 'Liên kết xác nhận sai hoặc đã hết hạn. Bạn có thể yêu cầu gửi lại email mới.',
        links: [{ href: '/resend-verification', label: 'Gửi lại email xác nhận' }],
      });
    }
    // kích hoạt + hủy token (dùng 1 lần)
    await user.update({ emailVerifiedAt: user.emailVerifiedAt || new Date(), verifyTokenHash: null, verifyTokenExpires: null });
    notice(res, {
      title: 'Đã xác nhận email',
      message: 'Tài khoản đã được kích hoạt. Bạn có thể đăng nhập.',
      links: [{ href: '/login', label: 'Đăng nhập' }],
    });
  }),
);

router.get('/resend-verification', guestOnly, (req, res) => res.render('auth/resend', { email: '', error: null }));

router.post(
  '/resend-verification',
  guestOnly,
  limitResend,
  asyncHandler(async (req, res) => {
    const email = normEmail(req.body.email);
    if (!(await verifyCaptcha(req, res, req.body.captcha))) {
      return res.status(400).render('auth/resend', { email, error: 'Mã captcha sai hoặc đã hết hạn.' });
    }
    const user = !V.validateEmail(email) ? await User.findOne({ where: { email } }) : null;
    const coolingDown = user && user.verifySentAt && Date.now() - user.verifySentAt.getTime() < RESEND_COOLDOWN_MS;
    if (user && !user.emailVerifiedAt && !coolingDown) {
      try {
        await sendVerification(req, user);
      } catch (err) {
        console.error('Gửi lại email thất bại:', err.message);
      }
    }
    notice(res, {
      title: 'Kiểm tra email của bạn',
      message: 'Nếu email này đang chờ xác nhận, chúng tôi đã gửi lại liên kết mới.',
      links: [{ href: '/login', label: 'Đăng nhập' }],
    });
  }),
);

// ---------------------------------------------------------------- ĐĂNG NHẬP
router.get('/login', guestOnly, (req, res) =>
  res.render('login', { error: null, email: '', next: safeNext(req.query.next, ''), canResend: false, info: Object.hasOwn(INFO, req.query.info) ? INFO[req.query.info] : null }),
);

router.post(
  '/login',
  guestOnly,
  limitLogin,
  asyncHandler(async (req, res) => {
    const email = normEmail(req.body.email);
    const password = String(req.body.password || '');
    const next = safeNext(req.body.next, '');
    const fail = (status, error, canResend = false) =>
      res.status(status).render('login', { error, email, next, canResend });

    if (!(await verifyCaptcha(req, res, req.body.captcha))) {
      return fail(400, 'Mã captcha sai hoặc đã hết hạn, hãy nhập mã ở ảnh mới.');
    }
    if (!email || !password || password.length > 200) return fail(400, 'Vui lòng nhập email và mật khẩu.');

    const user = await User.findOne({ where: { email } });
    // luôn chạy bcrypt.compare (kể cả email không tồn tại) để thời gian xử lý như nhau
    const match = await bcrypt.compare(password, user ? user.passwordHash : DUMMY_HASH);

    if (user && user.lockedUntil && user.lockedUntil > new Date()) {
      return fail(429, 'Tài khoản tạm khóa do nhập sai nhiều lần, vui lòng thử lại sau ít phút.');
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
      return fail(401, 'Email hoặc mật khẩu không đúng.'); // cùng 1 thông báo cho 2 trường hợp
    }
    if (!user.emailVerifiedAt) {
      return fail(403, 'Email chưa được xác nhận. Hãy bấm liên kết trong email đã gửi cho bạn.', true);
    }

    // đăng nhập đúng: tạo session MỚI (đổi token mỗi lần đăng nhập -> chống session fixation)
    const oldToken = req.cookies[SESSION_COOKIE];
    if (oldToken) await Session.destroy({ where: { id: sha256(oldToken) } });
    await user.update({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() });
    const token = randomToken();
    await Session.create({
      id: sha256(token), // DB chỉ giữ hash của token
      userId: user.id,
      expiresAt: new Date(Date.now() + SESSION_MS),
      ip: String(req.ip || '').slice(0, 64),
      userAgent: String(req.get('user-agent') || '').slice(0, 255),
    });
    res.cookie(SESSION_COOKIE, token, cookieOptions(SESSION_MS));
    res.redirect(303, safeNext(next));
  }),
);

// ---------------------------------------------------------------- QUÊN MẬT KHẨU (OTP)
router.get('/forgot-password', guestOnly, (req, res) => res.render('auth/forgot', { email: '', error: null }));

router.post(
  '/forgot-password',
  guestOnly,
  limitForgot,
  asyncHandler(async (req, res) => {
    const email = normEmail(req.body.email);
    if (!(await verifyCaptcha(req, res, req.body.captcha))) {
      return res.status(400).render('auth/forgot', { email, error: 'Mã captcha sai hoặc đã hết hạn.' });
    }
    const eEmail = V.validateEmail(email);
    if (eEmail) return res.status(400).render('auth/forgot', { email, error: eEmail });
    const user = await User.findOne({ where: { email } });
    if (user && user.emailVerifiedAt) {
      const old = await PasswordReset.findOne({ where: { userId: user.id } });
      const cooling = old && Date.now() - old.sentAt.getTime() < RESEND_COOLDOWN_MS;
      if (!cooling) {
        const otp = String(crypto.randomInt(0, 1000000)).padStart(6, '0'); // CSPRNG, 6 chữ số
        await PasswordReset.destroy({ where: { userId: user.id } }); // mỗi người chỉ có 1 OTP còn hiệu lực
        await PasswordReset.create({
          userId: user.id,
          otpHash: sha256(`${user.id}:${otp}`), // chỉ lưu hash, không lưu OTP
          expiresAt: new Date(Date.now() + OTP_MINUTES * 60 * 1000),
          sentAt: new Date(),
        });
        try {
          await sendMail({ to: user.email, ...otpEmailContent({ name: user.name, otp, minutes: OTP_MINUTES }) });
        } catch (err) {
          console.error('Gửi OTP thất bại:', err.message);
        }
      }
    }
    // luôn chuyển sang bước nhập OTP, dù email có tồn tại hay không
    res.redirect(303, `/reset-password?sent=1&email=${encodeURIComponent(email)}`);
  }),
);

const renderReset = (res, status, { email = '', errors = {}, error = null, sent = false }) =>
  res.status(status).render('auth/reset', { email, errors, error, sent });

router.get('/reset-password', guestOnly, (req, res) => {
  const email = normEmail(req.query.email);
  renderReset(res, 200, { email: V.validateEmail(email) ? '' : email, sent: req.query.sent === '1' });
});

router.post(
  '/reset-password',
  guestOnly,
  limitReset,
  asyncHandler(async (req, res) => {
    const email = normEmail(req.body.email);
    const otp = String(req.body.otp || '').trim();
    const password = String(req.body.password || '');
    const password2 = String(req.body.password2 || '');

    if (!(await verifyCaptcha(req, res, req.body.captcha))) {
      return renderReset(res, 400, { email, errors: { captcha: 'Mã captcha sai hoặc đã hết hạn, hãy nhập mã ở ảnh mới.' } });
    }
    const errors = {};
    const eEmail = V.validateEmail(email);
    if (eEmail) errors.email = eEmail;
    if (!V.OTP_RE.test(otp)) errors.otp = 'OTP gồm đúng 6 chữ số.';
    const user = !eEmail ? await User.findOne({ where: { email } }) : null;
    const ePass = V.validatePassword(password, { email, name: user ? user.name : '' });
    if (ePass) errors.password = ePass;
    else if (password !== password2) errors.password2 = 'Mật khẩu nhập lại không khớp.';
    if (Object.keys(errors).length) return renderReset(res, 400, { email, errors });

    const BAD = 'OTP không đúng hoặc đã hết hạn. Bạn có thể yêu cầu mã mới.';
    const row = user ? await PasswordReset.findOne({ where: { userId: user.id } }) : null;
    if (!user || !row || row.expiresAt < new Date()) {
      if (row) await row.destroy();
      return renderReset(res, 400, { email, error: BAD });
    }
    if (!safeEqual(row.otpHash, sha256(`${user.id}:${otp}`))) {
      // quá 5 lần sai thì hủy OTP (chặn dò 1 triệu khả năng)
      if (row.attempts + 1 >= OTP_MAX_TRIES) await row.destroy();
      else await row.update({ attempts: row.attempts + 1 });
      return renderReset(res, 400, { email, error: BAD });
    }

    // OTP đúng: đổi mật khẩu, hủy OTP, mở khóa, đăng xuất mọi thiết bị
    await user.update({
      passwordHash: await bcrypt.hash(password, BCRYPT_COST),
      failedLogins: 0,
      lockedUntil: null,
    });
    await PasswordReset.destroy({ where: { userId: user.id } });
    await Session.destroy({ where: { userId: user.id } });
    res.redirect(303, '/login?info=reset');
  }),
);

// ---------------------------------------------------------------- ĐĂNG XUẤT
router.post(
  '/logout',
  asyncHandler(async (req, res) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await Session.destroy({ where: { id: sha256(token) } }); // hủy phiên ngay trong DB
    res.clearCookie(SESSION_COOKIE, cookieOptions());
    res.redirect(303, '/');
  }),
);

module.exports = router;
