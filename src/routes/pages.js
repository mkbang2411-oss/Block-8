// ===== TRANG CHỦ (phố) + TRANG KHÁCH (bàn tròn chọn món) =====
//   GET /       phố Ba Cô Gái, bấm vào quán để chọn vai (khách: xem tự do; đầu bếp: phải đăng nhập)
//   GET /khach  bàn tròn xoay các món LẤY TỪ DATABASE
const express = require("express");
const { Dish, Chef, Ingredient } = require("../models");
const { taoPho } = require("../utils/pho");
const { asyncHandler, dishIcon } = require("../utils/format");

const router = express.Router();

router.get("/", (req, res) => {
  res.render("home", { pho: taoPho() });
});

// Hộp chọn vai ở trang phố: khách vào xem thực đơn luôn (không cần đăng nhập), đầu bếp sang trang đăng nhập
router.get("/vao-quan", (req, res) =>
  res.redirect(303, req.query.role === "admin" ? "/login" : "/khach"),
);

router.get(
  "/khach",
  asyncHandler(async (req, res) => {
    const dishes = await Dish.findAll({
      include: [
        { model: Chef, as: "chef" },
        { model: Ingredient, as: "ingredients" },
      ],
      order: [["id", "ASC"]],
    });
    // chỉ gửi xuống trình duyệt những trường cần để vẽ vòng món
    const mon = dishes.map((d) => ({
      id: d.id,
      ten: d.name,
      gia: Number(d.price),
      icon: dishIcon(d),
      anh: d.imageUrl || "", // URL ảnh trên Supabase (rỗng = dùng emoji)
      moTa: d.description || "",
      loai: d.category,
      conBan: d.available,
      dauBep: d.chef ? d.chef.name : "",
      nguyenLieu: d.ingredients.map((i) => ({ ten: i.name, donVi: i.unit })),
    }));
    res.render("khach", { mon });
  }),
);

module.exports = router;