let seen = null, voiceOn = false;

const enableBtn = $("#enable");
if (enableBtn) {
  enableBtn.addEventListener("click", () => {
    voiceOn = true;
    const overlay = $("#overlay");
    if (overlay) overlay.classList.add("hidden");
    speak("Sistem suara antrian diaktifkan");
  });
}

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "id-ID";
  u.rate = 0.9;
  window.speechSynthesis.speak(u);
}

function triggerVoiceCall() {
  const big = $("#big").textContent;
  const lay = $("#lay").textContent;
  if (big && big !== "-") {
    const parts = big.split("-");
    const kode = parts[0] || "";
    const nomor = parts[1] ? parseInt(parts[1], 10) : "";
    speak(`Panggilan ulang. Nomor antrian ${kode} ${nomor}, silakan menuju meja pelayanan ${lay}`);
  }
}

const keyOf = x => x.id + "|" + x.dipanggil_at;

const calledChip = x => h("div", {
  class: "flex items-center justify-between p-2.5 sm:p-3 bg-surface-container-low rounded-xl hover:bg-surface-container transition-colors border border-outline-variant/20"
},
  h("div", { class: "flex items-center gap-3" },
    h("span", { class: "font-mono font-bold text-base text-primary w-16" }, x.no_antrian),
    h("div", { class: "flex flex-col text-left" },
      h("span", { class: "text-xs font-semibold text-on-surface truncate max-w-[200px]" }, x.layanan),
      h("span", { class: "text-[10px] text-outline" }, x.dipanggil_at ? new Date(x.dipanggil_at).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }) + " WIB" : "")
    )
  ),
  h("span", { class: "text-[10px] px-2 py-0.5 bg-primary/10 text-primary rounded-full font-bold" }, "Dilayani")
);

const waitChip = (x, idx) => h("div", {
  class: "p-3 rounded-xl flex flex-col items-center justify-center text-center shadow-xs transition-transform " +
    (idx === 0 ? "bg-primary-container/15 border-2 border-primary/40" : "bg-surface-container-low border border-outline-variant/20")
},
  h("span", { class: "text-[10px] uppercase font-bold " + (idx === 0 ? "text-primary animate-pulse" : "text-outline") }, idx === 0 ? "Berikutnya" : `Urutan ${idx + 1}`),
  h("span", { class: "font-mono text-xl sm:text-2xl font-extrabold " + (idx === 0 ? "text-primary" : "text-on-surface") + " my-1" }, x.no_antrian),
  h("span", { class: "text-xs font-medium text-on-surface truncate max-w-full" }, x.layanan)
);

function announce(list) {
  const keys = new Set(list.map(keyOf));
  if (seen === null) { seen = keys; return; }   // muat pertama: jangan diumumkan
  const fresh = list.filter(x => !seen.has(keyOf(x)))
    .sort((a, b) => a.dipanggil_at.localeCompare(b.dipanggil_at));
  seen = keys;
  if (!voiceOn) return;
  fresh.forEach(x => {
    const parts = x.no_antrian.split("-");
    const kode = parts[0] || "";
    const nomor = parts[1] ? parseInt(parts[1], 10) : "";
    speak(`Nomor antrian ${kode} ${nomor}, silakan menuju meja pelayanan ${x.layanan}`);
  });
}

async function tick() {
  try {
    const d = await api("/antrian/hari-ini");
    const [cur, ...rest] = d.dipanggil;
    $("#big").textContent = cur ? cur.no_antrian : "-";
    $("#lay").textContent = cur ? cur.layanan : "Belum ada antrian dipanggil";

    const calledBox = $("#called");
    if (calledBox) {
      if (rest.length) {
        calledBox.replaceChildren(...rest.slice(0, 6).map(calledChip));
      } else {
        calledBox.replaceChildren(h("p", { class: "text-xs text-outline italic text-center py-4" }, "Belum ada antrian yang selesai dipanggil"));
      }
    }

    const wc = $("#wc");
    if (wc) wc.textContent = `${d.menunggu.length} Antrian`;

    const waitBox = $("#wait");
    if (waitBox) {
      if (d.menunggu.length) {
        waitBox.replaceChildren(...d.menunggu.slice(0, 12).map((x, i) => waitChip(x, i)));
      } else {
        waitBox.replaceChildren(h("div", { class: "col-span-full text-center py-8 text-xs text-outline" }, "Tidak ada antrian menunggu"));
      }
    }

    const totalStat = $("#statTotal");
    if (totalStat) totalStat.textContent = (d.selesai || 0) + d.dipanggil.length + d.menunggu.length;
    const sisaStat = $("#statSisa");
    if (sisaStat) sisaStat.textContent = d.menunggu.length;

    announce(d.dipanggil);
  } catch {
    /* koneksi putus sementara, coba lagi di tick berikutnya */
  }
}

// Clock & Date widget
function updateClock() {
  const clockEl = $("#clock");
  if (clockEl) clockEl.textContent = new Date().toLocaleTimeString("id-ID") + " WIB";
  const dateEl = $("#currentDate");
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString("id-ID", {
      weekday: "long", year: "numeric", month: "long", day: "numeric"
    });
  }
}

setInterval(updateClock, 1000);
updateClock();
tick();
setInterval(tick, 3000);
