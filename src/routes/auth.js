const express = require("express");
const { ROLES } = require("../middleware/auth");

const router = express.Router();

// GET /login, GET /register -> trang đăng nhập / đăng ký (cùng 1 view, khác tab mở sẵn)
router.get("/login", (req, res) => {
  res.render("login", { error: null, tab: "login" });
});
router.get("/register", (req, res) => {
  res.render("login", { error: null, tab: "register" });
});

// POST /login -> lưu role vào cookie, redirect 303
// (hộp "chọn vai" ở trang chủ vẫn dùng đường này. Đăng nhập bằng email/mật khẩu chưa có backend: JS giả lập ở giao diện)
router.post("/login", (req, res) => {
  const role = req.body.role;
  if (!ROLES.includes(role)) {
    const error = req.body.email
      ? "Đăng nhập bằng tài khoản đang được phát triển (chưa có backend)."
      : "Vui lòng chọn role hợp lệ (user hoặc admin).";
    return res.status(400).render("login", { error, tab: "login" });
  }
  res.cookie("role", role, { httpOnly: true, sameSite: "lax" });
  res.redirect(303, role === "admin" ? "/admin/dishes" : "/khach");
});

// POST /logout -> xóa role + cờ đăng nhập, về trang đăng nhập, redirect 303
router.post("/logout", (req, res) => {
  res.clearCookie("role");
  res.clearCookie("dn");
  res.redirect(303, "/login");
});

module.exports = router;
