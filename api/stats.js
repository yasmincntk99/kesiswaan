/*
==========================================================
SMANSASOO Kesiswaan Portal
API Route: /api/stats
Version : 1.0.0
==========================================================
Pencatat statistik pengunjung sederhana (page-view counter)
per halaman, dipakai panel statistik floating di sidebar
(js/stats-panel.js + js/stats-tracker.js).

Penyimpanan: Upstash Redis (REST API). Dipilih karena:
- Gratis untuk trafik kecil-menengah sekolah.
- Cukup panggil lewat fetch() biasa (REST), tidak perlu
  tambah dependency npm apa pun di /api.
- Cocok untuk counter sederhana (INCR/MGET), bukan database
  relasional yang berat untuk kasus ini.

Setup (lihat juga README.md):
1. Buat database Redis gratis di https://console.upstash.com
2. Di Vercel Dashboard -> Project -> Settings -> Environment
   Variables, tambahkan:
     UPSTASH_REDIS_REST_URL   = REST URL dari Upstash
     UPSTASH_REDIS_REST_TOKEN = REST Token dari Upstash
3. Redeploy. Kalau dua env var itu belum diisi, endpoint ini
   tetap merespons (tidak error 500) tapi dengan
   "configured: false" -- js/stats-panel.js akan menampilkan
   pesan "belum diaktifkan" alih-alih data statistik.

Method:
- GET  /api/stats            -> ambil semua angka sekaligus
- POST /api/stats?page=nilai -> tambah 1 hit untuk halaman itu
==========================================================
*/

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

const KEY_PREFIX = "kesiswaan:stats:";

// Sinkron dengan data-page di <body> tiap halaman (lihat
// js/shell.js). Tambah entri baru di sini kalau ada halaman
// baru yang mau ikut dihitung.
const KNOWN_PAGES = {
    home: "Dashboard",
    "cek-poin": "Cek Poin Siswa",
    "tata-tertib": "Tata Tertib",
    admin: "Panel Komisi Disiplin",
    about: "Tentang",
    privacy: "Privasi"
};

function isKnownPage(page) {
    return Object.prototype.hasOwnProperty.call(KNOWN_PAGES, page);
}

async function redisCommand(command) {

    const response = await fetch(REDIS_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${REDIS_TOKEN}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify(command)
    });

    if (!response.ok) {
        throw new Error(`Redis error (HTTP ${response.status}).`);
    }

    const payload = await response.json();

    return payload.result;

}

module.exports = async (req, res) => {

    res.setHeader("Cache-Control", "no-store");

    if (!REDIS_URL || !REDIS_TOKEN) {

        res.status(200).json({
            success: false,
            configured: false,
            message: "Statistik pengunjung belum diaktifkan (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN belum diatur di Environment Variable Vercel).",
            data: null
        });

        return;

    }

    try {

        if (req.method === "POST") {

            const page = (req.query.page || "").toString().trim();

            if (!isKnownPage(page)) {
                res.status(400).json({ success: false, configured: true, message: "Halaman tidak dikenal." });
                return;
            }

            const [pageCount, totalCount] = await Promise.all([
                redisCommand(["INCR", `${KEY_PREFIX}page:${page}`]),
                redisCommand(["INCR", `${KEY_PREFIX}total`])
            ]);

            res.status(200).json({
                success: true,
                configured: true,
                data: { page, count: Number(pageCount) || 0, total: Number(totalCount) || 0 }
            });

            return;

        }

        // GET -- ambil semua angka dalam satu panggilan (MGET)
        const pageKeys = Object.keys(KNOWN_PAGES);

        const command = ["MGET", ...pageKeys.map((p) => `${KEY_PREFIX}page:${p}`), `${KEY_PREFIX}total`];

        const results = await redisCommand(command);

        const perPage = {};

        pageKeys.forEach((p, i) => {
            perPage[p] = Number(results[i]) || 0;
        });

        const total = Number(results[results.length - 1]) || 0;

        res.status(200).json({
            success: true,
            configured: true,
            data: { total, perPage, labels: KNOWN_PAGES }
        });

    } catch (err) {

        res.status(500).json({
            success: false,
            configured: true,
            message: err.message || "Terjadi kesalahan pada server."
        });

    }

};
