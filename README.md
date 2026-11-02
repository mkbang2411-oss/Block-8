# CÁI QUÁN ĂN

**Website quản lý và giới thiệu món ăn** được xây dựng bằng Node.js, Express, EJS, Sequelize và PostgreSQL trên Supabase. Dự án kết hợp giao diện khám phá quán ăn mang phong cách con phố Việt Nam với hệ thống quản trị dữ liệu món ăn, đầu bếp và nguyên liệu.

Các trang được render ở phía máy chủ (Server-Side Rendering – SSR) bằng EJS. Dữ liệu chính được lưu trong cơ sở dữ liệu PostgreSQL, thay vì chỉ khai báo trực tiếp trên giao diện.

## 1. Công nghệ sử dụng

- **Node.js, Express.js:** xây dựng máy chủ và định tuyến.
- **EJS:** tạo giao diện HTML được render từ phía máy chủ.
- **Sequelize:** ánh xạ và thao tác với cơ sở dữ liệu thông qua mô hình (ORM).
- **PostgreSQL / Supabase:** lưu trữ dữ liệu món ăn, đầu bếp và nguyên liệu.
- **HTML, CSS, JavaScript:** xây dựng giao diện và các tương tác phía trình duyệt.
- **Web Audio API:** tạo hiệu ứng âm thanh trực tiếp trên trình duyệt.
- **Sharp:** hỗ trợ xử lý, tối ưu hình ảnh qua script của dự án.

## 2. Chức năng chính

### Giao diện khách hàng

- Khám phá con phố lấy ý tưởng từ Phố cổ Hội An (Việt Nam) và truy cập khu vực quán ăn.
- Xem danh sách món ăn lấy từ cơ sở dữ liệu.
- Tìm kiếm món theo tên.
- Mở trang chi tiết để xem thông tin món ăn.
- Xem các món trên giao diện bàn tròn và thao tác với món còn phục vụ.
- Thêm món vào hàng chờ đặt món tạm thời trên trình duyệt.

### Đăng ký, đăng nhập và phân quyền

Giao diện đăng nhập/đăng ký (`/login`, `/register`) gọi API thật của server bằng fetch JSON.

- **Đăng ký 3 bước**: (1) nhập email + tick "không phải người máy" (CAPTCHA) -> server xác minh CAPTCHA rồi mới gửi **OTP 6 số** qua email; (2) nhập OTP; (3) họ tên, vai trò, mật khẩu. Tài khoản được tạo sẵn là đã xác minh email, không cần bấm link.
- **OTP đăng ký**: CSPRNG, chỉ lưu hash trong bảng `register_otps`, hiệu lực 5 phút, sai 5 lần thì hủy, gửi lại sau 60 giây (mỗi lần gửi / gửi lại đều phải qua CAPTCHA). Nhập đúng OTP thì nhận "vé" dùng 1 lần (15 phút) cho bước 3.
- **Đăng nhập**: email + mật khẩu. Sai 5 lần khóa tài khoản 15 phút; thông báo lỗi không cho biết email có tồn tại hay không.
- **Quên mật khẩu**: link "Quên mật khẩu?" ở trang đăng nhập -> OTP 6 số qua email (10 phút, sai 5 lần thì hủy) + mật khẩu mới. Đổi xong mọi phiên cũ bị đăng xuất.
- **Email OTP** dùng mẫu Hội An (`src/utils/mailer.js`), ảnh nền `public/img/email/hoian-bg.jpg` được tải từ `APP_URL`. Dev chưa cấu hình email thì mã OTP in ra console của server.
- **Phiên**: cookie `sid` (httpOnly, SameSite=Lax, Secure khi production) chứa token ngẫu nhiên 256 bit; bảng `sessions` chỉ lưu **SHA-256** của token, hạn 7 ngày. Đổi token mỗi lần đăng nhập. **Đăng xuất** (`POST /logout`) xóa phiên trong DB và cookie.
- **Đăng xuất**: bấm vào chiếc thuyền ở góc sông (trang phố) -> hộp hỏi "Bạn có chắc muốn đăng xuất?" -> đồng ý thì `POST /logout`.
- **Vé hành khách**: bấm cô gái áo dài ở đầu phố để mở vé (tên + ảnh đại diện tròn). Ảnh được kéo/zoom và cắt vuông ngay trên trình duyệt, gửi `POST /avatar`; server resize 512px + thumbnail 240px lưu vào thư mục `avatars/` của bucket `dish-images` (cột `users.avatarUrl`, `users.avatarPath` tự được thêm khi khởi động).
- **Chọn vai**: sau khi đăng nhập, bấm vào nhà hàng ở trang phố để chọn **Khách hàng** hoặc **Đầu bếp** (`POST /chon-vai`). Khu `/admin/**` bắt buộc có phiên đăng nhập thật và đang ở vai Đầu bếp; chưa đăng nhập thì chuyển về `/login`.
- **Mật khẩu** lưu bằng **bcrypt (cost 12)**. Ràng buộc: 8-72 byte, có chữ thường + HOA + số, không khoảng trắng, không chứa tên email/họ tên.
- **reCAPTCHA** (tùy chọn): đặt `RECAPTCHA_SITE_KEY` + `RECAPTCHA_SECRET_KEY` để bước 1 (trước khi server gửi OTP) dùng Google reCAPTCHA v2 thật. Để trống thì giao diện dùng ô giả lập và server không kiểm tra.
- Chặn CSRF bằng kiểm tra `Origin/Referer` cùng nguồn cho mọi POST/PATCH/DELETE, kèm giới hạn số lần gọi theo IP.

> Lưu ý: mọi tài khoản đăng ký xong đều chọn được vai Đầu bếp (có quyền CRUD). Nếu muốn giới hạn, hãy thêm mã mời hoặc danh sách email được phép.

### Quản trị dữ liệu

Quản trị viên có thể thực hiện các thao tác CRUD (thêm, xem danh sách, chỉnh sửa và xóa) đối với:

- **Món ăn:** tên, mô tả, giá, danh mục, trạng thái phục vụ, đầu bếp và nguyên liệu liên quan.
- **Đầu bếp:** tên và chuyên môn.
- **Nguyên liệu:** tên và đơn vị tính.

Khu vực quản trị sử dụng biểu mẫu được render từ máy chủ, có kiểm tra dữ liệu đầu vào, thông báo lỗi và phân trang danh sách.

## 3. Cài đặt và chạy dự án

### Yêu cầu

- Node.js và npm.
- Một cơ sở dữ liệu PostgreSQL; dự án được cấu hình để kết nối với Supabase.
- Chuỗi kết nối cơ sở dữ liệu hợp lệ.

### Bước 1: Cài đặt thư viện

Mở terminal tại thư mục dự án và chạy:

```bash
npm install
```

### Bước 2: Cấu hình biến môi trường

Sao chép `.env.example` thành `.env`, sau đó cập nhật thông tin kết nối:

```env
DATABASE_URL=postgresql://YOUR_CONNECTION_STRING
PORT=3000
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
APP_URL=http://localhost:3000
SMTP_HOST=... hoặc RESEND_API_KEY=...   # gửi email OTP (xem .env.example)
```

Khi dev mà chưa cấu hình email, mã OTP được in ra console của server. Production bắt buộc đặt `NODE_ENV=production`, `APP_URL` và cấu hình gửi email.

Thay `DATABASE_URL` bằng chuỗi kết nối PostgreSQL thực tế trong phần **Project Settings → Database** của Supabase. Dự án khuyến nghị sử dụng **Session pooler, cổng 5432**.

Không đưa file `.env` hoặc khóa bí mật lên kho mã nguồn công khai.

### Bước 3: Khởi tạo dữ liệu mẫu (tùy chọn)

```bash
npm run db:seed
```

Lệnh này tạo lại cấu trúc bảng theo script seed và nạp dữ liệu mẫu. **Script seed có thể xóa dữ liệu hiện có**, vì vậy chỉ chạy khi phù hợp với môi trường dữ liệu của bạn.

### Bước 4: Khởi động máy chủ

Chạy chế độ thông thường:

```bash
npm start
```

Hoặc chạy chế độ phát triển tự khởi động lại khi mã nguồn thay đổi:

```bash
npm run dev
```

Mở trình duyệt tại: <http://localhost:3000>

Nếu đã đổi giá trị `PORT` trong `.env`, hãy truy cập cổng tương ứng.

## 4. Các trang và đường dẫn

| Chức năng           | Phương thức và đường dẫn                              | Mô tả                                                     |
| ------------------- | ----------------------------------------------------- | --------------------------------------------------------- |
| Trang chủ           | `GET /`                                               | Giao diện con phố Ba Cô Gái.                              |
| Giao diện khách     | `GET /khach`                                          | Bàn tròn hiển thị các món ăn từ cơ sở dữ liệu.            |
| Danh sách món       | `GET /dishes?q=`                                      | Hiển thị và tìm kiếm món ăn theo từ khóa.                 |
| Chi tiết món        | `GET /dishes/:id`                                     | Xem thông tin của một món; trả về 404 nếu không tìm thấy. |
| Đăng nhập / đăng ký | `GET /login`, `GET /register`                         | Trang đăng nhập + đăng ký (cùng một giao diện, 2 tab).    |
| Đăng nhập           | `POST /login`                                         | Email + mật khẩu, tạo phiên lưu trong DB (JSON).          |
| Đăng ký             | `POST /register/otp`, `/register/verify`, `/register` | 3 bước: CAPTCHA + gửi OTP, kiểm tra OTP, tạo tài khoản.           |
| Quên mật khẩu       | `POST /forgot-password`, `/reset-password`            | Gửi OTP qua email rồi đặt mật khẩu mới.                   |
| Chọn vai            | `POST /chon-vai`                                      | Chọn Khách hàng / Đầu bếp sau khi đăng nhập.              |
| Đăng xuất           | `POST /logout`                                        | Xóa phiên trong DB và cookie, về `/login`.                |
| Quản lý món ăn      | `/admin/dishes`                                       | Danh sách và các thao tác quản trị món ăn.                |
| Quản lý đầu bếp     | `/admin/chefs`                                        | Danh sách và các thao tác quản trị đầu bếp.               |
| Quản lý nguyên liệu | `/admin/ingredients`                                  | Danh sách và các thao tác quản trị nguyên liệu.           |

Trong mỗi khu vực quản trị, các thao tác gồm xem danh sách, mở biểu mẫu thêm mới, tạo bản ghi, mở biểu mẫu chỉnh sửa, cập nhật và xác nhận xóa. Danh sách hỗ trợ phân trang bằng tham số `?page=`.

## 5. Cấu trúc thư mục

```text
Block-5-main/
├── public/
│   ├── css/style.css          # Giao diện và hiệu ứng CSS
│   ├── img/                   # Hình ảnh giao diện
│   └── js/                    # JavaScript phía trình duyệt
├── scripts/
│   └── seed.js                # Tạo bảng và dữ liệu mẫu
├── src/
│   ├── admin/resources.js     # Cấu hình trường dữ liệu quản trị
│   ├── config/database.js     # Kết nối PostgreSQL
│   ├── middleware/auth.js     # Kiểm tra quyền truy cập
│   ├── models/                # Các mô hình và quan hệ dữ liệu
│   ├── routes/                # Định tuyến ứng dụng
│   ├── utils/                 # Hàm hỗ trợ dùng chung
│   ├── views/                 # Giao diện EJS
│   ├── app.js                 # Cấu hình Express
│   └── server.js              # Khởi tạo kết nối và máy chủ
├── .env.example               # Mẫu biến môi trường
├── package.json
└── README.md
```

## 6. Âm thanh và tương tác

Âm thanh được tạo bằng Web Audio API trong `public/js/am-thanh.js`, không cần tải sẵn các tệp MP3. Tùy trang, hiệu ứng có thể bao gồm tiếng chim, xe cộ, chén đĩa, dao thớt và âm thanh khi thao tác với giao diện.

- Nút loa ở góc dưới bên trái dùng để bật hoặc tắt âm thanh.
- Trạng thái bật/tắt được lưu trong `localStorage` của trình duyệt.
- Trình duyệt chỉ cho phép phát âm thanh sau khi người dùng tương tác lần đầu.

## 7. Một số giới hạn của phiên bản hiện tại

- Chưa có chức năng đổi mật khẩu khi đang đăng nhập và chưa phân biệt nhiều cấp quyền (mọi tài khoản đều chọn được vai Đầu bếp).
- Hàng chờ / thao tác đặt món ở giao diện khách chỉ lưu tạm trên trình duyệt; chưa có bảng đơn hàng trong cơ sở dữ liệu.
- Dữ liệu đầu bếp hiện chỉ gồm tên và chuyên môn.
- Dữ liệu nguyên liệu không có số lượng định mức theo từng món; giao diện hiển thị tên và đơn vị tính.
- Biểu tượng món ăn được chọn theo tên hoặc danh mục bằng logic trong mã nguồn, không phải ảnh riêng cho từng món.
- Các thao tác quản trị được xử lý bằng biểu mẫu và điều hướng phía máy chủ, không dùng fetch/AJAX cho CRUD.

## 8. Lệnh npm

| Lệnh              | Công dụng                                                |
| ----------------- | -------------------------------------------------------- |
| `npm install`     | Cài đặt các thư viện cần thiết.                          |
| `npm start`       | Khởi động máy chủ.                                       |
| `npm run dev`     | Chạy máy chủ với nodemon trong quá trình phát triển.     |
| `npm run db:seed` | Khởi tạo bảng và nạp dữ liệu mẫu; có thể xóa dữ liệu cũ. |
