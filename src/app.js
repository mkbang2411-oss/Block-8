const path = require("path");
const express = require("express");
const compression = require("compression");
const cookieParser = require("cookie-parser");
const methodOverride = require("method-override");
const { attachUser, requireAuth, sameOriginOnly } = require("./middleware/auth");
const { formatPrice, dishThumb } = require("./utils/format");

const app = express();

// chạy sau proxy (Render...): để req.ip đúng cho rate limit và cookie Secure hoạt động
if (process.env.NODE_ENV === "production") app.set("trust proxy", 1);

// nén HTML/CSS/JS trước khi gửi về trình duyệt (giảm ~70% dung lượng)
app.use(compression());

// endpoint nhẹ, không đụng DB: dùng cho dịch vụ ping (UptimeRobot...) giữ Render free không "ngủ"
app.get("/healthz", (req, res) => res.type("text").send("ok"));

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

const PUBLIC = path.join(__dirname, "..", "public");
// Một static duy nhất: ảnh (/img) ít đổi nên cache 30 ngày (đổi ảnh thì đổi tên file), CSS/JS cache 1 ngày
app.use(
  express.static(PUBLIC, {
    maxAge: "1d",
    setHeaders: (res, file) => {
      if (/[\\/]img[\\/]/.test(file))
        res.setHeader("Cache-Control", "public, max-age=2592000");
    },
  }),
);
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
// <form method="POST" action="...?_method=PATCH|DELETE"> -> req.method = PATCH|DELETE
app.use(methodOverride("_method"));
// chặn CSRF (POST/PATCH/DELETE phải cùng nguồn) rồi đọc cookie phiên -> req.user
app.use(sameOriginOnly);
app.use(attachUser);
// origin của Supabase Storage (không phải bí mật): để <link rel="preconnect"> mở sẵn kết nối tới nơi chứa ảnh
let imgOrigin = "";
try {
  if (process.env.SUPABASE_URL) imgOrigin = new URL(process.env.SUPABASE_URL).origin;
} catch (e) {}
app.use((req, res, next) => {
  res.locals.imgOrigin = imgOrigin;
  res.locals.formatPrice = formatPrice;
  res.locals.dishThumb = dishThumb;
  next();
});

app.use(require("./routes/pages"));
app.use(require("./routes/auth"));
app.use(require("./routes/public"));
// toàn bộ CRUD (/admin/**) bắt buộc đăng nhập; khách chỉ xem /, /khach, /dishes
app.use("/admin", requireAuth, require("./routes/admin"));

// id sai / không có / đường dẫn lạ -> 404
app.use((req, res) => {
  res.status(404).render("error", {
    status: 404,
    message: "Không tìm thấy trang hoặc dữ liệu bạn yêu cầu.",
  });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res
    .status(500)
    .render("error", { status: 500, message: "Có lỗi xảy ra phía máy chủ." });
});

module.exports = app;
