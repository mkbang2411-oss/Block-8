const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// OTP xác thực email khi ĐĂNG KÝ (bước 1-2 của form đăng ký). Mỗi email chỉ có 1 dòng.
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
  },
  { tableName: 'register_otps', indexes: [{ fields: ['expiresAt'] }] }
);

module.exports = RegisterOtp;
