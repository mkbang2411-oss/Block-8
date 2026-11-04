const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

// Link đặt lại mật khẩu (quên mật khẩu). Mỗi người chỉ có 1 link CHƯA DÙNG còn hiệu lực.
// Email chứa link /reset-password?token=<64 ký tự hex ngẫu nhiên 256 bit>; DB CHỈ lưu SHA-256 của token (không lưu token gốc),
// hết hạn sau 30 phút, dùng 1 lần: đổi mật khẩu xong thì ĐÁNH DẤU `usedAt` (không xóa dòng) để còn bằng chứng trong DB.
// Cột `tokenHash` là cột thật tên tokenHash (bản cũ đặt tên otpHash, được đổi tên tự động khi khởi động: utils/migrate.js).
const PasswordReset = sequelize.define(
  "PasswordReset",
  {
    tokenHash: { type: DataTypes.STRING(64), allowNull: false },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    usedAt: { type: DataTypes.DATE }, // NULL = chưa dùng; có giá trị = đã dùng để đổi mật khẩu lúc đó
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }, // không còn dùng (token 256 bit không cần giới hạn thử)
    sentAt: { type: DataTypes.DATE, allowNull: false },
  },
  {
    tableName: "password_resets",
    indexes: [
      { fields: ["userId"] },
      { fields: ["expiresAt"] },
      { fields: ["tokenHash"], unique: true },
    ],
  },
);

module.exports = PasswordReset;
