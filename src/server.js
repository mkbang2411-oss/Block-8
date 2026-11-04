const app = require("./app");
const { sequelize, User, Session, PasswordReset, RegisterOtp } = require("./models");
const { addMissingColumns, renameColumnIfNeeded } = require("./utils/migrate");
const { startCleanup } = require("./utils/cleanup");

const PORT = process.env.PORT || 3000;

(async () => {
  try {
    await sequelize.authenticate();
    // Code-first: bảng được tạo từ model (chưa có thì tạo, có rồi thì giữ nguyên)
    // bảng password_resets cũ lưu hash token ở cột tên `otpHash`: đổi tên thành `tokenHash` TRƯỚC khi sync (để sync không tạo thêm cột/chỉ mục trùng)
    await renameColumnIfNeeded(
      sequelize,
      PasswordReset,
      "otpHash",
      "tokenHash",
    ).catch(() => {}); // bảng chưa có (DB mới) -> bỏ qua
    await sequelize.sync();
    await addMissingColumns(sequelize, [User, Session, PasswordReset, RegisterOtp]); // bảng có từ trước vẫn nhận cột mới (users.windowStart, password_resets.usedAt)
    startCleanup();
    app.listen(PORT, () =>
      console.log(`Server chạy tại http://localhost:${PORT}`),
    );
  } catch (err) {
    console.error("Không kết nối được database:", err.message);
    process.exit(1);
  }
})();
