const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const { NAME_RE } = require("../utils/validators");

// Tài khoản đầu bếp. KHÔNG bao giờ lưu mật khẩu gốc: chỉ lưu bcrypt hash (60 ký tự, đã chứa sẵn salt + cost).
const User = sequelize.define(
  "User",
  {
    name: {
      type: DataTypes.STRING(80),
      allowNull: false,
      set(v) {
        this.setDataValue(
          "name",
          String(v ?? "")
            .trim()
            .replace(/\s+/g, " "),
        );
      },
      validate: {
        notEmpty: { msg: "Họ tên không được để trống" },
        len: { args: [2, 80], msg: "Họ tên từ 2 đến 80 ký tự" },
        is: { args: NAME_RE, msg: "Họ tên chứa ký tự không hợp lệ" },
      },
    },
    // luôn lưu chữ thường (setter chuẩn hóa) để unique không bị lách bằng hoa/thường
    email: {
      type: DataTypes.STRING(254),
      allowNull: false,
      unique: true,
      set(v) {
        this.setDataValue(
          "email",
          String(v ?? "")
            .trim()
            .toLowerCase(),
        );
      },
      validate: {
        isEmail: { msg: "Email không hợp lệ" },
        len: { args: [5, 254], msg: "Email 5-254 ký tự" },
      },
    },
    passwordHash: {
      type: DataTypes.STRING(60),
      allowNull: false,
      validate: {
        is: {
          args: /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/,
          msg: "passwordHash phải là bcrypt hash",
        },
      },
    },
    role: {
      type: DataTypes.STRING(20),
      allowNull: false,
      defaultValue: "chef", // tài khoản có từ trước chưa có lựa chọn nên giữ là đầu bếp
      validate: { isIn: [["chef", "customer"]] }, // vai chọn lúc đăng ký: đầu bếp | khách hàng
    },

    // xác minh email: chỉ lưu SHA-256 của token (token gốc chỉ nằm trong email của người dùng)
    emailVerifiedAt: { type: DataTypes.DATE },
    verifyTokenHash: {
      type: DataTypes.STRING(64),
      validate: { is: /^[a-f0-9]{64}$/ },
    },
    verifyTokenExpires: { type: DataTypes.DATE },
    verifySentAt: { type: DataTypes.DATE },

    // chống dò mật khẩu: sai quá số lần thì khóa tạm
    failedLogins: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      validate: { min: 0, max: 100 },
    },
    lockedUntil: { type: DataTypes.DATE },
    lastLoginAt: { type: DataTypes.DATE },

    // ảnh đại diện (vé hành khách): file nằm trên Supabase Storage, DB chỉ giữ URL + đường dẫn để xóa ảnh cũ khi đổi
    avatarUrl: { type: DataTypes.STRING(500) },
    avatarPath: { type: DataTypes.STRING(200) },
  },
  { tableName: "users", indexes: [{ fields: ["verifyTokenHash"] }] },
);

module.exports = User;
