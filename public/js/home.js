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
    if (document.querySelector(".lop:not([hidden])")) return; // đang mở hộp thoại / vé: không dạo phố
    if (e.key === "ArrowRight") set(x - 120);
    if (e.key === "ArrowLeft") set(x + 120);
    moved = 0; // để Enter/Space trên nhà hàng luôn mở được hộp chọn vai
  });

  // bấm (không kéo) vào nhà hàng -> hộp chọn vai
  // Hộp chọn vai là <form method="post" action="/chon-vai"> thật (server đặt cookie role rồi redirect 303);
  // JS chỉ chen hiệu ứng chuyển cảnh trước khi gửi form.
  const hopVai = $("#hop-vai"),
    form = $("#form-vai"),
    vao = $("#vao");
  // Chưa đăng nhập (trang chủ không có cô gái + bảng) -> bấm nhà hàng chuyển ra trang đăng nhập bằng nước tràn.
  const daDangNhap = $(".canh").dataset.dn === "1";
  pho.addEventListener("click", (e) => {
    if (moved < 6 && e.target.closest(".nha-hang")) {
      if (!daDangNhap) return nuocTran(() => (location.href = "/login"));
      hopVai.hidden = false;
      Am.phat("mo");
    }
  });
  // ---------- thuyền = đăng xuất ----------
  // Bấm thuyền: tiếng nước + thuyền lắc, rồi hỏi lại cho chắc. Đồng ý -> gửi form POST /logout thật
  // (common.js thêm nước tràn rồi mới submit; server xóa phiên + cookie, về trang đăng nhập).
  const thuyen = $("#thuyen"),
    nutThuyen = $("#nut-thuyen");
  if (nutThuyen)
    nutThuyen.addEventListener("click", () => {
      Am.phat("nuoc");
      thuyen.classList.remove("lac");
      void thuyen.offsetWidth;
      thuyen.classList.add("lac");
      setTimeout(() => thuyen.classList.remove("lac"), 950);
      const h = hop(`<h2>Bạn có chắc muốn đăng xuất?</h2>
        <p>Bạn sẽ rời quán và cần đăng nhập lại để vào lần sau.</p>
        <div class="nut-hang nut-giua"><button type="button" class="nut nut-phu" data-a="o-lai">Ở lại</button><button type="button" class="nut" data-a="dx">Đăng xuất</button></div>`);
      h.el.querySelector('[data-a="o-lai"]').focus();
      h.el.addEventListener("click", (e) => {
        const a = e.target.dataset.a;
        if (a === "o-lai") h.dong();
        if (a === "dx") {
          h.dong();
          Am.phat("nuoc");
          const f = $("#form-dang-xuat");
          f.requestSubmit
            ? f.requestSubmit()
            : f.dispatchEvent(
                new Event("submit", { bubbles: true, cancelable: true }),
              );
        }
      });
    });

  // ---------- cô gái = vé hành khách (hồ sơ + ảnh đại diện) ----------
  const coGai = $("#co-gai");
  if (coGai) {
    const khach = {
      ten: coGai.dataset.ten || "",
      avt: coGai.dataset.avt || "",
    };
    coGai.addEventListener("click", () => {
      if (moved < 6) moVe(khach);
    });
  }
  form.addEventListener("change", () => (vao.disabled = false));
  $("#de-sau").onclick = () => (hopVai.hidden = true);
  // Vai của TÀI KHOẢN (chọn lúc đăng ký): "customer" chỉ được vào với vai khách, "chef" vào được cả 2 vai.
  const vaiTaiKhoan = $(".canh").dataset.tk;
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (vaiTaiKhoan === "customer" && form.role.value === "admin") {
      const h = hop(`<h2>Vai trò không hợp lệ</h2>
        <p>Tài khoản của bạn đăng ký là <b>khách hàng</b> nên không thể vào quán với vai đầu bếp. Bạn hãy chọn vai khách hàng nhé.</p>
        <div class="nut-hang nut-giua"><button type="button" class="nut" data-a="ok">Đã hiểu</button></div>`);
      const nut = h.el.querySelector('[data-a="ok"]');
      nut.focus();
      nut.addEventListener("click", () => {
        h.dong();
        form.querySelector('input[value="user"]').checked = true;
      });
      return;
    }
    hopVai.hidden = true;
    // chạy hiệu ứng chuyển cảnh rồi gửi form POST /chon-vai thật (server đặt cookie + redirect 303)
    chuyenCanh(() => form.submit());
  });

  // =====================================================================
  // VÉ HÀNH KHÁCH
  //   - xem: avatar tròn + tên. Bấm avatar (hoặc "Đổi ảnh") để chọn ảnh từ máy.
  //   - chỉnh: kéo ảnh để dời, thanh trượt / nút +/- / lăn chuột / chụm 2 ngón để zoom.
  //   - lưu: cắt đúng vùng đang thấy ra ảnh vuông 512px NGAY TRÊN TRÌNH DUYỆT, gửi POST /avatar;
  //     server resize lại + tạo thumbnail 240px (giống ảnh món ăn) rồi lưu lên Supabase Storage.
  // =====================================================================
  function moVe(khach) {
    Am.phat("cuoi");
    const chu = (khach.ten.trim()[0] || "?").toUpperCase();
    const h = hop(`
      <div class="ve-giay">
        <div class="ve-tren"><span>Vé hành khách</span><span>Phố cổ Hội An</span></div>
        <div class="ve-than">
          <div class="ve-trai">
            <button type="button" class="ve-avt" id="ve-avt" aria-label="Đổi ảnh đại diện"></button>
            <button type="button" class="nut nut-phu ve-doi" data-a="chon">Đổi ảnh</button>
          </div>
          <div class="ve-phai">
            <small>HÀNH KHÁCH</small>
            <b class="ve-ten">${esc(khach.ten)}</b>
            <span class="ve-tuyen">Hội An <span aria-hidden="true">→</span> Cái Quán Ăn</span>
            <div class="ve-vach" aria-hidden="true"></div>
            <span class="ve-ghichu">Ảnh JPG, PNG hoặc WEBP · tối đa 3MB</span>
          </div>
        </div>
        <div class="ve-sua">
          <div class="ve-khung" id="ve-khung" aria-label="Kéo để dời ảnh"><img alt="" draggable="false"></div>
          <div class="ve-dk">
            <h3>Chỉnh ảnh đại diện</h3>
            <div class="ve-zoom">
              <button type="button" data-a="ra" aria-label="Thu nhỏ">−</button>
              <input type="range" id="ve-zoom" min="0" max="100" step="0.5" value="0" aria-label="Thu phóng">
              <button type="button" data-a="vao" aria-label="Phóng to">+</button>
            </div>
            <p>Kéo ảnh để chọn vị trí, kéo thanh trượt hoặc lăn chuột để phóng to / thu nhỏ.</p>
          </div>
        </div>
        <div class="ve-chan ve-chan-thuong"><div class="nut-hang"><button type="button" class="nut nut-phu" data-a="dong">Đóng</button></div></div>
        <div class="ve-chan ve-chan-sua" hidden><div class="nut-hang"><button type="button" class="nut nut-phu" data-a="huy">Hủy</button><button type="button" class="nut" data-a="luu">Lưu ảnh</button></div></div>
        <input type="file" id="ve-file" accept="image/jpeg,image/png,image/webp" hidden>
      </div>`);
    const ve = h.el;
    ve.classList.add("ve");
    ve.parentNode.classList.add("lop-ve");
    const avt = $("#ve-avt", ve),
      file = $("#ve-file", ve),
      khung = $("#ve-khung", ve),
      anh = $("img", khung),
      zoom = $("#ve-zoom", ve),
      chanSua = $(".ve-chan-sua", ve),
      chanThuong = $(".ve-chan-thuong", ve),
      nutLuu = $('[data-a="luu"]', ve);

    const veAvt = () => {
      avt.innerHTML = khach.avt
        ? `<img src="${esc(khach.avt)}" alt="Ảnh đại diện" decoding="async"><span class="ve-may">Đổi ảnh</span>`
        : `${esc(chu)}<span class="ve-may">Tải ảnh lên</span>`;
    };
    veAvt();

    // ---- trạng thái chỉnh ảnh ----
    const F = 232; // cạnh khung (px), khớp .ve-khung (JS đo lại thực tế bên dưới)
    let W = 0,
      H = 0, // kích thước gốc của ảnh
      s = 1,
      sMin = 1,
      sMax = 1, // tỉ lệ phóng hiện tại / nhỏ nhất (vừa khít) / lớn nhất
      cx = 0,
      cy = 0, // tâm ảnh trong khung
      kich = F,
      url = null,
      dangLuu = false;

    const kep = () => {
      const w = W * s,
        hh = H * s;
      // ảnh lớn hơn khung: không cho hở mép; nhỏ hơn khung: giữ trong khung
      cx =
        w >= kich
          ? Math.min(w / 2, Math.max(kich - w / 2, cx))
          : Math.min(kich - w / 2, Math.max(w / 2, cx));
      cy =
        hh >= kich
          ? Math.min(hh / 2, Math.max(kich - hh / 2, cy))
          : Math.min(kich - hh / 2, Math.max(hh / 2, cy));
    };
    const ve_ = () => {
      kep();
      anh.style.transform = `translate(${cx - (W * s) / 2}px, ${cy - (H * s) / 2}px) scale(${s})`;
      zoom.value = (Math.log(s / sMin) / Math.log(sMax / sMin)) * 100;
    };
    // đặt zoom, giữ nguyên điểm (px, py) trong khung đứng yên (zoom vào đúng chỗ con trỏ / giữa khung)
    const datZoom = (sMoi, px = kich / 2, py = kich / 2) => {
      sMoi = Math.min(sMax, Math.max(sMin, sMoi));
      const k = sMoi / s;
      cx = px - (px - cx) * k;
      cy = py - (py - cy) * k;
      s = sMoi;
      ve_();
    };
    const tuThanh = () => sMin * Math.pow(sMax / sMin, zoom.value / 100);

    function vaoCheDoSua(f) {
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(f);
      const im = new Image();
      im.onload = () => {
        W = im.naturalWidth;
        H = im.naturalHeight;
        anh.src = url;
        anh.width = W;
        anh.height = H;
        ve.classList.add("sua");
        chanSua.hidden = false;
        chanThuong.hidden = true;
        kich = khung.clientWidth || F;
        const phu = Math.max(kich / W, kich / H); // vừa phủ kín khung
        sMin = Math.min(kich / W, kich / H); // vừa khít cả ảnh (zoom ra tối đa)
        sMax = Math.max(phu * 4, sMin * 4); // zoom vào tối đa 4 lần
        s = phu;
        cx = kich / 2;
        cy = kich / 2;
        ve_();
      };
      im.onerror = () => bao("Không đọc được ảnh này, hãy thử ảnh khác");
      im.src = url;
    }
    function thoatCheDoSua() {
      ve.classList.remove("sua");
      chanSua.hidden = true;
      chanThuong.hidden = false;
      if (url) URL.revokeObjectURL(url);
      url = null;
      anh.removeAttribute("src");
      file.value = "";
    }

    file.addEventListener("change", () => {
      const f = file.files[0];
      if (!f) return;
      if (!["image/jpeg", "image/png", "image/webp"].includes(f.type)) {
        file.value = "";
        return bao("Chỉ nhận ảnh JPG, PNG hoặc WEBP");
      }
      if (f.size > 25 * 1024 * 1024) {
        file.value = "";
        return bao("Ảnh quá lớn, hãy chọn ảnh dưới 25MB");
      }
      vaoCheDoSua(f);
    });

    // ---- kéo ảnh (chuột / cảm ứng) + chụm 2 ngón ----
    const cham = new Map(); // pointerId -> {x, y}
    let khoang0 = 0,
      s0 = 1;
    const toaDo = (e) => {
      const r = khung.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };
    khung.addEventListener("pointerdown", (e) => {
      if (dangLuu) return;
      khung.setPointerCapture(e.pointerId);
      cham.set(e.pointerId, { x: e.clientX, y: e.clientY });
      khung.classList.add("keo");
      if (cham.size === 2) {
        const [a, b] = [...cham.values()];
        khoang0 = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        s0 = s;
      }
    });
    khung.addEventListener("pointermove", (e) => {
      const c = cham.get(e.pointerId);
      if (!c) return;
      if (cham.size === 1) {
        cx += e.clientX - c.x;
        cy += e.clientY - c.y;
        c.x = e.clientX;
        c.y = e.clientY;
        ve_();
      } else if (cham.size === 2) {
        c.x = e.clientX;
        c.y = e.clientY;
        const [a, b] = [...cham.values()];
        const r = khung.getBoundingClientRect();
        datZoom(
          (s0 * Math.hypot(a.x - b.x, a.y - b.y)) / khoang0,
          (a.x + b.x) / 2 - r.left,
          (a.y + b.y) / 2 - r.top,
        );
      }
    });
    const nha = (e) => {
      cham.delete(e.pointerId);
      if (!cham.size) khung.classList.remove("keo"); // còn 1 ngón thì tiếp tục kéo từ vị trí đã lưu
    };
    khung.addEventListener("pointerup", nha);
    khung.addEventListener("pointercancel", nha);
    // lăn chuột để zoom (chặn lăn cả phố phía sau)
    khung.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
        const [px, py] = toaDo(e);
        datZoom(s * Math.exp(-e.deltaY * 0.0015), px, py);
      },
      { passive: false },
    );
    zoom.addEventListener("input", () => datZoom(tuThanh()));

    // ---- cắt ảnh + gửi lên server ----
    async function luuAnh() {
      if (dangLuu) return;
      dangLuu = true;
      nutLuu.disabled = true;
      nutLuu.textContent = "Đang lưu…";
      try {
        const OUT = 512,
          k = OUT / kich,
          cv = document.createElement("canvas");
        cv.width = cv.height = OUT;
        const g = cv.getContext("2d");
        g.fillStyle = "#f6e8c8"; // phần hở (khi zoom ra hết cỡ)
        g.fillRect(0, 0, OUT, OUT);
        g.imageSmoothingQuality = "high";
        g.drawImage(
          anh,
          (cx - (W * s) / 2) * k,
          (cy - (H * s) / 2) * k,
          W * s * k,
          H * s * k,
        );
        const blob = await new Promise((ok) =>
          cv.toBlob(ok, "image/webp", 0.9),
        );
        if (!blob) throw new Error("Không xử lý được ảnh");
        const fd = new FormData();
        fd.append("image", blob, "avatar.webp");
        const r = await fetch("/avatar", {
          method: "POST",
          headers: {
            "X-CSRF-Token":
              document.querySelector('meta[name="csrf-token"]')?.content || "",
          },
          body: fd,
          credentials: "same-origin",
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.ok)
          throw new Error(d.error || "Không lưu được ảnh, vui lòng thử lại.");
        khach.avt = d.thumb;
        if (coGai) coGai.dataset.avt = d.thumb;
        veAvt();
        thoatCheDoSua();
        bao("Đã cập nhật ảnh đại diện");
      } catch (err) {
        bao(err.message || "Không lưu được ảnh, vui lòng thử lại.");
      } finally {
        dangLuu = false;
        nutLuu.disabled = false;
        nutLuu.textContent = "Lưu ảnh";
      }
    }

    avt.addEventListener("click", () => file.click());
    ve.addEventListener("click", (e) => {
      const a = e.target.closest("[data-a]")?.dataset.a;
      if (a === "chon") file.click();
      else if (a === "dong") h.dong();
      else if (a === "huy") thoatCheDoSua();
      else if (a === "luu") luuAnh();
      else if (a === "vao") datZoom(s * 1.25);
      else if (a === "ra") datZoom(s / 1.25);
    });
  }
})();
