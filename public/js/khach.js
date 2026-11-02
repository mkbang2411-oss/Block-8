(() => {
  const MON = window.MON || [],
    N = MON.length;
  if (!N) return; // chưa có món nào trong DB
  // Chỉ vẽ một "cửa sổ" 5 món quanh món đang chọn (khớp 5 ghế); toàn bộ danh sách vẫn nằm trong MON (server đã gửi sẵn).
  // Bấm mũi tên: cửa sổ trượt 1 món -> hiện thêm 1 món ở đầu này, món ở đầu kia ẩn đi (đi hết vòng thì quay lại món đầu).
  // Mỗi món có chỉ số tuyệt đối k (có thể âm hoặc > N), món thật là MON[k mod N]; nhờ vậy vòng xoay liên tục không bị giật.
  const A = 32, // góc giữa 2 món (độ) = góc giữa 2 ghế trong khach.ejs. Càng lớn các đĩa càng thưa
    R = 64; // R: bán kính vòng món (vh)
  const SO_HIEN = Math.min(N, 5);
  const DAU = -Math.floor((SO_HIEN - 1) / 2); // 5 món -> -2..+2
  const DEM = N >= 7 ? 1 : 0; // thêm 1 món ẩn mỗi đầu để món trượt vào / ra có hiệu ứng mờ dần
  const TU = DAU - DEM,
    DEN = DAU + SO_HIEN - 1 + DEM;
  const mod = (a, n) => ((a % n) + n) % n;
  const vong = $("#vong");
  const nodes = new Map(); // k -> phần tử nút món
  let idx = 0;
  const hang = new Map(); // id món -> { m, sl, cho }

  function taoNode(k, eager) {
    const x = MON[mod(k, N)];
    const b = document.createElement("button");
    b.dataset.k = k;
    b.innerHTML = `<span class="dia">${x.anh ? `<img class="anh-dia" src="${esc(x.anh)}" alt="${esc(x.ten)}" loading="${eager ? "eager" : "lazy"}" decoding="async">` : `<em>${x.icon}</em>`}</span><b>${esc(x.ten)}</b>`;
    return b;
  }
  const dat = (el, k, rg) =>
    (el.style.transform = `rotate(${k * A}deg) translateY(-${R}vh) rotate(${-(rg + k * A)}deg) translate(-50%,-50%)`);
  const lop = (k, d) =>
    "mon d" +
    (Math.abs(d) > 2 ? 3 : Math.abs(d)) +
    (MON[mod(k, N)].conBan ? "" : " het");

  function cap() {
    const rg = -idx * A;
    vong.style.transform = `rotate(${rg}deg)`;
    const moi = [];
    for (let d = TU; d <= DEN; d++) {
      const k = idx + d;
      let el = nodes.get(k);
      if (!el) {
        el = taoNode(k, Math.abs(d) <= 2);
        el.className = lop(k, 99); // vào cảnh ở trạng thái ẩn rồi mới hiện ra
        dat(el, k, rg);
        vong.append(el);
        nodes.set(k, el);
        moi.push([el, k, d]);
      } else {
        dat(el, k, rg);
        el.className = lop(k, d);
      }
      el.inert = Math.abs(d) > 2;
    }
    // món rời khỏi cửa sổ: trượt ra rồi mờ đi, xong thì gỡ khỏi trang
    for (const [k, el] of nodes) {
      if (k >= idx + TU && k <= idx + DEN) continue;
      nodes.delete(k);
      dat(el, k, rg);
      el.className = lop(k, 99);
      el.inert = true;
      setTimeout(() => el.remove(), 900);
    }
    if (moi.length) {
      void vong.offsetWidth; // ép trình duyệt vẽ trạng thái ẩn trước khi đổi sang trạng thái hiện
      for (const [el, k, d] of moi) el.className = lop(k, d);
    }
  }
  const xoay = (k) => {
    if (N < 2) return;
    idx += k;
    cap();
    Am.phat("xoay");
  };
  const trai = $("#trai"),
    phai = $("#phai");
  if (trai) trai.onclick = () => xoay(-1);
  if (phai) phai.onclick = () => xoay(1);
  addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") xoay(-1);
    if (e.key === "ArrowRight") xoay(1);
  });

  vong.addEventListener("click", (e) => {
    const el = e.target.closest(".mon");
    if (!el) return;
    const k = +el.dataset.k,
      d = k - idx;
    if (d === 0) moMon(MON[mod(k, N)]);
    else xoay(d); // bấm món bên cạnh -> xoay tới món đó
  });

  // Đơn gọi món hiện chỉ lưu tạm trên trình duyệt (DB chưa có bảng đơn hàng)
  function moMon(m) {
    const cho = Math.floor(Math.random() * 4) + 2; // 2-5 phút
    const nl = m.nguyenLieu.map((n) => esc(n.ten)).join(", ");
    const nut = m.conBan
      ? `<button class="nut nut-phu" data-a="hang">Thêm vào giỏ hàng</button><button class="nut" data-a="ngay">Đặt ngay</button>`
      : `<button class="nut" data-a="dong" >Đóng</button>`;
    const h =
      hop(`<div class="anh-mon to">${m.anh ? `<img src="${esc(m.anh)}" alt="${esc(m.ten)}">` : esc(m.icon)}</div><h2>${esc(m.ten)}</h2>
      <p class="gia">${vnd(m.gia)}</p>
      ${m.moTa ? `<p>${esc(m.moTa)}</p>` : ""}
      <p class="phu-chu-nho">${esc(m.loai)}${m.dauBep ? " · Đầu bếp " + esc(m.dauBep) : ""}</p>
      ${nl ? `<p class="phu-chu-nho">Nguyên liệu: ${nl}</p>` : ""}
      ${m.conBan ? `<p>Dự kiến chờ khoảng <b>${cho} phút</b></p>` : `<p><b>Món này hiện đã hết.</b></p>`}
      <div class="nut-hang hang-mon"><a class="nut nut-phu" href="/dishes/${m.id}">Chi tiết</a>${nut}</div>`);
    h.el.addEventListener("click", (e) => {
      const a = e.target.dataset.a;
      if (a === "dong") h.dong();
      if (a === "ngay") {
        Am.phat("ding");
        bao(`Đã gửi món ${m.ten}, chờ khoảng ${cho} phút`);
        h.dong();
      }
      if (a === "hang") {
        const c = hang.get(m.id) || { m, sl: 0, cho };
        c.sl++;
        c.cho = Math.max(c.cho, cho);
        hang.set(m.id, c);
        capNhat();
        Am.phat("them");
        bao(`Đã thêm ${m.ten} vào hàng chờ`);
        h.dong();
      }
    });
  }

  const nutHang = $("#nut-hang");
  const capNhat = () =>
    (nutHang.textContent = `Hàng chờ (${[...hang.values()].reduce((s, c) => s + c.sl, 0)})`);
  nutHang.onclick = () => {
    const ds = [...hang.values()];
    if (!ds.length) return bao("Hàng chờ đang trống");
    const tong = ds.reduce((s, c) => s + c.sl * c.m.gia, 0);
    const h =
      hop(`<h2>Hàng chờ</h2>${ds.map((c) => `<div class="dong-hang"><span>${esc(c.m.ten)} × ${c.sl}</span><span>${vnd(c.sl * c.m.gia)}</span><button class="xoa-nl" data-x="${c.m.id}" aria-label="Bỏ món">×</button></div>`).join("")}
      <p class="gia" style="margin-top:12px">Tổng: ${vnd(tong)}</p>
      <div class="nut-hang"><button class="nut nut-phu" data-a="dong">Đóng</button><button class="nut" data-a="dat">Đặt tất cả</button></div>`);
    h.el.addEventListener("click", (e) => {
      if (e.target.dataset.x) {
        hang.delete(+e.target.dataset.x);
        capNhat();
        h.dong();
        nutHang.click();
      }
      if (e.target.dataset.a === "dong") h.dong();
      if (e.target.dataset.a === "dat") {
        Am.phat("ding");
        bao(
          `Đã gửi ${ds.length} món, món lâu nhất khoảng ${Math.max(...ds.map((c) => c.cho))} phút`,
        );
        hang.clear();
        capNhat();
        h.dong();
      }
    });
  };
  cap();
})();
