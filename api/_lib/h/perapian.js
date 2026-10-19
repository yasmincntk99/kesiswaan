/*
==========================================================
/api/perapian  (KHUSUS ADMIN -- header Authorization: Bearer)
GET  -> { perbaikan:[{ id, kolom, nis, nama, dari, ke, jenis, saran }], laporan:[{ jenis, teks }], canWrite }
POST { ids:[...] } -> terapkan hanya usulan yang dicentang (server menghitung ulang; nilai dari browser tidak dipercaya),
                      lalu catat dari->ke ke tab Log_Perapian.
Tanpa AI: semua aturan deterministik di api/_lib/perapian.js.
==========================================================
*/
const sheets = require("../sheets");
const P = require("../perapian");
const { verifyAdmin } = require("../../admin-auth");

const MAX_IDS = 300;

module.exports = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const auth = verifyAdmin(req);
    if (!auth.ok) return res.status(auth.forbidden ? 403 : 401).json({ success: false, message: auth.forbidden ? "Akun ini tidak memiliki izin untuk fitur ini." : "Sesi Komisi Disiplin tidak valid. Silakan masuk lagi." });

    try {
        if (req.method === "GET") {
            if (sheets.mode() === "demo") return res.status(200).json({ success: true, data: { perbaikan: [], laporan: [], canWrite: false, demo: true } });
            const a = await P.analisis();
            return res.status(200).json({ success: true, data: { perbaikan: a.perbaikan, laporan: a.laporan, canWrite: sheets.canWrite(), jumlahSiswa: a.jumlahSiswa } });
        }
        if (req.method === "POST") {
            if (!sheets.canWrite()) return res.status(403).json({ success: false, code: "READ_ONLY", message: "Service account belum diatur, portal hanya bisa membaca." });
            let body = req.body;
            if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
            const ids = Array.isArray(body && body.ids) ? body.ids.map((x) => String(x).slice(0, 60)) : [];
            if (!ids.length) return res.status(400).json({ success: false, message: "Centang minimal satu perbaikan." });
            if (ids.length > MAX_IDS) return res.status(400).json({ success: false, message: `Maksimal ${MAX_IDS} perbaikan sekali terapkan.` });
            const r = await P.terapkan(ids, String(auth.nama || auth.username || "admin").slice(0, 80));
            return res.status(200).json({ success: true, data: r });
        }
        res.setHeader("Allow", "GET, POST");
        return res.status(405).json({ success: false, message: "Metode tidak didukung." });
    } catch (e) {
        console.error("perapian:", e && e.message);
        return res.status(500).json({ success: false, message: e && e.message ? e.message : "Terjadi kesalahan pada server." });
    }
};
