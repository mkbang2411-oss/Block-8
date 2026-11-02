// ---- Âm thanh: tự tổng hợp bằng WebAudio (không cần file mp3), bật sau lần bấm đầu tiên ----
// Không còn "nền rè như tivi": chỉ có hiệu ứng ngắn khi thao tác + vài tiếng đời sống rời rạc
// chỉ ở trang phố. Còn lại chỉ có tiếng chuyển cảnh (vut) và tiếng xoay bàn đổi món (xoay).
const Am = (() => {
  const AC = window.AudioContext || window.webkitAudioContext;
  const nutAm = document.querySelector("#nut-am");
  const kieu = document.body.dataset.am || "quan";
  const doc = (k) => {
    try {
      return localStorage.getItem(k);
    } catch (e) {
      return null;
    }
  };
  const ghi = (k, v) => {
    try {
      localStorage.setItem(k, v);
    } catch (e) {
      /* bỏ qua */
    }
  };
  let bat = doc("am") !== "0";
  let ctx, tong, buf;
  const R = Math.random;
  const giua = (a, b) => a + R() * (b - a);

  // ---------- nguyên liệu âm thanh ----------
  // nốt nhạc/âm thanh có cao độ: bao âm mượt (không bị "tạch" đầu nốt)
  function tieng(f, d, o = {}) {
    if (!ctx) return;
    const { type = "sine", v = 0.1, to = f, at = 0, att = 0.005, lp = 0 } = o;
    const t = ctx.currentTime + at;
    const os = ctx.createOscillator(),
      g = ctx.createGain();
    os.type = type;
    os.frequency.setValueAtTime(f, t);
    if (to !== f) os.frequency.exponentialRampToValueAtTime(to, t + d);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    let n = os;
    if (lp) {
      const fl = ctx.createBiquadFilter();
      fl.type = "lowpass";
      fl.frequency.value = lp;
      n = n.connect(fl);
    }
    n.connect(g).connect(tong);
    os.start(t);
    os.stop(t + d + 0.05);
  }
  // tiếng "xào xạc" ngắn qua bộ lọc (chỉ dùng cho hiệu ứng, không chạy liên tục)
  function rat(d, o = {}) {
    if (!ctx) return;
    const {
      loc = "bandpass",
      f = 1000,
      to = f,
      q = 1,
      v = 0.1,
      at = 0,
      att = 0.01,
    } = o;
    const t = ctx.currentTime + at;
    const s = ctx.createBufferSource(),
      fl = ctx.createBiquadFilter(),
      g = ctx.createGain();
    s.buffer = buf;
    s.loop = true; // lặp để đoạn nhiễu dài đến đâu cũng đủ
    fl.type = loc;
    fl.Q.value = q;
    fl.frequency.setValueAtTime(f, t);
    if (to !== f) fl.frequency.exponentialRampToValueAtTime(to, t + d);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + Math.min(att, d / 2));
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(fl).connect(g).connect(tong);
    s.start(t, R() * 1.5);
    s.stop(t + d + 0.05);
  }
  // chuông / bát sứ: vài họa âm không chẵn, tắt dần
  function chuong(f, d, v, at = 0) {
    [
      [1, 1, 1],
      [2.76, 0.45, 0.6],
      [5.4, 0.2, 0.35],
    ].forEach(([k, a, dk]) => tieng(f * k, d * dk, { v: v * a, at }));
  }

  // giọng người (rất đơn giản): sóng răng cưa qua 2 bộ lọc "formant" để ra tiếng "ừ/ư", rung nhẹ,
  // cuối âm khép lại thành tiếng ngân mũi "m". f0 -> f1: cao độ đầu và cuối âm.
  function giong(f0, f1, d, o = {}) {
    if (!ctx) return;
    const { at = 0, v = 0.14, forms = [380, 1350], khep = true } = o;
    const t = ctx.currentTime + at;
    const os = ctx.createOscillator(),
      lfo = ctx.createOscillator(),
      lg = ctx.createGain(),
      ra = ctx.createGain(),
      nguyenAm = ctx.createGain(),
      mui = ctx.createGain(),
      lpMui = ctx.createBiquadFilter();
    os.type = "sawtooth";
    os.frequency.setValueAtTime(f0, t);
    os.frequency.linearRampToValueAtTime(f1, t + d);
    lfo.frequency.value = 5.2; // rung giọng
    lg.gain.value = f0 * 0.014;
    lfo.connect(lg).connect(os.frequency);
    // tổng độ to: vào nhẹ, tắt dần
    ra.gain.setValueAtTime(0.0001, t);
    ra.gain.linearRampToValueAtTime(v, t + 0.06);
    ra.gain.setValueAtTime(v, t + d * 0.7);
    ra.gain.exponentialRampToValueAtTime(0.0001, t + d);
    // nguyên âm: hết ở ~60% âm tiết, nhường chỗ cho tiếng ngân mũi
    nguyenAm.gain.setValueAtTime(1, t);
    nguyenAm.gain.setValueAtTime(1, t + d * 0.55);
    if (khep) {
      nguyenAm.gain.linearRampToValueAtTime(0.05, t + d * 0.72);
      mui.gain.setValueAtTime(0.0001, t + d * 0.5);
      mui.gain.linearRampToValueAtTime(1.4, t + d * 0.75);
    }
    lpMui.type = "lowpass";
    lpMui.frequency.value = 420;
    forms.forEach((fq, i) => {
      const bp = ctx.createBiquadFilter(),
        g = ctx.createGain();
      bp.type = "bandpass";
      bp.frequency.value = fq;
      bp.Q.value = i ? 9 : 5;
      g.gain.value = i ? 0.7 : 1.4;
      os.connect(bp).connect(g).connect(nguyenAm);
    });
    nguyenAm.connect(ra);
    if (khep) os.connect(lpMui).connect(mui).connect(ra);
    ra.connect(tong);
    os.start(t);
    lfo.start(t);
    os.stop(t + d + 0.05);
    lfo.stop(t + d + 0.05);
  }

  // ---------- hiệu ứng khi thao tác ----------
  // Chỉ giữ 2 hiệu ứng: xoay (đổi món ở bàn ăn) và vut (chuyển cảnh). Các tiếng bấm nút/mở hộp thoại/gọi món đã bỏ.
  const SFX = {
    // xoay bàn: gỗ lăn + vài tiếng đĩa sứ chạm nhau
    xoay: () => {
      rat(0.6, { loc: "lowpass", f: 280, to: 650, q: 0.7, v: 0.3, att: 0.15 });
      tieng(95, 0.55, { v: 0.12, to: 68, att: 0.12 });
      chuong(2600, 0.22, 0.04, 0.1);
      chuong(3300, 0.18, 0.03, 0.26);
      chuong(2100, 0.24, 0.03, 0.42);
    },
    // tiếng nước: sóng vỗ vào mạn thuyền + vài bọt "ục" nổi lên
    nuoc: () => {
      rat(1.1, { loc: "lowpass", f: 380, to: 1500, q: 0.8, v: 0.22, att: 0.3 });
      rat(0.7, {
        loc: "bandpass",
        f: 900,
        to: 2400,
        q: 1.2,
        v: 0.1,
        at: 0.08,
        att: 0.2,
      });
      for (let i = 0; i < 6; i++) {
        const f = giua(260, 620);
        tieng(f, 0.1, {
          v: 0.07,
          to: f * giua(1.6, 2.2),
          at: 0.05 + i * giua(0.09, 0.17),
          att: 0.01,
        });
      }
      rat(0.5, {
        loc: "lowpass",
        f: 600,
        to: 250,
        q: 0.7,
        v: 0.12,
        at: 0.55,
        att: 0.1,
      });
    },
    // cô gái cười khẽ: phát ngẫu nhiên 1 trong các đoạn ngắn cắt từ file ghi âm thật (public/audio/co-gai-cuoi-N.mp3)
    cuoi: () => {
      const a = new Audio(`/audio/co-gai-cuoi-${1 + Math.floor(R() * 4)}.mp3`);
      a.volume = 0.85;
      a.play().catch(() => {});
    },
    // chuyển cảnh: gió lướt + lá xào xạc
    vut: () => {
      rat(1.4, {
        loc: "bandpass",
        f: 300,
        to: 2600,
        q: 0.8,
        v: 0.32,
        att: 0.55,
      });
      for (let i = 0; i < 12; i++)
        rat(0.06, {
          loc: "highpass",
          f: giua(3500, 6000),
          v: 0.05,
          at: giua(0, 1.2),
        });
    },
  };

  // ---------- tiếng đời sống rời rạc theo từng trang ----------
  const DOI = {
    chim: () => {
      const f = giua(2600, 4200);
      for (let i = 0, n = 3 + Math.floor(R() * 3); i < n; i++)
        tieng(f * giua(0.9, 1.1), 0.07, {
          v: 0.022,
          to: f * giua(1.2, 1.5),
          at: i * 0.1,
        });
    },
    xeDap: () => {
      chuong(2900, 0.7, 0.03);
      chuong(2900, 0.7, 0.03, 0.14);
    },
    coi: () => {
      tieng(430, 0.13, { type: "square", v: 0.03, lp: 1500 });
      tieng(430, 0.13, { type: "square", v: 0.03, lp: 1500, at: 0.2 });
    },
    // xe máy chạy ngang: động cơ nổ "bành bạch" lớn dần rồi nhỏ dần
    xeMay: () => {
      const d = giua(2.6, 3.4),
        t = ctx.currentTime;
      const os = ctx.createOscillator(),
        lp = ctx.createBiquadFilter(),
        tr = ctx.createGain(),
        g = ctx.createGain();
      const lfo = ctx.createOscillator(),
        lg = ctx.createGain();
      os.type = "sawtooth";
      os.frequency.setValueAtTime(68, t);
      os.frequency.linearRampToValueAtTime(92, t + d * 0.45);
      os.frequency.linearRampToValueAtTime(60, t + d);
      lp.type = "lowpass";
      lp.frequency.value = 380;
      tr.gain.value = 0.6;
      lfo.frequency.value = giua(13, 18);
      lg.gain.value = 0.4;
      lfo.connect(lg).connect(tr.gain);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.07, t + d * 0.45);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      os.connect(lp).connect(tr).connect(g).connect(tong);
      os.start(t);
      lfo.start(t);
      os.stop(t + d + 0.05);
      lfo.stop(t + d + 0.05);
      if (R() < 0.4)
        setTimeout(() => bat && ctx.state === "running" && DOI.coi(), d * 450);
    },
  };
  // nền chỉ có ở trang phố (home); các trang khác không có tiếng nền
  const LICH = {
    pho: [
      [DOI.chim, 5, 11],
      [DOI.xeMay, 9, 18],
      [DOI.xeDap, 20, 35],
    ],
  };
  function lap(fn, a, b) {
    const chay = () =>
      setTimeout(
        () => {
          if (bat && ctx && ctx.state === "running" && !document.hidden) fn();
          chay();
        },
        giua(a, b) * 1000,
      );
    chay();
  }

  // ---------- khởi động ----------
  function khoiDong() {
    if (!AC) return;
    if (!ctx) {
      ctx = new AC();
      // bộ nén để nhiều tiếng chồng nhau không bị vỡ
      const nen = ctx.createDynamicsCompressor();
      tong = ctx.createGain();
      tong.gain.value = bat ? 0.9 : 0;
      tong.connect(nen).connect(ctx.destination);
      buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const x = buf.getChannelData(0);
      for (let i = 0; i < x.length; i++) x[i] = R() * 2 - 1;
      (LICH[kieu] || []).forEach(([fn, a, b]) => lap(fn, a, b));
      // một tiếng chào nhỏ ngay khi vào trang để biết âm thanh đã bật
      setTimeout(
        () =>
          bat && ctx.state === "running" && LICH[kieu] && LICH[kieu][0][0](),
        700,
      );
    }
    if (ctx.state === "suspended") ctx.resume();
  }
  const hien = () => nutAm && (nutAm.textContent = bat ? "🔊" : "🔇");
  const phat = (t) => {
    if (bat && ctx && ctx.state !== "closed" && SFX[t]) SFX[t]();
  };

  addEventListener("pointerdown", khoiDong); // chỉ để mở âm thanh sau lần bấm đầu tiên (không phát tiếng bấm nút)
  addEventListener("keydown", khoiDong);
  if (nutAm)
    nutAm.onclick = () => {
      bat = !bat;
      ghi("am", bat ? 1 : 0);
      khoiDong();
      if (tong) tong.gain.setTargetAtTime(bat ? 0.9 : 0, ctx.currentTime, 0.05);
      hien();
    };
  hien();
  return { phat };
})();
