/*
==========================================================
SMANSASOO Kesiswaan Portal
Stats Panel (floating, glassmorphism)
Version : 1.1.0
==========================================================
Dipicu tombol #statsPanelToggle (dirender js/shell.js di
baris paling bawah sidebar). Begitu diklik, panel floating
kecil muncul dekat tombolnya berisi jumlah pengunjung yang
sudah cek Nilai/Kelulusan/dll, diambil dari /api/stats.

Datanya cuma diambil (GET) saat panel dibuka -- bukan setiap
halaman dimuat (itu tugas js/stats-tracker.js yang mengirim
hit lewat POST) -- supaya tidak ada request tambahan yang
sia-sia kalau panelnya memang tidak pernah dibuka.

SYARAT: file ini dijalankan SETELAH js/shell.js selesai
initialize() (supaya tombol #statsPanelToggle sudah ada di
DOM). Sejak shell.js v2.2.0, shell memuat file ini otomatis
lewat Shell.loadStats() -- yaitu SETELAH DOMContentLoaded --
jadi inisialisasi di bawah memakai pengecekan readyState,
bukan hanya listener DOMContentLoaded.

CHANGELOG (v1.1.0):
- Inisialisasi aman dipanggil kapan saja (sebelum maupun
  sesudah DOMContentLoaded). Sebelumnya hanya listen
  DOMContentLoaded, sehingga tidak pernah jalan kalau dimuat
  dinamis oleh shell.js.
- Guard anti-inisialisasi ganda.
- Utils.log tidak lagi wajib ada (fallback ke console.warn).
==========================================================
*/

window.StatsPanel = (() => {

    let panelEl = null;
    let overlayEl = null;
    let initialized = false;

    function log(...args) {

        if (window.Utils && typeof Utils.log === "function") {
            Utils.log(...args);
        } else {
            console.warn(...args);
        }

    }

    function markup() {

        return `

        <div class="stats-panel-overlay" id="statsPanelOverlay"></div>

        <aside class="stats-panel" id="statsPanel" role="dialog" aria-modal="false" aria-label="Statistik pengunjung">

            <div class="stats-panel-head">
                <strong>Statistik Pengunjung</strong>
                <button type="button" class="stats-panel-close" id="statsPanelClose" aria-label="Tutup panel statistik">
                    &times;
                </button>
            </div>

            <div id="statsPanelBody">
                <p class="stats-panel-loading">Memuat data...</p>
            </div>

        </aside>

        `;

    }

    function renderContent(response) {

        const body = document.getElementById("statsPanelBody");

        if (!body) return;

        if (!response || !response.configured) {

            body.innerHTML = `<p class="stats-panel-empty">${(response && response.message) || "Statistik pengunjung belum diaktifkan."}</p>`;

            return;

        }

        if (!response.success || !response.data) {

            body.innerHTML = `<p class="stats-panel-empty">${response.message || "Gagal memuat statistik."}</p>`;

            return;

        }

        const { total, perPage, labels } = response.data;

        const rows = Object.keys(labels || {})
            .map((key) => `

                <div class="stats-panel-row">
                    <span>${labels[key]}</span>
                    <span class="stats-panel-row-value">${(perPage[key] || 0).toLocaleString("id-ID")}</span>
                </div>

            `)
            .join("");

        body.innerHTML = `

            <div class="stats-panel-total">
                <span class="stats-panel-total-value">${(total || 0).toLocaleString("id-ID")}</span>
                <span class="stats-panel-total-label">Total kunjungan cek data</span>
            </div>

            <div class="stats-panel-list">
                ${rows || `<p class="stats-panel-empty">Belum ada data.</p>`}
            </div>

        `;

    }

    async function loadStats() {

        const body = document.getElementById("statsPanelBody");

        if (body) {
            body.innerHTML = `<p class="stats-panel-loading">Memuat data...</p>`;
        }

        try {

            const response = await fetch("/api/stats", { cache: "no-store" });
            const result = await response.json();

            renderContent(result);

        } catch (error) {

            log("Gagal memuat statistik pengunjung:", error);

            renderContent({ configured: true, success: false, message: "Gagal memuat statistik." });

        }

    }

    function open(toggle) {

        panelEl.classList.add("open");
        overlayEl.classList.add("open");

        if (toggle) toggle.setAttribute("aria-expanded", "true");

        // Selalu refresh saat dibuka supaya angkanya tidak basi.
        loadStats();

    }

    function close(toggle) {

        panelEl.classList.remove("open");
        overlayEl.classList.remove("open");

        if (toggle) toggle.setAttribute("aria-expanded", "false");

    }

    function initialize() {

        if (initialized) return;

        const toggle = document.getElementById("statsPanelToggle");

        if (!toggle) return;

        initialized = true;

        const wrapper = document.createElement("div");
        wrapper.innerHTML = markup();

        while (wrapper.firstChild) {
            document.body.appendChild(wrapper.firstChild);
        }

        panelEl = document.getElementById("statsPanel");
        overlayEl = document.getElementById("statsPanelOverlay");

        const closeBtn = document.getElementById("statsPanelClose");

        toggle.addEventListener("click", () => {

            panelEl.classList.contains("open") ? close(toggle) : open(toggle);

        });

        overlayEl.addEventListener("click", () => close(toggle));
        if (closeBtn) closeBtn.addEventListener("click", () => close(toggle));

        document.addEventListener("keydown", (event) => {

            if (event.key === "Escape" && panelEl.classList.contains("open")) {
                close(toggle);
            }

        });

    }

    return { initialize };

})();

// Aman dipanggil sebelum maupun sesudah DOMContentLoaded.
if (document.readyState === "loading") {

    // shell.js juga listen di DOMContentLoaded dan terdaftar lebih
    // dulu, jadi sidebar + #statsPanelToggle sudah ada saat ini jalan.
    document.addEventListener("DOMContentLoaded", () => StatsPanel.initialize());

} else {

    // Dimuat dinamis oleh Shell.loadStats() setelah Shell.initialize().
    StatsPanel.initialize();

}
