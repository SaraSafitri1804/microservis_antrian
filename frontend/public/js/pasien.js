let timer = null;

function umur(bulan) {
  if (bulan == null) return "-";
  return bulan < 12 ? bulan + " bln" : Math.floor(bulan / 12) + " thn " + (bulan % 12) + " bln";
}

async function load() {
  try {
    const q = encodeURIComponent($("#q").value.trim());
    const list = await api(`/pasien/${$("#jenis").value}?q=${q}`);
    hideMsg();
    $("#rows").replaceChildren(...(list.length ? list.map(p => h("tr", {},
      h("td", {}, p.nama), h("td", {}, umur(p.umur_bulan)), h("td", {}, p.nik || "-"), h("td", {}, p.jumlah_kunjungan)))
      : [h("tr", {}, h("td", { colspan: 4, class: "empty" }, "Belum ada data"))]));
  } catch (e) { showMsg(e.message); }
}

function start() {
  renderNav("pasien");
  $("#jenis").addEventListener("change", load);
  $("#q").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(load, 300); });
  load();
}

if (Auth.require(["admin", "petugas"])) start();
