renderNav("index");
let layanan = [], pollTimer = null;
const form = $("#form"), ticket = $("#ticket");

async function init() {
  try {
    layanan = await api("/antrian/layanan");
    $("#layanan").replaceChildren(...layanan.map(l => h("option", { value: l.id }, l.nama)));
    toggleLahir();
    $("#lahir").max = todayLocal();
    const saved = localStorage.getItem("tiket");
    if (saved) await poll(saved, true);
  } catch (e) { showMsg(e.message); }
}

function toggleLahir() {
  const l = layanan.find(x => x.id == $("#layanan").value);
  $("#lahirBox").classList.toggle("hidden", !(l && l.tipe === "balita"));
}
$("#layanan").addEventListener("change", toggleLahir);

form.addEventListener("submit", async e => {
  e.preventDefault(); hideMsg();
  const nik = $("#nik").value.trim(), lahir = $("#lahir").value, nama = $("#nama").value.trim();
  if (!nama) return showMsg("Nama wajib diisi");
  if (nik && !/^\d{16}$/.test(nik)) return showMsg("NIK harus 16 digit angka");
  const l = layanan.find(x => x.id == $("#layanan").value);
  if (l.tipe === "balita" && !lahir) return showMsg("Tanggal lahir balita wajib diisi");
  const body = { layanan_id: l.id, nama_pasien: nama };
  if (nik) body.nik = nik;
  if (l.tipe === "balita") body.tanggal_lahir = lahir;
  $("#btn").disabled = true;
  try {
    const t = await api("/antrian", { method: "POST", body });
    localStorage.setItem("tiket", t.id);
    showTicket(t);
  } catch (err) { showMsg(err.message); }
  finally { $("#btn").disabled = false; }
});

function showTicket(t) {
  form.classList.add("hidden"); ticket.classList.remove("hidden");
  $("#tNo").textContent = t.no_antrian;
  $("#tLay").textContent = t.layanan;
  const s = $("#tStatus");
  if (t.status === "menunggu")
    s.textContent = t.menunggu_di_depan === 0 ? "Anda berikutnya. Mohon bersiap."
      : t.menunggu_di_depan + " orang menunggu di depan Anda.";
  else if (t.status === "dipanggil") s.textContent = "Nomor Anda sedang dipanggil. Silakan menuju loket.";
  else if (t.status === "selesai") s.textContent = "Pelayanan selesai. Terima kasih.";
  else s.textContent = "Antrian dibatalkan.";
  clearTimeout(pollTimer);
  if (t.status === "menunggu" || t.status === "dipanggil") pollTimer = setTimeout(() => poll(t.id), 5000);
}

async function poll(id, first = false) {
  try { showTicket(await api("/antrian/" + id)); }
  catch (e) {
    if (e.status === 404 || first) { localStorage.removeItem("tiket"); resetForm(); }
    else pollTimer = setTimeout(() => poll(id), 8000);
  }
}

function resetForm() {
  clearTimeout(pollTimer);
  localStorage.removeItem("tiket");
  ticket.classList.add("hidden"); form.classList.remove("hidden"); form.reset(); toggleLahir();
}
$("#again").addEventListener("click", resetForm);
init();
