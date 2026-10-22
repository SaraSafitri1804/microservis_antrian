let timer = null;

function umur(bulan) {
  if (bulan == null) return "-";
  return bulan < 12 ? bulan + " bln" : Math.floor(bulan / 12) + " thn " + (bulan % 12) + " bln";
}

const maskNik = n => (n ? "••••••••••••" + n.slice(-4) : "-");

function setJenisFilter(val, btn) {
  const select = $("#jenis");
  if (select) select.value = val;

  const tabs = document.querySelectorAll(".filter-tab");
  tabs.forEach(t => {
    t.classList.remove("bg-surface-container-lowest", "text-primary", "shadow-xs");
    t.classList.add("text-on-surface-variant");
  });
  if (btn) {
    btn.classList.add("bg-surface-container-lowest", "text-primary", "shadow-xs");
    btn.classList.remove("text-on-surface-variant");
  }
  load();
}

async function load() {
  try {
    const qVal = $("#q") ? $("#q").value.trim() : "";
    const q = encodeURIComponent(qVal);
    const jenis = $("#jenis") ? $("#jenis").value : "balita";

    const list = await api(`/pasien/${jenis}?q=${q}`);
    hideMsg();

    const countMetric = $("#totalCountMetric");
    if (countMetric) countMetric.textContent = list.length;

    const body = $("#rows");
    if (!list.length) {
      body.replaceChildren(
        h("tr", {},
          h("td", { colspan: 5, class: "text-center py-10 text-outline text-xs italic" },
            `Belum ada data ${jenis === "balita" ? "balita" : "ibu hamil"} yang sesuai pencarian.`
          )
        )
      );
      return;
    }

    body.replaceChildren(...list.map(p => {
      const initials = p.nama.split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
      const isBalita = jenis === "balita";

      return h("tr", { class: "hover:bg-surface-container-low/50 transition-colors border-b border-surface-container" },
        // 1. Nama Pasien & Profil
        h("td", { class: "py-3.5 px-6" },
          h("div", { class: "flex items-center gap-3" },
            h("div", {
              class: "w-9 h-9 rounded-full " + (isBalita ? "bg-primary/10 text-primary" : "bg-secondary/10 text-secondary") +
                " font-bold text-xs flex items-center justify-center shrink-0"
            }, initials),
            h("div", { class: "flex flex-col min-w-0" },
              h("div", { class: "flex items-center gap-2" },
                h("span", { class: "font-semibold text-xs text-on-surface truncate" }, p.nama),
                h("span", {
                  class: "px-1.5 py-0.5 rounded text-[10px] font-bold " + (isBalita ? "bg-primary-container text-on-primary-container" : "bg-secondary-container text-on-secondary-container")
                }, isBalita ? "Balita" : "Bumil")
              ),
              h("span", { class: "text-[11px] text-outline" }, isBalita ? "Buku KIA / KMS" : "ANC Terpadu")
            )
          )
        ),
        // 2. Umur / Gestasi
        h("td", { class: "py-3.5 px-4 text-xs font-medium text-on-surface" }, umur(p.umur_bulan)),
        // 3. NIK
        h("td", { class: "py-3.5 px-4 text-xs font-mono text-outline bg-surface-container-low/50 rounded-lg" }, maskNik(p.nik)),
        // 4. Kunjungan
        h("td", { class: "py-3.5 px-4 text-xs text-center" },
          h("span", { class: "px-2.5 py-1 rounded-full bg-surface-container text-primary font-bold text-xs" },
            `${p.jumlah_kunjungan} kali`
          )
        ),
        // 5. Aksi
        h("td", { class: "py-3.5 px-6 text-right" },
          h("span", { class: "inline-flex items-center gap-1 text-[11px] font-semibold text-secondary bg-secondary-container/20 px-2.5 py-1 rounded-lg" },
            h("span", { class: "material-symbols-outlined text-[14px]" }, "verified"),
            h("span", {}, "Tercatat KMS")
          )
        )
      );
    }));
  } catch (e) {
    showMsg(e.message);
  }
}

function start() {
  renderNav("pasien");

  const jenisSelect = $("#jenis");
  if (jenisSelect) jenisSelect.addEventListener("change", load);

  const qInput = $("#q");
  if (qInput) {
    qInput.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(load, 300);
    });
  }

  load();
}

if (Auth.require(["admin", "petugas"])) start();
