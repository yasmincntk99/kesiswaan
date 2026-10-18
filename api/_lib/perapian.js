/*
Perapian data siswa. Semuanya deterministik (tanpa AI): lebih cepat, gratis, dan data siswa tidak pernah keluar dari server.
analisis() membaca Data_Siswa & Data_Foto_Siswa lalu menghasilkan:
  perbaikan : usulan ubah satu sel (id stabil "Tab!baris!kolom"), diterapkan HANYA bila guru mencentangnya;
  laporan   : masalah yang tidak bisa diperbaiki otomatis (NIS ganda, NIS formulir tak dikenal, nomor WA salah, dll).
Server menghitung ulang saat menerapkan, sehingga browser tidak bisa menulis nilai sembarang.
*/
const sheets = require("./sheets");
const K = require("./kesiswaan");

const COLS = { nis: 0, nama: 1, kelas: 2, foto: 3, nisn: 4, wa: 5 };
const KOLOM_LABEL = ["NIS", "Nama", "Kelas", "Foto", "NISN", "WA_Ortu"];
const raw = (cells, i) => String(cells[i] === undefined || cells[i] === null ? "" : cells[i]);
const T = (v) => String(v || "").trim();
const rapiSpasi = (v) => T(v).replace(/\s+/g, " ");
const KELAS_RE = /^(x|xi|xii)\s*[-.\/]?\s*(\d{1,2})$/i;

function normKelas(v) { const m = KELAS_RE.exec(rapiSpasi(v)); return m ? `${m[1].toUpperCase()}-${Number(m[2])}` : null; }

/** Data nama di sheet ini dominan HURUF BESAR? -> samakan; jika tidak, hanya rapikan spasi. */
function gayaNama(rows) {
    const names = rows.map((c) => T(c[COLS.nama])).filter((n) => /[A-Za-z]/.test(n));
    const upper = names.filter((n) => n === n.toUpperCase()).length;
    return names.length >= 5 && upper / names.length >= 0.8 ? "upper" : "asli";
}
const rapiNama = (v, gaya) => { const s = rapiSpasi(v); return gaya === "upper" ? s.toUpperCase() : s; };

const nisnBersih = (v) => { const d = T(v).replace(/\D/g, ""); return /^\d{10}$/.test(d) ? d : ""; };

async function analisis() {
    const [rawSiswa, rawForm] = await Promise.all([
        sheets.readTab("Data_Siswa"),
        sheets.readTab("Data_Foto_Siswa").catch(() => [])
    ]);
    const siswa = rawSiswa.map((cells, i) => ({ cells, row: i + 1 })).slice(1).filter((r) => r.cells.some((c) => T(c) !== ""));
    const form = rawForm.map((cells, i) => ({ cells, row: i + 1 })).slice(1).filter((r) => r.cells.some((c) => T(c) !== ""));
    const gaya = gayaNama(siswa.map((r) => r.cells));

    const perbaikan = [], laporan = [];
    const fix = (r, col, ke, jenis, saran) => {
        const dari = raw(r.cells, col);
        if (ke === dari || T(ke) === "" ) return;
        perbaikan.push({
            id: `Data_Siswa!${r.row}!${col}`, tab: "Data_Siswa", row: r.row, col, kolom: KOLOM_LABEL[col],
            nis: K.cleanNIS(r.cells[COLS.nis]), nama: T(r.cells[COLS.nama]), dari, ke, jenis, saran
        });
    };

    // data formulir terbaru per NIS (baris bawah = lebih baru)
    const formByNis = new Map();
    for (const r of form) { const nis = K.cleanNIS(r.cells[1]); if (nis) formByNis.set(nis, r); }

    const seen = new Map();
    for (const r of siswa) {
        const c = r.cells;
        const nisRaw = raw(c, COLS.nis), nisBersih = K.cleanNIS(nisRaw);
        const label = `baris ${r.row}`;
        const namaStr = T(c[COLS.nama]);

        if (!nisBersih) laporan.push({ jenis: "NIS kosong", teks: `${label}: ${namaStr || "(tanpa nama)"} belum punya NIS.` });
        if (!namaStr) laporan.push({ jenis: "Nama kosong", teks: `${label}: NIS ${nisBersih || "-"} belum punya nama.` });
        if (!T(c[COLS.kelas])) laporan.push({ jenis: "Kelas kosong", teks: `${label}: ${namaStr || nisBersih} belum punya kelas.` });
        if (nisBersih) { if (seen.has(nisBersih)) laporan.push({ jenis: "NIS ganda", teks: `NIS ${nisBersih} ada di baris ${seen.get(nisBersih)} dan ${r.row}.` }); else seen.set(nisBersih, r.row); }

        // 1) rapikan teks
        if (nisRaw !== "" && nisBersih && nisBersih !== nisRaw) fix(r, COLS.nis, nisBersih, "Format", "Hapus spasi / “.0” pada NIS");
        const nm = rapiNama(raw(c, COLS.nama), gaya);
        if (namaStr && nm !== raw(c, COLS.nama)) fix(r, COLS.nama, nm, "Format", gaya === "upper" ? "Spasi dirapikan, huruf besar seperti data lain" : "Spasi dirapikan");
        const kl = normKelas(raw(c, COLS.kelas));
        if (T(c[COLS.kelas]) && kl && kl !== raw(c, COLS.kelas)) fix(r, COLS.kelas, kl, "Format", "Seragamkan penulisan kelas (mis. X-1)");
        else if (T(c[COLS.kelas]) && !kl) laporan.push({ jenis: "Kelas tidak dikenal", teks: `${label}: kelas “${T(c[COLS.kelas])}” (${namaStr || nisBersih}) tidak berformat X/XI/XII-angka.` });

        // 2) nomor WA
        const waRaw = T(c[COLS.wa]), waOk = K.cleanWA(waRaw);
        if (waRaw && waOk && waOk !== raw(c, COLS.wa)) fix(r, COLS.wa, waOk, "Format", "Samakan format nomor WA (62…)");
        else if (waRaw && !waOk) laporan.push({ jenis: "Nomor WA salah", teks: `${label}: WA_Ortu “${waRaw}” (${namaStr || nisBersih}) tidak terbaca sebagai nomor HP.` });

        // 3) lengkapi dari formulir
        const f = nisBersih && formByNis.get(nisBersih);
        if (f) {
            const fFoto = T(f.cells[4]), fNisn = nisnBersih(f.cells[5]), fWa = K.cleanWA(f.cells[6]);
            if (!T(c[COLS.foto]) && /^https:\/\//i.test(fFoto)) fix(r, COLS.foto, fFoto, "Lengkapi", "Foto diambil dari formulir siswa");
            if (!T(c[COLS.nisn]) && fNisn) fix(r, COLS.nisn, fNisn, "Lengkapi", "NISN diambil dari formulir siswa");
            if (!waRaw && fWa) fix(r, COLS.wa, fWa, "Lengkapi", "Nomor WA ayah diambil dari formulir siswa");
            const fNama = rapiNama(f.cells[2], "upper"), sNama = rapiNama(namaStr, "upper");
            if (fNama && sNama && fNama !== sNama) laporan.push({ jenis: "Nama beda", teks: `NIS ${nisBersih}: Data_Siswa “${namaStr}” ≠ formulir “${T(f.cells[2])}”. Cek manual.` });
        }
    }

    // formulir: NIS tak dikenal / nomor salah
    const nisAda = new Set(siswa.map((r) => K.cleanNIS(r.cells[COLS.nis])));
    for (const [nis, r] of formByNis) if (!nisAda.has(nis)) laporan.push({ jenis: "NIS formulir tak dikenal", teks: `Formulir baris ${r.row}: NIS ${nis} (${T(r.cells[2]) || "tanpa nama"}) tidak ada di Data_Siswa.` });
    for (const [nis, r] of formByNis) { const w = T(r.cells[6]); if (w && !K.cleanWA(w)) laporan.push({ jenis: "Nomor WA salah", teks: `Formulir baris ${r.row}: nomor “${w}” (NIS ${nis}) tidak terbaca sebagai nomor HP.` }); }

    return { perbaikan, laporan, gaya, jumlahSiswa: siswa.length };
}

async function terapkan(ids, penangani) {
    const { perbaikan } = await analisis();
    const byId = new Map(perbaikan.map((p) => [p.id, p]));
    const dipilih = [...new Set(ids)].map((id) => byId.get(id)).filter(Boolean);
    if (!dipilih.length) return { diterapkan: 0, dilewati: ids.length, logOk: true };
    await sheets.updateCells(dipilih.map((p) => ({ tab: p.tab, row: p.row, col: p.col, value: p.ke })));
    let logOk = true;
    try {
        const stamp = `${K.todayWIB()} ${new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Jakarta" })}`;
        const safe = (v) => (/^[=+\-@]/.test(String(v)) ? "'" + v : String(v));
        await sheets.appendRows("Log_Perapian", dipilih.map((p) => [stamp, p.tab, p.row, p.kolom, p.nis, safe(p.nama), safe(p.dari), safe(p.ke), penangani]));
    } catch (e) { logOk = false; console.error("Log_Perapian gagal:", e && e.message); }
    return { diterapkan: dipilih.length, dilewati: ids.length - dipilih.length, logOk };
}

module.exports = { analisis, terapkan, normKelas, rapiNama };
