renderNav("login");
if (new URLSearchParams(location.search).get("expired")) showMsg("Sesi berakhir, silakan login lagi.");
if (Auth.token) location.href = Auth.role === "admin" ? "admin.html" : "petugas.html";

$("#form").addEventListener("submit", async e => {
  e.preventDefault(); hideMsg(); $("#btn").disabled = true;
  try {
    const d = await api("/auth/login", { method: "POST", body: { email: $("#email").value.trim(), password: $("#pw").value } });
    Auth.save(d);
    location.href = d.role === "admin" ? "admin.html" : "petugas.html";
  } catch (err) { showMsg(err.message); $("#btn").disabled = false; }
});
