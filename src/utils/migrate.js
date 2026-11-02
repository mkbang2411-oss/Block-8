// sequelize.sync() chỉ tạo bảng còn thiếu, KHÔNG thêm cột mới vào bảng đã có.
// Hàm này thêm các cột model có mà bảng thật chưa có (an toàn, chạy lại nhiều lần không sao), không xóa/đổi gì.
async function addMissingColumns(sequelize, models) {
  const qi = sequelize.getQueryInterface();
  for (const model of models) {
    const table = model.getTableName();
    const existing = await qi.describeTable(table);
    for (const [name, attr] of Object.entries(model.rawAttributes)) {
      const col = attr.field || name;
      if (existing[col]) continue;
      // cột mới trên bảng có dữ liệu: không ép NOT NULL nếu không có default
      const def = { ...attr };
      if (def.allowNull === false && def.defaultValue === undefined) def.allowNull = true;
      await qi.addColumn(table, col, def);
      console.log(`Đã thêm cột ${table}.${col}`);
    }
  }
}
module.exports = { addMissingColumns };
