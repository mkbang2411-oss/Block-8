const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Captcha dùng 1 lần, hết hạn nhanh. Chỉ lưu hash của đáp án (không lưu chữ gốc).
const Captcha = sequelize.define(
  'Captcha',
  {
    id: { type: DataTypes.STRING(64), primaryKey: true, validate: { is: /^[a-f0-9]{64}$/ } }, // SHA-256 của token trong cookie `cid`
    answerHash: { type: DataTypes.STRING(64), allowNull: false, validate: { is: /^[a-f0-9]{64}$/ } },
    expiresAt: { type: DataTypes.DATE, allowNull: false, validate: { isDate: true } },
  },
  { tableName: 'captchas', indexes: [{ fields: ['expiresAt'] }] }
);

module.exports = Captcha;
