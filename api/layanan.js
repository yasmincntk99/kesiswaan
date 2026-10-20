/*
==========================================================
/api/layanan  -- satu fungsi serverless untuk beberapa endpoint admin.
Paket Vercel gratis (Hobby) membatasi 12 fungsi per deployment; menggabungkan menjaga jumlahnya aman.
URL lama tetap berlaku lewat "rewrites" di vercel.json:
  /api/ai-catat /api/eksekutif /api/perapian /api/qr /api/ringkasan /api/tanya /api/walikelas  ->  /api/layanan?op=<nama>
Setiap handler memeriksa sesi & perannya sendiri (lihat api/_lib/h/*).
==========================================================
*/
const HANDLERS = {
    "ai-catat": () => require("./_lib/h/ai-catat"),
    eksekutif: () => require("./_lib/h/eksekutif"),
    perapian: () => require("./_lib/h/perapian"),
    qr: () => require("./_lib/h/qr"),
    ringkasan: () => require("./_lib/h/ringkasan"),
    tanya: () => require("./_lib/h/tanya"),
    walikelas: () => require("./_lib/h/walikelas")
};

module.exports = async (req, res) => {
    const op = String((req.query && req.query.op) || "");
    if (!Object.prototype.hasOwnProperty.call(HANDLERS, op)) {
        res.setHeader("Cache-Control", "no-store");
        return res.status(404).json({ success: false, message: "Layanan tidak ditemukan." });
    }
    return HANDLERS[op]()(req, res);
};
