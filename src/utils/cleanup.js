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
    // OTP đăng ký: còn giữ khi vé (ticket) của bước 3 chưa hết hạn
    await RegisterOtp.destroy({
      where: {
        expiresAt: { [Op.lt]: now },
        [Op.or]: [{ ticketExpires: null }, { ticketExpires: { [Op.lt]: now } }],
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
