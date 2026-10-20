/*
==========================================================
SMANSASOO Kesiswaan Portal
Floating Badge Admin + Panel
==========================================================
Badge kecil melayang di pojok kanan bawah semua halaman.
Diklik -> panel kaca: form login admin (jika belum masuk),
menu admin (jika sudah), dan toggle mode gelap/terang.
Dimuat otomatis oleh js/shell.js setelah js/admin-auth.js.
==========================================================
*/
window.AdminBadge = (() => {

    const THEME_TOGGLE_ID = "kdThemeToggle";

    const MENU = [
        { href: "/pages/admin.html#input", title: "Catat Pelanggaran", desc: "Input pelanggaran baru ke Google Sheet", icon: "✍️" },
        { href: "/pages/admin.html#data", title: "Data Pelanggaran", desc: "Cari, filter, dan unduh CSV", icon: "🗂️" },
        { href: "/pages/admin.html#pembinaan", title: "Perlu Pembinaan", desc: "Siswa dengan poin tertinggi & tindak lanjut", icon: "🛡️" },
        { href: "/pages/admin.html#ringkasan", title: "Ringkasan Harian", desc: "Ringkasan, siswa terlambat ditangani & cek data", icon: "📋" },
        { href: "/pages/admin.html#perapian", title: "Rapikan Data", desc: "Usulan perbaikan data siswa, disetujui per baris", icon: "🧹" },
        { href: "/pages/qr.html", title: "Kartu & Pindai QR", desc: "Pindai kartu siswa, cetak QR kelas", icon: "📷" }
    ];

    const MENU_EKS = [
        { href: "/pages/eksekutif.html", title: "KPI & Infografis", desc: "Ringkasan capaian disiplin untuk pimpinan", icon: "📈" }
    ];

    const MENU_QR = [{ href: "/pages/qr.html", title: "Kartu & Pindai QR", desc: "Pindai kartu siswa, cetak QR kelas", icon: "📷" }];

    const MENU_WALI = [
        { href: "/pages/walikelas.html", title: "Rekomendasi Mingguan", desc: "Ringkasan dan saran untuk kelas Anda", icon: "🧑‍🏫" },
        { href: "/pages/qr.html", title: "Kartu & Pindai QR", desc: "Pindai kartu siswa, cetak QR kelas", icon: "📷" }
    ];

    const SHIELD = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7 3v5c0 4.5-3 8.2-7 10-4-1.8-7-5.5-7-10V6l7-3z"/><path d="M9.5 12l1.8 1.8L15 10"/></svg>';

    let badge, panel, body, backdrop, loginCtl;

    function fmtTime(exp) {
        try {
            return new Date(exp * 1000).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
        } catch (e) { return ""; }
    }

    function renderBody() {

        const auth = window.AdminAuth;
        const logged = !!(auth && auth.isLoggedIn());

        badge.classList.toggle("is-active", logged);
        badge.querySelector(".kd-badge-label").textContent = logged ? (auth.hasRole("komisi") ? "Komisi aktif" : auth.hasRole("kesiswaan") ? "Kesiswaan aktif" : auth.hasRole("walikelas") ? "Wali kelas aktif" : "Eksekutif aktif") : "Komisi Disiplin";

        let html = "";

        if (!auth) {
            html += '<p class="kd-panel-note">Modul login belum termuat. Muat ulang halaman.</p>';
        } else if (!logged) {
            html += `
            <div class="kd-panel-section">
                <h3 class="kd-panel-h">Masuk Komisi Disiplin</h3>
                <p class="kd-panel-note">Khusus anggota Komisi Disiplin Sekolah (Gerakan Disiplin Sekolah) untuk mencatat dan melihat data pelanggaran siswa.</p>
                <div id="kdPanelLogin"></div>
            </div>`;
        } else {
            html += `
            <div class="kd-panel-section">
                <div class="kd-user-chip">
                    <span class="kd-user-dot" aria-hidden="true"></span>
                    <span><strong>${escapeHtml(auth.displayName())}</strong><small>Sesi aktif sampai ${fmtTime(auth.expiresAt())}</small></span>
                </div>
                ${auth.insecure() ? '<p class="kd-panel-warn">⚠️ Server masih memakai pengaman bawaan. Atur <code>ADMIN_PASSWORD</code> dan <code>ADMIN_SESSION_SECRET</code> di Vercel sebelum dipakai sungguhan.</p>' : ""}
                <ul class="kd-menu">
                    ${[].concat(auth.hasRole("eksekutif") ? MENU_EKS : [], auth.hasRole("walikelas") ? MENU_WALI : [], auth.hasRole("komisi") ? MENU : auth.hasRole("kesiswaan") ? MENU.filter((m) => /#(data|pembinaan)$/.test(m.href)).concat(MENU_QR) : []).map((m) => `
                    <li><a class="kd-menu-item" href="${m.href}">
                        <span class="kd-menu-ico" aria-hidden="true">${m.icon}</span>
                        <span class="kd-menu-text"><strong>${m.title}</strong><small>${m.desc}</small></span>
                    </a></li>`).join("")}
                </ul>
                <button type="button" class="kd-btn kd-btn--ghost kd-btn--block" id="kdPanelLogout">Keluar</button>
            </div>`;
        }

        html += `
        <div class="kd-panel-section kd-panel-row">
            <span class="kd-panel-rowtext"><strong>Mode tampilan</strong><small>Terang atau gelap</small></span>
            <button type="button" class="theme-toggle" id="${THEME_TOGGLE_ID}" aria-label="Ganti mode gelap/terang" aria-pressed="false">
                <span class="theme-toggle-track">
                    <span class="theme-toggle-icon" aria-hidden="true">&#9728;&#65039;</span>
                    <span class="theme-toggle-icon" aria-hidden="true">&#127769;</span>
                </span>
                <span class="theme-toggle-thumb" aria-hidden="true"></span>
            </button>
        </div>`;

        body.innerHTML = html;

        if (window.Theme) {
            Theme.initToggle(THEME_TOGGLE_ID);
        } else {
            const t = document.getElementById(THEME_TOGGLE_ID);
            if (t) t.disabled = true;
        }

        const slot = document.getElementById("kdPanelLogin");
        if (slot && auth) {
            loginCtl = auth.buildLoginForm(() => {
                renderBody();
                const first = body.querySelector(".kd-menu-item");
                if (first) first.focus();
            });
            slot.appendChild(loginCtl.form);
        }

        const out = document.getElementById("kdPanelLogout");
        if (out) {
            out.addEventListener("click", () => {
                auth.logout();
                if (/\/pages\/(admin|eksekutif|walikelas)(\.html)?$/.test(location.pathname)) { location.href = "/index.html"; return; }
                renderBody();
            });
        }
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    }

    function open() {
        renderBody();
        panel.classList.add("open");
        backdrop.classList.add("open");
        panel.setAttribute("aria-hidden", "false");
        badge.setAttribute("aria-expanded", "true");
        if (loginCtl && !(window.AdminAuth && AdminAuth.isLoggedIn())) setTimeout(() => loginCtl.focus(), 60);
    }

    function close() {
        panel.classList.remove("open");
        backdrop.classList.remove("open");
        panel.setAttribute("aria-hidden", "true");
        badge.setAttribute("aria-expanded", "false");
    }

    function initialize() {

        const wrap = document.createElement("div");
        wrap.innerHTML = `
        <div class="kd-badge-backdrop" id="kdBadgeBackdrop"></div>
        <aside class="kd-panel" id="kdPanel" role="dialog" aria-label="Panel Komisi Disiplin Sekolah" aria-hidden="true">
            <header class="kd-panel-head">
                <strong>Komisi Disiplin Sekolah</strong>
                <button type="button" class="kd-panel-close" id="kdPanelClose" aria-label="Tutup panel">&times;</button>
            </header>
            <div class="kd-panel-body" id="kdPanelBody"></div>
        </aside>
        <button type="button" class="kd-badge" id="kdBadge" aria-haspopup="dialog" aria-expanded="false" aria-controls="kdPanel" title="Panel Komisi Disiplin Sekolah">
            <span class="kd-badge-ico">${SHIELD}</span>
            <span class="kd-badge-label">Komisi Disiplin</span>
            <span class="kd-badge-dot" aria-hidden="true"></span>
        </button>`;
        while (wrap.firstChild) document.body.appendChild(wrap.firstChild);

        badge = document.getElementById("kdBadge");
        panel = document.getElementById("kdPanel");
        body = document.getElementById("kdPanelBody");
        backdrop = document.getElementById("kdBadgeBackdrop");

        badge.addEventListener("click", () => (panel.classList.contains("open") ? close() : open()));
        backdrop.addEventListener("click", close);
        document.getElementById("kdPanelClose").addEventListener("click", close);
        document.addEventListener("keydown", (e) => { if (e.key === "Escape" && panel.classList.contains("open")) { close(); badge.focus(); } });
        document.addEventListener("adminauth:change", () => { if (panel.classList.contains("open")) renderBody(); else badge.classList.toggle("is-active", AdminAuth.isLoggedIn()); });

        // status awal badge (tanpa membuka panel)
        const logged = !!(window.AdminAuth && AdminAuth.isLoggedIn());
        badge.classList.toggle("is-active", logged);
        badge.querySelector(".kd-badge-label").textContent = logged ? (window.AdminAuth && !window.AdminAuth.hasRole("komisi") ? (window.AdminAuth.hasRole("kesiswaan") ? "Kesiswaan aktif" : window.AdminAuth.hasRole("walikelas") ? "Wali kelas aktif" : "Eksekutif aktif") : "Komisi aktif") : "Komisi Disiplin";

        // tautan #input/#data/#pembinaan di halaman admin: tutup panel saat dipilih
        body.addEventListener("click", (e) => { if (e.target.closest(".kd-menu-item")) close(); });
    }

    return { initialize, open, close };

})();

(function boot() {
    const go = () => AdminBadge.initialize();
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", go);
    else go();
})();
