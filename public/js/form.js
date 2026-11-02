// ===== Form Thêm / Sửa (đầu bếp): giao diện lấy từ Block 7, vẫn là form HTML thường gửi lên server =====
// Server (SSR) không đổi: <select> và <select multiple> gốc vẫn nằm trong form và là thứ được gửi đi.
// File này chỉ vẽ lớp giao diện đẹp phủ lên trên rồi ghi ngược giá trị vào thẻ gốc:
//   1. ô chọn (danh mục, đầu bếp, đơn vị) -> dropdown tự vẽ, có bàn phím (↑ ↓ Home End Enter Esc)
//   2. nguyên liệu -> bấm 1 lần để chọn, bấm lần nữa để bỏ (không cần giữ Ctrl), có ô tìm theo tên + thẻ tóm tắt các nguyên liệu đã chọn
//   3. logic form: kiểm tra ảnh ngay ở trình duyệt, chặn bấm lưu 2 lần, cuộn tới thông báo lỗi, Hủy quay về đúng trang danh sách
(() => {
  const form = $("#form");
  if (!form) return;

  const MUI =
    '<svg class="chon-mui" viewBox="0 0 12 8" width="12" height="8" aria-hidden="true"><path d="M1 1.5 6 6.5l5-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const xoaLoi = (sel) => {
    const t = sel.closest(".truong");
    if (!t) return;
    t.classList.remove("co-loi");
    t.querySelectorAll(".chu-loi").forEach((s) => s.remove());
  };

  // bỏ dấu tiếng Việt + chữ thường + gọn khoảng trắng: "Bánh  Phở" -> "banh pho"
  const boDau = (s) =>
    String(s)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/gi, "d")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();

  // ---------- 1. ô chọn tự vẽ ----------
  const dsOf = (c) => c.querySelector(".chon-ds");
  const nutOf = (c) => c.querySelector(".chon-nut");
  const mucDung = (c) => [...dsOf(c).children];

  function dong(c, { focus = false } = {}) {
    if (dsOf(c).hidden) return;
    dsOf(c).hidden = true;
    c.classList.remove("mo", "len");
    nutOf(c).setAttribute("aria-expanded", "false");
    if (focus) nutOf(c).focus();
  }
  function mo(c) {
    document.querySelectorAll(".chon.mo").forEach((x) => x !== c && dong(x));
    const ds = dsOf(c);
    ds.hidden = false;
    c.classList.add("mo");
    nutOf(c).setAttribute("aria-expanded", "true");
    // gần mép dưới màn hình mà phía trên còn rộng hơn thì xổ lên
    c.classList.remove("len");
    const r = c.getBoundingClientRect();
    if (
      innerHeight - r.bottom < ds.offsetHeight + 12 &&
      r.top > innerHeight - r.bottom
    )
      c.classList.add("len");
    (ds.querySelector('[aria-selected="true"]') || mucDung(c)[0])?.focus();
  }
  function datGiaTri(c, li) {
    mucDung(c).forEach((x) =>
      x.setAttribute("aria-selected", String(x === li)),
    );
    c.querySelector(".chon-ten").textContent = li.textContent;
    c._goc.value = li.dataset.v;
  }
  function chon(c, li) {
    const doi = c._goc.value !== li.dataset.v;
    datGiaTri(c, li);
    dong(c, { focus: true });
    if (doi) {
      xoaLoi(c._goc);
      c._goc.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  form.querySelectorAll("select[data-chon]").forEach((sel) => {
    const ds = [...sel.options].map((o) => [o.value, o.textContent]);
    const hien = ds.find(([k]) => k === sel.value) || ds[0];
    const c = document.createElement("div");
    c.className = "chon";
    c.dataset.chon = sel.name;
    c.innerHTML = `<button type="button" class="chon-nut" aria-haspopup="listbox" aria-expanded="false"><span class="chon-ten"></span>${MUI}</button>
  <ul class="chon-ds" role="listbox" hidden>${ds
    .map(
      ([k, lb]) =>
        `<li role="option" tabindex="-1" data-v="${esc(k)}" aria-selected="${k === hien[0]}">${esc(lb)}</li>`,
    )
    .join("")}</ul>`;
    c.querySelector(".chon-ten").textContent = hien[1];
    c._goc = sel;
    // nhãn <label for=id> trỏ vào nút thay cho thẻ gốc (bấm nhãn -> focus nút)
    nutOf(c).id = sel.id;
    sel.id = "";
    sel.hidden = true;
    sel.after(c);
  });

  form.addEventListener("click", (e) => {
    const nut = e.target.closest(".chon-nut");
    if (nut) {
      const c = nut.closest(".chon");
      return dsOf(c).hidden ? mo(c) : dong(c);
    }
    const li = e.target.closest(".chon-ds li");
    if (li) chon(li.closest(".chon"), li);
  });
  form.addEventListener("keydown", (e) => {
    const c = e.target.closest(".chon");
    if (!c) return;
    const mu = dsOf(c);
    if (e.target.closest(".chon-nut")) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) {
        e.preventDefault();
        if (mu.hidden) mo(c);
      }
      return;
    }
    const ds = mucDung(c);
    const i = ds.indexOf(e.target);
    const toi = (j) => (
      e.preventDefault(),
      ds[Math.max(0, Math.min(ds.length - 1, j))]?.focus()
    );
    if (e.key === "ArrowDown") toi(i + 1);
    else if (e.key === "ArrowUp") toi(i - 1);
    else if (e.key === "Home") toi(0);
    else if (e.key === "End") toi(ds.length - 1);
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (i >= 0) chon(c, ds[i]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      dong(c, { focus: true });
    } else if (e.key === "Tab") dong(c);
  });
  // bấm ra ngoài thì đóng
  document.addEventListener("pointerdown", (e) =>
    document
      .querySelectorAll(".chon.mo")
      .forEach((c) => !c.contains(e.target) && dong(c)),
  );

  // ---------- 2. chọn nhiều nguyên liệu ----------
  form.querySelectorAll("select[data-nl]").forEach((sel) => {
    const opts = [...sel.options];
    const nl = document.createElement("div");
    nl.className = "nl";
    nl.dataset.nl = "";
    // "Cà chua (kg)" -> tên + đơn vị
    const tach = (t) => {
      const m = /^(.*?)\s*\(([^()]*)\)\s*$/.exec(t);
      return m ? [m[1], m[2]] : [t, ""];
    };
    const LUP =
      '<svg class="nl-lup" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><circle cx="8.5" cy="8.5" r="5.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="m13 13 4.5 4.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
    nl.innerHTML = `<div class="nl-tim">${LUP}<input type="text" class="nl-q" placeholder="Tìm nguyên liệu…" autocomplete="off" aria-label="Tìm nguyên liệu"><button type="button" class="nl-xoa" aria-label="Xóa ô tìm kiếm" hidden>×</button></div>
  <div class="nl-tomtat"><span class="nl-dem"></span><button type="button" class="nl-bo" hidden>Bỏ chọn hết</button></div>
  <div class="nl-chips" hidden></div>
  <ul class="nl-ds" role="listbox" aria-multiselectable="true" aria-label="Danh sách nguyên liệu">${opts
    .map((o, i) => {
      const [ten, dv] = tach(o.textContent);
      return `<li role="option" tabindex="-1" data-i="${i}" data-n="${esc(boDau(ten))}" aria-selected="${o.selected}"><span class="nl-tick" aria-hidden="true"></span><span class="nl-ten">${esc(ten)}</span><small class="nl-dv">${esc(dv)}</small></li>`;
    })
    .join("")}</ul>
  <p class="nl-trong" hidden></p>`;
    const ul = nl.querySelector(".nl-ds");
    const chips = nl.querySelector(".nl-chips");
    const dem = nl.querySelector(".nl-dem");
    const bo = nl.querySelector(".nl-bo");
    const lis = [...ul.children];
    // thẻ gốc đã bị ẩn; nhãn trỏ vào danh sách
    const q = nl.querySelector(".nl-q");
    const xoaQ = nl.querySelector(".nl-xoa");
    const trong = nl.querySelector(".nl-trong");
    q.id = sel.id + "-q";
    ul.id = sel.id;
    sel.id = "";
    sel.hidden = true;
    sel.after(nl);
    sel.closest(".truong")?.querySelector("[data-chi-khi-khong-js]")?.remove();

    const capNhat = () => {
      lis.forEach((li) =>
        li.setAttribute("aria-selected", String(opts[li.dataset.i].selected)),
      );
      const dang = lis.filter((li) => opts[li.dataset.i].selected);
      dem.textContent = dang.length
        ? `Đã chọn ${dang.length} nguyên liệu`
        : "Chưa chọn nguyên liệu nào";
      dem.classList.toggle("co", dang.length > 0);
      bo.hidden = chips.hidden = !dang.length;
      chips.innerHTML = dang
        .map(
          (li) =>
            `<button type="button" class="nl-chip" data-i="${li.dataset.i}" title="Bấm để bỏ chọn">${esc(li.querySelector(".nl-ten").textContent)}<span aria-hidden="true">×</span></button>`,
        )
        .join("");
    };

    // Tìm tên nguyên liệu (chạy ngay trên trình duyệt, không gọi server): không phân biệt hoa/thường/dấu,
    // nhiều từ thì phải khớp đủ từng từ (thứ tự tùy ý), gõ dính "banhpho" vẫn ra. Khớp đầu từ xếp trước. Mục đã chọn không bị đụng tới.
    const loc = () => {
      const tu = boDau(q.value).split(" ").filter(Boolean);
      xoaQ.hidden = !q.value;
      const diem = lis.map((li) => {
        const ten = li.dataset.n;
        const tuTen = ten.split(" ");
        let tong = 0;
        for (const t of tu) {
          const d = tuTen.some((w) => w.startsWith(t))
            ? 4
            : ten.includes(t)
              ? 3
              : ten.replace(/ /g, "").includes(t)
                ? 2
                : 0;
          if (!d) return [li, 0];
          tong += d;
        }
        return [li, tu.length ? tong + (ten.startsWith(tu[0]) ? 1 : 0) : 1];
      });
      const thay = diem
        .filter(([, d]) => d > 0)
        .sort(
          (a, b) =>
            (tu.length ? b[1] - a[1] : 0) || a[0].dataset.i - b[0].dataset.i,
        );
      diem.forEach(([li, d]) => (li.hidden = d <= 0));
      ul.append(
        ...thay.map(([li]) => li),
        ...diem.filter(([, d]) => d <= 0).map(([li]) => li),
      );
      ul.hidden = !thay.length;
      trong.hidden = thay.length > 0;
      trong.textContent = lis.length
        ? "Không có nguyên liệu nào khớp."
        : "Chưa có nguyên liệu nào. Hãy thêm ở tab Nguyên liệu.";
      ul.scrollTop = 0;
    };
    q.addEventListener("input", loc);
    loc();
    const bat = (i) => {
      opts[i].selected = !opts[i].selected;
      xoaLoi(sel);
      capNhat();
    };

    nl.addEventListener("click", (e) => {
      const li = e.target.closest(".nl-ds li");
      if (li) return bat(li.dataset.i);
      const chip = e.target.closest(".nl-chip");
      if (chip) return bat(chip.dataset.i);
      if (e.target.closest(".nl-xoa")) {
        q.value = "";
        loc();
        return q.focus();
      }
      if (e.target.closest(".nl-bo")) {
        opts.forEach((o) => (o.selected = false));
        capNhat();
      }
    });
    nl.addEventListener("keydown", (e) => {
      const hien = () => lis.filter((x) => !x.hidden);
      if (e.target === q) {
        // Enter ở ô tìm KHÔNG được gửi cả form
        if (e.key === "Enter" || e.key === "ArrowDown") {
          e.preventDefault();
          hien()[0]?.focus();
        } else if (e.key === "Escape" && q.value) {
          e.preventDefault();
          q.value = "";
          loc();
        }
        return;
      }
      const li = e.target.closest?.(".nl-ds li");
      if (!li) return;
      const vis = hien();
      const i = vis.indexOf(li);
      const toi = (j) => (
        e.preventDefault(),
        vis[Math.max(0, Math.min(vis.length - 1, j))]?.focus()
      );
      if (e.key === "ArrowDown") toi(i + 1);
      else if (e.key === "ArrowUp")
        i <= 0 ? (e.preventDefault(), q.focus()) : toi(i - 1);
      else if (e.key === "Home") toi(0);
      else if (e.key === "End") toi(vis.length - 1);
      else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        bat(li.dataset.i);
      }
    });
    capNhat();
  });

  // ---------- 3. logic form ----------
  const loi = $("#loi");
  const nut = form.querySelector(".nut-hang .nut:not(.nut-phu)");
  const MAX_ANH = 3 * 1024 * 1024; // khớp giới hạn 3MB của server (server vẫn kiểm tra lại)
  const LOAI_ANH = ["image/jpeg", "image/png", "image/webp"];
  const baoLoi = () => {
    loi.hidden = false;
    loi.scrollIntoView({ block: "nearest" });
  };

  // có lỗi từ server (form trả 400): cuộn tới thông báo, và gõ lại ô nào thì bỏ viền đỏ của ô đó
  if (!loi.hidden) baoLoi();
  form.addEventListener("input", (e) => xoaLoi(e.target));
  form.addEventListener("change", (e) => xoaLoi(e.target));

  form.addEventListener("submit", (e) => {
    // kiểm tra nhanh ảnh ở trình duyệt cho đỡ upload phí
    const f = form.elements.image && form.elements.image.files[0];
    if (f && (!LOAI_ANH.includes(f.type) || f.size > MAX_ANH)) {
      e.preventDefault();
      const t = form.elements.image.closest(".truong");
      xoaLoi(form.elements.image);
      t.classList.add("co-loi");
      t.insertAdjacentHTML(
        "beforeend",
        `<small class="chu-loi">${!LOAI_ANH.includes(f.type) ? "Chỉ nhận ảnh JPG, PNG hoặc WEBP" : "Ảnh tối đa 3MB"}</small>`,
      );
      return baoLoi();
    }
    // tránh bấm 2 lần gửi trùng (nút hồi lại nếu người dùng bấm Back)
    nut.disabled = true;
  });
  addEventListener("pageshow", () => (nut.disabled = false));

  // Hủy / quay lại danh sách: về đúng trang danh sách lúc trước (admin.js đã nhớ), sửa món thì mở lại món đó
  try {
    const luu = sessionStorage.getItem("ds-admin:" + form.dataset.res);
    if (luu) {
      const u = new URL(luu, location.href);
      if (form.dataset.id) u.searchParams.set("sel", form.dataset.id);
      $("#huy").href = u.pathname + u.search;
    }
  } catch (e) {}
})();
