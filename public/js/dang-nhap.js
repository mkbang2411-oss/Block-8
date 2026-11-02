// Trang /login + /register: chuyển tab, đăng nhập, đăng ký 3 bước (email + CAPTCHA -> OTP -> thông tin), quên mật khẩu (3 bước) + hiệu ứng nước tràn.
// Gọi API thật của server (src/routes/auth.js) bằng fetch JSON; lỗi server trả {ok:false, error, field?}.
(() => {
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const goc = $(".dn");
  const tabs = $$(".dn-tab-nut");
  const paneDn = $("#p-dn"),
    paneDk = $("#p-dk"),
    paneQm = $("#p-qm");

  // ================= GỌI SERVER =================
  const goi = async (url, body) => {
    let r;
    try {
      r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        credentials: "same-origin",
        body: JSON.stringify(body),
      });
    } catch (e) {
      throw new Error("Không kết nối được máy chủ, vui lòng thử lại.");
    }
    let d = {};
    try {
      d = await r.json();
    } catch (e) {}
    if (!r.ok || !d.ok) {
      const err = new Error(d.error || "Có lỗi xảy ra, vui lòng thử lại.");
      err.field = d.field;
      err.status = r.status;
      throw err;
    }
    return d;
  };
  const guiDangNhap = ({ email, matKhau }) =>
    goi("/login", { email, password: matKhau, next: goc.dataset.next || "" });
  const guiMaOtp = (email, recaptcha) =>
    goi("/register/otp", { email, recaptcha });
  const xacThucOtp = (email, ma) => goi("/register/verify", { email, otp: ma });
  const dangKy = (thongTin) => goi("/register", thongTin);
  const guiMaQuenMk = (email) => goi("/forgot-password", { email });
  const xacThucQuenMk = (email, ma) =>
    goi("/forgot-password/verify", { email, otp: ma });
  const datLaiMk = (thongTin) => goi("/reset-password", thongTin);

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
    $$("input", f).forEach((i) =>
      i.addEventListener(
        "input",
        () => i.classList.contains("loi") && loiO(i, ""),
      ),
    );
  const cho = (nut, bat) => {
    nut.classList.toggle("cho", bat);
    nut.disabled = bat;
  };
  const kiemEmail = (i) => {
    const v = i.value.trim();
    if (!v) return loiO(i, "Vui lòng nhập email.");
    if (!EMAIL.test(v))
      return loiO(i, "Email chưa đúng định dạng (vd: ten@email.com).");
    return loiO(i, "");
  };

  // cùng luật với server (utils/validators.js): 8-72 byte, có chữ thường + HOA + số, không khoảng trắng
  const kiemMatKhau = (v) => {
    if (v.length < 8) return "Mật khẩu ít nhất 8 ký tự.";
    if (new TextEncoder().encode(v).length > 72)
      return "Mật khẩu tối đa 72 byte.";
    if (/\s/.test(v)) return "Mật khẩu không được chứa khoảng trắng.";
    if (!/[a-z]/.test(v) || !/[A-Z]/.test(v) || !/\d/.test(v))
      return "Mật khẩu phải có chữ thường, chữ HOA và chữ số.";
    return "";
  };

  // ---- danh sách điều kiện hiện từng dòng dưới ô nhập (○ chưa nhập | ✗ chưa đạt | ✓ đạt), cập nhật khi gõ ----
  // Mật khẩu: cùng luật với server. Nhập lại mật khẩu: chỉ cần trùng khớp với mật khẩu.
  const LUAT_MK = [
    ["Ít nhất 8 ký tự", (v) => v.length >= 8],
    ["Tối đa 72 ký tự", (v) => new TextEncoder().encode(v).length <= 72],
    ["Có chữ thường (a-z)", (v) => /[a-z]/.test(v)],
    ["Có chữ HOA (A-Z)", (v) => /[A-Z]/.test(v)],
    ["Có chữ số (0-9)", (v) => /\d/.test(v)],
    ["Không có khoảng trắng", (v) => !/\s/.test(v)],
  ];
  // gan(): vẽ danh sách vào <ul>, trả về hàm cap(force). force = true: ô trống cũng tô đỏ các điều kiện chưa đạt (khi bấm gửi)
  function gan(input, ul, luat) {
    ul.replaceChildren(
      ...luat.map(([chu]) => {
        const li = document.createElement("li"),
          i = document.createElement("i");
        i.setAttribute("aria-hidden", "true");
        li.append(i, chu);
        return li;
      }),
    );
    const cap = (force) => {
      const v = input.value;
      luat.forEach(([, ok], k) => {
        const st = !v && !force ? "" : ok(v) ? "ok" : "bad";
        ul.children[k].className = st;
        ul.children[k].firstChild.textContent =
          st === "ok" ? "✓" : st === "bad" ? "✗" : "○";
      });
    };
    input.addEventListener("input", () => cap());
    if (input.form)
      input.form.addEventListener("reset", () => setTimeout(() => cap())); // form.reset() không bắn sự kiện input
    cap();
    return cap;
  }
  // gắn cả cặp mật khẩu + nhập lại; trả về hàm kiểm tra (đánh dấu ô lỗi, trả true/false)
  function ganCapMk(mk, ulMk, mk2, ulMk2) {
    const capMk = gan(mk, ulMk, LUAT_MK);
    const capKhop = gan(mk2, ulMk2, [
      ["Trùng khớp với mật khẩu", (v) => v !== "" && v === mk.value],
    ]);
    mk.addEventListener("input", () => mk2.value && capKhop());
    return {
      kiemMk() {
        const ok = kiemMatKhau(mk.value) === "";
        capMk(true);
        mk.classList.toggle("loi", !ok);
        return ok;
      },
      kiemKhop() {
        const ok = mk2.value !== "" && mk2.value === mk.value;
        capKhop(true);
        mk2.classList.toggle("loi", !ok);
        return ok;
      },
    };
  }

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
    paneQm.hidden = true;
    document.title = ten === "login" ? "Đăng nhập" : "Đăng ký";
    try {
      history.replaceState(null, "", ten === "login" ? "/login" : "/register");
    } catch (e) {}
    if (focus) {
      const f =
        ten === "login" ? $("#f-dn input") : $(".dn-b:not([hidden]) input");
      f && f.focus({ preventScroll: true });
    }
  }
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => chonTab(t.dataset.tab));
    t.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const n =
        tabs[
          (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length
        ];
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
    moQuenMk();
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
      const kq = await guiDangNhap({
        email: em.value.trim(),
        matKhau: mk.value,
      });
      nuocTran(() => (location.href = kq.next || "/")); // nước tràn lên rồi vào trang chủ (hoặc trang đang định vào)
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
  let emailDk = "",
    veDk = "";
  function datBuoc(n) {
    $$(".dn-b").forEach((b) => (b.hidden = +b.dataset.b !== n));
    $$(".dn-buoc li").forEach((li) => {
      const k = +li.dataset.b;
      li.classList.toggle("on", k === n);
      li.classList.toggle("xong", k < n);
      li.firstElementChild.textContent = k < n ? "✓" : k;
      k === n
        ? li.setAttribute("aria-current", "step")
        : li.removeAttribute("aria-current");
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

  // --- Bước 1: email + CAPTCHA, xong mới gửi OTP ---
  // --- "Không phải người máy" nằm ở BƯỚC 1: phải qua trước khi server gửi OTP ---
  // Có RECAPTCHA_SITE_KEY: widget reCAPTCHA thật (#cap-rc). Không có: ô giả lập #cap (server không kiểm tra).
  // Token reCAPTCHA chỉ dùng được 1 lần -> sau mỗi lần gọi /register/otp phải đặt lại widget.
  const cap = $("#cap"),
    capRc = $("#cap-rc"),
    loiCap = $("#loi-cap");
  let capOk = false;
  const tokenCap = () =>
    capRc
      ? window.grecaptcha
        ? grecaptcha.getResponse()
        : ""
      : capOk
        ? "ok"
        : "";
  window.capXong = () => (loiCap.textContent = "");
  window.capHet = () => {};
  function datLaiCap() {
    capOk = false;
    if (capRc) {
      try {
        grecaptcha.reset();
      } catch (e) {}
    } else if (cap) {
      cap.classList.remove("ok", "cho");
      cap.setAttribute("aria-checked", "false");
    }
  }
  function bamCap() {
    if (capOk || cap.classList.contains("cho")) return;
    cap.classList.add("cho");
    loiCap.textContent = "";
    setTimeout(() => {
      cap.classList.remove("cho");
      cap.classList.add("ok");
      cap.setAttribute("aria-checked", "true");
      capOk = true;
    }, 700);
  }
  if (cap) {
    cap.addEventListener("click", bamCap);
    cap.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        bamCap();
      }
    });
  }

  const f1 = $("#f-b1");
  xoaLoiKhiGo(f1);
  f1.addEventListener("submit", async (e) => {
    e.preventDefault();
    const emailOk = kiemEmail(f1.email);
    const token = tokenCap();
    loiCap.textContent = token
      ? ""
      : "Vui lòng xác nhận bạn không phải người máy.";
    if (!emailOk) return f1.email.focus();
    if (!token) return cap && cap.focus();
    const nut = $(".dn-nut", f1);
    cho(nut, true);
    try {
      emailDk = f1.email.value.trim();
      const kq = await guiMaOtp(emailDk, capRc ? token : "");
      cho(nut, false);
      datLaiCap(); // token đã dùng, lần gửi sau phải xác nhận lại
      otp.forEach((i) => (i.value = ""));
      loiOtp.textContent = "";
      datBuoc(2);
      demNguoc(kq.cooldown || 60);
    } catch (err) {
      cho(nut, false);
      datLaiCap(); // server đã tiêu token (đúng hay sai) -> bắt tick lại
      if (err.field === "captcha") loiCap.textContent = err.message;
      else loiO(f1.email, err.message || "Không gửi được mã, vui lòng thử lại.");
    }
  });

  // --- Bước 2: OTP ---
  // gắn hành vi nhập 6 ô OTP (tự nhảy ô, xóa lùi, mũi tên, dán cả mã) cho 1 nhóm ô; trả về mảng 6 ô
  function noiOtp(nhom, loiEl) {
    const o = $$("input", nhom);
    o.forEach((inp, i) => {
      inp.addEventListener("input", () => {
        inp.value = inp.value.replace(/\D/g, "").slice(-1);
        inp.classList.remove("loi");
        loiEl.textContent = "";
        if (inp.value && o[i + 1]) o[i + 1].focus();
      });
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Backspace" && !inp.value && o[i - 1]) {
          o[i - 1].value = "";
          o[i - 1].focus();
          e.preventDefault();
        } else if (e.key === "ArrowLeft" && o[i - 1]) o[i - 1].focus();
        else if (e.key === "ArrowRight" && o[i + 1]) o[i + 1].focus();
      });
      inp.addEventListener("focus", () => inp.select());
      inp.addEventListener("paste", (e) => {
        const t = ((e.clipboardData && e.clipboardData.getData("text")) || "")
          .replace(/\D/g, "")
          .slice(0, 6);
        if (!t) return;
        e.preventDefault();
        [...t].forEach((c, k) => (o[k].value = c));
        o[Math.min(t.length, 5)].focus();
      });
    });
    return o;
  }
  const f2 = $("#f-b2"),
    loiOtp = $("#loi-otp"),
    guiLai = $("#gui-lai"),
    otp = noiOtp($(".dn-otp", f2), loiOtp);
  // đếm ngược nút "Gửi lại mã" (mỗi nút 1 bộ đếm riêng)
  function boDem(nut) {
    let t,
      con = 0;
    const hien = () => {
      nut.disabled = con > 0;
      nut.textContent = con > 0 ? `Gửi lại mã sau ${con}s` : "Gửi lại mã";
    };
    return {
      chay(sec) {
        clearInterval(t);
        con = sec;
        hien();
        t = setInterval(() => {
          con--;
          hien();
          if (con <= 0) clearInterval(t);
        }, 1000);
      },
      dung: () => clearInterval(t),
    };
  }
  const demDk = boDem(guiLai);
  const demNguoc = (sec) => demDk.chay(sec);
  // "Gửi lại mã": server chỉ gửi email khi CAPTCHA qua, nên quay về bước 1 (giữ email) để xác nhận lại rồi bấm gửi
  guiLai.addEventListener("click", () => {
    demDk.dung();
    datLaiCap();
    f1.email.value = emailDk;
    datBuoc(1);
    loiCap.textContent = "Hãy xác nhận không phải người máy để nhận mã mới.";
  });
  $("#doi-email").addEventListener("click", () => {
    demDk.dung();
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
      const kq = await xacThucOtp(emailDk, ma);
      veDk = kq.ticket; // vé dùng 1 lần để hoàn tất bước 3
      cho(nut, false);
      demDk.dung();
      datBuoc(3);
    } catch (err) {
      cho(nut, false);
      otp.forEach((i) => i.classList.add("loi"));
      loiOtp.textContent = err.message || "Mã chưa đúng hoặc đã hết hạn.";
    }
  });

  // --- Bước 3: thông tin cá nhân (CAPTCHA đã xác nhận ở bước 1) ---
  const f3 = $("#f-b3"),
    loiRole = $("#loi-role");
  xoaLoiKhiGo(f3);
  $$('input[name="role"]', f3).forEach((r) =>
    r.addEventListener("change", () => (loiRole.textContent = "")),
  );
  const luat3 = ganCapMk(
    f3.matKhau,
    $("#dk-luat-mk"),
    f3.matKhau2,
    $("#dk-luat-mk2"),
  );
  f3.addEventListener("submit", async (e) => {
    e.preventDefault();
    const ten = f3.hoTen,
      mk = f3.matKhau,
      mk2 = f3.matKhau2;
    const roleChon = f3.querySelector('input[name="role"]:checked');
    loiRole.textContent = roleChon
      ? ""
      : "Vui lòng chọn vai trò (khách hàng hoặc đầu bếp).";
    const kq = [
      loiO(ten, ten.value.trim().length < 2 ? "Vui lòng nhập họ và tên." : ""),
      luat3.kiemMk(),
      luat3.kiemKhop(),
    ];
    if (kq.includes(false)) return [ten, mk, mk2][kq.indexOf(false)].focus();
    if (!roleChon) return f3.querySelector('input[name="role"]').focus();
    const nut = $(".dn-nut", f3);
    cho(nut, true);
    try {
      await dangKy({
        email: emailDk,
        ticket: veDk,
        hoTen: ten.value.trim(),
        role: roleChon.value,
        matKhau: mk.value,
        matKhau2: mk2.value,
      });
      veDk = "";
      cho(nut, false);
      $("#dk-dau").hidden = true;
      $$(".dn-b").forEach((b) => (b.hidden = true));
      $("#dk-chan").hidden = true;
      $("#dk-xong").hidden = false;
      $("#dk-dn").focus({ preventScroll: true });
    } catch (err) {
      cho(nut, false);
      if (err.field === "phien") {
        // vé hết hạn / email đã có tài khoản: quay lại bước 1
        veDk = "";
        datBuoc(1);
        return loiO(f1.email, err.message);
      }
      if (err.field === "role") {
        loiRole.textContent = err.message;
        return;
      }
      const o = { hoTen: ten, matKhau: mk, matKhau2: mk2 }[err.field];
      if (o) {
        loiO(o, err.message);
        o.focus();
      } else loiRole.textContent = err.message || "Không đăng ký được, vui lòng thử lại.";
    }
  });
  $("#dk-dn").addEventListener("click", () => {
    // về tab đăng nhập, điền sẵn email vừa đăng ký, đặt lại form đăng ký
    fDn.email.value = emailDk;
    [f1, f2, f3].forEach((f) => f.reset());
    datLaiCap();
    $("#dk-xong").hidden = true;
    $("#dk-dau").hidden = false;
    $("#dk-chan").hidden = false;
    datBuoc(1);
    chonTab("login", { focus: false });
    fDn.password.focus({ preventScroll: true });
  });

  // ================= QUÊN MẬT KHẨU: 3 bước giống đăng ký (email -> mã OTP -> mật khẩu mới) =================
  const q1 = $("#f-q1"),
    q2 = $("#f-q2"),
    q3 = $("#f-q3"),
    qTieuDe = $("#qm-tieude"),
    qPhu = $("#qm-phu"),
    loiQOtp = $("#loi-qotp"),
    qGuiLai = $("#q-gui-lai"),
    qOtp = noiOtp($(".dn-otp", q2), loiQOtp),
    demQ = boDem(qGuiLai);
  let emailQ = "",
    maQ = "";
  xoaLoiKhiGo(q1);
  xoaLoiKhiGo(q3);
  const luatQ = ganCapMk(
    q3.matKhau,
    $("#qm-luat-mk"),
    q3.matKhau2,
    $("#qm-luat-mk2"),
  );
  const TDQ = {
    1: [
      "Quên mật khẩu",
      "Nhập email đã đăng ký, chúng tôi sẽ gửi mã xác thực 6 số.",
    ],
    2: ["Nhập mã xác thực", null],
    3: [
      "Đặt lại mật khẩu",
      "Gần xong rồi! Chọn mật khẩu mới cho tài khoản của bạn.",
    ],
  };
  function buocQ(n) {
    q1.hidden = n !== 1;
    q2.hidden = n !== 2;
    q3.hidden = n !== 3;
    $$("#qm-buoc li").forEach((li) => {
      const k = +li.dataset.b;
      li.classList.toggle("on", k === n);
      li.classList.toggle("xong", k < n);
      li.firstElementChild.textContent = k < n ? "✓" : k;
      k === n
        ? li.setAttribute("aria-current", "step")
        : li.removeAttribute("aria-current");
    });
    qTieuDe.textContent = TDQ[n][0];
    if (n === 2) {
      const b = document.createElement("b");
      b.textContent = emailQ;
      qPhu.replaceChildren("Mã gồm 6 số đã gửi tới ", b, ".");
    } else qPhu.textContent = TDQ[n][1];
    const f = $("input", [q1, q2, q3][n - 1]);
    f && setTimeout(() => f.focus({ preventScroll: true }), 60);
  }
  function moQuenMk() {
    paneDn.hidden = true;
    paneDk.hidden = true;
    paneQm.hidden = false;
    q1.email.value = fDn.email.value.trim();
    maQ = "";
    buocQ(1);
  }
  function veDangNhap() {
    demQ.dung();
    maQ = "";
    chonTab("login", { focus: false });
    fDn.email.focus({ preventScroll: true });
  }
  $("#qm-ve").addEventListener("click", (e) => {
    e.preventDefault();
    veDangNhap();
  });
  // Bước 1: gửi mã
  q1.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!kiemEmail(q1.email)) return q1.email.focus();
    const nut = $(".dn-nut", q1);
    cho(nut, true);
    try {
      emailQ = q1.email.value.trim();
      const kq = await guiMaQuenMk(emailQ);
      cho(nut, false);
      qOtp.forEach((i) => (i.value = ""));
      loiQOtp.textContent = "";
      buocQ(2);
      demQ.chay(kq.cooldown || 60);
    } catch (err) {
      cho(nut, false);
      loiO(q1.email, err.message || "Không gửi được mã, vui lòng thử lại.");
    }
  });
  qGuiLai.addEventListener("click", async () => {
    qGuiLai.disabled = true;
    try {
      const kq = await guiMaQuenMk(emailQ);
      bao("Nếu email đã đăng ký, mã mới đã được gửi");
      demQ.chay(kq.cooldown || 60);
    } catch (err) {
      bao(err.message || "Không gửi được mã");
      demQ.chay(err.status === 429 ? 15 : 5);
    }
  });
  $("#q-doi-email").addEventListener("click", () => {
    demQ.dung();
    buocQ(1);
  });
  // Bước 2: kiểm tra mã (server chưa hủy mã, bước 3 sẽ kiểm tra lại)
  q2.addEventListener("submit", async (e) => {
    e.preventDefault();
    const ma = qOtp.map((i) => i.value).join("");
    if (ma.length < 6) {
      qOtp.forEach((i) => i.classList.toggle("loi", !i.value));
      loiQOtp.textContent = "Vui lòng nhập đủ 6 số.";
      return (qOtp.find((i) => !i.value) || qOtp[5]).focus();
    }
    const nut = $(".dn-nut", q2);
    cho(nut, true);
    try {
      await xacThucQuenMk(emailQ, ma);
      maQ = ma;
      cho(nut, false);
      demQ.dung();
      buocQ(3);
    } catch (err) {
      cho(nut, false);
      qOtp.forEach((i) => i.classList.add("loi"));
      loiQOtp.textContent = err.message || "Mã chưa đúng hoặc đã hết hạn.";
    }
  });
  // Bước 3: mật khẩu mới
  q3.addEventListener("submit", async (e) => {
    e.preventDefault();
    const mk = q3.matKhau,
      mk2 = q3.matKhau2;
    const ok2 = luatQ.kiemMk();
    const ok3 = luatQ.kiemKhop();
    if (!ok2 || !ok3) return (ok2 ? mk2 : mk).focus();
    const nut = $(".dn-nut", q3);
    cho(nut, true);
    try {
      await datLaiMk({
        email: emailQ,
        otp: maQ,
        matKhau: mk.value,
        matKhau2: mk2.value,
      });
      cho(nut, false);
      [q1, q2, q3].forEach((f) => f.reset());
      veDangNhap();
      fDn.email.value = emailQ;
      fDn.password.focus({ preventScroll: true });
      bao("Đặt lại mật khẩu thành công, hãy đăng nhập bằng mật khẩu mới");
    } catch (err) {
      cho(nut, false);
      if (err.field === "matKhau" || err.field === "matKhau2") {
        const o = err.field === "matKhau" ? mk : mk2;
        loiO(o, err.message);
        return o.focus();
      }
      // mã hết hạn / bị hủy: quay lại bước 2 để lấy mã mới
      maQ = "";
      qOtp.forEach((i) => ((i.value = ""), i.classList.add("loi")));
      buocQ(2);
      loiQOtp.textContent = err.message || "Mã chưa đúng hoặc đã hết hạn.";
    }
  });

  // vào thẳng /register thì focus ô email
  if (goc.dataset.tab === "register") f1.email.focus({ preventScroll: true });
  else fDn.email.focus({ preventScroll: true });
})();
