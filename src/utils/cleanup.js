// Dọn dữ liệu hết hạn trong DB mỗi giờ: phiên, captcha, tài khoản không bao giờ xác minh email (>7 ngày)
const { Op } = require('sequelize');
const { Session, Captcha, User, PasswordReset } = require('../models');

async function cleanup() {
  const now = new Date();
  try {
    await Session.destroy({ where: { expiresAt: { [Op.lt]: now } } });
    await PasswordReset.destroy({ where: { expiresAt: { [Op.lt]: now } } });
    await Captcha.destroy({ where: { expiresAt: { [Op.lt]: now } } });
    await User.destroy({
      where: { emailVerifiedAt: null, createdAt: { [Op.lt]: new Date(Date.now() - 7 * 24 * 3600 * 1000) } },
    });
  } catch (err) {
    console.error('Dọn dữ liệu hết hạn lỗi:', err.message);
  }
}

function startCleanup() {
  cleanup();
  setInterval(cleanup, 60 * 60 * 1000).unref();
}

module.exports = { startCleanup };
