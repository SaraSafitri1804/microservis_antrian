renderNav("index");

let layanan = [], pollTimer = null;
const form = $("#form"), ticket = $("#ticket"), infoCard = $("#infoCard");

async function init() {
  try {
    layanan = await api("/antrian/layanan");
    const select = $("#layanan");
    select.replaceChildren(
      h("option", { value: "", disabled: true, selected: true }, "-- Pilih Layanan Posyandu --"),
      ...layanan.map(l => h("option", { value: l.id }, `${l.nama} (${l.tipe === "balita" ? "Balita & Imunisasi" : l.tipe === "ibu_hamil" ? "Ibu Hamil" : "Umum"})`))
    );
    toggleLahir();
    const lahirInput = $("#lahir");
    if (lahirInput) lahirInput.max = todayLocal();

    // Sisa Kuota / Active queues
    updateQueueStats();

    const saved = localStorage.getItem("tiket");
    if (saved) await poll(saved, true);
  } catch (e) {
    showMsg(e.message);
  }
}

async function updateQueueStats() {
  try {
    const ring = await api("/antrian/ringkasan");
    const totalMenunggu = ring.per_layanan.reduce((sum, s) => sum + s.menunggu, 0);
    const badgeEl = $("#quotaBadge");
    if (badgeEl) badgeEl.textContent = `${totalMenunggu} Antrian Menunggu`;
  } catch {
    // optional widget
  }
}

function toggleLahir() {
  const select = $("#layanan");
  const lahirBox = $("#lahirBox");
  if (!select || !lahirBox) return;
  const l = layanan.find(x => x.id == select.value);
  lahirBox.classList.toggle("hidden", !(l && l.tipe === "balita"));
}

$("#layanan").addEventListener("change", toggleLahir);

const nikInput = $("#nik");
if (nikInput) {
  nikInput.addEventListener("input", e => {
    const counter = $("#nikCounter");
    if (counter) counter.textContent = `${e.target.value.length}/16 Digit`;
  });
}

form.addEventListener("submit", async e => {
  e.preventDefault();
  hideMsg();
  const nik = $("#nik").value.trim();
  const lahir = $("#lahir") ? $("#lahir").value : "";
  const nama = $("#nama").value.trim();
  const layananId = $("#layanan").value;

  if (!layananId) return showMsg("Silakan pilih layanan posyandu terlebih dahulu");
  if (!nama) return showMsg("Nama pasien / balita wajib diisi");
  if (nik && !/^\d{16}$/.test(nik)) return showMsg("NIK harus 16 digit angka valid");

  const l = layanan.find(x => x.id == layananId);
  if (!l) return showMsg("Layanan tidak valid");
  if (l.tipe === "balita" && !lahir) return showMsg("Tanggal lahir balita wajib diisi");

  const body = { layanan_id: l.id, nama_pasien: nama };
  if (nik) body.nik = nik;
  if (l.tipe === "balita") body.tanggal_lahir = lahir;

  const btn = $("#btn");
  if (btn) btn.disabled = true;

  try {
    const t = await api("/antrian", { method: "POST", body });
    localStorage.setItem("tiket", t.id);
    localStorage.setItem("tiket_nama", nama);
    showTicket(t, nama);
  } catch (err) {
    showMsg(err.message);
  } finally {
    if (btn) btn.disabled = false;
  }
});

function showTicket(t, nama) {
  form.classList.add("hidden");
  ticket.classList.remove("hidden");
  if (infoCard) infoCard.classList.add("hidden");

  $("#tNo").textContent = t.no_antrian;
  $("#tLay").textContent = t.layanan;

  const tNama = $("#tNama");
  if (tNama) {
    const savedNama = nama || localStorage.getItem("tiket_nama") || "-";
    tNama.textContent = savedNama;
  }

  const tJam = $("#tJam");
  if (tJam) {
    tJam.textContent = `Hari ini, ${new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })} WIB`;
  }

  const s = $("#tStatus");
  if (t.status === "menunggu") {
    s.textContent = t.menunggu_di_depan === 0
      ? "Anda berikutnya. Mohon bersiap di dekat ruang pemeriksaan."
      : `± ${t.menunggu_di_depan * 5} Menit (${t.menunggu_di_depan} antrian di depan Anda)`;
  } else if (t.status === "dipanggil") {
    s.textContent = "Nomor Anda sedang dipanggil! Silakan segera menuju loket/meja pelayanan.";
  } else if (t.status === "selesai") {
    s.textContent = "Pelayanan selesai. Terima kasih telah berkunjung ke Posyandu.";
  } else {
    s.textContent = "Antrian telah dibatalkan.";
  }

  clearTimeout(pollTimer);
  if (t.status === "menunggu" || t.status === "dipanggil") {
    pollTimer = setTimeout(() => poll(t.id), 5000);
  }
}

async function poll(id, first = false) {
  try {
    const t = await api("/antrian/" + id);
    showTicket(t);
  } catch (e) {
    if (e.status === 404 || first) {
      localStorage.removeItem("tiket");
      localStorage.removeItem("tiket_nama");
      resetForm();
    } else {
      pollTimer = setTimeout(() => poll(id), 8000);
    }
  }
}

function resetForm() {
  clearTimeout(pollTimer);
  localStorage.removeItem("tiket");
  localStorage.removeItem("tiket_nama");
  ticket.classList.add("hidden");
  form.classList.remove("hidden");
  if (infoCard) infoCard.classList.remove("hidden");
  form.reset();
  toggleLahir();
  const counter = $("#nikCounter");
  if (counter) counter.textContent = "0/16 Digit";
  updateQueueStats();
}

const againBtn = $("#again");
if (againBtn) againBtn.addEventListener("click", resetForm);

init();
