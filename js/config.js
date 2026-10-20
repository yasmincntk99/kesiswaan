/*
==========================================================
SMANSASOO Kesiswaan Portal
Konfigurasi aplikasi (dibaca js/shell.js dan halaman)
==========================================================
*/
window.CONFIG = {

    APP_NAME: "Portal Gerakan Disiplin Sekolah",

    VERSION: "1.0.0",

    SCHOOL_NAME: "SMAN 1 Sooko Mojokerto",

    // Identitas unit & program (tampil di navbar dan sidebar)
    UNIT_NAME: "Kesiswaan & Kedisiplinan",
    PROGRAM_NAME: "Gerakan Disiplin Sekolah",
    COMMITTEE_NAME: "Komisi Disiplin Sekolah",
    PROGRAM_SLOGAN: "Bersama, Berkreasi, dan Berprestasi",

    ACADEMIC_YEAR: "2026/2027",

    // Poin kumulatif per tahun ajaran (reset tiap 1 Juli).
    // Tingkat sanksi lengkap ada di data/tata-tertib.json.
    API: {
        DASHBOARD: "/api/dashboard",
        CEK_POIN: "/api/cek-poin",
        TATA_TERTIB: "/api/tata-tertib",
        PELANGGARAN: "/api/pelanggaran",
        PEMBINAAN: "/api/pembinaan",
        SURAT: "/api/surat",
        RINGKASAN: "/api/ringkasan",
        EKSEKUTIF: "/api/eksekutif",
        TANYA: "/api/tanya",
        WALIKELAS: "/api/walikelas",
        QR: "/api/qr",
        PERAPIAN: "/api/perapian",
        AI_CATAT: "/api/ai-catat",
        ADMIN_AUTH: "/api/admin-auth"
    },

    API_TIMEOUT: 12000

};

Object.freeze(window.CONFIG);
Object.freeze(window.CONFIG.API);
