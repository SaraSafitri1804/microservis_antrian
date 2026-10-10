const API = "/api";

const Auth = {
  get token() { return localStorage.getItem("token"); },
  get role() { return localStorage.getItem("role"); },
  get user() { try { return JSON.parse(localStorage.getItem("user")); } catch { return null; } },
  save(d) {
    localStorage.setItem("token", d.token);
    localStorage.setItem("role", d.role);
    localStorage.setItem("user", JSON.stringify(d.user));
  },
  clear() { ["token", "role", "user"].forEach(k => localStorage.removeItem(k)); },
  require(roles) {
    if (!this.token || !roles.includes(this.role)) { location.href = "login.html"; return false; }
    return true;
  },
};

async function api(path, { method = "GET", body } = {}) {
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (Auth.token) headers["Authorization"] = "Bearer " + Auth.token;
  let res;
  try {
    res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    throw new Error("Tidak dapat terhubung ke server");
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && Auth.token) { Auth.clear(); location.href = "login.html?expired=1"; }
    const d = data && data.detail;
    const msg = typeof d === "string" ? d
      : Array.isArray(d) ? d.map(x => x.msg.replace(/^Value error, /, "")).join(", ")
      : "Terjadi kesalahan (" + res.status + ")";
    const err = new Error(msg); err.status = res.status; throw err;
  }
  return data;
}

// Buat elemen DOM dengan aman (teks selalu lewat textContent, bukan innerHTML)
function h(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  for (const c of kids.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
const $ = s => document.querySelector(s);

const STATUS_LABEL = { menunggu: "Menunggu", dipanggil: "Dipanggil", selesai: "Selesai", batal: "Batal" };
const badge = s => h("span", { class: "badge " + s }, STATUS_LABEL[s] || s);

function showMsg(text, type = "error") {
  const box = $("#msg");
  if (!box) return;
  box.className = "msg " + type;
  box.textContent = text;
  if (type === "ok") setTimeout(() => box.classList.add("hidden"), 3000);
}
const hideMsg = () => { const b = $("#msg"); if (b) b.className = "msg hidden"; };
const todayLocal = () => new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD

function renderNav(active) {
  const nav = $("#nav");
  const links = [["index", "index.html", "Ambil Nomor"], ["display", "display.html", "Layar Display"]];
  if (Auth.token && ["admin", "petugas"].includes(Auth.role)) links.push(["petugas", "petugas.html", "Petugas"], ["pasien", "pasien.html", "Data Pasien"]);
  if (Auth.token && Auth.role === "admin") links.push(["admin", "admin.html", "Admin"]);
  nav.replaceChildren(h("span", { class: "brand" }, "Posyandu"),
    ...links.map(([id, href, label]) => h("a", { href, class: id === active ? "active" : "" }, label)),
    h("span", { class: "sp" }));
  if (Auth.token) {
    nav.append(h("span", { class: "brand" }, Auth.user ? Auth.user.name : ""),
      h("a", { href: "#", onclick: e => { e.preventDefault(); Auth.clear(); location.href = "login.html"; } }, "Keluar"));
  } else nav.append(h("a", { href: "login.html", class: active === "login" ? "active" : "" }, "Login"));
}
