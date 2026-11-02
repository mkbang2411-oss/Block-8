const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Phiên đăng nhập lưu bền vững trong DB (restart server / nhiều instance vẫn giữ phiên).
// id = SHA-256 của token nằm trong cookie `sid` -> lộ bảng này cũng không dùng được để chiếm phiên.
const Session = sequelize.define(
  'Session',
  {
    id: { type: DataTypes.STRING(64), primaryKey: true, validate: { is: /^[a-f0-9]{64}$/ } },
    expiresAt: { type: DataTypes.DATE, allowNull: false, validate: { isDate: true } },
    ip: { type: DataTypes.STRING(64) },
    userAgent: { type: DataTypes.STRING(255) },
  },
  { tableName: 'sessions', indexes: [{ fields: ['expiresAt'] }, { fields: ['userId'] }] }
);

module.exports = Session;
