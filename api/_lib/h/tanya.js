/*
==========================================================
/api/tanya  (akun masuk: Komisi, Kesiswaan, atau Eksekutif)
POST { pertanyaan } -> { success, data: { judul, jawaban, satuan, baris:[{label,nilai}], total, ... } }
Hasil hanya angka gabungan. Lihat api/_lib/tanya.js untuk batas privasi.
Env: GEMINI_API_KEY (wajib), GEMINI_MODEL (opsional), AI_HOURLY_LIMIT (opsional; default 30 per akun per jam)
==========================================================
*/
const K = require("../kesiswaan");
const AI = require("../ai");
const T = require("../tanya");
const { verifyAdmin } = require("../../admin-auth");

const HOURLY = () => Math.max(1, Number(process.env.AI_HOURLY_LIMIT) || 30);
const MAX_TEKS = 300;
const usage = new Map();

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
    const auth = verifyAdmin(req, ["komisi", "kesiswaan", "eksekutif"]);
    if (!auth.ok) return res.status(auth.forbidden ? 403 : 401).json({ success: false, message: auth.forbidden ? "Akun ini tidak memiliki izin untuk fitur ini." : "Sesi tidak valid. Silakan masuk lagi." });
    if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ success: false, message: "Metode tidak didukung." }); }

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) return res.status(503).json({ success: false, code: "AI_OFF", message: "Fitur AI belum aktif: GEMINI_API_KEY belum diatur di Vercel (lalu Redeploy)." });

        const teks = String(readBody(req).pertanyaan || "").replace(/\s+/g, " ").trim();
        if (teks.length < 5) return res.status(400).json({ success: false, message: "Tulis pertanyaannya dulu, mis. “Kelas mana paling banyak terlambat bulan ini?”." });
        if (teks.length > MAX_TEKS) return res.status(400).json({ success: false, message: `Pertanyaan terlalu panjang (maks ${MAX_TEKS} karakter).` });
        if (overLimit(auth.username || auth.nama || "akun")) return res.status(429).json({ success: false, message: `Batas ${HOURLY()} pertanyaan per jam tercapai. Coba lagi nanti.` });

        const [siswa, tatib, violations] = await Promise.all([K.loadSiswa(), K.loadTatib(), K.loadPelanggaran()]);
        const { masked, mentions } = AI.maskNames(teks, siswa, tatib, T.STOP_TANYA);
        if (mentions.length) return res.status(200).json({ success: true, data: { ditolak: true, jawaban: "Tanya Data hanya menjawab angka gabungan, bukan data per siswa. Untuk satu siswa, gunakan menu Data Pelanggaran." } });

        const today = K.todayWIB();
        const ctx = { today, hari: T.HARI[new Date(today + "T00:00:00Z").getUTCDay()], tatib, kelas: [...new Set(siswa.map((s) => s.kelas).filter(Boolean))].sort((a, b) => a.localeCompare(b, "id", { numeric: true })) };
        const models = [...new Set([process.env.GEMINI_MODEL, "gemini-3.5-flash-lite", "gemini-3.1-flash-lite"].filter(Boolean))];
        const { sys, user } = T.prompt(masked, ctx);
        const ai = await AI.callJSON({ sys, user, schema: T.SCHEMA, apiKey, models });
        const spec = T.bersihkan(ai, ctx);
        if (spec.tolak) return res.status(200).json({ success: true, data: { ditolak: true, jawaban: spec.tolak } });
        const out = T.jalankan(spec, violations, ctx);
        if (out.tolak) return res.status(200).json({ success: true, data: { ditolak: true, jawaban: out.tolak } });
        return res.status(200).json({ success: true, data: out });
    } catch (e) {
        const status = e.status || 500;
        if (status === 500) console.error("tanya:", e && e.message);
        return res.status(status).json({ success: false, message: status === 500 ? "Pertanyaan belum dapat diproses. Coba lagi." : e.message });
    }
};
