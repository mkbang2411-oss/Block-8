const ROLES = ["user", "admin"];

// Không xác thực thật: chỉ đọc role từ cookie do trang /login đặt
function attachRole(req, res, next) {
  const role = req.cookies && req.cookies.role;
  req.role = ROLES.includes(role) ? role : null;
  res.locals.role = req.role;
  // "Đã đăng nhập" (khác với role đang chọn trong quán): trang chủ dựa vào cờ này để hiện cô gái + 2 bảng.
  // Hiện do giao diện đặt cookie "dn" sau khi đăng nhập; khi có backend thì đổi thành kiểm tra phiên thật.
  req.daDangNhap = !!(req.cookies && req.cookies.dn === "1");
  res.locals.daDangNhap = req.daDangNhap;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.role) return res.redirect(303, "/login");
  if (req.role !== "admin") {
    return res.status(403).render("error", {
      status: 403,
      message: "Trang này chỉ dành cho role admin.",
    });
  }
  next();
}

module.exports = { ROLES, attachRole, requireAdmin };
