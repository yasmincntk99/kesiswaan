/*
==========================================================
SMANSASOO Kesiswaan Portal
Shell (Navbar + Sidebar + Footer)
==========================================================
Satu-satunya tempat markup navbar & sidebar situs. Setiap
halaman cukup menaruh <div id="shellNav"></div> sebagai elemen
pertama <body>, <div id="shellFooter"></div> di akhir konten,
lalu memuat js/config.js dan js/shell.js.

Shell otomatis: mengisi navbar, membungkus isi halaman di
samping sidebar (drawer di mobile, kolom tetap >=1024px),
mengisi footer, lalu memuat statistik pengunjung dan
floating badge Admin (js/admin-auth.js + js/admin-badge.js).

Halaman menandai dirinya lewat <body data-page="...">. Menu
baru cukup ditambahkan ke NAV_LINKS di bawah.

Sidebar per-halaman (opsional), diset SEBELUM js/shell.js:
  window.SHELL_PAGE_SECTIONS = [{ id, label, icon }];
  window.SHELL_EXTERNAL_LINK = { href, label };
==========================================================
*/

// Harus di top level (bukan di dalam callback) supaya
// document.currentScript terisi. Dipakai loadStats() untuk
// menghitung base path yang benar dari / maupun /pages/.
const SHELL_SCRIPT_SRC = document.currentScript ? document.currentScript.src : "";

window.Shell = (() => {

    /* ==========================================
       REGISTRY LINK NAVIGASI
       (satu-satunya tempat menambah menu baru)
    ========================================== */

    // Sidebar PUBLIK (belum login admin).
    const NAV_LINKS = [
        { key: "home", label: "Dashboard", href: "/index.html", icon: "📊" },
        { key: "gerakan", label: "Gerakan Disiplin", href: "/pages/gerakan-disiplin.html", icon: "🎯", highlight: true },
        { key: "cek-poin", label: "Cek Poin Siswa", href: "/pages/cek-poin.html", icon: "🔎" },
        { key: "tata-tertib", label: "Tata Tertib", href: "/pages/tata-tertib.html", icon: "📘" },
        { key: "about", label: "Tentang Portal", href: "/pages/about.html", icon: "ℹ️" }
    ];

    // Sidebar ADMIN (sesi admin aktif): dikelompokkan menurut pekerjaan.
    // "tab" = tab di /pages/admin.html (aktif mengikuti event kd:tab).
    const ADMIN_GROUPS = [
        {
            title: "Kerja harian",
            links: [
                { key: "admin-input", tab: "input", label: "Catat Pelanggaran", href: "/pages/admin.html#input", icon: "✍️", queue: true },
                { key: "admin-data", tab: "data", label: "Data Pelanggaran", href: "/pages/admin.html#data", icon: "🗂️" },
                { key: "admin-pembinaan", tab: "pembinaan", label: "Perlu Pembinaan", href: "/pages/admin.html#pembinaan", icon: "🛡️" }
            ]
        },
        {
            title: "Pantau & rujukan",
            links: [
                { key: "home", label: "Dashboard", href: "/index.html", icon: "📊" },
                { key: "tata-tertib", label: "Tata Tertib & Sanksi", href: "/pages/tata-tertib.html", icon: "📘" },
                { key: "cek-poin", label: "Cek Poin (tampilan siswa)", href: "/pages/cek-poin.html", icon: "🔎" },
                { key: "gerakan", label: "Gerakan Disiplin", href: "/pages/gerakan-disiplin.html", icon: "🎯" }
            ]
        }
    ];

    // Salinan logika sesi js/admin-auth.js (sessionStorage) supaya sidebar
    // langsung benar sebelum modul itu selesai dimuat. Keabsahan token tetap
    // diperiksa server pada setiap panggilan /api/pelanggaran.
    const SESSION_KEY = "kesiswaan-admin-session";
    const QUEUE_KEY = "kd-pelanggaran-queue";

    function adminSession() {
        try {
            const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || "null");
            return s && s.token && s.exp && Date.now() < s.exp * 1000 ? s : null;
        } catch (e) { return null; }
    }

    function queueCount() {
        try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]").length; } catch (e) { return 0; }
    }

    const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

    let adminTab = "input";   // tab aktif di halaman admin

    // Ditambahkan di footer saja (tidak memenuhi navbar/sidebar utama).
    const FOOTER_EXTRA_LINKS = [
        { label: "Tentang", href: "/pages/about.html" },
        { label: "Privasi", href: "/pages/privacy.html" }
    ];

    function activePage() {

        return document.body.dataset.page || "";

    }

    /* ==========================================
       NAVBAR
    ========================================== */

    function navbarHTML() {

        return `

        <nav class="app-navbar">

            <div class="app-navbar-left">

                <button type="button" class="app-hamburger" id="appSidebarToggle" aria-label="Buka menu" aria-expanded="false">
                    &#9776;
                </button>

                <a href="/index.html" class="app-navbar-brand">
                    <img src="/assets/logo/logo.png" alt="Logo ${CONFIG.SCHOOL_NAME}">
                    <span class="app-navbar-text">
                        <strong>${CONFIG.SCHOOL_NAME}</strong>
                        <small>${CONFIG.UNIT_NAME} &middot; ${CONFIG.PROGRAM_NAME}</small>
                    </span>
                </a>

            </div>

        </nav>

        `;

    }

    /* ==========================================
       SIDEBAR
    ========================================== */

    function sidebarTitle() {

        return adminSession() ? "Menu Admin" : "Menu Situs";

    }

    // Kartu identitas di puncak sidebar. Publik: sorotan Gerakan Disiplin
    // Sekolah. Admin: identitas tim + akun yang sedang masuk.
    function brandCardHTML(session) {

        const shield = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z"/><path d="M9.5 12l1.8 1.8L15 10"/></svg>';

        if (session) {

            return `
            <div class="gds-card gds-card--admin">
                <span class="gds-shield">${shield}</span>
                <div class="gds-text">
                    <small>Tim ${CONFIG.PROGRAM_NAME}</small>
                    <strong>${CONFIG.UNIT_NAME}</strong>
                </div>
                <div class="gds-user"><span class="gds-dot" aria-hidden="true"></span><span>${esc(session.username || "admin")}</span><em>Admin</em></div>
            </div>`;

        }

        return `
        <a class="gds-card" href="/pages/gerakan-disiplin.html" aria-label="${CONFIG.PROGRAM_NAME}">
            <span class="gds-shield">${shield}</span>
            <div class="gds-text">
                <small>${CONFIG.SCHOOL_NAME}</small>
                <strong>${CONFIG.PROGRAM_NAME}</strong>
            </div>
            <div class="gds-motto">${CONFIG.PROGRAM_SLOGAN}</div>
        </a>`;

    }

    function navLinkHTML(link, activeKey, session) {

        const isActive = link.tab
            ? (activeKey === "admin" && adminTab === link.tab)
            : link.key === activeKey;

        const badge = link.queue && queueCount() > 0
            ? `<span class="gds-count" data-queue-badge title="Antrean offline belum terkirim">${queueCount()}</span>`
            : (link.queue ? `<span class="gds-count" data-queue-badge hidden></span>` : "");

        return `
            <a href="${link.href}" data-key="${link.key}"${link.tab ? ` data-tab="${link.tab}"` : ""} class="${isActive ? "active" : ""}${link.highlight ? " is-highlight" : ""}" title="${link.label}"${isActive ? ' aria-current="page"' : ""}>
                <span class="icon">${link.icon}</span> <span class="label">${link.label}</span>${badge}
            </a>`;

    }

    function sidebarBodyHTML() {

        const activeKey = activePage();
        const session = adminSession();

        const pageSections = Array.isArray(window.SHELL_PAGE_SECTIONS) ? window.SHELL_PAGE_SECTIONS : [];
        const externalLink = window.SHELL_EXTERNAL_LINK || null;
        const sheetUrl = window.__kdSheetUrl || "";

        let nav = "";

        if (session) {

            nav = ADMIN_GROUPS.map((g) => `
                <p class="app-sidebar-title">${g.title}</p>
                <nav>${g.links.map((l) => navLinkHTML(l, activeKey, session)).join("")}</nav>
            `).join("");

            nav += `
                <p class="app-sidebar-title">Akun & data</p>
                <nav>
                    <a href="${esc(sheetUrl)}" id="sbSheetLink" target="_blank" rel="noopener" title="Buka Google Sheet"${sheetUrl ? "" : " hidden"}>
                        <span class="icon">📄</span> <span class="label">Buka Google Sheet</span>
                    </a>
                    <button type="button" class="gds-logout" id="sbLogout" title="Keluar dari sesi admin">
                        <span class="icon">🚪</span> <span class="label">Keluar</span>
                    </button>
                </nav>`;

        } else {

            nav = `<nav>${NAV_LINKS.map((l) => navLinkHTML(l, activeKey, null)).join("")}</nav>`;

        }

        return `

        ${brandCardHTML(session)}

        ${nav}

        ${pageSections.length ? `

        <p class="app-sidebar-title">Di Halaman Ini</p>

        <nav id="sectionNav">

            ${pageSections.map((s) => `
                <a href="#${s.id}" data-section="${s.id}" title="${s.label}">
                    <span class="icon">${s.icon || "&bull;"}</span> <span class="label">${s.label}</span>
                </a>
            `).join("")}

        </nav>

        ` : ""}

        ${externalLink ? `

        <div class="app-sidebar-external">
            <a href="${externalLink.href}" target="_blank" rel="noopener">
                ${externalLink.label} &rarr;
            </a>
        </div>

        ` : ""}

        `;

    }

    function sidebarHTML() {

        const externalLink = window.SHELL_EXTERNAL_LINK || null;

        return `

        <div class="app-sidebar-head">

            <p class="app-sidebar-title" id="appSidebarTitle">${sidebarTitle()}</p>

            <button
                type="button"
                class="app-sidebar-collapse-btn"
                id="appSidebarCollapseBtn"
                aria-label="Perkecil sidebar (Ctrl+B)"
                title="Perkecil / perbesar sidebar (Ctrl+B)">
                &#10094;
            </button>

        </div>

        <div class="app-sidebar-body" id="appSidebarBody">${sidebarBodyHTML()}</div>

        <button
            type="button"
            class="app-sidebar-stats-toggle${externalLink ? "" : " app-sidebar-stats-toggle-pinned"}"
            id="statsPanelToggle"
            title="Statistik Pengunjung"
            aria-haspopup="dialog"
            aria-expanded="false">
            <span class="icon">📊</span> <span class="label">Statistik Pengunjung</span>
        </button>

        `;

    }

    /* ==========================================
       SIDEBAR DINAMIS: ganti isi saat status admin
       berubah tanpa menyentuh tombol statistik
       (yang sudah dipasangi handler stats-panel.js).
    ========================================== */

    function wireSidebarBody() {

        const body = document.getElementById("appSidebarBody");

        if (!body) return;

        body.querySelectorAll("a").forEach((link) => {

            link.addEventListener("click", () => {

                document.body.classList.remove("sidebar-open");

                const t = link.dataset.tab;

                // Pindah tab tanpa muat ulang bila sudah di halaman admin.
                if (t && activePage() === "admin") adminTab = t;

            });

        });

        const out = document.getElementById("sbLogout");

        if (out) {

            out.addEventListener("click", () => {

                if (window.AdminAuth) window.AdminAuth.logout();
                else {
                    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* abaikan */ }
                    document.dispatchEvent(new CustomEvent("adminauth:change"));
                }

                // Halaman admin ditutup overlay login oleh js/admin-auth.js saat dimuat.
                if (activePage() === "admin") location.reload();

            });

        }

    }

    function refreshSidebar() {

        const body = document.getElementById("appSidebarBody");

        if (!body) return;

        const session = adminSession();

        body.innerHTML = sidebarBodyHTML();

        const title = document.getElementById("appSidebarTitle");
        if (title) title.textContent = sidebarTitle();

        document.body.classList.toggle("is-admin-mode", !!session);

        wireSidebarBody();

    }

    function wireSidebarEvents() {

        document.addEventListener("adminauth:change", refreshSidebar);

        // Dikirim js/admin.js: tab aktif, antrean offline, dan URL Google Sheet.
        document.addEventListener("kd:tab", (e) => {
            adminTab = (e.detail && e.detail.tab) || "input";
            refreshSidebar();
        });

        document.addEventListener("kd:queue", refreshSidebar);

        document.addEventListener("kd:sheet", (e) => {
            window.__kdSheetUrl = (e.detail && e.detail.url) || "";
            refreshSidebar();
        });

        // Sesi bisa dihapus dari tab lain / kedaluwarsa.
        window.addEventListener("storage", (e) => { if (e.key === QUEUE_KEY) refreshSidebar(); });

    }

    /* ==========================================
       FOOTER
    ========================================== */

    function renderFooter() {

        const mount = document.getElementById("shellFooter");

        if (!mount) return;

        const year = (window.Utils && Utils.getCurrentYear) ? Utils.getCurrentYear() : new Date().getFullYear();

        mount.innerHTML = `

        <footer class="shell-footer">

            <div class="container shell-footer-inner">

                <div class="shell-footer-links">

                    ${FOOTER_EXTRA_LINKS.map((link) => `<a href="${link.href}">${link.label}</a>`).join("")}

                </div>

                <p>&copy; ${year} ${CONFIG.SCHOOL_NAME}</p>

                <small>${CONFIG.APP_NAME} &middot; v${CONFIG.VERSION}</small>

            </div>

        </footer>

        `;

    }

    /* ==========================================
       LAYOUT: bungkus isi halaman + pasang sidebar
    ========================================== */

    function buildLayout(navMount) {

        // Pindahkan semua elemen <body> lain (kecuali navbar)
        // ke dalam .app-content, tanpa perlu halaman menulis
        // ulang markup-nya.
        const contentWrap = document.createElement("div");
        contentWrap.className = "app-content";

        Array.from(document.body.children).forEach((el) => {

            if (el === navMount) return;

            contentWrap.appendChild(el);

        });

        const overlay = document.createElement("div");
        overlay.className = "app-sidebar-overlay";
        overlay.id = "appSidebarOverlay";

        const sidebar = document.createElement("aside");
        sidebar.className = "app-sidebar";
        sidebar.id = "appSidebar";
        sidebar.innerHTML = sidebarHTML();

        const layout = document.createElement("div");
        layout.className = "app-layout";
        layout.appendChild(sidebar);
        layout.appendChild(contentWrap);

        document.body.appendChild(overlay);
        document.body.appendChild(layout);

        return { overlay, sidebar };

    }

    /* ==========================================
       INTERAKSI: buka/tutup sidebar (mobile)
    ========================================== */

    function wireSidebarToggle(overlay, sidebar) {

        const toggle = document.getElementById("appSidebarToggle");

        function close() {

            document.body.classList.remove("sidebar-open");

            if (toggle) toggle.setAttribute("aria-expanded", "false");

        }

        function open() {

            document.body.classList.add("sidebar-open");

            if (toggle) toggle.setAttribute("aria-expanded", "true");

        }

        if (toggle) {

            toggle.addEventListener("click", () => {

                document.body.classList.contains("sidebar-open") ? close() : open();

            });

        }

        if (overlay) {

            overlay.addEventListener("click", close);

        }

        sidebar.querySelectorAll("a").forEach((link) => {

            link.addEventListener("click", close);

        });

    }

    /* ==========================================
       SCROLL-SPY (opsional, untuk "Di Halaman Ini")
    ========================================== */

    function wireScrollSpy() {

        const pageSections = Array.isArray(window.SHELL_PAGE_SECTIONS) ? window.SHELL_PAGE_SECTIONS : [];

        if (!pageSections.length || !("IntersectionObserver" in window)) return;

        const sections = pageSections
            .map((s) => document.getElementById(s.id))
            .filter(Boolean);

        const links = document.querySelectorAll("#sectionNav a");

        if (!sections.length || !links.length) return;

        const observer = new IntersectionObserver((entries) => {

            entries.forEach((entry) => {

                if (!entry.isIntersecting) return;

                links.forEach((link) => {

                    link.classList.toggle(
                        "active",
                        link.dataset.section === entry.target.id
                    );

                });

            });

        }, { rootMargin: "-40% 0px -50% 0px" });

        sections.forEach((section) => observer.observe(section));

    }

    /* ==========================================
       SIDEBAR MINIMIZE (desktop) -- tombol chevron
       + shortcut keyboard Ctrl+B (Cmd+B di Mac).
       Preferensi disimpan di localStorage supaya
       konsisten dipindah-pindah halaman.
    ========================================== */

    const COLLAPSE_STORAGE_KEY = "kesiswaan-sidebar-collapsed";

    function isCollapsed() {

        try {
            return localStorage.getItem(COLLAPSE_STORAGE_KEY) === "1";
        } catch (e) {
            return false;
        }

    }

    function setCollapsed(collapsed) {

        document.body.classList.toggle("sidebar-collapsed", collapsed);

        const btn = document.getElementById("appSidebarCollapseBtn");

        if (btn) {
            btn.setAttribute("aria-label", collapsed ? "Perbesar sidebar (Ctrl+B)" : "Perkecil sidebar (Ctrl+B)");
        }

        try {
            localStorage.setItem(COLLAPSE_STORAGE_KEY, collapsed ? "1" : "0");
        } catch (e) {
            // localStorage tidak tersedia -- abaikan, cukup state di memori.
        }

    }

    function wireSidebarCollapse() {

        // Terapkan preferensi tersimpan begitu shell dimuat.
        setCollapsed(isCollapsed());

        const btn = document.getElementById("appSidebarCollapseBtn");

        if (btn) {

            btn.addEventListener("click", () => {

                setCollapsed(!document.body.classList.contains("sidebar-collapsed"));

            });

        }

        // Ctrl+B / Cmd+B -- hanya efektif di desktop (sidebar
        // dock tetap), CSS-nya sendiri sudah di-scope ke situ,
        // jadi aman dipasang global tanpa cek lebar layar di JS.
        document.addEventListener("keydown", (event) => {

            const isShortcut = (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey
                && event.key.toLowerCase() === "b";

            if (!isShortcut) return;

            event.preventDefault();

            setCollapsed(!document.body.classList.contains("sidebar-collapsed"));

        });

    }

    /* ==========================================
       STATISTIK PENGUNJUNG
       Dimuat otomatis di semua halaman. Dipanggil
       SETELAH initialize() supaya #statsPanelToggle
       sudah ada di DOM saat stats-panel.js berjalan.
    ========================================== */

    function loadStats() {

        if (window.__statsLoaded) return;

        window.__statsLoaded = true;

        // Base path dari lokasi shell.js sendiri (aman dari / maupun /pages/)
        const base = SHELL_SCRIPT_SRC
            ? SHELL_SCRIPT_SRC.replace(/js\/shell\.js.*$/, "")
            : "/";

        if (!document.querySelector('link[href*="stats-panel.css"]')) {

            const css = document.createElement("link");
            css.rel = "stylesheet";
            css.href = base + "css/stats-panel.css";
            document.head.appendChild(css);

        }

        const load = (file) => new Promise((resolve, reject) => {

            // Kalau halaman masih punya tag statisnya, jangan dimuat lagi
            if (document.querySelector(`script[src*="${file}"]`)) return resolve();

            const s = document.createElement("script");
            s.src = base + "js/" + file;
            s.onload = resolve;
            s.onerror = reject;
            document.body.appendChild(s);

        });

        // Urutan penting: tracker dulu, baru panel; lalu badge Admin (butuh admin-auth)
        load("stats-tracker.js")
            .then(() => load("stats-panel.js"))
            .catch((e) => console.warn("Statistik gagal dimuat", e))
            .then(() => load("admin-auth.js"))
            .then(() => load("admin-badge.js"))
            .catch((e) => console.warn("Badge admin gagal dimuat", e));

    }

    /* ==========================================
       INIT
    ========================================== */

    function initialize() {

        const navMount = document.getElementById("shellNav");

        if (!navMount) return;

        navMount.innerHTML = navbarHTML();

        const { overlay, sidebar } = buildLayout(navMount);

        renderFooter();

        document.body.classList.toggle("is-admin-mode", !!adminSession());

        // Tab awal di halaman admin mengikuti hash URL.
        if (activePage() === "admin" && /^#(input|data|pembinaan)$/.test(location.hash)) adminTab = location.hash.slice(1);

        wireSidebarToggle(overlay, sidebar);
        wireSidebarBody();
        wireSidebarEvents();
        wireSidebarCollapse();
        wireScrollSpy();

    }

    return {

        NAV_LINKS,

        initialize,

        loadStats

    };

})();

document.addEventListener("DOMContentLoaded", () => {

    Shell.initialize();   // sidebar + tombol #statsPanelToggle sudah ada setelah ini
    Shell.loadStats();    // baru muat tracker & panel statistik

});
