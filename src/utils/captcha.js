// CAPTCHA ảnh tự sinh (svg-captcha), mức 2:
//   - chữ biến dạng + vẽ thành đường path (bot không đọc được chữ từ mã SVG), có nhiễu, màu ngẫu nhiên
//   - đáp án chỉ lưu dạng hash trong DB, gắn với cookie `cid`, hết hạn 5 phút, DÙNG 1 LẦN (đúng hay sai đều bị xóa)
const svgCaptcha = require('svg-captcha');
const { Captcha } = require('../models');
const { randomToken, sha256, safeEqual, cookieOptions } = require('./security');

const TTL_MS = 5 * 60 * 1000;
const COOKIE = 'cid';

const answerHash = (id, text) => sha256(`${id}:${String(text).trim().toLowerCase()}`);

// GET /captcha -> trả ảnh SVG mới, đồng thời ghi đáp án (hash) vào DB + đặt cookie cid
async function issueCaptcha(req, res) {
  const old = req.cookies && req.cookies[COOKIE];
  if (old) await Captcha.destroy({ where: { id: sha256(old) } });

  const { data, text } = svgCaptcha.create({
    size: 5,
    ignoreChars: '0oO1iIl5Ss2Zz', // bỏ ký tự dễ nhầm
    noise: 4,
    color: true,
    width: 160,
    height: 56,
    fontSize: 48,
    background: '#fffaf0',
  });
  const token = randomToken(16);
  await Captcha.create({ id: sha256(token), answerHash: answerHash(token, text), expiresAt: new Date(Date.now() + TTL_MS) });

  res.cookie(COOKIE, token, cookieOptions(TTL_MS));
  res.set({ 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' });
  res.send(data);
}

// Kiểm tra đáp án. Luôn xóa bản ghi (dùng 1 lần) để không thử lại nhiều đáp án trên cùng 1 ảnh.
async function verifyCaptcha(req, res, input) {
  const token = req.cookies && req.cookies[COOKIE];
  res.clearCookie(COOKIE, cookieOptions());
  if (!token || typeof input !== 'string' || !input.trim() || input.length > 12) return false;
  const row = await Captcha.findByPk(sha256(token));
  if (!row) return false;
  await row.destroy();
  if (row.expiresAt < new Date()) return false;
  return safeEqual(row.answerHash, answerHash(token, input));
}

module.exports = { issueCaptcha, verifyCaptcha };
