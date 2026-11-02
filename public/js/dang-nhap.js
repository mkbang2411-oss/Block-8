// Trang /login + /register: chuyển tab, đăng ký 3 bước, đăng nhập + hiệu ứng nước tràn.
// CHỈ LÀ GIAO DIỆN: các hàm trong khối "GIẢ LẬP BACKEND" bên dưới đang trả về thành công sau ~0.4s.
// Khi nối backend chỉ cần thay thân 4 hàm đó bằng fetch() (resolve = thành công, reject(new Error("thông báo")) = lỗi).
(() => {
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const goc = $(".dn");
  const tabs = $$(".dn-tab-nut");
  const paneDn = $("#p-dn"),
    paneDk = $("#p-dk");

  // ================= GIẢ LẬP BACKEND =================
  const gia = (ms = 400) => new Promise((r) => setTimeout(r, ms));
  const guiDangNhap = async ({ email, matKhau }) => {
    await gia(350); // TODO(backend): POST đăng nhập; thành công thì server đặt cookie phiên
    // Tạm thời: cookie "dn" cho server biết đã đăng nhập (trang chủ hiện cô gái + 2 bảng). Backend thật nên thay bằng cookie phiên httpOnly.
    document.cookie = "dn=1; path=/; max-age=2592000; samesite=lax";
  };
  const guiMaOtp = async (email) => gia(); // TODO(backend): gửi mã OTP tới email
  const xacThucOtp = async (email, ma) => gia(); // TODO(backend): kiểm tra OTP
  const dangKy = async (thongTin) => gia(500); // TODO(backend): tạo tài khoản (kèm token reCAPTCHA)

  // ================= TIỆN ÍCH =================
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const loiO = (input, msg) => {
    const o = input.closest(".dn-truong") || input.parentElement;
    const t = o.querySelector(".dn-loi");
    input.classList.toggle("loi", !!msg);
    input.setAttribute("aria-invalid", msg ? "true" : "false");
    if (t) t.textContent = msg || "";
    return !msg;
  };
  const xoaLoiKhiGo = (f) =>
    $$("input", f).forEach((i) => i.addEventListener("input", () => i.classList.contains("loi") && loiO(i, "")));
  const cho = (nut, bat) => {
    nut.classList.toggle("cho", bat);
    nut.disabled = bat;
  };
  const kiemEmail = (i) => {
    const v = i.value.trim();
    if (!v) return loiO(i, "Vui lòng nhập email.");
    if (!EMAIL.test(v)) return loiO(i, "Email chưa đúng định dạng (vd: ten@email.com).");
    return loiO(i, "");
  };

  // ================= HIỆU ỨNG NƯỚC TRÀN (common.js: nuocTran) =================
  addEventListener("pageshow", (e) => {
    if (e.persisted) {
      $$(".nuoc-tran").forEach((x) => x.remove());
      $$(".dn-nut").forEach((n) => cho(n, false));
    }
  });

  // ================= TAB ĐĂNG NHẬP / ĐĂNG KÝ =================
  function chonTab(ten, { focus = true } = {}) {
    goc.dataset.tab = ten;
    tabs.forEach((t) => {
      const on = t.dataset.tab === ten;
      t.classList.toggle("on", on);
      t.setAttribute("aria-selected", on);
      t.tabIndex = on ? 0 : -1;
    });
    paneDn.hidden = ten !== "login";
    paneDk.hidden = ten !== "register";
    document.title = ten === "login" ? "Đăng nhập" : "Đăng ký";
    try {
      history.replaceState(null, "", ten === "login" ? "/login" : "/register");
    } catch (e) {}
    if (focus) {
      const f = ten === "login" ? $("#f-dn input") : $(".dn-b:not([hidden]) input");
      f && f.focus({ preventScroll: true });
    }
  }
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => chonTab(t.dataset.tab));
    t.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const n = tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
      chonTab(n.dataset.tab);
      n.focus();
    });
  });
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a[data-chuyen]");
    if (!a) return;
    e.preventDefault();
    chonTab(a.dataset.chuyen);
  });

  // ================= ĐĂNG NHẬP =================
  const fDn = $("#f-dn");
  xoaLoiKhiGo(fDn);
  $(".dn-mat").addEventListener("click", (e) => {
    const nut = e.currentTarget,
      i = nut.parentElement.querySelector("input");
    const hien = i.type === "password";
    i.type = hien ? "text" : "password";
    nut.setAttribute("aria-pressed", hien);
    nut.setAttribute("aria-label", hien ? "Ẩn mật khẩu" : "Hiện mật khẩu");
  });
  $("#quen-mk").addEventListener("click", (e) => {
    e.preventDefault();
    bao("Tính năng quên mật khẩu đang được phát triển");
  });
  fDn.addEventListener("submit", async (e) => {
    e.preventDefault();
    const em = fDn.email,
      mk = fDn.password;
    const ok1 = kiemEmail(em);
    const ok2 = loiO(mk, mk.value ? "" : "Vui lòng nhập mật khẩu.");
    if (!ok1 || !ok2) return (ok1 ? mk : em).focus();
    const nut = $(".dn-nut", fDn);
    cho(nut, true);
    try {
      await guiDangNhap({ email: em.value.trim(), matKhau: mk.value });
      nuocTran(() => (location.href = "/")); // nước tràn lên rồi vào trang chủ
    } catch (err) {
      cho(nut, false);
      loiO(mk, err.message || "Email hoặc mật khẩu chưa đúng.");
    }
  });

  // ================= ĐĂNG KÝ 3 BƯỚC =================
  const tieuDe = $("#dk-tieude"),
    phu = $("#dk-phu");
  const TD = {
    1: ["Xác thực email", "Nhập email bạn muốn dùng để đăng nhập hệ thống."],
    2: ["Nhập mã xác thực", null],
    3: ["Thông tin cá nhân", "Gần xong rồi! Điền vài thông tin để hoàn tất."],
  };
  let emailDk = "";
  function datBuoc(n) {
    $$(".dn-b").forEach((b) => (b.hidden = +b.dataset.b !== n));
    $$(".dn-buoc li").forEach((li) => {
      const k = +li.dataset.b;
      li.classList.toggle("on", k === n);
      li.classList.toggle("xong", k < n);
      li.firstElementChild.textContent = k < n ? "✓" : k;
      k === n ? li.setAttribute("aria-current", "step") : li.removeAttribute("aria-current");
    });
    tieuDe.textContent = TD[n][0];
    if (n === 2) {
      const b = document.createElement("b");
      b.textContent = emailDk;
      phu.replaceChildren("Mã gồm 6 số đã gửi tới ", b, ".");
    } else phu.textContent = TD[n][1];
    const f = $(`.dn-b[data-b="${n}"] input`);
    f && setTimeout(() => f.focus({ preventScroll: true }), 60);
  }

  // --- Bước 1: email ---
  const f1 = $("#f-b1");
  xoaLoiKhiGo(f1);
  f1.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!kiemEmail(f1.email)) return f1.email.focus();
    const nut = $(".dn-nut", f1);
    cho(nut, true);
    try {
      emailDk = f1.email.value.trim();
      await guiMaOtp(emailDk);
      cho(nut, false);
      $$(".dn-otp input").forEach((i) => (i.value = ""));
      datBuoc(2);
      demNguoc(60);
    } catch (err) {
      cho(nut, false);
      loiO(f1.email, err.message || "Không gửi được mã, vui lòng thử lại.");
    }
  });

  // --- Bước 2: OTP ---
  const f2 = $("#f-b2"),
    otp = $$(".dn-otp input"),
    loiOtp = $("#loi-otp"),
    guiLai = $("#gui-lai");
  otp.forEach((inp, i) => {
    inp.addEventListener("input", () => {
      inp.value = inp.value.replace(/\D/g, "").slice(-1);
      inp.classList.remove("loi");
      loiOtp.textContent = "";
      if (inp.value && otp[i + 1]) otp[i + 1].focus();
    });
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Backspace" && !inp.value && otp[i - 1]) {
        otp[i - 1].value = "";
        otp[i - 1].focus();
        e.preventDefault();
      } else if (e.key === "ArrowLeft" && otp[i - 1]) otp[i - 1].focus();
      else if (e.key === "ArrowRight" && otp[i + 1]) otp[i + 1].focus();
    });
    inp.addEventListener("focus", () => inp.select());
    inp.addEventListener("paste", (e) => {
      const t = ((e.clipboardData && e.clipboardData.getData("text")) || "").replace(/\D/g, "").slice(0, 6);
      if (!t) return;
      e.preventDefault();
      [...t].forEach((c, k) => (otp[k].value = c));
      otp[Math.min(t.length, 5)].focus();
    });
  });
  let dem = 0,
    tDem;
  function demNguoc(s) {
    clearInterval(tDem);
    dem = s;
    hienDem();
    tDem = setInterval(() => {
      dem--;
      hienDem();
      if (dem <= 0) clearInterval(tDem);
    }, 1000);
  }
  function hienDem() {
    guiLai.disabled = dem > 0;
    guiLai.textContent = dem > 0 ? `Gửi lại mã sau ${dem}s` : "Gửi lại mã";
  }
  guiLai.addEventListener("click", async () => {
    guiLai.disabled = true;
    try {
      await guiMaOtp(emailDk);
      bao("Đã gửi lại mã xác thực");
    } catch (err) {
      bao(err.message || "Không gửi được mã");
    }
    demNguoc(60);
  });
  $("#doi-email").addEventListener("click", () => {
    clearInterval(tDem);
    datBuoc(1);
  });
  f2.addEventListener("submit", async (e) => {
    e.preventDefault();
    const ma = otp.map((i) => i.value).join("");
    if (ma.length < 6) {
      otp.forEach((i) => i.classList.toggle("loi", !i.value));
      loiOtp.textContent = "Vui lòng nhập đủ 6 số.";
      return (otp.find((i) => !i.value) || otp[5]).focus();
    }
    const nut = $(".dn-nut", f2);
    cho(nut, true);
    try {
      await xacThucOtp(emailDk, ma);
      cho(nut, false);
      clearInterval(tDem);
      datBuoc(3);
    } catch (err) {
      cho(nut, false);
      otp.forEach((i) => i.classList.add("loi"));
      loiOtp.textContent = err.message || "Mã chưa đúng hoặc đã hết hạn.";
    }
  });

  // --- Bước 3: thông tin + "không phải người máy" ---
  const f3 = $("#f-b3"),
    cap = $("#cap"),
    loiCap = $("#loi-cap");
  xoaLoiKhiGo(f3);
  let capOk = false;
  function bamCap() {
    if (capOk || cap.classList.contains("cho")) return;
    cap.classList.add("cho");
    loiCap.textContent = "";
    setTimeout(() => {
      // TODO(backend): thay bằng reCAPTCHA thật, lấy token gửi kèm khi đăng ký
      cap.classList.remove("cho");
      cap.classList.add("ok");
      cap.setAttribute("aria-checked", "true");
      capOk = true;
    }, 700);
  }
  cap.addEventListener("click", bamCap);
  cap.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      bamCap();
    }
  });
  f3.addEventListener("submit", async (e) => {
    e.preventDefault();
    const ten = f3.hoTen,
      mk = f3.matKhau,
      mk2 = f3.matKhau2;
    const kq = [
      loiO(ten, ten.value.trim().length < 2 ? "Vui lòng nhập họ và tên." : ""),
      loiO(mk, mk.value.length < 8 ? "Mật khẩu ít nhất 8 ký tự." : ""),
      loiO(mk2, mk2.value !== mk.value ? "Mật khẩu nhập lại chưa khớp." : mk2.value ? "" : "Vui lòng nhập lại mật khẩu."),
    ];
    if (!capOk) loiCap.textContent = "Vui lòng xác nhận bạn không phải người máy.";
    if (kq.includes(false)) return [ten, mk, mk2][kq.indexOf(false)].focus();
    if (!capOk) return cap.focus();
    const nut = $(".dn-nut", f3);
    cho(nut, true);
    try {
      await dangKy({ email: emailDk, hoTen: ten.value.trim(), matKhau: mk.value });
      cho(nut, false);
      $("#dk-dau").hidden = true;
      $$(".dn-b").forEach((b) => (b.hidden = true));
      $("#dk-chan").hidden = true;
      $("#dk-xong").hidden = false;
      $("#dk-dn").focus({ preventScroll: true });
    } catch (err) {
      cho(nut, false);
      loiCap.textContent = err.message || "Không đăng ký được, vui lòng thử lại.";
    }
  });
  $("#dk-dn").addEventListener("click", () => {
    // về tab đăng nhập, điền sẵn email vừa đăng ký, đặt lại form đăng ký
    fDn.email.value = emailDk;
    [f1, f2, f3].forEach((f) => f.reset());
    capOk = false;
    cap.classList.remove("ok", "cho");
    cap.setAttribute("aria-checked", "false");
    $("#dk-xong").hidden = true;
    $("#dk-dau").hidden = false;
    $("#dk-chan").hidden = false;
    datBuoc(1);
    chonTab("login", { focus: false });
    fDn.password.focus({ preventScroll: true });
  });

  // vào thẳng /register thì focus ô email
  if (goc.dataset.tab === "register") f1.email.focus({ preventScroll: true });
  else fDn.email.focus({ preventScroll: true });
})();
