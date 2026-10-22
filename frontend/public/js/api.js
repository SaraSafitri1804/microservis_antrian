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
const $$ = s => document.querySelectorAll(s);

const STATUS_LABEL = { menunggu: "Menunggu", dipanggil: "Dipanggil", selesai: "Selesai", batal: "Batal" };
const STATUS_CLASSES = {
  menunggu: "inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-900 font-semibold text-xs border border-amber-200",
  dipanggil: "inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-100 text-teal-900 font-semibold text-xs border border-teal-300 animate-pulse",
  selesai: "inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-900 font-semibold text-xs border border-emerald-200",
  batal: "inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-100 text-rose-900 font-semibold text-xs border border-rose-200"
};

const badge = s => {
  const dot = h("span", {
    class: "w-2 h-2 rounded-full " + (
      s === "menunggu" ? "bg-amber-500" :
      s === "dipanggil" ? "bg-teal-600 animate-ping" :
      s === "selesai" ? "bg-emerald-600" : "bg-rose-500"
    )
  });
  return h("span", { class: STATUS_CLASSES[s] || "badge " + s }, dot, STATUS_LABEL[s] || s);
};

function showMsg(text, type = "error") {
  const box = $("#msg");
  if (!box) return;
  const textEl = $("#msg-text") || $("#msgDesc") || box;
  textEl.textContent = text;
  box.classList.remove("hidden");
  if (box.classList.contains("flex") || box.dataset.flex) {
    box.classList.add("flex");
  }
  if (type === "ok") {
    box.classList.remove("bg-error-container", "text-on-error-container", "bg-rose-100", "text-rose-900");
    box.classList.add("bg-secondary-container", "text-on-secondary-container");
    setTimeout(() => hideMsg(), 3500);
  } else {
    box.classList.remove("bg-secondary-container", "text-on-secondary-container", "bg-emerald-100", "text-emerald-900");
    box.classList.add("bg-error-container", "text-on-error-container");
  }
}

const hideMsg = () => {
  const b = $("#msg");
  if (b) {
    b.classList.add("hidden");
    b.classList.remove("flex");
  }
};

const todayLocal = () => new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD

function renderNav(active) {
  const pageMap = {
    index: ["index.html", "ambil-antrian"],
    display: ["display.html", "layar-antrian"],
    petugas: ["petugas.html", "dashboard-petugas"],
    pasien: ["pasien.html", "data-pasien"],
    admin: ["admin.html", "dashboard-admin"],
    login: ["login.html", "login-petugas"]
  };

  // 1. Highlight active navigation items
  const navLinks = $$("nav a, [data-path]");
  navLinks.forEach(a => {
    const href = a.getAttribute("href") || "";
    const dataPath = a.getAttribute("data-path") || "";
    const info = pageMap[active];
    const isCurrent = (info && (href === info[0] || dataPath === info[1])) || href === active + ".html";

    if (isCurrent) {
      a.setAttribute("aria-current", "page");
      if (a.closest("aside")) {
        a.className = "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all bg-primary-container text-on-primary-container shadow-xs";
      } else {
        a.className = "px-4 py-2 transition-colors bg-primary-container text-on-primary-container text-sm font-semibold rounded-lg shadow-xs";
      }
    }
  });

  // 1b. Dynamic role-based sidebar for pasien.html
  const sidebarNav = $("#sidebarNav");
  if (sidebarNav && active === "pasien") {
    if (Auth.role === "admin") {
      sidebarNav.replaceChildren(
        h("div", { class: "px-3 py-1 text-[11px] text-outline uppercase tracking-wider font-bold" }, "Modul Administrator"),
        h("a", { href: "admin.html", class: "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-all" },
          h("span", { class: "material-symbols-outlined text-[20px]" }, "analytics"),
          h("span", {}, "Laporan & Rekapitulasi")
        ),
        h("a", { href: "admin.html#statistik-section", class: "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-all" },
          h("span", { class: "material-symbols-outlined text-[20px]" }, "monitoring"),
          h("span", {}, "Statistik Gizi & Usia")
        ),
        h("a", { href: "pasien.html", "aria-current": "page", class: "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all bg-primary-container text-on-primary-container shadow-xs" },
          h("span", { class: "material-symbols-outlined text-[20px]" }, "groups"),
          h("span", {}, "Master Data Pasien")
        ),
        h("a", { href: "admin.html#akun-section", class: "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-all" },
          h("span", { class: "material-symbols-outlined text-[20px]" }, "manage_accounts"),
          h("span", {}, "Manajemen Akun Staf")
        ),
        h("div", { class: "px-3 pt-5 pb-1 text-[11px] text-outline uppercase tracking-wider font-bold" }, "Pintasan Layanan"),
        h("a", { href: "display.html", target: "_blank", class: "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-all" },
          h("span", { class: "material-symbols-outlined text-[20px] text-outline" }, "tv"),
          h("span", {}, "Buka Layar TV Antrian"),
          h("span", { class: "material-symbols-outlined text-[16px] text-outline ml-auto" }, "open_in_new")
        )
      );
    } else {
      sidebarNav.replaceChildren(
        h("div", { class: "px-3 py-1 text-[11px] text-outline uppercase tracking-wider font-bold" }, "Pelayanan Loket"),
        h("a", { href: "petugas.html", class: "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-all" },
          h("span", { class: "material-symbols-outlined text-[20px]" }, "volume_up"),
          h("span", {}, "Panggilan Antrian")
        ),
        h("a", { href: "pasien.html", "aria-current": "page", class: "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all bg-primary-container text-on-primary-container shadow-xs" },
          h("span", { class: "material-symbols-outlined text-[20px]" }, "person_search"),
          h("span", {}, "Pencarian Data Pasien")
        ),
        h("div", { class: "px-3 pt-5 pb-1 text-[11px] text-outline uppercase tracking-wider font-bold" }, "Layar Monitor"),
        h("a", { href: "display.html", target: "_blank", class: "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-semibold text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface transition-all" },
          h("span", { class: "material-symbols-outlined text-[20px] text-outline" }, "tv"),
          h("span", {}, "Pantau Layar TV Antrian"),
          h("span", { class: "material-symbols-outlined text-[16px] text-outline ml-auto" }, "open_in_new")
        )
      );
    }
  }

  // 2. Hide admin-only links for non-admin users
  const adminOnlyLinks = $$("[data-role='admin'], [data-path='dashboard-admin']");
  adminOnlyLinks.forEach(el => {
    if (Auth.role !== "admin") {
      el.classList.add("hidden");
      // also hide parent section header if it's in a control group
      const parentGroup = el.closest(".admin-only-section");
      if (parentGroup) parentGroup.classList.add("hidden");
    } else {
      el.classList.remove("hidden");
      const parentGroup = el.closest(".admin-only-section");
      if (parentGroup) parentGroup.classList.remove("hidden");
    }
  });

  // 3. User profile / name display update
  const userDisplays = $$(".user-display-name, #user-name");
  userDisplays.forEach(el => {
    if (Auth.user && Auth.user.name) el.textContent = Auth.user.name;
    else if (Auth.role) el.textContent = Auth.role === "admin" ? "Administrator" : "Kader Posyandu";
    else el.textContent = "Pengunjung Posyandu";
  });

  const roleDisplays = $$(".user-display-role, #user-role");
  roleDisplays.forEach(el => {
    if (Auth.role) el.textContent = Auth.role.toUpperCase();
    else el.textContent = "WARGA / PASIEN";
  });

  // 4. Update Public Top Bar Auth Area on index.html / display.html
  const navAuthArea = $("#navAuthArea");
  if (navAuthArea) {
    if (Auth.token) {
      const dashboardHref = Auth.role === "admin" ? "admin.html" : "petugas.html";
      const dashboardLabel = Auth.role === "admin" ? "Dashboard Admin" : "Dashboard Petugas";
      const userName = (Auth.user && Auth.user.name) || (Auth.role === "admin" ? "Admin" : "Petugas");
      
      navAuthArea.replaceChildren(
        h("div", { class: "hidden sm:flex flex-col text-right" },
          h("span", { class: "text-xs text-on-surface font-bold" }, userName),
          h("span", { class: "text-[10px] text-primary uppercase font-bold" }, Auth.role)
        ),
        h("a", {
          href: dashboardHref,
          class: "px-3 py-1.5 rounded-xl bg-primary hover:bg-primary-container text-on-primary text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-xs"
        },
          h("span", { class: "material-symbols-outlined text-[16px]" }, "dashboard"),
          h("span", {}, dashboardLabel)
        ),
        h("button", {
          class: "p-1.5 rounded-xl text-outline hover:text-error hover:bg-error-container/20 transition-colors cursor-pointer",
          title: "Logout",
          onclick: () => {
            Auth.clear();
            location.reload();
          }
        },
          h("span", { class: "material-symbols-outlined text-[18px]" }, "logout")
        )
      );
    } else {
      navAuthArea.replaceChildren(
        h("a", {
          href: "login.html",
          class: "px-3.5 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface text-xs font-semibold flex items-center gap-1.5 transition-colors border border-outline-variant/30"
        },
          h("span", { class: "material-symbols-outlined text-[18px] text-primary" }, "lock"),
          h("span", {}, "Login Petugas")
        )
      );
    }
  }

  // 5. Logout triggers
  const logoutButtons = $$("[data-action='logout'], .btn-logout");
  logoutButtons.forEach(btn => {
    btn.onclick = e => {
      e.preventDefault();
      Auth.clear();
      location.href = "login.html";
    };
  });
}
