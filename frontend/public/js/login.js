renderNav("login");

if (new URLSearchParams(location.search).get("expired")) {
  showMsg("Sesi Anda telah berakhir, silakan login kembali.");
}
if (Auth.token) {
  location.href = Auth.role === "admin" ? "admin.html" : "petugas.html";
}

function togglePasswordVisibility() {
  const pwInput = $("#pw");
  const icon = $("#pwToggleIcon");
  if (!pwInput || !icon) return;
  if (pwInput.type === "password") {
    pwInput.type = "text";
    icon.textContent = "visibility_off";
  } else {
    pwInput.type = "password";
    icon.textContent = "visibility";
  }
}

function handleForgotPassword(e) {
  if (e) e.preventDefault();
  const modal = $("#resetModal");
  if (modal) modal.classList.remove("hidden");
}

function closeForgotModal() {
  const modal = $("#resetModal");
  if (modal) modal.classList.add("hidden");
}

const form = $("#form");
if (form) {
  form.addEventListener("submit", async e => {
    e.preventDefault();
    hideMsg();
    const btn = $("#btn");
    const btnText = $("#btn-text");
    const btnSpinner = $("#btn-spinner");
    const btnIcon = $("#btn-icon");

    if (btn) btn.disabled = true;
    if (btnText) btnText.textContent = "Memverifikasi Kredensial...";
    if (btnSpinner) btnSpinner.classList.remove("hidden");
    if (btnIcon) btnIcon.classList.add("hidden");

    try {
      const email = $("#email").value.trim();
      const password = $("#pw").value;
      const d = await api("/auth/login", {
        method: "POST",
        body: { email, password }
      });
      Auth.save(d);
      if (btnText) btnText.textContent = "Autentikasi Berhasil! Mengalihkan...";
      setTimeout(() => {
        location.href = d.role === "admin" ? "admin.html" : "petugas.html";
      }, 500);
    } catch (err) {
      showMsg(err.message);
      if (btn) btn.disabled = false;
      if (btnText) btnText.textContent = "Masuk ke Dashboard";
      if (btnSpinner) btnSpinner.classList.add("hidden");
      if (btnIcon) btnIcon.classList.remove("hidden");
    }
  });
}
