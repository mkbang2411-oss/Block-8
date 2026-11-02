// Ràng buộc dữ liệu đăng ký / đặt lại mật khẩu (dùng chung cho route và model)
const NAME_RE = /^\p{L}[\p{L}\p{M} .'-]*$/u; // bắt đầu bằng chữ; chỉ chữ (có dấu), khoảng trắng, . ' -
const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const OTP_RE = /^\d{6}$/;

const normEmail = (v) => String(v || '').trim().toLowerCase();

function validateName(name) {
  if (name.length < 2 || name.length > 80) return 'Họ tên từ 2 đến 80 ký tự.';
  if (!NAME_RE.test(name)) return 'Họ tên chỉ gồm chữ cái, khoảng trắng, dấu chấm, gạch nối và dấu nháy.';
  return null;
}

function validateEmail(email) {
  if (!email) return 'Vui lòng nhập email.';
  if (email.length > 254 || email.split('@')[0].length > 64 || !EMAIL_RE.test(email) || email.includes('..'))
    return 'Email không hợp lệ.';
  return null;
}

function validatePassword(password, { email = '', name = '' } = {}) {
  if (password.length < 8) return 'Mật khẩu tối thiểu 8 ký tự.';
  if (Buffer.byteLength(password) > 72) return 'Mật khẩu tối đa 72 byte (giới hạn của bcrypt).';
  if (/\s/.test(password)) return 'Mật khẩu không được chứa khoảng trắng.';
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password))
    return 'Mật khẩu phải có chữ thường, chữ HOA và chữ số.';
  const local = email.split('@')[0];
  if (local.length >= 3 && password.toLowerCase().includes(local)) return 'Mật khẩu không được chứa phần tên của email.';
  if (name.length >= 3 && password.toLowerCase().includes(name.toLowerCase().replace(/\s+/g, '')))
    return 'Mật khẩu không được chứa họ tên.';
  return null;
}

module.exports = { NAME_RE, EMAIL_RE, OTP_RE, normEmail, validateName, validateEmail, validatePassword };
