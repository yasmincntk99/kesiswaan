/*
==========================================================
SMANSASOO Kesiswaan Portal
Shared Library: Google Sheets (baca + tulis)
==========================================================
Mode data (otomatis, urut prioritas):
1. SERVICE ACCOUNT  (GOOGLE_SERVICE_ACCOUNT_EMAIL + _KEY + GOOGLE_SHEET_ID)
   Baca & tulis lewat Google Sheets API. Spreadsheet cukup di-share
   ke email service account (Editor) -- TIDAK perlu dibuka publik.
   Ini mode yang direkomendasikan karena data pelanggaran siswa
   bersifat sensitif.
2. PUBLIK  (hanya GOOGLE_SHEET_ID)
   Hanya baca, lewat endpoint gviz CSV. Spreadsheet harus di-share
   "Anyone with the link: Viewer" -> data bisa dibaca siapa pun yang
   tahu link-nya. Tidak bisa menulis dari portal.
3. DEMO  (tidak ada GOOGLE_SHEET_ID)
   Memakai data fiktif di /data/sample-*.json.

Tanpa dependency npm: JWT service account dibuat dengan "crypto".
==========================================================
*/

const crypto = require("crypto");

const SHEET_ID = () => (process.env.GOOGLE_SHEET_ID || "").trim();

function hasServiceAccount() {
    return !!(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_KEY);
}

function mode() {
    if (!SHEET_ID()) return "demo";
    return hasServiceAccount() ? "service-account" : "public";
}

function canWrite() {
    return mode() === "service-account";
}

function sheetUrl() {
    return SHEET_ID() ? `https://docs.google.com/spreadsheets/d/${SHEET_ID()}/edit` : "";
}

/* ---------- CSV (untuk mode publik) ---------- */

function parseCSV(text) {
    const rows = [];
    let row = [], field = "", inQ = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i], next = text[i + 1];
        if (inQ) {
            if (ch === '"' && next === '"') { field += '"'; i++; }
            else if (ch === '"') inQ = false;
            else field += ch;
        } else if (ch === '"') inQ = true;
        else if (ch === ",") { row.push(field); field = ""; }
        else if (ch === "\r") { /* lewati */ }
        else if (ch === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
        else field += ch;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows;
}

/* ---------- Service account ---------- */

const b64url = (input) =>
    (Buffer.isBuffer(input) ? input : Buffer.from(input))
        .toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

let cached = { token: null, exp: 0 };

async function accessToken() {
    const now = Math.floor(Date.now() / 1000);
    if (cached.token && cached.exp - 60 > now) return cached.token;

    const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
    const key = String(process.env.GOOGLE_SERVICE_ACCOUNT_KEY).replace(/\\n/g, "\n");

    const input = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" })) + "." + b64url(JSON.stringify({
        iss: email,
        scope: "https://www.googleapis.com/auth/spreadsheets",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600
    }));

    const signer = crypto.createSign("RSA-SHA256");
    signer.update(input);
    signer.end();

    const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
            assertion: input + "." + b64url(signer.sign(key))
        })
    });

    if (!response.ok) {
        const detail = await googleDetail(response);
        console.error("Token Google gagal", JSON.stringify(detail));
        throw Object.assign(new Error(`Gagal mendapat token Google (HTTP ${response.status}).`), { detail });
    }

    const data = await response.json();
    cached = { token: data.access_token, exp: now + (data.expires_in || 3600) };
    return cached.token;
}

/** Ambil alasan dari respons error Google tanpa membocorkan data (hanya status, reason, pesan). */
async function googleDetail(response) {
    let reason = "", message = "";
    try {
        const body = await response.json();
        const e = body && body.error ? body.error : {};
        message = String(e.message || "").slice(0, 300);
        reason = String((e.status || (e.errors && e.errors[0] && e.errors[0].reason) || (e.details && e.details[0] && e.details[0].reason)) || "");
    } catch (x) { /* bukan JSON */ }
    return { status: response.status, reason, message };
}

/** Petunjuk non-rahasia untuk diagnosis admin: sheet mana & akun mana yang dipakai server. */
function diagnostics() {
    const id = SHEET_ID();
    return {
        mode: mode(),
        sheet: id ? `${id.slice(0, 6)}…${id.slice(-4)}` : "",
        account: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || ""
    };
}

/* ---------- API publik lib ---------- */

/** Baca satu tab -> array of arrays (baris pertama = header). */
async function readTab(tab) {
    const id = SHEET_ID();
    if (!id) throw new Error("GOOGLE_SHEET_ID belum diatur.");

    if (hasServiceAccount()) {
        const token = await accessToken();
        const url = `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(tab)}?valueRenderOption=FORMATTED_VALUE`;
        const response = await fetch(url, { headers: { Authorization: "Bearer " + token } });
        if (!response.ok) {
            const detail = await googleDetail(response);
            console.error("Sheets read gagal", tab, JSON.stringify(detail));
            throw Object.assign(new Error(`Gagal membaca tab "${tab}" (HTTP ${response.status}). Pastikan sheet di-share ke service account.`), { detail });
        }
        const data = await response.json();
        return data.values || [];
    }

    const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(tab)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Gagal membaca tab "${tab}" (HTTP ${response.status}). Pastikan sheet di-share "Anyone with the link".`);
    return parseCSV(await response.text());
}

/** Tab -> array of object, kunci = header huruf kecil tanpa spasi/titik. */
function rowsToObjects(rows) {
    if (!rows.length) return [];
    const keys = rows[0].map((h) => String(h || "").toLowerCase().replace(/[^a-z0-9]/g, ""));
    return rows.slice(1)
        .filter((r) => r.some((c) => String(c || "").trim() !== ""))
        .map((r) => {
            const o = {};
            keys.forEach((k, i) => { if (k) o[k] = String(r[i] === undefined ? "" : r[i]).trim(); });
            return o;
        });
}

/** Tambah satu baris di akhir tab. Nilai disimpan apa adanya (RAW). */
async function appendRow(tab, values) {
    return appendRows(tab, [values]);
}

/** Tambah banyak baris sekaligus (satu panggilan API). Nilai disimpan apa adanya (RAW). */
async function appendRows(tab, rows) {
    if (!rows.length) return;
    if (!canWrite()) throw Object.assign(new Error("Penulisan ke Google Sheet belum diaktifkan (service account belum diatur)."), { code: "READ_ONLY" });

    const token = await accessToken();
    const range = encodeURIComponent(`${tab}!A1`);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID()}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;

    const response = await fetch(url, {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({ values: rows })
    });

    if (!response.ok) {
        const detail = await googleDetail(response);
        console.error("Sheets append gagal", tab, JSON.stringify(detail));
        throw Object.assign(new Error(`Gagal menulis ke sheet (HTTP ${response.status}). Pastikan service account menjadi Editor.`), { detail });
    }
}

/** 0 -> A, 25 -> Z, 26 -> AA */
function colLetter(i) { let n = i + 1, s = ""; while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); } return s; }

/** Ubah banyak sel sekaligus (satu panggilan). updates: [{ tab, row (1-based), col (0-based), value }]. Nilai RAW (teks apa adanya). */
async function updateCells(updates) {
    if (!updates.length) return;
    if (!canWrite()) throw Object.assign(new Error("Penulisan ke Google Sheet belum diaktifkan (service account belum diatur)."), { code: "READ_ONLY" });
    const token = await accessToken();
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID()}/values:batchUpdate`, {
        method: "POST",
        headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
        body: JSON.stringify({
            valueInputOption: "RAW",
            data: updates.map((u) => ({ range: `'${String(u.tab).replace(/'/g, "''")}'!${colLetter(u.col)}${u.row}`, values: [[u.value]] }))
        })
    });
    if (!response.ok) {
        const detail = await googleDetail(response);
        console.error("Sheets update gagal", JSON.stringify(detail));
        throw Object.assign(new Error(`Gagal mengubah sheet (HTTP ${response.status}). Pastikan service account menjadi Editor.`), { detail });
    }
}

module.exports = { mode, canWrite, sheetUrl, readTab, rowsToObjects, appendRow, appendRows, updateCells, colLetter, diagnostics };
