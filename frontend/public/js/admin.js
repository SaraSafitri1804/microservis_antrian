let rows = [];

function start() {
  renderNav("admin");
  const tglInput = $("#tgl");
  if (tglInput) {
    tglInput.value = todayLocal();
    tglInput.addEventListener("change", load);
  }
  const csvBtn = $("#csv");
  if (csvBtn) csvBtn.addEventListener("click", downloadCsv);

  const regForm = $("#reg");
  if (regForm) regForm.addEventListener("submit", tambahAkun);

  load();
  loadStatistik();
}

const jam = iso => (iso ? new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) + " WIB" : "-");

async function load() {
  const tglEl = $("#tgl");
  const t = (tglEl && tglEl.value) || todayLocal();
  try {
    const [ring, list] = await Promise.all([
      api("/antrian/ringkasan?tanggal=" + t),
      api("/antrian?tanggal=" + t + "&limit=500")
    ]);
    rows = list;
    hideMsg();

    // Summary table (#sum)
    const tot = { menunggu: 0, dipanggil: 0, selesai: 0, batal: 0, total: 0 };
    const trs = ring.per_layanan.map(s => {
      for (const k in tot) tot[k] += (s[k] || 0);
      return h("tr", { class: "hover:bg-surface-container-low/50 transition-colors border-b border-surface-container" },
        h("td", { class: "py-3 px-4 font-semibold text-primary flex items-center gap-2" },
          h("span", { class: "material-symbols-outlined text-[18px]" }, "medical_services"),
          s.layanan
        ),
        h("td", { class: "py-3 px-4 text-center" },
          h("span", { class: "px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold text-xs" }, s.menunggu)
        ),
        h("td", { class: "py-3 px-4 text-center" },
          h("span", { class: "px-2 py-0.5 rounded-full bg-teal-100 text-teal-900 font-bold text-xs" }, s.dipanggil)
        ),
        h("td", { class: "py-3 px-4 text-center" },
          h("span", { class: "px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 font-bold text-xs" }, s.selesai)
        ),
        h("td", { class: "py-3 px-4 text-center" },
          h("span", { class: "px-2 py-0.5 rounded-full bg-rose-100 text-rose-900 font-bold text-xs" }, s.batal || 0)
        ),
        h("td", { class: "py-3 px-4 text-right font-extrabold text-on-surface" }, s.total)
      );
    });

    // Total footer row
    trs.push(
      h("tr", { class: "bg-surface-container-high/60 font-bold text-on-surface" },
        h("td", { class: "py-3.5 px-4 font-bold" }, "Total Kunjungan Keseluruhan"),
        h("td", { class: "py-3.5 px-4 text-center text-amber-700" }, tot.menunggu),
        h("td", { class: "py-3.5 px-4 text-center text-teal-700" }, tot.dipanggil),
        h("td", { class: "py-3.5 px-4 text-center text-emerald-700" }, tot.selesai),
        h("td", { class: "py-3.5 px-4 text-center text-rose-700" }, tot.batal),
        h("td", { class: "py-3.5 px-4 text-right text-primary text-base font-extrabold" }, tot.total)
      )
    );
    const sumTable = $("#sum");
    if (sumTable) sumTable.replaceChildren(...trs);

    // Detailed Report table (#rep)
    const repTable = $("#rep");
    if (repTable) {
      repTable.replaceChildren(...(list.length ? list.map(a =>
        h("tr", { class: "hover:bg-surface-container-low/40 transition-colors border-b border-surface-container" },
          h("td", { class: "py-3 px-4 font-mono font-bold text-primary" }, a.no_antrian),
          h("td", { class: "py-3 px-4 font-semibold text-on-surface" }, a.nama_pasien),
          h("td", { class: "py-3 px-4 text-outline" }, a.layanan),
          h("td", { class: "py-3 px-4 text-center" }, badge(a.status)),
          h("td", { class: "py-3 px-4 text-outline font-mono text-[11px]" }, jam(a.created_at)),
          h("td", { class: "py-3 px-4 text-outline font-mono text-[11px]" }, jam(a.dipanggil_at)),
          h("td", { class: "py-3 px-4 text-on-surface font-semibold font-mono text-[11px]" }, jam(a.selesai_at))
        )
      ) : [
        h("tr", {},
          h("td", { colspan: 7, class: "text-center py-10 text-outline text-xs italic" },
            "Tidak ada transaksi antrian pada tanggal ini"
          )
        )
      ]));
    }
  } catch (e) {
    showMsg(e.message);
  }
}

// Sel yang diawali = + - @ diberi tanda ' supaya tidak dibaca sebagai rumus di Excel
const cell = v => {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return '"' + s.replace(/"/g, '""') + '"';
};

function downloadCsv() {
  if (!rows.length) return showMsg("Tidak ada data antrian untuk diunduh pada tanggal ini.");
  const tgl = $("#tgl") ? $("#tgl").value : todayLocal();
  const head = ["No Antrian", "Nama Pasien", "Layanan", "Status", "Tanggal", "Waktu Daftar", "Waktu Dipanggil", "Waktu Selesai"];
  const lines = [head.map(cell).join(",")].concat(rows.map(a => [
    a.no_antrian, a.nama_pasien, a.layanan, a.status, a.tanggal,
    jam(a.created_at), jam(a.dipanggil_at), jam(a.selesai_at)
  ].map(cell).join(",")));

  const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const a = h("a", { href: URL.createObjectURL(blob), download: `laporan-antrian-posyandu-${tgl}.csv` });
  document.body.append(a);
  a.click();
  a.remove();
}

async function tambahAkun(e) {
  e.preventDefault();
  hideMsg();
  const name = $("#rn").value.trim();
  const email = $("#re").value.trim();
  const password = $("#rp").value;
  const role = $("#rr").value;

  if (password.length < 8) return showMsg("Kata sandi akun minimal 8 karakter");

  try {
    await api("/auth/register", {
      method: "POST",
      body: { name, email, password, role }
    });
    $("#reg").reset();
    showMsg(`Akun ${role} untuk "${name}" berhasil didaftarkan!`, "ok");
  } catch (err) {
    showMsg(err.message);
  }
}

const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

async function loadStatistik() {
  try {
    const d = await api("/pasien/statistik");

    // 4 Key metrics cards
    const statBox = $("#statCards");
    if (statBox) {
      const metricItem = (num, title, icon, colorClass, badgeText) => h("div", {
        class: "bg-surface-container-lowest p-5 rounded-2xl shadow-sm flex flex-col justify-between border border-outline-variant/20 hover:shadow-md transition-shadow"
      },
        h("div", { class: "flex items-start justify-between" },
          h("div", { class: "flex flex-col" },
            h("span", { class: "text-xs text-outline uppercase tracking-wider font-semibold" }, title),
            h("span", { class: "text-3xl font-extrabold text-on-surface mt-1" }, num)
          ),
          h("div", { class: `w-12 h-12 rounded-xl ${colorClass} flex items-center justify-center` },
            h("span", { class: "material-symbols-outlined text-[26px]" }, icon)
          )
        ),
        h("div", { class: "mt-4 pt-2 border-t border-surface-container flex items-center justify-between text-xs text-outline" },
          h("span", { class: "font-semibold text-secondary" }, badgeText),
          h("span", {}, "Posyandu")
        )
      );

      statBox.replaceChildren(
        metricItem(d.total_balita, "Balita Terdaftar", "child_care", "bg-primary/10 text-primary", "Kohort Balita"),
        metricItem(d.total_ibu_hamil, "Ibu Hamil (Bumil)", "pregnant_woman", "bg-secondary/10 text-secondary", "ANC Terpadu"),
        metricItem(d.kunjungan_hari_ini, "Kunjungan Hari Ini", "event_available", "bg-tertiary-fixed text-on-tertiary-fixed", "Realtime"),
        metricItem(d.total_kunjungan, "Total Kunjungan", "history", "bg-primary-container text-on-primary-container", "Kumulatif")
      );
    }

    // Age distribution bars (#umur)
    const umurBox = $("#umurBars");
    if (umurBox) {
      const max = Math.max(1, ...d.balita_per_umur.map(x => x.jumlah));
      const colors = ["bg-primary", "bg-secondary", "bg-tertiary-container", "bg-primary-container"];

      umurBox.replaceChildren(...d.balita_per_umur.map((x, idx) => {
        const pct = Math.round((x.jumlah / (d.total_balita || 1)) * 100);
        const col = colors[idx % colors.length];

        return h("div", { class: "space-y-1.5" },
          h("div", { class: "flex justify-between items-center text-xs" },
            h("span", { class: "font-semibold text-on-surface flex items-center gap-2" },
              h("span", { class: `w-2.5 h-2.5 rounded-full ${col}` }),
              x.kelompok
            ),
            h("span", { class: "font-bold text-on-surface" }, `${x.jumlah} Anak `, h("span", { class: "text-outline font-normal" }, `(${pct}%)`))
          ),
          h("div", { class: "w-full bg-surface-container-low h-3 rounded-full overflow-hidden" },
            h("div", { class: `${col} h-full rounded-full transition-all duration-500`, style: `width: ${(x.jumlah / max) * 100}%` })
          )
        );
      }));
    }

    // Monthly visit table (#bulan)
    const bulanBox = $("#bulan");
    if (bulanBox) {
      bulanBox.replaceChildren(...d.kunjungan_per_bulan.map(b => {
        const blnNum = +b.bulan.slice(5) - 1;
        const year = b.bulan.slice(0, 4);
        return h("tr", { class: "hover:bg-surface-container-low/40 border-b border-surface-container" },
          h("td", { class: "py-3 px-4 font-bold text-xs text-primary" }, `${BULAN[blnNum] || b.bulan} ${year}`),
          h("td", { class: "py-3 px-4 text-xs font-semibold" }, b.balita),
          h("td", { class: "py-3 px-4 text-xs font-semibold" }, b.ibu_hamil),
          h("td", { class: "py-3 px-4 text-xs text-outline" }, b.umum)
        );
      }));
    }
  } catch (e) {
    showMsg("Statistik: " + e.message);
  }
}

if (Auth.require(["admin"])) start();
