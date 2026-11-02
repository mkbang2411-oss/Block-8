const sequelize = require('../config/database');
const Dish = require('./Dish');
const Chef = require('./Chef');
const Ingredient = require('./Ingredient');
const User = require('./User');
const Session = require('./Session');
const PasswordReset = require('./PasswordReset');
const RegisterOtp = require('./RegisterOtp');

// Mỗi món BẮT BUỘC có một đầu bếp; không xóa được đầu bếp còn đang phụ trách món (RESTRICT)
Chef.hasMany(Dish, { foreignKey: { name: 'chefId', allowNull: false }, as: 'dishes', onDelete: 'RESTRICT' });
Dish.belongsTo(Chef, { foreignKey: { name: 'chefId', allowNull: false }, as: 'chef' });

// Món ăn <-> nguyên liệu (nhiều-nhiều); xóa một bên thì bảng nối tự xóa theo
Dish.belongsToMany(Ingredient, {
  through: 'dish_ingredients',
  as: 'ingredients',
  foreignKey: 'dishId',
  otherKey: 'ingredientId',
});
Ingredient.belongsToMany(Dish, {
  through: 'dish_ingredients',
  as: 'dishes',
  foreignKey: 'ingredientId',
  otherKey: 'dishId',
});

// Tài khoản 1-n phiên đăng nhập; xóa tài khoản thì xóa luôn các phiên
User.hasMany(Session, { foreignKey: { name: 'userId', allowNull: false }, as: 'sessions', onDelete: 'CASCADE' });
Session.belongsTo(User, { foreignKey: { name: 'userId', allowNull: false }, as: 'user' });

User.hasMany(PasswordReset, { foreignKey: { name: 'userId', allowNull: false }, as: 'resets', onDelete: 'CASCADE' });
PasswordReset.belongsTo(User, { foreignKey: { name: 'userId', allowNull: false }, as: 'user' });

module.exports = { sequelize, Dish, Chef, Ingredient, User, Session, PasswordReset, RegisterOtp };
