let rows = [];

function start() {
  renderNav("admin");
  $("#tgl").value = todayLocal();
  $("#tgl").addEventListener("change", load);
  $("#csv").addEventListener("click", downloadCsv);
  $("#reg").addEventListener("submit", tambahAkun);
  load();
  loadStatistik();
}

const jam = iso => (iso ? new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) : "-");

async function load() {
  const t = $("#tgl").value || todayLocal();
  try {
    const [ring, list] = await Promise.all([api("/antrian/ringkasan?tanggal=" + t), api("/antrian?tanggal=" + t + "&limit=500")]);
    rows = list; hideMsg();
    const tot = { menunggu: 0, dipanggil: 0, selesai: 0, batal: 0, total: 0 };
    const trs = ring.per_layanan.map(s => {
      for (const k in tot) tot[k] += s[k];
      return h("tr", {}, h("td", {}, s.layanan), ...["menunggu", "dipanggil", "selesai", "batal", "total"].map(k => h("td", {}, s[k])));
    });
    trs.push(h("tr", {}, h("td", {}, h("b", {}, "Semua")), ...["menunggu", "dipanggil", "selesai", "batal", "total"].map(k => h("td", {}, h("b", {}, tot[k])))));
    $("#sum").replaceChildren(...trs);
    $("#rep").replaceChildren(...(list.length ? list.map(a => h("tr", {},
      h("td", {}, h("b", {}, a.no_antrian)), h("td", {}, a.nama_pasien), h("td", {}, a.layanan),
      h("td", {}, badge(a.status)), h("td", {}, jam(a.created_at)), h("td", {}, jam(a.dipanggil_at)), h("td", {}, jam(a.selesai_at))))
      : [h("tr", {}, h("td", { colspan: 7, class: "empty" }, "Tidak ada data pada tanggal ini"))]));
  } catch (e) { showMsg(e.message); }
}

// Sel yang diawali = + - @ diberi tanda ' supaya tidak dibaca sebagai rumus di Excel
const cell = v => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
};

function downloadCsv() {
  if (!rows.length) return showMsg("Tidak ada data untuk diunduh");
  const head = ["No Antrian", "Nama", "Layanan", "Status", "Tanggal", "Dipanggil", "Selesai"];
  const lines = [head.map(cell).join(",")].concat(rows.map(a =>
    [a.no_antrian, a.nama_pasien, a.layanan, a.status, a.tanggal, a.dipanggil_at, a.selesai_at].map(cell).join(",")));
  const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = h("a", { href: URL.createObjectURL(blob), download: "laporan-antrian-" + $("#tgl").value + ".csv" });
  document.body.append(a); a.click(); a.remove();
}

async function tambahAkun(e) {
  e.preventDefault(); hideMsg();
  if ($("#rp").value.length < 8) return showMsg("Password minimal 8 karakter");
  try {
    await api("/auth/register", { method: "POST", body: {
      name: $("#rn").value.trim(), email: $("#re").value.trim(), password: $("#rp").value, role: $("#rr").value } });
    $("#reg").reset(); showMsg("Akun berhasil ditambahkan", "ok");
  } catch (err) { showMsg(err.message); }
}
const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

async function loadStatistik() {
  try {
    const d = await api("/pasien/statistik");
    const kartu = (n, label) => h("div", { class: "card stat" }, h("div", { class: "num" }, n), h("div", {}, label));
    $("#stat").replaceChildren(kartu(d.total_balita, "Balita terdaftar"), kartu(d.total_ibu_hamil, "Ibu hamil terdaftar"),
      kartu(d.kunjungan_hari_ini, "Kunjungan hari ini"), kartu(d.total_kunjungan, "Total kunjungan"));
    const max = Math.max(1, ...d.balita_per_umur.map(x => x.jumlah));
    $("#umur").replaceChildren(...d.balita_per_umur.map(x => {
      const isi = h("i"); isi.style.width = (x.jumlah / max * 100) + "%";
      return h("div", { class: "barrow" }, h("span", {}, x.kelompok), h("div", { class: "bar" }, isi), h("b", {}, x.jumlah));
    }));
    $("#bulan").replaceChildren(...d.kunjungan_per_bulan.map(b => h("tr", {},
      h("td", {}, BULAN[+b.bulan.slice(5) - 1] + " " + b.bulan.slice(0, 4)), h("td", {}, b.balita), h("td", {}, b.ibu_hamil), h("td", {}, b.umum))));
  } catch (e) { showMsg("Statistik: " + e.message); }
}

if (Auth.require(["admin"])) start();
