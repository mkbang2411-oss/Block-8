// Admin cấp / thu hồi quyền ĐẦU BẾP cho một tài khoản đã đăng ký.
// Dùng:  node scripts/set-role.js <email> <chef|customer>
//   vd:  node scripts/set-role.js bep@example.com chef       (cấp quyền CRUD /admin)
//        node scripts/set-role.js bep@example.com customer   (thu hồi, hiệu lực ngay ở request kế tiếp)
// Chạy trên máy chủ có DATABASE_URL (file .env), nên chỉ người quản trị hệ thống làm được; web không có cách nào tự nâng quyền.
require('dotenv').config();
const { sequelize, User } = require('../src/models');

const ROLES = ['chef', 'customer'];

(async () => {
  const [emailArg, roleArg] = process.argv.slice(2);
  if (!emailArg || !ROLES.includes(roleArg)) {
    console.error('Cách dùng: node scripts/set-role.js <email> <chef|customer>');
    process.exit(1);
  }
  const email = emailArg.trim().toLowerCase();
  const user = await User.findOne({ where: { email } });
  if (!user) {
    console.error(`Không tìm thấy tài khoản: ${email}`);
    process.exit(1);
  }
  if (user.role === roleArg) {
    console.log(`${email} đã là ${roleArg}, không cần đổi.`);
  } else {
    const cu = user.role;
    await user.update({ role: roleArg });
    console.log(`Đã đổi role của ${email}: ${cu} -> ${roleArg}`);
  }
  await sequelize.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
