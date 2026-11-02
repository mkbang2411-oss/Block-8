// ===== Khung chi tiết bên phải (admin + danh sách món): chỉ nút Đóng (×) =====
// Sửa / Xóa là link sang trang riêng do server dựng (/:id/edit, /:id/delete), không dùng popup hay fetch.
(() => {
  const chia = $("#chia");
  if (!chia) return;

  // Nhớ URL danh sách (đúng trang) để Hủy / sau khi lưu quay về đúng chỗ, không rơi về trang 1
  const kd = "ds-admin:" + (location.pathname.split("/")[2] || "");
  const u0 = new URL(location.href);
  const nho = () => {
    const u = new URL(location.href);
    u.searchParams.delete("sel");
    u.searchParams.delete("success");
    try {
      sessionStorage.setItem(kd, u.pathname + u.search);
    } catch (e) {}
  };
  if (location.pathname.startsWith("/admin")) {
    // vừa sửa xong: server đưa về /admin/xxx?sel=ID mà không biết trang -> nếu món chưa hiện thì chuyển về trang đã nhớ
    try {
      const luu = sessionStorage.getItem(kd);
      if (
        luu &&
        u0.searchParams.get("sel") &&
        !u0.searchParams.get("page") &&
        !chia.querySelector(".o.chon")
      ) {
        const v = new URL(luu, location.href);
        if (
          v.searchParams.get("page") &&
          chia.querySelector(".o") &&
          v.pathname === u0.pathname
        ) {
          ["sel", "success"].forEach(
            (k) =>
              u0.searchParams.get(k) &&
              v.searchParams.set(k, u0.searchParams.get(k)),
          );
          return location.replace(v.pathname + v.search);
        }
      }
    } catch (e) {}
    nho();
  }

  chia.addEventListener("click", (e) => {
    if (!e.target.closest('[data-a="dong"]')) return;
    chia.classList.remove("co-chon");
    chia.querySelectorAll(".o.chon").forEach((o) => o.classList.remove("chon"));
    // chờ khung thu lại xong mới ẩn nội dung cho mượt
    setTimeout(() => {
      if (chia.classList.contains("co-chon")) return;
      chia.querySelectorAll(".ct").forEach((s) => (s.hidden = true));
    }, 600);
    // bỏ ?sel= khỏi thanh địa chỉ
    const u = new URL(location.href);
    u.searchParams.delete("sel");
    history.replaceState(null, "", u);
  });
})();
