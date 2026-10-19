/*
Rekomendasi Mingguan Wali Kelas. Data dari /api/walikelas (server membatasi ke kelas milik akun).
*/
(function () {
    "use strict";
    const $ = (id) => document.getElementById(id);
    const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const nf = (n) => Number(n || 0).toLocaleString("id-ID");
    const LV = { 1: ["Prioritas", "bad"], 2: ["Perlu dipantau", "warn"], 3: ["Info", "info"] };
    let kelas = "", dipilih = "";

    function render(d) {
        $("wkKelas").textContent = `Kelas ${d.kelas} · ${d.jumlahSiswa} siswa`;
        $("wkPeriode").textContent = `7 hari terakhir: ${d.minggu.label}`;
        const r = d.ringkas;
        const arah = r.arah === "naik" ? "▲ naik" : r.arah === "turun" ? "▼ turun" : "● tetap";
        const sum = `<section class="kd-card wk-sum" data-s="${r.arah === "naik" ? "bad" : r.arah === "turun" ? "ok" : "info"}">
            <h2 class="kd-card-title">Ringkasan kelas ${esc(d.kelas)}</h2>
            <p class="kd-tny-main">${esc(d.ringkasan)}</p>
            <div class="kd-esum">
                <div class="kd-esum-i"><span>Pelanggaran 7 hari terakhir</span><strong>${nf(r.kasusMinggu)} <small>${arah}</small></strong></div>
                <div class="kd-esum-i"><span>7 hari sebelumnya</span><strong>${nf(r.kasusMingguLalu)}</strong></div>
                <div class="kd-esum-i"><span>Siswa terlibat</span><strong>${nf(r.siswaTerlibatMinggu)}</strong></div>
                <div class="kd-esum-i"><span>Pelanggaran tahun ajaran ${esc(d.ta)}</span><strong>${nf(r.kasusTahunAjaran)}</strong></div>
            </div>
            ${d.hariTerbanyak ? `<p class="kd-card-sub" style="margin:.75rem 0 0">Hari dengan pelanggaran terbanyak sepanjang tahun ajaran: <strong>${esc(d.hariTerbanyak.hari)}</strong> (${nf(d.hariTerbanyak.jumlah)} kasus).</p>` : ""}
        </section>`;

        const cards = d.perhatian.length ? d.perhatian.map((s) => {
            const [lab, st] = LV[s.level] || LV[3];
            return `<article class="kd-card wk-card" data-s="${st}">
                <div class="wk-top"><strong class="wk-nama">${esc(s.nama)}</strong><span class="kd-ekpi-badge">${lab}</span></div>
                <p class="kd-card-sub" style="margin:.1rem 0 .5rem">${nf(s.poin)} poin · ${esc(s.tingkat)}${s.poinMinggu ? ` · +${nf(s.poinMinggu)} poin 7 hari terakhir` : ""}</p>
                <ul class="wk-list">${s.alasan.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>
                <p class="wk-saran"><strong>Saran:</strong> ${s.saran.map(esc).join(" ")}</p>
            </article>`;
        }).join("") : `<section class="kd-card"><p style="margin:0">Tidak ada siswa yang perlu perhatian khusus saat ini. 👍</p></section>`;

        const jenis = d.jenisTeratas.length ? `<section class="kd-card"><h2 class="kd-card-title">Pelanggaran tersering (7 hari terakhir)</h2><div class="kd-bars">${d.jenisTeratas.map((j) => `<div class="kd-bar"><div class="kd-bar-top"><span>${esc(j.jenis)}</span><strong>${nf(j.jumlah)}</strong></div><div class="kd-bar-track"><div class="kd-bar-fill" style="width:${Math.max(8, Math.round(j.jumlah / d.jenisTeratas[0].jumlah * 100))}%"></div></div></div>`).join("")}</div></section>` : "";

        const apr = d.apresiasi.jumlah ? `<section class="kd-card"><h2 class="kd-card-title">Layak diapresiasi</h2>
            <p class="kd-card-sub">${nf(d.apresiasi.jumlah)} siswa belum punya catatan pelanggaran tahun ajaran ini. Sapaan atau pujian singkat bisa menjaga semangatnya.</p>
            <p style="margin:0">${d.apresiasi.nama.map(esc).join(", ")}${d.apresiasi.jumlah > d.apresiasi.nama.length ? ` dan ${nf(d.apresiasi.jumlah - d.apresiasi.nama.length)} lainnya` : ""}.</p></section>` : "";

        const a = d.aturan;
        $("wkBody").innerHTML = `${sum}
            <h2 class="kd-card-title wk-h">Siswa yang perlu perhatian <small>(${nf(d.perhatian.length)})</small></h2>
            <div class="wk-grid">${cards}</div>
            <div class="kd-grid kd-grid--1-1">${jenis}${apr}</div>
            <p class="kd-card-sub">Cara menyusun saran: tindak lanjut belum ada untuk siswa SP1 atau lebih; sisa ≤ ${a.sisaMendekati} poin menuju tingkat berikutnya; jenis pelanggaran sama ≥ ${a.ulangMin} kali dalam 30 hari; atau tambahan ≥ ${a.lonjakanPoin} poin dalam 7 hari. Ini aturan sederhana, bukan prediksi, dan hanya anjuran untuk Bapak/Ibu.</p>`;
    }

    async function load() {
        $("wkAlert").innerHTML = "";
        try {
            const r = await fetch(CONFIG.API.WALIKELAS + (dipilih ? "?kelas=" + encodeURIComponent(dipilih) : ""), { cache: "no-store" });
            const j = await r.json().catch(() => ({}));
            if (r.status === 401) return;
            if (!r.ok || !j.success) throw new Error(j.message || "Gagal memuat data.");
            kelas = j.data.kelas;
            const sel = $("wkPilih");
            if (j.kelasTersedia.length > 1) {
                sel.classList.remove("kd-hidden");
                sel.innerHTML = j.kelasTersedia.map((k) => `<option value="${esc(k)}"${k === kelas ? " selected" : ""}>${esc(k)}</option>`).join("");
            }
            render(j.data);
        } catch (e) {
            $("wkBody").innerHTML = "";
            $("wkAlert").innerHTML = `<div class="kd-card kd-error" role="alert">${esc(e.message || "Gagal memuat data.")}</div>`;
        }
    }

    $("wkReload").addEventListener("click", load);
    $("wkPrint").addEventListener("click", () => window.print());
    $("wkPilih").addEventListener("change", (e) => { dipilih = e.target.value; load(); });
    load();
})();
