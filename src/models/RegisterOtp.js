const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// OTP xác thực email khi ĐĂNG KÝ (bước 1-2 của form đăng ký). Mỗi email chỉ có 1 dòng; dòng này GIỮ LẠI số lần thử sai (attempts)
// và số lần gửi (sendCount) xuyên suốt các lần xin mã mới -> xin mã mới KHÔNG làm attempts về 0.
// Email ĐÃ có tài khoản cũng có dòng (otpHash ngẫu nhiên, không ai biết) để mọi giới hạn hoạt động y hệt -> không dò được email nào đã đăng ký.
// Chỉ lưu hash của OTP; sau khi nhập đúng OTP thì cấp "vé" (ticket) dùng 1 lần cho bước 3 (chỉ lưu hash của vé).
const RegisterOtp = sequelize.define(
  'RegisterOtp',
  {
    email: { type: DataTypes.STRING(254), allowNull: false, unique: true },
    otpHash: { type: DataTypes.STRING(64), allowNull: false },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    sentAt: { type: DataTypes.DATE, allowNull: false },
    ticketHash: { type: DataTypes.STRING(64) },
    ticketExpires: { type: DataTypes.DATE },
    // Khóa xác thực khi nhập sai đủ số lần. KHÔNG bị xóa/reset khi xin mã mới; chỉ hết khi quá lockedUntil.
    lockedUntil: { type: DataTypes.DATE },
    // Tổng số lần GỬI mã cho email này trong cửa sổ sendWindowStart (giới hạn theo email, không chỉ theo IP)
    sendCount: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    sendWindowStart: { type: DataTypes.DATE },
  },
  { tableName: 'register_otps', indexes: [{ fields: ['expiresAt'] }] }
);

module.exports = RegisterOtp;
