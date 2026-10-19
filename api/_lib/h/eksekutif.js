/*
==========================================================
/api/eksekutif  (KHUSUS peran "eksekutif" -- header Authorization: Bearer)
GET -> KPI & infografis agregat untuk kepala sekolah (tanpa nama siswa). Lihat api/_lib/kpi.js.
==========================================================
*/
const kpi = require("../kpi");
const { verifyAdmin } = require("../../admin-auth");

module.exports = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const auth = verifyAdmin(req, "eksekutif");
    if (!auth.ok) return res.status(auth.forbidden ? 403 : 401).json({ success: false, message: auth.forbidden ? "Akun ini tidak memiliki akses portal eksekutif." : "Sesi tidak valid. Silakan masuk lagi." });
    if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ success: false, message: "Metode tidak diizinkan." }); }
    try {
        return res.status(200).json({ success: true, data: await kpi.hitung() });
    } catch (e) {
        console.error("eksekutif:", e && e.message);
        return res.status(500).json({ success: false, message: "KPI belum dapat dihitung. " + (e && e.message ? e.message : "") });
    }
};
