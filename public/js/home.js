(() => {
  const pho = $("#pho");
  const goiY = $("#goi-y");
  const nhaHang = $(".nha-hang");
  let x = 0,
    v = 0,
    dn = false,
    sx = 0,
    x0 = 0,
    last = 0,
    moved = 0;
  const min = () => Math.min(0, innerWidth - pho.offsetWidth);
  // lớp xa trôi chậm; mặt đất (vỉa hè, đường) trôi cùng tốc độ với phố
  const LOP = [
    [".xa1", 0.12],
    [".via-he", 1],
    [".le-duong", 1],
    [".duong", 1],
  ].map(([s, k]) => [$(s), k]);

  // mũi tên "Nhà hàng hướng này": ẩn đi khi nhà hàng đã hiện trên màn hình
  const capNhatGoiY = () => {
    const r = nhaHang.getBoundingClientRect();
    const thay = r.left < innerWidth * 0.8 && r.right > innerWidth * 0.2;
    goiY.classList.toggle("an", thay);
    // nhà hàng đã trôi ra khỏi màn về phía bên trái (đang đứng bên phải nhà hàng) -> mũi tên chỉ sang trái
    goiY.classList.toggle("trai", !thay && r.right <= innerWidth * 0.2);
  };

  const set = (n) => {
    x = Math.max(min(), Math.min(0, n));
    pho.style.transform = `translateX(${x}px)`;
    LOP.forEach(([e, k]) => (e.style.backgroundPositionX = x * k + "px"));
    capNhatGoiY();
  };
  set(0);
  addEventListener("resize", () => set(x));
  addEventListener("load", () => set(x)); // ảnh tải xong -> độ rộng phố chính xác

  pho.addEventListener("pointerdown", (e) => {
    dn = true;
    moved = 0;
    sx = last = e.clientX;
    x0 = x;
    v = 0;
    pho.classList.add("keo");
  });
  addEventListener("pointermove", (e) => {
    if (!dn) return;
    moved = Math.max(moved, Math.abs(e.clientX - sx));
    v = e.clientX - last;
    last = e.clientX;
    set(x0 + e.clientX - sx);
  });
  addEventListener("pointerup", () => {
    if (!dn) return;
    dn = false;
    pho.classList.remove("keo");
    (function quanTinh() {
      if (dn || Math.abs(v) < 0.4) return;
      set(x + v);
      v *= 0.94;
      requestAnimationFrame(quanTinh);
    })();
  });
  addEventListener("wheel", (e) => set(x - (e.deltaX || e.deltaY)), {
    passive: true,
  });
  // bàn phím: mũi tên trái/phải để dạo phố
  addEventListener("keydown", (e) => {
    if (!hopVai.hidden) return;
    if (e.key === "ArrowRight") set(x - 120);
    if (e.key === "ArrowLeft") set(x + 120);
    moved = 0; // để Enter/Space trên nhà hàng luôn mở được hộp chọn vai
  });

  // bấm (không kéo) vào nhà hàng -> hộp chọn vai
  // Hộp chọn vai là <form method="post" action="/login"> thật (server đặt cookie role rồi redirect 303);
  // JS chỉ chen hiệu ứng chuyển cảnh trước khi gửi form.
  const hopVai = $("#hop-vai"),
    form = $("#form-vai"),
    vao = $("#vao");
  pho.addEventListener("click", (e) => {
    if (moved < 6 && e.target.closest(".nha-hang")) {
      hopVai.hidden = false;
      Am.phat("mo");
    }
  });
  // bảng treo ở đầu phố: Đăng nhập -> cùng hộp chọn vai như bấm vào nhà hàng
  const dangNhap = $("#dang-nhap"),
    dangXuat = $("#dang-xuat");
  if (dangNhap)
    dangNhap.addEventListener("click", () => {
      if (moved >= 6) return;
      hopVai.hidden = false;
      Am.phat("mo");
    });
  // trang phố luôn là trạng thái đã ra khỏi quán (server xóa role khi vào "/"); có role thì bảng là form POST /logout thật
  if (dangXuat)
    dangXuat.addEventListener("click", () => {
      if (moved < 6) bao("Bạn chưa đăng nhập");
    });
  form.addEventListener("change", () => (vao.disabled = false));
  $("#de-sau").onclick = () => (hopVai.hidden = true);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    hopVai.hidden = true;
    // chạy hiệu ứng chuyển cảnh rồi gửi form POST /login thật (server đặt cookie + redirect 303)
    chuyenCanh(() => form.submit());
  });
})();
