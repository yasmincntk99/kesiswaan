/*
==========================================================
GET /api/dashboard?periode=tahun|semester|bulan|semua
Agregat PUBLIK pelanggaran siswa (tanpa nama siswa).
==========================================================
*/
const K = require("./_lib/kesiswaan");
const sheets = require("./_lib/sheets");

module.exports = async (req, res) => {

    res.setHeader("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");

    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ success: false, message: "Metode tidak diizinkan." });
    }

    const periode = ["tahun", "semester", "bulan", "semua"].includes(req.query.periode) ? req.query.periode : "tahun";

    try {
        const [violations, siswa] = await Promise.all([K.loadPelanggaran(), K.loadSiswa().catch(() => [])]);

        return res.status(200).json({
            success: true,
            mode: sheets.mode(),
            data: K.aggregate(violations, siswa, periode)
        });
    } catch (err) {
        res.setHeader("Cache-Control", "no-store");
        return res.status(500).json({ success: false, message: err.message || "Terjadi kesalahan pada server." });
    }
};
