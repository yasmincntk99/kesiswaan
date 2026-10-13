/*
==========================================================
GET /api/tata-tertib
Daftar jenis pelanggaran (poin) + tingkat sanksi. PUBLIK.
Sumber: tab TATA_TERTIB (jika spreadsheet terhubung) atau
data/tata-tertib.json.
==========================================================
*/
const K = require("./_lib/kesiswaan");

module.exports = async (req, res) => {
    res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=900");
    if (req.method !== "GET") {
        res.setHeader("Allow", "GET");
        return res.status(405).json({ success: false, message: "Metode tidak diizinkan." });
    }
    try {
        return res.status(200).json({ success: true, data: { pelanggaran: await K.loadTatib(), tingkat: K.tatib.tingkat } });
    } catch (err) {
        return res.status(500).json({ success: false, message: err.message || "Terjadi kesalahan pada server." });
    }
};
