let busy = false;

function start() {
  renderNav("petugas");
  api("/antrian/layanan").then(ls => {
    $("#fl").append(...ls.map(l => h("option", { value: l.id }, l.nama)));
  }).catch(e => showMsg(e.message));
  $("#fl").addEventListener("change", load);
  $("#fs").addEventListener("change", load);
  load();
  setInterval(() => { if (!document.hidden) load(); }, 5000);
}

async function load() {
  if (busy) return; busy = true;
  try {
    const q = new URLSearchParams();
    if ($("#fl").value) q.set("layanan_id", $("#fl").value);
    if ($("#fs").value) q.set("status", $("#fs").value);
    const [ring, list] = await Promise.all([api("/antrian/ringkasan"), api("/antrian?" + q)]);
    renderSummary(ring.per_layanan); renderRows(list); hideMsg();
  } catch (e) { showMsg(e.message); }
  finally { busy = false; }
}

function renderSummary(items) {
  $("#summary").replaceChildren(...items.map(s => h("div", { class: "card stat" },
    h("div", { class: "nm" }, s.layanan),
    h("div", { class: "nums" },
      h("span", {}, h("b", {}, s.menunggu), "menunggu"),
      h("span", {}, h("b", {}, s.dipanggil), "dipanggil"),
      h("span", {}, h("b", {}, s.selesai), "selesai")),
    h("button", { disabled: s.menunggu === 0, onclick: () => panggilBerikutnya(s.layanan_id) }, "Panggil berikutnya"))));
}

const maskNik = n => (n ? "************" + n.slice(-4) : "-");

function renderRows(list) {
  const body = $("#rows");
  if (!list.length) { body.replaceChildren(h("tr", {}, h("td", { colspan: 5, class: "empty" }, "Belum ada antrian"))); return; }
  body.replaceChildren(...list.map(a => {
    const btns = [];
    if (a.status === "menunggu") btns.push(btn("Panggil", a.id, "panggil"));
    if (a.status === "dipanggil") btns.push(btn("Panggil ulang", a.id, "panggil", "sec"), btn("Selesai", a.id, "selesai"));
    if (a.status === "menunggu" || a.status === "dipanggil") btns.push(btn("Batal", a.id, "batal", "red"));
    return h("tr", {},
      h("td", {}, h("b", {}, a.no_antrian)),
      h("td", {}, a.nama_pasien, h("br"), h("small", {}, "NIK " + maskNik(a.nik))),
      h("td", {}, a.layanan), h("td", {}, badge(a.status)), h("td", { class: "act" }, ...btns));
  }));
}

const btn = (label, id, aksi, cls = "") =>
  h("button", { class: "sm " + cls, onclick: () => aksiAntrian(id, aksi) }, label);

async function aksiAntrian(id, aksi) {
  if (aksi === "batal" && !confirm("Batalkan antrian ini?")) return;
  try { await api(`/antrian/${id}/${aksi}`, { method: "POST" }); } catch (e) { showMsg(e.message); }
  busy = false; load();
}

async function panggilBerikutnya(layananId) {
  try {
    const list = await api(`/antrian?layanan_id=${layananId}&status=menunggu`);
    if (!list.length) return showMsg("Tidak ada antrian yang menunggu");
    await api(`/antrian/${list[0].id}/panggil`, { method: "POST" });
  } catch (e) { showMsg(e.message); }
  busy = false; load();
}
if (Auth.require(["admin", "petugas"])) start();
