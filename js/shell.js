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

    const NAV_LINKS = [
        { key: "home", label: "Dashboard", href: "/index.html", icon: "📊" },
        { key: "cek-poin", label: "Cek Poin Siswa", href: "/pages/cek-poin.html", icon: "🔎" },
        { key: "tata-tertib", label: "Tata Tertib", href: "/pages/tata-tertib.html", icon: "📘" },
        { key: "about", label: "Tentang Portal", href: "/pages/about.html", icon: "ℹ️" }
    ];

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
                    <strong>${CONFIG.SCHOOL_NAME}</strong>
                </a>

            </div>

        </nav>

        `;

    }

    /* ==========================================
       SIDEBAR
    ========================================== */

    function sidebarHTML() {

        const activeKey = activePage();

        const pageSections = Array.isArray(window.SHELL_PAGE_SECTIONS) ? window.SHELL_PAGE_SECTIONS : [];
        const externalLink = window.SHELL_EXTERNAL_LINK || null;

        return `

        <div class="app-sidebar-head">

            <p class="app-sidebar-title">Menu Situs</p>

            <button
                type="button"
                class="app-sidebar-collapse-btn"
                id="appSidebarCollapseBtn"
                aria-label="Perkecil sidebar (Ctrl+B)"
                title="Perkecil / perbesar sidebar (Ctrl+B)">
                &#10094;
            </button>

        </div>

        <nav>

            ${NAV_LINKS.map((link) => `
                <a href="${link.href}" class="${link.key === activeKey ? "active" : ""}" title="${link.label}">
                    <span class="icon">${link.icon}</span> <span class="label">${link.label}</span>
                </a>
            `).join("")}

        </nav>

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

        wireSidebarToggle(overlay, sidebar);
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
