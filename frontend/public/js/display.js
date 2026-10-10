let seen = null, voiceOn = false;

$("#enable").addEventListener("click", () => {
  voiceOn = true; $("#overlay").classList.add("hidden"); speak("Suara diaktifkan");
});

function speak(text) {
  if (!("speechSynthesis" in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "id-ID"; u.rate = 0.9;
  speechSynthesis.speak(u);
}

const keyOf = x => x.id + "|" + x.dipanggil_at;
const chip = x => h("div", { class: "chip" }, x.no_antrian, h("small", {}, x.layanan));

function announce(list) {
  const keys = new Set(list.map(keyOf));
  if (seen === null) { seen = keys; return; }   // muat pertama: jangan diumumkan
  const fresh = list.filter(x => !seen.has(keyOf(x)))
    .sort((a, b) => a.dipanggil_at.localeCompare(b.dipanggil_at));
  seen = keys;
  if (!voiceOn) return;
  fresh.forEach(x => {
    const [kode, nomor] = x.no_antrian.split("-");
    speak(`Nomor antrian ${kode} ${parseInt(nomor, 10)}, silakan menuju ${x.layanan}`);
  });
}

async function tick() {
  try {
    const d = await api("/antrian/hari-ini");
    const [cur, ...rest] = d.dipanggil;
    $("#big").textContent = cur ? cur.no_antrian : "-";
    $("#lay").textContent = cur ? cur.layanan : "";
    $("#called").replaceChildren(...rest.slice(0, 8).map(chip));
    $("#wc").textContent = d.menunggu.length;
    $("#wait").replaceChildren(...d.menunggu.slice(0, 16).map(chip));
    announce(d.dipanggil);
  } catch { /* koneksi putus sementara, coba lagi di tick berikutnya */ }
}

setInterval(() => { $("#clock").textContent = new Date().toLocaleTimeString("id-ID"); }, 1000);
tick(); setInterval(tick, 3000);
