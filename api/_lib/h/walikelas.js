/*
==========================================================
/api/walikelas  (peran: walikelas; Komisi & Kesiswaan boleh melihat semua kelas)
GET ?kelas=X-1  -> { success, kelasTersedia, data: rekomendasi mingguan kelas tsb }
Wali kelas HANYA mendapat kelas yang tercantum di kolom "Kelas" tab Pengguna (dibawa di token bertanda tangan);
kelas lain ditolak server (403). Berisi nama siswa kelasnya sendiri.
==========================================================
*/
const R = require("../rekomendasi");
const { verifyAdmin } = require("../../admin-auth");

module.exports = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const auth = verifyAdmin(req, ["walikelas", "komisi", "kesiswaan"]);
    if (!auth.ok) return res.status(auth.forbidden ? 403 : 401).json({ success: false, message: auth.forbidden ? "Akun ini tidak memiliki izin untuk fitur ini." : "Sesi tidak valid. Silakan masuk lagi." });
    if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ success: false, message: "Metode tidak diizinkan." }); }

    try {
        const semua = await R.daftarKelas();
        const luas = auth.roles.includes("komisi") || auth.roles.includes("kesiswaan");
        const boleh = luas ? semua : (auth.kelas || []).map(R.up).filter((k) => semua.includes(k));
        if (!boleh.length) return res.status(403).json({ success: false, message: "Akun ini belum diberi kelas. Isi kolom Kelas (mis. X-1) di tab Pengguna, lalu masuk lagi." });

        const minta = R.up((req.query && req.query.kelas) || "");
        if (minta && !boleh.includes(minta)) return res.status(403).json({ success: false, message: "Anda tidak memiliki akses ke kelas tersebut." });
        const kelas = minta || boleh[0];
        return res.status(200).json({ success: true, kelasTersedia: boleh, data: await R.hitung(kelas) });
    } catch (e) {
        console.error("walikelas:", e && e.message);
        return res.status(500).json({ success: false, message: "Rekomendasi belum dapat dimuat. Coba lagi." });
    }
};
