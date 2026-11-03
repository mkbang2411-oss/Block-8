// Mock data: xóa & tạo lại bảng từ model (code-first) rồi thêm dữ liệu mẫu.
// Có ~10 món để bàn tròn ở trang /khach nhìn đủ đầy (giao diện thiết kế cho khoảng 10 món).
require("dotenv").config();
const bcrypt = require("bcryptjs");
const { sequelize, Dish, Chef, Ingredient, User } = require("../src/models");

(async () => {
  await sequelize.sync({ force: true });

  const [an, binh, lan, mai] = await Chef.bulkCreate(
    [
      { name: "Nguyễn Văn An", specialty: "Món Huế" },
      { name: "Trần Thị Bình", specialty: "Món Ý" },
      { name: "Cô Lan", specialty: "Phở, nước dùng" },
      { name: "Cô Mai", specialty: "Món nướng, bún chả" },
    ],
    { returning: true },
  );

  const list = await Ingredient.bulkCreate(
    [
      ["Thịt bò", "kg"],
      ["Bánh phở", "kg"],
      ["Hành lá", "g"],
      ["Mì Ý", "g"],
      ["Cà chua", "kg"],
      ["Trứng gà", "quả"],
      ["Bún", "kg"],
      ["Thịt ba chỉ", "kg"],
      ["Nước mắm", "chai"],
      ["Tôm", "kg"],
      ["Gạo nếp", "kg"],
      ["Cà phê", "g"],
      ["Sữa đặc", "lon"],
      ["Hạt sen", "g"],
      ["Long nhãn", "g"],
      ["Đậu hũ", "miếng"],
    ].map(([name, unit]) => ({ name, unit })),
    { returning: true },
  );
  const ing = Object.fromEntries(list.map((i) => [i.name, i]));

  // [tên, mô tả, giá, danh mục, còn bán, đầu bếp, [nguyên liệu]]
  const mon = [
    [
      "Phở bò",
      "Phở bò nước dùng hầm xương 12 tiếng.",
      65000,
      "Món chính",
      true,
      an,
      ["Thịt bò", "Bánh phở", "Hành lá"],
    ],
    [
      "Spaghetti sốt cà",
      "Mì Ý sốt cà chua tươi.",
      89000,
      "Món chính",
      true,
      binh,
      ["Mì Ý", "Cà chua"],
    ],
    [
      "Trứng chiên hành",
      "Món ăn nhanh.",
      30000,
      "Khai vị",
      false,
      an,
      ["Trứng gà", "Hành lá"],
    ],
    [
      "Bún chả",
      "Thịt nướng than hoa, nước chấm chua ngọt.",
      60000,
      "Món chính",
      true,
      mai,
      ["Bún", "Thịt ba chỉ", "Nước mắm"],
    ],
    [
      "Bún đậu mắm tôm",
      "Bún lá, đậu hũ chiên giòn, mắm tôm.",
      65000,
      "Món chính",
      true,
      mai,
      ["Bún", "Đậu hũ"],
    ],
    [
      "Nem rán",
      "Nem rán giòn, nhân thịt và miến.",
      50000,
      "Khai vị",
      true,
      an,
      ["Thịt ba chỉ", "Trứng gà"],
    ],
    [
      "Xôi xéo",
      "Xôi nếp đậu xanh, hành phi.",
      30000,
      "Món chay",
      true,
      an,
      ["Gạo nếp"],
    ],
    [
      "Cà phê trứng",
      "Cà phê đậm phủ lớp kem trứng béo.",
      40000,
      "Đồ uống",
      true,
      lan,
      ["Cà phê", "Trứng gà", "Sữa đặc"],
    ],
    [
      "Bánh tôm Hồ Tây",
      "Bánh tôm khoai lang chiên giòn.",
      48000,
      "Khai vị",
      true,
      lan,
      ["Tôm"],
    ],
    [
      "Chè sen long nhãn",
      "Chè hạt sen, long nhãn, đường phèn.",
      35000,
      "Tráng miệng",
      true,
      lan,
      ["Hạt sen", "Long nhãn"],
    ],
  ];
  for (const [
    name,
    description,
    price,
    category,
    available,
    chef,
    ings,
  ] of mon) {
    const dish = await Dish.create({
      name,
      description,
      price,
      category,
      available,
      chefId: chef.id,
    });
    await dish.setIngredients(ings.map((n) => ing[n]));
  }

  // Tài khoản đầu bếp mẫu (đã xác minh email) để đăng nhập ngay; đặt SEED_CHEF_EMAIL / SEED_CHEF_PASSWORD trong .env
  // LƯU Ý: sync({ force: true }) ở đầu file xóa cả bảng users và sessions -> chạy seed xong phải đăng nhập lại.
  if (process.env.SEED_CHEF_EMAIL && process.env.SEED_CHEF_PASSWORD) {
    await User.create({
      name: "Đầu bếp mẫu",
      email: process.env.SEED_CHEF_EMAIL.trim().toLowerCase(),
      passwordHash: await bcrypt.hash(process.env.SEED_CHEF_PASSWORD, 12),
      role: "chef", // mặc định của model là customer nên tài khoản mẫu phải ghi rõ chef
      emailVerifiedAt: new Date(),
    });
    console.log("Đã tạo tài khoản đầu bếp mẫu:", process.env.SEED_CHEF_EMAIL);
  }

  console.log("Seed xong.");
  await sequelize.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
