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
function letterHTML({ nis, nama, kelas, rows, poin, t, today, ayLabel }) {
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
.sign .qr{display:block;height:64px;width:auto;min-width:64px;margin:2px 0}
.bawah{margin-top:10px;border-top:1px dashed #000;padding-top:6px;font-size:10pt;break-inside:avoid}
.foot{position:fixed;left:0;right:0;bottom:0;border-top:3px solid #8fbf9f;padding-top:3px;font:italic bold 10pt Georgia,serif;color:#222}
.noprint{position:fixed;top:8px;right:8px;font:14px sans-serif}.noprint button{padding:8px 14px;font-size:14px;cursor:pointer}
@media print{.noprint{display:none}}
</style></head><body>
<div class="noprint"><button onclick="window.print()">Cetak</button></div>
<div class="kop"><img src="${base}/assets/logo/kop-jatim.png" alt=""><div class="t"><div>PEMERINTAH PROVINSI JAWA TIMUR</div><div>DINAS PENDIDIKAN</div><b>SMA NEGERI 1 SOOKO MOJOKERTO</b><small>Jalan R.A. Basuni No. 361 Kecamatan Sooko, Kab. Mojokerto 61361</small><small>Pos-el : info@sman1sooko.sch.id &nbsp; Laman : www.sman1sooko.sch.id</small></div></div>
<div class="tgl">Mojokerto, ${esc(tglPanjang(state.hariIni))}</div>
<table class="i"><tr><td>Nomor</td><td>: ......... / ......... / 101.6.27.15 / ${esc(state.hariIni.slice(0, 4))}</td></tr><tr><td>Lampiran</td><td>: -</td></tr><tr><td>Hal</td><td>: <b>${esc(hal)}</b></td></tr></table>
<p style="margin-top:10px">Kepada :<br>Yth. Bapak/Ibu Orang Tua / Wali dari <b>${esc(nama)}</b> (Kelas ${esc(kelas)}, NIS ${esc(nis)})<br>Di <b><u>TEMPAT</u></b></p>
<p>Dengan hormat,<br>${esc(isi)}</p>
<p>Total poin pelanggaran tahun ajaran ${esc(r.label)}: <b>${esc(poin)} poin</b> (${esc(t.label)}), dengan rincian:</p>
<table class="p"><thead><tr><th class="c" style="width:32px">No</th><th style="width:150px">Tanggal</th><th>Pelanggaran</th><th class="c" style="width:50px">Poin</th></tr></thead><tbody>${body}</tbody></table>
<p>Tindak lanjut sekolah: ${esc(t.tindakan)}</p>
<p style="margin-bottom:2px">Mengharap kehadiran Bapak/Ibu pada :</p>
<table class="i"><tr><td>Hari / Tanggal</td><td>: ................................................</td></tr><tr><td>Waktu</td><td>: Pukul ............ WIB</td></tr><tr><td>Tempat</td><td>: ................................................</td></tr></table>
<p>Atas perhatian dan kerjasamanya, kami sampaikan terima kasih.</p>
<div class="sign">Kepala SMAN 1 Sooko<img class="qr" src="${base}/assets/ttd/ttd-kepsek.png" alt="" onerror="this.style.visibility='hidden'"><b>Drs. SUGENG WIBAWA</b><br>Pembina Utama Muda<br>NIP. 196709041995121003</div>
<div class="bawah"><b>Tanda terima orang tua / wali</b> — surat ini telah saya terima. Mojokerto, ........................ &nbsp; (............................)</div>
<div class="foot">Bersama, Berkreasi dan Berprestasi</div>
</body></html>`;
}

module.exports = { letterHTML, signLink, verifyLink, tglPanjang, TTL_DAYS };
