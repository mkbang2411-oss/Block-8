const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// OTP quên mật khẩu (6 số). Bảng riêng để DB cũ chỉ cần sync() là có, không phải sửa bảng users.
// Chỉ lưu hash của OTP, hết hạn 10 phút, tối đa 5 lần thử sai.
const PasswordReset = sequelize.define(
  'PasswordReset',
  {
    otpHash: { type: DataTypes.STRING(64), allowNull: false },
    expiresAt: { type: DataTypes.DATE, allowNull: false },
    attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    sentAt: { type: DataTypes.DATE, allowNull: false },
  },
  { tableName: 'password_resets', indexes: [{ fields: ['userId'] }, { fields: ['expiresAt'] }] }
);

module.exports = PasswordReset;
