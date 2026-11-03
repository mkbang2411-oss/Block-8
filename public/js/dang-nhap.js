// Trang /login + /register: chuyển tab, đăng nhập (form thường -> server trả 303), đăng ký 3 bước (email + CAPTCHA -> OTP -> thông tin),
// quên mật khẩu (gửi link qua email) và đặt mật khẩu mới (form thường, mở từ link trong email).
// Đăng ký / quên mật khẩu gọi API server (src/routes/auth.js) bằng fetch JSON; lỗi server trả {ok:false, error, field?}.
// Đăng nhập + đặt lại mật khẩu là form HTML thường: JS chỉ kiểm tra sơ bộ rồi để trình duyệt gửi, server redirect 303.
(() => {
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const goc = $(".dn");
  const tabs = $$(".dn-tab-nut");
  const paneDn = $("#p-dn"),
    paneDk = $("#p-dk"),
    paneQm = $("#p-qm"),
    paneDm = $("#p-dm"); // chỉ có khi mở từ link đặt lại mật khẩu

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
  const guiMaOtp = (email, recaptcha) =>
    goi("/register/otp", { email, recaptcha });
  const xacThucOtp = (email, ma) => goi("/register/verify", { email, otp: ma });
  const dangKy = (thongTin) => goi("/register", thongTin);
  const guiLinkQuenMk = (email) => goi("/forgot-password", { email });

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
    if (paneDm) paneDm.hidden = true;
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
  fDn.addEventListener("input", () => (loiChung.hidden = true));
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
  // ---- CAPTCHA của form đăng nhập: server chỉ cho hiện khi đã sai từ 3 lần (ô #cap-dn / #cap-dn-rc có mặt trong trang) ----
  const khoiCapDn = $("#dn-cap-khoi"),
    loiChung = $("#dn-loi-chung"),
    capDn = $("#cap-dn"),
    capDnRc = $("#cap-dn-rc"),
    capDnVal = $("#cap-dn-val"),
    loiCapDn = $("#loi-cap-dn");
  if (capDn) {
    // ô giả lập (dev, chưa có RECAPTCHA_SITE_KEY): bấm là tick, ghi "ok" vào input ẩn
    const bam = () => {
      if (capDn.classList.contains("ok") || capDn.classList.contains("cho"))
        return;
      capDn.classList.add("cho");
      setTimeout(() => {
        capDn.classList.remove("cho");
        capDn.classList.add("ok");
        capDn.setAttribute("aria-checked", "true");
        capDnVal.value = "ok";
        loiCapDn.textContent = "";
      }, 700);
    };
    capDn.addEventListener("click", bam);
    capDn.addEventListener("keydown", (e) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        bam();
      }
    });
  }
  const capDnHien = () => !khoiCapDn.hidden; // chỉ bắt tick khi server đã đòi (sai >= 3 lần)
  const tokenCapDn = () =>
    !capDnHien()
      ? "ok"
      : capDnRc
        ? idCapDn !== null && window.grecaptcha
          ? grecaptcha.getResponse(idCapDn)
          : ""
        : capDnVal.value;
  function datLaiCapDn() {
    if (capDnRc) {
      try {
        grecaptcha.reset(idCapDn);
      } catch (e) {}
    } else if (capDn) {
      capDn.classList.remove("ok", "cho");
      capDn.setAttribute("aria-checked", "false");
      capDnVal.value = "";
    }
  }
  // Form đăng nhập là form HTML thường (không JS vẫn POST /login và nhận 303). Có JS thì gửi bằng fetch redirect:"manual":
  //   - server trả 303 (type "opaqueredirect") = đăng nhập ĐÚNG -> chạy nước tràn rồi mới sang trang đích
  //   - server trả trang lỗi (401/400/429...) = thay nội dung trang bằng trang đó (giống như trình duyệt tự gửi form)
  fDn.addEventListener("submit", async (e) => {
    const em = fDn.email,
      mk = fDn.password;
    const ok1 = kiemEmail(em);
    const ok2 = loiO(mk, mk.value ? "" : "Vui lòng nhập mật khẩu.");
    const okCap = !!tokenCapDn();
    if (capDnHien())
      loiCapDn.textContent = okCap
        ? ""
        : "Vui lòng xác nhận bạn không phải người máy.";
    e.preventDefault();
    if (!ok1 || !ok2 || !okCap) return (ok1 ? mk : em).focus();
    const nut = $(".dn-nut", fDn);
    cho(nut, true);
    let r;
    try {
      r = await fetch(fDn.action, {
        method: "POST",
        redirect: "manual",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json", // lỗi -> JSON; đúng -> vẫn 303
        },
        body: new URLSearchParams(new FormData(fDn)),
      });
    } catch (err) {
      cho(nut, false);
      return loiO(mk, "Không kết nối được máy chủ, vui lòng thử lại.");
    }
    if (r.type === "opaqueredirect" || (r.status >= 300 && r.status < 400)) {
      // đích do server đã kiểm tra (safeNext) và nằm sẵn trong ô ẩn `next`
      const dich = fDn.next.value || "/";
      return nuocTran(() => (location.href = dich));
    }
    // sai mật khẩu / cần CAPTCHA / bị khóa: server trả JSON {error, needCaptcha} -> hiện lỗi tại chỗ
    let d = {};
    try {
      d = await r.json();
    } catch (err) {} // vd. 429 của bộ giới hạn IP trả trang HTML
    cho(nut, false);
    loiChung.textContent =
      d.error || "Có lỗi xảy ra, vui lòng thử lại sau ít phút.";
    loiChung.hidden = false;
    if (d.needCaptcha) khoiCapDn.hidden = false;
    if (capDnHien()) datLaiCapDn(); // token CAPTCHA đã bị tiêu, lần sau phải tick lại
    mk.value = "";
    mk.focus();
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
  // reCAPTCHA thật: trang có thể có 2 widget (đăng ký + đăng nhập khi sai >= 3 lần) nên vẽ tường minh và giữ id từng widget
  let idCapRc = null,
    idCapDn = null;
  window.capSan = () => {
    const ve = (el, extra) =>
      el
        ? grecaptcha.render(el, { sitekey: el.dataset.sitekey, ...extra })
        : null;
    idCapRc = ve(capRc, { callback: () => (loiCap.textContent = "") });
    idCapDn = ve(capDnRc, {
      callback: () => loiCapDn && (loiCapDn.textContent = ""),
    });
  };
  if (
    window.grecaptcha &&
    window.grecaptcha.render &&
    idCapRc === null &&
    idCapDn === null
  )
    window.capSan(); // script Google nạp xong trước file này
  const tokenCap = () =>
    capRc
      ? window.grecaptcha && idCapRc !== null
        ? grecaptcha.getResponse(idCapRc)
        : ""
      : capOk
        ? "ok"
        : "";
  function datLaiCap() {
    capOk = false;
    if (capRc) {
      try {
        grecaptcha.reset(idCapRc);
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
      else
        loiO(f1.email, err.message || "Không gửi được mã, vui lòng thử lại.");
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
      } else
        loiRole.textContent =
          err.message || "Không đăng ký được, vui lòng thử lại.";
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

  // ================= QUÊN MẬT KHẨU: nhập email -> server gửi EMAIL CHỨA LINK đặt lại mật khẩu =================
  const q1 = $("#f-q1"),
    qXong = $("#qm-xong"),
    qDau = $("#qm-dau"),
    qGuiLai = $("#q-gui-lai"),
    demQ = boDem(qGuiLai);
  let emailQ = "";
  xoaLoiKhiGo(q1);
  function hienQ(daGui) {
    q1.hidden = daGui;
    qXong.hidden = !daGui;
    qDau.hidden = daGui;
    if (daGui) {
      const b = document.createElement("b");
      b.textContent = emailQ;
      $("#qm-xong-phu").replaceChildren(
        "Nếu ",
        b,
        " đã đăng ký, chúng tôi vừa gửi một email chứa link đặt lại mật khẩu (hiệu lực 30 phút). Nhớ xem cả mục Spam.",
      );
    } else {
      const f = q1.email;
      setTimeout(() => f.focus({ preventScroll: true }), 60);
    }
  }
  function moQuenMk() {
    paneDn.hidden = true;
    paneDk.hidden = true;
    paneQm.hidden = false;
    q1.email.value = fDn.email.value.trim();
    demQ.dung();
    hienQ(false);
  }
  function veDangNhap() {
    demQ.dung();
    chonTab("login", { focus: false });
    fDn.email.focus({ preventScroll: true });
  }
  $("#qm-ve").addEventListener("click", (e) => {
    e.preventDefault();
    veDangNhap();
  });
  q1.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!kiemEmail(q1.email)) return q1.email.focus();
    const nut = $(".dn-nut", q1);
    cho(nut, true);
    try {
      emailQ = q1.email.value.trim();
      const kq = await guiLinkQuenMk(emailQ);
      cho(nut, false);
      hienQ(true);
      demQ.chay(kq.cooldown || 60);
    } catch (err) {
      cho(nut, false);
      loiO(q1.email, err.message || "Không gửi được link, vui lòng thử lại.");
    }
  });
  qGuiLai.addEventListener("click", async () => {
    qGuiLai.disabled = true;
    try {
      const kq = await guiLinkQuenMk(emailQ);
      bao("Nếu email đã đăng ký, link mới đã được gửi");
      demQ.chay(kq.cooldown || 60);
    } catch (err) {
      bao(err.message || "Không gửi được link");
      demQ.chay(err.status === 429 ? 15 : 5);
    }
  });
  $("#q-doi-email").addEventListener("click", () => {
    demQ.dung();
    hienQ(false);
  });

  // ================= ĐẶT MẬT KHẨU MỚI (mở từ link trong email; form thường -> server trả 303 /login?reset=1) =================
  const fDm = $("#f-dm");
  if (fDm) {
    xoaLoiKhiGo(fDm);
    const luatDm = ganCapMk(
      fDm.matKhau,
      $("#dm-luat-mk"),
      fDm.matKhau2,
      $("#dm-luat-mk2"),
    );
    fDm.addEventListener("submit", (e) => {
      const ok2 = luatDm.kiemMk();
      const ok3 = luatDm.kiemKhop();
      if (!ok2 || !ok3) {
        e.preventDefault();
        return (ok2 ? fDm.matKhau2 : fDm.matKhau).focus();
      }
      cho($(".dn-nut", fDm), true);
    });
  }

  // thông báo sau khi đổi mật khẩu thành công (server redirect 303 về /login?reset=1)
  if (goc.dataset.notice) bao(goc.dataset.notice);

  // mở sẵn đúng chỗ: /register -> ô email đăng ký; /login?quen=1 -> quên mật khẩu; trang đặt mật khẩu mới -> ô mật khẩu;
  // đăng nhập lại sau khi server báo lỗi -> ô mật khẩu (email đã được điền lại)
  if (goc.dataset.tab === "register") f1.email.focus({ preventScroll: true });
  else if (goc.dataset.tab === "reset") {
    const f = $("#f-dm input[name=matKhau]");
    f && f.focus({ preventScroll: true });
  } else if (/[?&]quen=1\b/.test(location.search)) moQuenMk();
  else if ($(".bao-loi", paneDn) && fDn.email.value)
    fDn.password.focus({ preventScroll: true });
  else fDn.email.focus({ preventScroll: true });
})();
