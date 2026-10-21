/*
Surat peringatan / panggilan orang tua + tautan bertanda tangan.
Kunci tanda tangan diturunkan dari rahasia sesi dengan label berbeda, sehingga token surat
TIDAK bisa dipakai sebagai token admin (dan sebaliknya).
*/
const crypto = require("crypto");

const BULAN_PANJANG = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];
const tglPanjang = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ""); return m ? `${Number(m[3])} ${BULAN_PANJANG[Number(m[2]) - 1]} ${m[1]}` : ""; };
const esc = (v) => String(v === undefined || v === null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const TTL_DAYS = 14;

/* Jadwal kehadiran orang tua: tanggal (kalender), jam 08.00–13.00, ruang (daftar tetap). */
const WAKTU = ["08.00", "08.30", "09.00", "09.30", "10.00", "10.30", "11.00", "11.30", "12.00", "12.30", "13.00"];
const RUANG = ["Ruang BK", "Ruang Pertemuan"];
const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
const MAKS_HARI_KE_DEPAN = 90;

function hariTanggal(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!m) return "";
    return `${HARI[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).getUTCDay()]}, ${tglPanjang(iso)}`;
}

/** -> { d, w, r } yang sudah divalidasi, atau { error }. today: ISO tanggal hari ini (WIB). */
function cekJadwal(j, today) {
    j = j || {};
    const d = String(j.tanggal || ""), w = String(j.waktu || ""), r = String(j.ruang || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || hariTanggal(d).startsWith("undefined") || isNaN(Date.parse(d + "T00:00:00Z"))) return { error: "Tanggal kehadiran belum dipilih." };
    if (d < today) return { error: "Tanggal kehadiran tidak boleh sebelum hari ini." };
    if (Date.parse(d + "T00:00:00Z") - Date.parse(today + "T00:00:00Z") > MAKS_HARI_KE_DEPAN * 86400000) return { error: `Tanggal kehadiran maksimal ${MAKS_HARI_KE_DEPAN} hari ke depan.` };
    if (new Date(d + "T00:00:00Z").getUTCDay() === 0) return { error: "Hari Minggu tidak dapat dipilih." };
    if (!WAKTU.includes(w)) return { error: "Waktu harus antara 08.00 dan 13.00." };
    if (!RUANG.includes(r)) return { error: "Ruangan tidak valid." };
    return { d, w, r };
}

function key(secret) { return crypto.createHash("sha256").update("surat-kesiswaan|" + secret).digest(); }

function signLink(payload, secret) {
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return body + "." + crypto.createHmac("sha256", key(secret)).update(body).digest("base64url");
}

/** -> payload { n: nis, iat, exp } atau null bila rusak / kedaluwarsa. */
function verifyLink(token, secret) {
    const parts = String(token || "").split(".");
    if (parts.length !== 2) return null;
    const expected = crypto.createHmac("sha256", key(secret)).update(parts[0]).digest();
    let given;
    try { given = Buffer.from(parts[1], "base64url"); } catch (e) { return null; }
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return null;
    try {
        const p = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
        if (!p || p.k !== "surat" || !p.n || !(p.exp > Math.floor(Date.now() / 1000))) return null;
        return p;
    } catch (e) { return null; }
}

/** rows: pelanggaran siswa pada tahun ajaran, urut tanggal; t: tingkat; today: ISO tanggal surat. */
function letterHTML({ nis, nama, kelas, rows, poin, t, today, ayLabel, jadwal, nomor }) {
    const r = { label: ayLabel };
    const state = { hariIni: today };
    const isSP = /^Surat Peringatan/.test(t.label);
        const isi = {
            "Surat Peringatan 1": "Berdasarkan catatan Komisi Disiplin Sekolah, putra/putri Bapak/Ibu telah melakukan beberapa pelanggaran tata tertib sekolah sebagaimana tercantum di bawah ini. Sehubungan dengan itu, sekolah menerbitkan Surat Peringatan 1 dan siswa dipanggil oleh Guru BK untuk mendapat pembinaan.",
            "Surat Peringatan 2": "Berdasarkan catatan Komisi Disiplin Sekolah, jumlah poin pelanggaran putra/putri Bapak/Ibu telah mencapai tingkat Surat Peringatan 2. Sekolah menerbitkan Surat Peringatan 2 dan memohon kehadiran Bapak/Ibu untuk pembinaan bersama pihak sekolah.",
            "Surat Peringatan 3": "Berdasarkan catatan Komisi Disiplin Sekolah, jumlah poin pelanggaran putra/putri Bapak/Ibu telah mencapai tingkat Surat Peringatan 3. Sekolah menerbitkan Surat Peringatan 3 dan memohon kehadiran Bapak/Ibu untuk pembinaan intensif serta pembuatan pernyataan tertulis bermaterai.",
            "Pembinaan Khusus": "Berdasarkan catatan Komisi Disiplin Sekolah, jumlah poin pelanggaran putra/putri Bapak/Ibu telah mencapai tingkat Pembinaan Khusus. Sekolah memohon kehadiran Bapak/Ibu untuk pembahasan tindak lanjut bersama pihak sekolah."
        }[t.label] || "Berdasarkan catatan Komisi Disiplin Sekolah, putra/putri Bapak/Ibu memerlukan pembinaan terkait pelanggaran tata tertib sekolah.";
        const body = rows.map((x, i) => `<tr><td class="c">${i + 1}</td><td class="nw">${esc(tglPanjang(x.tanggal))}</td><td>${esc(x.jenis)}</td><td class="c">${esc(x.poin)}</td></tr>`).join("");
        const base = "";
        const hal = isSP ? t.label : "Panggilan Orang Tua / Wali";
        return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>${esc(hal)} - ${esc(nama)}</title>
<style>
@page{size:A4;margin:12mm 18mm 18mm}
*{box-sizing:border-box}body{font:10.5pt/1.35 Arial,Helvetica,sans-serif;color:#000;margin:0}
.kop{display:flex;align-items:center;gap:14px;padding-bottom:6px;border-bottom:4px double #222}
.kop img{width:70px;height:auto;flex:none}.kop .t{flex:1;text-align:center;line-height:1.25}
.kop .t div{font-size:13pt}.kop .t b{display:block;font-size:15pt}.kop .t small{display:block;font-size:9pt}
.tgl{text-align:right;margin:8px 0 10px}
table.i{border-collapse:collapse}table.i td{padding:0 8px 0 0;vertical-align:top}table.i td:first-child{width:95px}
p{margin:6px 0}
table.p{width:100%;border-collapse:collapse;margin:6px 0}
table.p th,table.p td{border:1px solid #000;padding:2px 6px}table.p th{background:#eee}.c{text-align:center}.nw{white-space:nowrap}
.sign{margin:10px 0 0 auto;width:58%;break-inside:avoid;line-height:1.3}
.sign .qr{display:block;height:84px;width:auto;min-width:84px;margin:2px 0}
.bawah{margin-top:10px;border-top:1px dashed #000;padding-top:6px;font-size:10pt;break-inside:avoid}
.foot{position:fixed;left:0;right:0;bottom:0;border-top:3px solid #8fbf9f;padding-top:3px;font:italic bold 10pt Georgia,serif;color:#222}
.noprint{position:fixed;top:8px;right:8px;font:14px sans-serif}.noprint button{padding:8px 14px;font-size:14px;cursor:pointer}
@media print{.noprint{display:none}}
</style></head><body>
<div class="noprint"><button onclick="window.print()">Cetak</button></div>
<div class="kop"><img src="${base}/assets/logo/kop-jatim-transparan.png" alt=""><div class="t"><div>PEMERINTAH PROVINSI JAWA TIMUR</div><div>DINAS PENDIDIKAN</div><b>SMA NEGERI 1 SOOKO MOJOKERTO</b><small>Jalan R.A. Basuni No. 361 Kecamatan Sooko, Kab. Mojokerto 61361</small><small>Pos-el : info@sman1sooko.sch.id &nbsp; Laman : www.sman1sooko.sch.id</small></div></div>
<div class="tgl">Mojokerto, ${esc(tglPanjang(state.hariIni))}</div>
<table class="i"><tr><td>Nomor</td><td>: ${esc(nomor || "........." + "/KDS/101.6.27.15/" + state.hariIni.slice(0, 4))}</td></tr><tr><td>Lampiran</td><td>: -</td></tr><tr><td>Hal</td><td>: <b>${esc(hal)}</b></td></tr></table>
<p style="margin-top:10px">Kepada :<br>Yth. Bapak/Ibu Orang Tua / Wali dari <b>${esc(nama)}</b> (Kelas ${esc(kelas)}, NIS ${esc(nis)})<br>Di <b><u>TEMPAT</u></b></p>
<p>Dengan hormat,<br>${esc(isi)}</p>
<p>Total poin pelanggaran tahun ajaran ${esc(r.label)}: <b>${esc(poin)} poin</b> (${esc(t.label)}), dengan rincian:</p>
<table class="p"><thead><tr><th class="c" style="width:32px">No</th><th style="width:150px">Tanggal</th><th>Pelanggaran</th><th class="c" style="width:50px">Poin</th></tr></thead><tbody>${body}</tbody></table>
<p>Tindak lanjut sekolah: ${esc(t.tindakan)}</p>
<p style="margin-bottom:2px">Mengharap kehadiran Bapak/Ibu pada :</p>
<table class="i"><tr><td>Hari / Tanggal</td><td>: ${jadwal ? `<b>${esc(hariTanggal(jadwal.d))}</b>` : "................................................"}</td></tr><tr><td>Waktu</td><td>: ${jadwal ? `Pukul <b>${esc(jadwal.w)}</b> WIB` : "Pukul ............ WIB"}</td></tr><tr><td>Tempat</td><td>: ${jadwal ? `<b>${esc(jadwal.r)}</b> SMAN 1 Sooko` : "................................................"}</td></tr></table>
<p>Atas perhatian dan kerjasamanya, kami sampaikan terima kasih.</p>
<div class="sign">Kepala SMAN 1 Sooko<img class="qr" src="${base}/assets/ttd/ttd-kepsek.png" alt="" onerror="this.style.visibility='hidden'"><b>Drs. SUGENG WIBAWA</b><br>Pembina Utama Muda<br>NIP. 196709041995121003</div>
<div class="bawah"><b>Tanda terima orang tua / wali</b> — surat ini telah saya terima. Mojokerto, ........................ &nbsp; (............................)</div>
<div class="foot">Bersama, Berkreasi dan Berprestasi</div>
</body></html>`;
}

/** Nomor surat: <urut 3 digit><tanggal panggil>/KDS/101.6.27.15/<tahun>, mis. 00521/KDS/101.6.27.15/2026. */
async function nomorSurat(upstash, nis, tingkat, tanggalIso) {
    const m = /^(\d{4})-\d{2}-(\d{2})$/.exec(tanggalIso || "");
    if (!m || typeof upstash !== "function") return null;
    const [, thn, tgl] = m;
    const mapKey = `surat:map:${thn}:${nis}:${tingkat}:${tanggalIso}`;
    const fmt = (n) => `${String(n).padStart(3, "0")}${tgl}/KDS/101.6.27.15/${thn}`;
    const ada = await upstash([["GET", mapKey]]);
    if (!ada) return null;                                   // Upstash belum aktif: kosongkan agar tidak ada nomor ganda
    if (ada[0] && ada[0].result) return fmt(Number(ada[0].result));
    const inc = await upstash([["INCR", `surat:no:${thn}`]]);
    const n = inc && inc[0] && Number(inc[0].result);
    if (!n) return null;
    const set = await upstash([["SET", mapKey, String(n), "NX"]]);
    if (set && set[0] && set[0].result === null) {           // keduluan permintaan lain untuk surat yang sama
        const lagi = await upstash([["GET", mapKey]]);
        if (lagi && lagi[0] && lagi[0].result) return fmt(Number(lagi[0].result));
    }
    return fmt(n);
}

module.exports = { nomorSurat, letterHTML, signLink, verifyLink, tglPanjang, TTL_DAYS, WAKTU, RUANG, MAKS_HARI_KE_DEPAN, hariTanggal, cekJadwal };
