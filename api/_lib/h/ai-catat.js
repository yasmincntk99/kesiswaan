/*
==========================================================
/api/ai-catat  (KHUSUS ADMIN -- header Authorization: Bearer)
POST { teks }  -> { success, data: { mentions, kelompok, tanpaJenis, belumTercocok } }
Mengubah kalimat guru ("Rizky X-1 dan Dina terlambat, tidak pakai dasi") menjadi usulan catatan
pelanggaran. TIDAK menulis apa pun ke Sheet: hasilnya hanya mengisi form untuk diperiksa guru.
Env: GEMINI_API_KEY (wajib), GEMINI_MODEL (opsional), AI_HOURLY_LIMIT (opsional, default 30 per guru).
Privasi & validasi: lihat api/_lib/ai.js.
==========================================================
*/
const K = require("../kesiswaan");
const AI = require("../ai");
const { verifyAdmin } = require("../../admin-auth");

const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const HOURLY = () => Math.max(1, Number(process.env.AI_HOURLY_LIMIT) || 30);
const MAX_TEKS = 600;
const usage = new Map();      // username -> [timestamp]; best effort per instance serverless

function readBody(req) {
    let body = req.body;
    if (typeof body === "string") { try { body = JSON.parse(body); } catch (e) { body = {}; } }
    return body && typeof body === "object" ? body : {};
}

function overLimit(user) {
    const now = Date.now(), list = (usage.get(user) || []).filter((t) => now - t < 3600e3);
    if (list.length >= HOURLY()) { usage.set(user, list); return true; }
    list.push(now); usage.set(user, list); return false;
}

module.exports = async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    const auth = verifyAdmin(req);
    if (!auth.ok) return res.status(auth.forbidden ? 403 : 401).json({ success: false, message: auth.forbidden ? "Akun ini tidak memiliki izin untuk fitur ini." : "Sesi Komisi Disiplin tidak valid. Silakan masuk lagi." });
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ success: false, message: "Metode tidak didukung." }); }

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return res.status(503).json({ success: false, code: "AI_OFF", message: "Fitur AI belum aktif: GEMINI_API_KEY belum diatur di Vercel (lalu Redeploy)." });

        const teks = String(readBody(req).teks || "").replace(/\s+/g, " ").trim();
        if (teks.length < 5) return res.status(400).json({ success: false, message: "Tulis kalimatnya dulu, mis. “Rizky X-1 dan Dina XI-2 terlambat 15 menit”." });
        if (teks.length > MAX_TEKS) return res.status(400).json({ success: false, message: `Kalimat terlalu panjang (maks ${MAX_TEKS} karakter).` });
        if (overLimit(auth.username || auth.nama || "admin")) return res.status(429).json({ success: false, message: `Batas ${HOURLY()} permintaan AI per jam tercapai. Coba lagi nanti atau catat manual.` });

        const [siswa, tatib] = await Promise.all([K.loadSiswa(), K.loadTatib()]);
        const { masked, mentions } = AI.maskNames(teks, siswa, tatib);
        if (!mentions.length) return res.status(200).json({ success: true, data: { mentions: [], kelompok: [], tanpaJenis: [], belumTercocok: [], pesan: "Tidak ada nama siswa yang cocok. Tulis nama (dan kelas bila perlu) sesuai data siswa." } });

        const today = K.todayWIB();
        const hari = HARI[new Date(today + "T00:00:00Z").getUTCDay()];
        const models = [...new Set([process.env.GEMINI_MODEL, "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"].filter(Boolean))];
        const ai = await AI.callGemini({ masked, tatib, today, hari, apiKey, models });
        const out = AI.validate(ai, mentions, tatib, today);

        return res.status(200).json({ success: true, data: { mentions, ...out } });
    } catch (e) {
        const status = e.status || 500;
        if (status === 500) console.error("ai-catat:", e && e.message);
        return res.status(status).json({ success: false, message: status === 500 ? "Terjadi kesalahan pada server." : e.message });
    }
};
