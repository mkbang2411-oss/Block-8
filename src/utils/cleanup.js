// Dọn dữ liệu hết hạn trong DB mỗi giờ: phiên, OTP, tài khoản không bao giờ xác minh email (>7 ngày)
const { Op } = require("sequelize");
const { Session, User, PasswordReset, RegisterOtp } = require("../models");

async function cleanup() {
  const now = new Date();
  try {
    await Session.destroy({ where: { expiresAt: { [Op.lt]: now } } });
    // link đặt lại mật khẩu: chưa dùng mà hết hạn -> xóa ngay; đã dùng (usedAt) thì giữ 30 ngày làm bằng chứng rồi mới xóa
    await PasswordReset.destroy({
      where: {
        [Op.or]: [
          { usedAt: null, expiresAt: { [Op.lt]: now } },
          {
            expiresAt: {
              [Op.lt]: new Date(Date.now() - 30 * 24 * 3600 * 1000),
            },
          },
        ],
      },
    });
    // OTP đăng ký: chỉ xóa khi đã hết hạn, vé (ticket) bước 3 đã hết, KHÔNG còn bị khóa và cửa sổ đếm số lần gửi (1 giờ) đã qua.
    // Xóa sớm hơn sẽ làm attempts / sendCount về 0 -> kẻ tấn công xin mã mới để được thử lại từ đầu.
    await RegisterOtp.destroy({
      where: {
        expiresAt: { [Op.lt]: now },
        [Op.and]: [
          { [Op.or]: [{ ticketExpires: null }, { ticketExpires: { [Op.lt]: now } }] },
          { [Op.or]: [{ lockedUntil: null }, { lockedUntil: { [Op.lt]: now } }] },
          {
            [Op.or]: [
              { sendWindowStart: null },
              { sendWindowStart: { [Op.lt]: new Date(Date.now() - 60 * 60 * 1000) } },
            ],
          },
        ],
      },
    });
    await User.destroy({
      where: {
        emailVerifiedAt: null,
        createdAt: { [Op.lt]: new Date(Date.now() - 7 * 24 * 3600 * 1000) },
      },
    });
  } catch (err) {
    console.error("Dọn dữ liệu hết hạn lỗi:", err.message);
  }
}

function startCleanup() {
  cleanup();
  setInterval(cleanup, 60 * 60 * 1000).unref();
}

module.exports = { startCleanup };
