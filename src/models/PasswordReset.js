const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

// Link đặt lại mật khẩu (quên mật khẩu). Mỗi người chỉ có 1 dòng còn hiệu lực.
// Email chứa link /reset-password?token=<64 ký tự hex ngẫu nhiên 256 bit>; DB CHỈ lưu SHA-256 của token (không lưu token gốc),
// hết hạn sau 30 phút, dùng 1 lần (đổi mật khẩu xong là xóa dòng này).
// Dùng lại cột `otpHash` có sẵn của bảng cũ (field: 'otpHash') nên DB đang chạy không cần migrate.
const PasswordReset = sequelize.define(
  "PasswordReset",
  {
    tokenHash: {
      type: DataTypes.STRING(64),
      allowNull: false,
      field: "otpHash",
    },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }, // không còn dùng (token 256 bit không cần giới hạn thử)
    sentAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    tableName: "password_resets",
    indexes: [{ fields: ["userId"] }, { fields: ["expiresAt"] }],
  },
);

module.exports = PasswordReset;
