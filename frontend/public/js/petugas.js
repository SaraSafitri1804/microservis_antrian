let busy = false;
let currentList = [];

function start() {
  renderNav("petugas");
  api("/antrian/layanan").then(ls => {
    const fl = $("#fl");
    if (fl) {
      fl.replaceChildren(
        h("option", { value: "" }, "Semua Layanan"),
        ...ls.map(l => h("option", { value: l.id }, l.nama))
      );
    }
  }).catch(e => showMsg(e.message));

  const fl = $("#fl");
  if (fl) fl.addEventListener("change", load);
  const fs = $("#fs");
  if (fs) fs.addEventListener("change", load);

  const searchInput = $("#patientSearch");
  if (searchInput) {
    searchInput.addEventListener("input", filterClientRows);
  }

  const callNextBtn = $("#btnCallNext");
  if (callNextBtn) {
    callNextBtn.addEventListener("click", () => {
      const flVal = $("#fl") ? $("#fl").value : "";
      panggilBerikutnya(flVal || undefined);
    });
  }

  load();
  setInterval(() => { if (!document.hidden) load(); }, 5000);
}

async function load() {
  if (busy) return;
  busy = true;
  try {
    const q = new URLSearchParams();
    const flVal = $("#fl") ? $("#fl").value : "";
    const fsVal = $("#fs") ? $("#fs").value : "";
    if (flVal && flVal !== "Semua") q.set("layanan_id", flVal);
    if (fsVal && fsVal !== "Semua") q.set("status", fsVal);

    const [ring, list] = await Promise.all([
      api("/antrian/ringkasan"),
      api("/antrian?" + q)
    ]);
    currentList = list;
    renderSummary(ring.per_layanan);
    renderRows(list);
    hideMsg();
  } catch (e) {
    showMsg(e.message);
  } finally {
    busy = false;
  }
}

function renderSummary(items) {
  let totMenunggu = 0, totDipanggil = 0, totSelesai = 0, totBatal = 0;
  items.forEach(s => {
    totMenunggu += s.menunggu;
    totDipanggil += s.dipanggil;
    totSelesai += s.selesai;
    totBatal += (s.batal || 0);
  });
  const totalPasien = totMenunggu + totDipanggil + totSelesai + totBatal;

  const mTot = $("#metricTotal"); if (mTot) mTot.textContent = totalPasien;
  const mWait = $("#metricWaiting"); if (mWait) mWait.textContent = totMenunggu;
  const mActive = $("#metricActive"); if (mActive) mActive.textContent = totDipanggil;
  const mDone = $("#metricDone"); if (mDone) mDone.textContent = totSelesai;

  const summaryContainer = $("#summaryCards");
  if (!summaryContainer) return;

  summaryContainer.replaceChildren(...items.map(s => {
    const card = h("div", {
      class: "bg-surface-container-lowest p-5 rounded-2xl shadow-sm flex flex-col justify-between border border-outline-variant/20 hover:shadow-md transition-shadow"
    },
      h("div", { class: "flex items-start justify-between mb-3" },
        h("div", { class: "flex flex-col" },
          h("span", { class: "text-xs font-bold text-primary truncate max-w-[170px]" }, s.layanan),
          h("span", { class: "text-2xl font-extrabold text-on-surface mt-1" }, s.menunggu + s.dipanggil + s.selesai)
        ),
        h("span", { class: "text-[10px] px-2 py-0.5 rounded-full bg-surface-container text-outline uppercase font-semibold" }, "Hari Ini")
      ),
      h("div", { class: "grid grid-cols-3 gap-1 bg-surface-container-low p-2 rounded-xl text-center text-xs mb-3" },
        h("div", {}, h("div", { class: "font-bold text-amber-700" }, s.menunggu), h("div", { class: "text-[10px] text-outline" }, "Menunggu")),
        h("div", {}, h("div", { class: "font-bold text-teal-700" }, s.dipanggil), h("div", { class: "text-[10px] text-outline" }, "Dipanggil")),
        h("div", {}, h("div", { class: "font-bold text-emerald-700" }, s.selesai), h("div", { class: "text-[10px] text-outline" }, "Selesai"))
      ),
      h("button", {
        disabled: s.menunggu === 0,
        class: "w-full py-2 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer " +
          (s.menunggu > 0
            ? "bg-primary text-on-primary hover:bg-primary-container shadow-xs"
            : "bg-surface-container text-outline opacity-60 cursor-not-allowed"),
        onclick: () => panggilBerikutnya(s.layanan_id)
      },
        h("span", { class: "material-symbols-outlined text-[16px]" }, "volume_up"),
        h("span", {}, "Panggil Berikutnya")
      )
    );
    return card;
  }));
}

const maskNik = n => (n ? "••••••••••••" + n.slice(-4) : "-");

function renderRows(list) {
  const body = $("#rows");
  const countEl = $("#tableRecordCount");
  if (countEl) countEl.textContent = `Menampilkan ${list.length} Antrian`;

  if (!list.length) {
    body.replaceChildren(
      h("tr", {},
        h("td", { colspan: 6, class: "text-center py-10 text-outline text-xs italic" },
          "Belum ada antrian yang sesuai dengan filter"
        )
      )
    );
    return;
  }

  body.replaceChildren(...list.map(a => {
    const initials = a.nama_pasien.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
    const btns = [];

    if (a.status === "menunggu") {
      btns.push(
        h("button", {
          class: "px-3 py-1.5 rounded-lg bg-primary hover:bg-primary-container text-on-primary text-xs font-semibold flex items-center gap-1 shadow-xs cursor-pointer transition-colors",
          onclick: () => aksiAntrian(a.id, "panggil")
        },
          h("span", { class: "material-symbols-outlined text-[16px]" }, "volume_up"),
          h("span", {}, "Panggil")
        )
      );
    }

    if (a.status === "dipanggil") {
      btns.push(
        h("button", {
          class: "px-2.5 py-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high text-primary text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer",
          onclick: () => aksiAntrian(a.id, "panggil"),
          title: "Panggil Ulang Suara"
        },
          h("span", { class: "material-symbols-outlined text-[16px]" }, "replay"),
          h("span", {}, "Ulang")
        ),
        h("button", {
          class: "px-3 py-1.5 rounded-lg bg-secondary hover:opacity-90 text-on-secondary text-xs font-semibold flex items-center gap-1 shadow-xs transition-colors cursor-pointer",
          onclick: () => aksiAntrian(a.id, "selesai")
        },
          h("span", { class: "material-symbols-outlined text-[16px]" }, "check"),
          h("span", {}, "Selesai")
        )
      );
    }

    if (a.status === "menunggu" || a.status === "dipanggil") {
      btns.push(
        h("button", {
          class: "p-1.5 rounded-lg text-error hover:bg-error-container/40 transition-colors cursor-pointer",
          onclick: () => aksiAntrian(a.id, "batal"),
          title: "Batalkan Antrian"
        },
          h("span", { class: "material-symbols-outlined text-[18px]" }, "close")
        )
      );
    }

    const createdTime = a.created_at ? new Date(a.created_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) + " WIB" : "-";

    return h("tr", { class: "hover:bg-surface-container-low/50 transition-colors border-b border-surface-container" },
      // 1. Nomor Antrian
      h("td", { class: "py-3.5 px-4 font-mono font-extrabold text-primary text-sm" },
        h("span", { class: "px-2.5 py-1 rounded-lg bg-primary/10 border border-primary/20" }, a.no_antrian)
      ),
      // 2. Pasien Profile
      h("td", { class: "py-3.5 px-4" },
        h("div", { class: "flex items-center gap-2.5" },
          h("div", { class: "w-8 h-8 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center shrink-0" }, initials),
          h("div", { class: "flex flex-col min-w-0" },
            h("span", { class: "font-semibold text-xs text-on-surface truncate" }, a.nama_pasien),
            h("span", { class: "text-[11px] text-outline font-mono" }, "NIK: " + maskNik(a.nik))
          )
        )
      ),
      // 3. Layanan
      h("td", { class: "py-3.5 px-4 text-xs text-on-surface-variant font-medium" }, a.layanan),
      // 4. Kedatangan
      h("td", { class: "py-3.5 px-4 text-xs text-outline font-mono" }, createdTime),
      // 5. Status Badge
      h("td", { class: "py-3.5 px-4 text-center" }, badge(a.status)),
      // 6. Aksi Interaktif
      h("td", { class: "py-3.5 px-4 text-right" },
        h("div", { class: "inline-flex items-center gap-1.5 justify-end" }, ...btns)
      )
    );
  }));
}

function filterClientRows() {
  const query = $("#patientSearch").value.trim().toLowerCase();
  if (!query) {
    renderRows(currentList);
    return;
  }
  const filtered = currentList.filter(a =>
    a.nama_pasien.toLowerCase().includes(query) ||
    a.no_antrian.toLowerCase().includes(query) ||
    (a.nik && a.nik.includes(query))
  );
  renderRows(filtered);
}

function clearSearch() {
  const input = $("#patientSearch");
  if (input) {
    input.value = "";
    renderRows(currentList);
  }
}

async function aksiAntrian(id, aksi) {
  if (aksi === "batal" && !confirm("Yakin ingin membatalkan nomor antrian ini?")) return;
  try {
    await api(`/antrian/${id}/${aksi}`, { method: "POST" });
    showMsg(`Antrian berhasil di-${aksi}`, "ok");
  } catch (e) {
    showMsg(e.message);
  }
  busy = false;
  load();
}

async function panggilBerikutnya(layananId) {
  try {
    const url = layananId ? `/antrian?layanan_id=${layananId}&status=menunggu` : `/antrian?status=menunggu`;
    const list = await api(url);
    if (!list.length) return showMsg("Tidak ada antrian yang sedang menunggu.");
    await api(`/antrian/${list[0].id}/panggil`, { method: "POST" });
    showMsg(`Nomor ${list[0].no_antrian} berhasil dipanggil!`, "ok");
  } catch (e) {
    showMsg(e.message);
  }
  busy = false;
  load();
}

if (Auth.require(["admin", "petugas"])) start();
