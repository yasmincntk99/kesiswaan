/*
==========================================================
SMANSASOO Kesiswaan Portal
Konfigurasi aplikasi (dibaca js/shell.js dan halaman)
==========================================================
*/
window.CONFIG = {

    APP_NAME: "SMANSASOO Kesiswaan Portal",

    VERSION: "1.0.0",

    SCHOOL_NAME: "SMAN 1 Sooko Mojokerto",

    ACADEMIC_YEAR: "2026/2027",

    // Poin kumulatif per tahun ajaran (reset tiap 1 Juli).
    // Tingkat sanksi lengkap ada di data/tata-tertib.json.
    API: {
        DASHBOARD: "/api/dashboard",
        CEK_POIN: "/api/cek-poin",
        TATA_TERTIB: "/api/tata-tertib",
        PELANGGARAN: "/api/pelanggaran",
        ADMIN_AUTH: "/api/admin-auth"
    },

    API_TIMEOUT: 12000

};

Object.freeze(window.CONFIG);
Object.freeze(window.CONFIG.API);
