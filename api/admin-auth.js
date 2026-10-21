/*
==========================================================
SMANSASOO Kesiswaan Portal
POST /api/admin-auth  (login)
GET  /api/admin-auth  (verifikasi token)
==========================================================
Username + password admin diperiksa DI SERVER, lalu server
mengembalikan token bertanda tangan (HMAC-SHA256) yang berlaku
8 jam. Endpoint lain yang perlu dilindungi (mis. /api/pelanggaran)
memanggil verifyAdmin() yang di-export di bawah.

Kredensial bawaan (supaya langsung jalan tanpa konfigurasi):
  username : adminkesiswaan
  password : TIDAK ditulis di source code -- hanya hash SHA-256-nya
             (DEFAULT_PASSWORD_HASH).

PENTING (repo ini publik): hash password pendek bisa ditebak
(brute force offline) dan DEFAULT_SESSION_SECRET ikut terbaca
publik, sehingga token bisa dipalsukan. Untuk produksi, SET
Environment Variable di Vercel -- nilainya mengambil alih default:
  ADMIN_USERNAME         username admin
  ADMIN_PASSWORD         password baru (plaintext)
  ADMIN_SESSION_SECRET   string acak panjang (wajib untuk aman)
Selama ADMIN_SESSION_SECRET kosong, respons login membawa
"insecureDefaults: true" dan panel admin menampilkan peringatan.

AKUN PER GURU (opsional): tab "Pengguna" di Google Sheet
  Username | Nama | Password | Aktif | Peran
Nama guru itulah yang dicatat di kolom Pencatat. Tab dibaca hanya di
mode service account (tidak pernah lewat jalur publik, karena memuat
password). Akun ADMIN_USERNAME / ADMIN_PASSWORD tetap berlaku sebagai
akun cadangan. Password di sheet boleh teks biasa atau "sha256:<hex>".
Akun yang dinonaktifkan di sheet tetap bisa memakai token yang sudah
terbit sampai kedaluwarsa (maks. 8 jam); sesi baru langsung ditolak.

Pembatas tebak password: maksimal 5 gagal per IP + username per 10 menit
(Upstash kalau UPSTASH_REDIS_REST_* terisi, kalau tidak di memori).

POST body  : { "username": "...", "password": "..." }
POST respon: 200 { success, token, expiresAt, username, nama, peran, insecureDefaults }
             401 salah | 429 terlalu banyak percobaan
GET header : Authorization: Bearer <token>
GET respon : 200 { valid: true, username, nama, peran, expiresAt } | 401 { valid: false }
==========================================================
*/

const crypto = require("crypto");
const sheets = require("./_lib/sheets");

const TTL_SECONDS = 8 * 60 * 60;
const MAX_FAILS = 5;
const WINDOW_SECONDS = 10 * 60;

// Default sementara -- lihat catatan di atas. Untuk mengganti,
// isi ADMIN_USERNAME / ADMIN_PASSWORD di Environment Variable
// Vercel (nilainya akan menggantikan default ini).
const DEFAULT_USERNAME = "adminkesiswaan";
const DEFAULT_PASSWORD_HASH = "36212231d2a67b5184e9f0dd9246e1f4e4c147719995b01bb4c6415adbb6cb65";
const DEFAULT_SESSION_SECRET = "334d3eeec8c93a5a61177b65f496ca8ce1cc629302454d4d8655677bbdc21246";

const memFails = new Map();

function sha(value) {

    return crypto.createHash("sha256").update(String(value)).digest();

}

function safeEqual(a, b) {

    return crypto.timingSafeEqual(sha(a), sha(b));

}

function b64url(buffer) {

    return Buffer.from(buffer).toString("base64url");

}

function adminUsername() {

    return process.env.ADMIN_USERNAME || DEFAULT_USERNAME;

}

// Password ADMIN_PASSWORD (kalau diisi) dibandingkan sebagai
// plaintext seperti biasa; kalau tidak diisi, dibandingkan
// terhadap hash default di atas (plaintext-nya tidak pernah
// disimpan di sini).
function passwordMatches(password) {

    if (process.env.ADMIN_PASSWORD) {
        return safeEqual(password, process.env.ADMIN_PASSWORD);
    }

    const given = sha(password);
    const expected = Buffer.from(DEFAULT_PASSWORD_HASH, "hex");

    return given.length === expected.length && crypto.timingSafeEqual(given, expected);

}

/* ==========================================
   AKUN PER GURU (tab "Pengguna")
========================================== */

const INACTIVE = ["tidak", "nonaktif", "non-aktif", "no", "n", "false", "0", "off"];
const DUMMY_PASSWORD = "tidak-ada-akun-" + DEFAULT_PASSWORD_HASH.slice(0, 16);

/** Kolom "Kelas" tab Pengguna (untuk wali kelas): "X-1" atau "X-1, X-2" -> ["X-1","X-2"] (huruf besar). */
function parseKelas(v) {
    return [...new Set(String(v || "").toUpperCase().split(/[,;|]+/).map((x) => x.trim().replace(/\s+/g, "-")).filter(Boolean))].slice(0, 6);
}

async function loadUsers() {

    // Tab ini memuat password: hanya dibaca lewat service account, tidak pernah lewat gviz publik.
    if (sheets.mode() !== "service-account") return [];

    try {

        const rows = await sheets.readTab("Pengguna");

        return rows.slice(1).map((r) => ({
            username: String(r[0] || "").trim(),
            nama: String(r[1] || "").trim(),
            password: String(r[2] || "").trim(),
            aktif: !INACTIVE.includes(String(r[3] || "").trim().toLowerCase()),
            peran: String(r[4] || "").trim().toLowerCase() || "komisi",
            kelas: parseKelas(r[5])
        })).filter((u) => u.username && u.password && u.aktif);

    } catch (e) {

        console.warn("Tab Pengguna tidak terbaca (memakai akun cadangan saja):", e.message);
        return [];

    }

}

function sheetPasswordMatches(stored, given) {

    const m = /^sha256:([0-9a-f]{64})$/i.exec(stored);

    if (m) return crypto.timingSafeEqual(sha(given), Buffer.from(m[1], "hex"));

    return safeEqual(given, stored);

}

function signingSecret() {

    if (process.env.ADMIN_SESSION_SECRET) return process.env.ADMIN_SESSION_SECRET;
    if (process.env.ADMIN_PASSWORD) return sha("kesiswaan-admin|" + process.env.ADMIN_PASSWORD).toString("hex");

    return DEFAULT_SESSION_SECRET;

}

function insecureDefaults() {

    return !process.env.ADMIN_SESSION_SECRET && !process.env.ADMIN_PASSWORD;

}

function signToken(payload) {

    const body = b64url(JSON.stringify(payload));
    const mac = crypto.createHmac("sha256", signingSecret()).update(body).digest();

    return body + "." + b64url(mac);

}

/* ==========================================
   VERIFIKASI TOKEN (dipakai GET di bawah,
   dan di-export untuk endpoint lain)
========================================== */

/* Peran akun (kolom "Peran" tab Pengguna). Boleh lebih dari satu: "komisi", "eksekutif", "komisi,eksekutif".
   Nilai lain (mis. "admin", "guru") dianggap "komisi" agar akun lama tetap berfungsi. Kosong = "komisi". */
const EKSEKUTIF_ALIAS = ["eksekutif", "executive", "eksekutif-sekolah", "kepsek", "kepala-sekolah", "pimpinan"];

const WALI_ALIAS = ["walikelas", "wali-kelas", "wali", "wk"];
const KESISWAAN_ALIAS = ["kesiswaan", "bk", "bimbingan-konseling", "guru-bk", "wakasek-kesiswaan", "waka-kesiswaan"];

function parsePeran(value) {
    const tokens = String(value || "").toLowerCase().split(/[,;/|]+/).map((t) => t.trim().replace(/\s+/g, "-")).filter(Boolean);
    const roles = new Set();
    if (!tokens.length) roles.add("komisi");
    tokens.forEach((t) => roles.add(EKSEKUTIF_ALIAS.includes(t) ? "eksekutif" : KESISWAAN_ALIAS.includes(t) ? "kesiswaan" : WALI_ALIAS.includes(t) ? "walikelas" : "komisi"));
    return [...roles];
}

/** need: peran yang disyaratkan endpoint ("komisi" bawaan; "eksekutif"; "kesiswaan"; atau daftar, mis. ["komisi","kesiswaan"] = salah satu; null = cukup sesi valid).
    Komisi = akses penuh; Kesiswaan = terbatas (data, pembinaan, surat); Eksekutif = hanya portal KPI. */
function verifyAdmin(req, need = "komisi") {

    const header = String(req.headers.authorization || "");
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    const parts = token.split(".");

    if (parts.length !== 2) return { ok: false, configured: true };

    const expected = crypto.createHmac("sha256", signingSecret()).update(parts[0]).digest();
    let given;

    try {
        given = Buffer.from(parts[1], "base64url");
    } catch (e) {
        return { ok: false, configured: true };
    }

    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
        return { ok: false, configured: true };
    }

    let payload;

    try {
        payload = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    } catch (e) {
        return { ok: false, configured: true };
    }

    if (!payload || !payload.exp || Math.floor(Date.now() / 1000) >= payload.exp) {
        return { ok: false, configured: true };
    }

    const roles = parsePeran(payload.r);
    if (need && !([].concat(need)).some((n) => roles.includes(n))) return { ok: false, forbidden: true, configured: true, roles };

    return { ok: true, configured: true, username: payload.u, nama: payload.n || payload.u, peran: payload.r || "komisi", roles, kelas: Array.isArray(payload.k) ? payload.k.map(String).slice(0, 6) : [], expiresAt: payload.exp };

}

/* ==========================================
   LOGIN (POST) -- pembatas percobaan gagal
========================================== */

function clientIp(req) {

    const forwarded = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();

    return forwarded || (req.socket && req.socket.remoteAddress) || "unknown";

}

async function upstash(commands) {

    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;

    if (!url || !token) return null;

    try {

        const response = await fetch(url.replace(/\/$/, "") + "/pipeline", {
            method: "POST",
            headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
            body: JSON.stringify(commands)
        });

        if (!response.ok) return null;

        return await response.json();

    } catch (e) {

        return null;

    }

}

async function getFails(key) {

    const data = await upstash([["GET", key]]);

    if (data && data[0]) return Number(data[0].result) || 0;

    const entry = memFails.get(key);

    if (!entry || Date.now() > entry.reset) return 0;

    return entry.count;

}

async function addFail(key) {

    const data = await upstash([["INCR", key], ["EXPIRE", key, WINDOW_SECONDS]]);

    if (data) return;

    const entry = memFails.get(key);

    if (!entry || Date.now() > entry.reset) {
        memFails.set(key, { count: 1, reset: Date.now() + WINDOW_SECONDS * 1000 });
    } else {
        entry.count++;
    }

}

async function clearFails(key) {

    await upstash([["DEL", key]]);
    memFails.delete(key);

}

function readBody(req) {

    let body = req.body;

    if (typeof body === "string") {
        try { body = JSON.parse(body); } catch (e) { body = {}; }
    }

    return body && typeof body === "object" ? body : {};

}

async function handleLogin(req, res) {

    const adminUser = adminUsername();

    const body = readBody(req);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");
    const uname = username.toLowerCase();

    // per IP + username: satu guru yang salah ketik tidak mengunci guru lain di Wi-Fi sekolah yang sama
    const key = "kesiswaan-adminfail:" + clientIp(req) + ":" + uname.slice(0, 64);

    if ((await getFails(key)) >= MAX_FAILS) {
        return res.status(429).json({
            success: false,
            message: "Terlalu banyak percobaan gagal. Coba lagi dalam 10 menit."
        });
    }

    // keduanya selalu dihitung (tanpa short-circuit) supaya waktu respons seragam
    const userOk = safeEqual(uname, adminUser.toLowerCase());
    const passOk = passwordMatches(password);

    let account = null;

    if (userOk && passOk) {

        account = { username: adminUser, nama: process.env.ADMIN_NAME || adminUser, peran: "komisi" };

    } else {

        const user = (await loadUsers()).find((u) => u.username.toLowerCase() === uname);
        const ok = sheetPasswordMatches(user ? user.password : DUMMY_PASSWORD, password);

        if (user && ok) account = { username: user.username, nama: user.nama || user.username, peran: user.peran, kelas: user.kelas || [] };

    }

    if (!account) {

        await addFail(key);
        await new Promise((resolve) => setTimeout(resolve, 500));

        return res.status(401).json({ success: false, message: "Username atau password salah." });

    }

    await clearFails(key);

    const now = Math.floor(Date.now() / 1000);
    const exp = now + TTL_SECONDS;

    return res.status(200).json({
        success: true,
        token: signToken({ u: account.username, n: account.nama, r: account.peran, k: account.kelas || [], iat: now, exp }),
        expiresAt: exp,
        username: account.username,
        nama: account.nama,
        peran: account.peran,
        roles: parsePeran(account.peran),
        kelas: account.kelas || [],
        insecureDefaults: insecureDefaults()
    });

}

function handleVerify(req, res) {

    const result = verifyAdmin(req, null);

    if (!result.ok) {
        return res.status(401).json({ valid: false });
    }

    return res.status(200).json({ valid: true, username: result.username, nama: result.nama, peran: result.peran, roles: result.roles, kelas: result.kelas, expiresAt: result.expiresAt, insecureDefaults: insecureDefaults() });

}

module.exports = async function handler(req, res) {

    res.setHeader("Cache-Control", "no-store");

    if (req.method === "POST") return handleLogin(req, res);
    if (req.method === "GET") return handleVerify(req, res);

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ success: false, message: "Metode tidak diizinkan." });

};

module.exports.verifyAdmin = verifyAdmin;
module.exports.parsePeran = parsePeran;
module.exports.signingSecret = signingSecret;
module.exports.signToken = signToken;
module.exports.upstash = upstash;
