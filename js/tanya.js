/*
Tanya Data (AI): kotak pertanyaan angka gabungan. Dipasang ke elemen dengan data-tanya (Panel Komisi/Kesiswaan dan Portal Eksekutif).
Server menerjemahkan pertanyaan ke kueri terstruktur dan menghitung sendiri dari Sheet (js tidak memegang data siswa).
*/
(function () {
    "use strict";
    const mount = document.querySelector("[data-tanya]");
    if (!mount || !window.CONFIG) return;
    const esc = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const nf = (n) => Number(n || 0).toLocaleString("id-ID");
    const CONTOH = ["Kelas mana paling banyak melanggar bulan ini?", "Pelanggaran apa yang paling sering tahun ajaran ini?", "Hari apa paling banyak siswa terlambat?", "Berapa pelanggaran kategori berat minggu ini?", "Bandingkan jumlah pelanggaran per bulan"];

    mount.innerHTML = `
        <h2 class="kd-card-title" style="margin:0 0 .25rem">💬 Tanya Data (AI)</h2>
        <p class="kd-card-sub" style="margin:0 0 .75rem">Tanyakan angka kedisiplinan dengan bahasa biasa. Jawaban dihitung langsung dari data sekolah dan hanya berupa angka gabungan, tanpa nama siswa.</p>
        <div class="kd-field full">
            <label class="kd-field-label" for="tnyText">Pertanyaan</label>
            <textarea class="kd-textarea" id="tnyText" rows="2" maxlength="300" placeholder="mis. Kelas mana paling banyak terlambat bulan ini?"></textarea>
        </div>
        <div class="kd-tny-chips">${CONTOH.map((c) => `<button type="button" class="kd-chip kd-tny-chip">${esc(c)}</button>`).join("")}</div>
        <div class="kd-actions" style="margin-top:.6rem"><button type="button" class="kd-btn kd-btn--primary" id="tnyRun">Tanyakan</button></div>
        <p class="kd-form-error kd-hidden" id="tnyMsg" role="alert" style="margin-top:.6rem"></p>
        <div id="tnyOut" aria-live="polite"></div>`;

    const $ = (id) => document.getElementById(id);
    const run = $("tnyRun"), txt = $("tnyText"), msg = $("tnyMsg"), out = $("tnyOut");

    function bars(d) {
        if (!d.baris.length) return "";
        const max = Math.max(1, ...d.baris.map((b) => b.nilai));
        if (d.baris.length === 1 && d.baris[0].label === "Total") return "";
        return `<div class="kd-bars" style="margin-top:.75rem">${d.baris.map((b) => `<div class="kd-bar"><div class="kd-bar-top"><span>${esc(b.label)}</span><strong>${nf(b.nilai)} ${esc(d.satuan)}</strong></div><div class="kd-bar-track"><div class="kd-bar-fill" style="width:${Math.max(3, Math.round(b.nilai / max * 100))}%"></div></div></div>`).join("")}</div>`;
    }

    async function ask() {
        const q = txt.value.trim();
        msg.classList.add("kd-hidden");
        if (q.length < 5) { msg.textContent = "Tulis pertanyaannya dulu."; msg.classList.remove("kd-hidden"); return; }
        run.disabled = true; run.textContent = "Menghitung…"; out.innerHTML = "";
        try {
            const r = await fetch(CONFIG.API.TANYA, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pertanyaan: q }) });
            const j = await r.json().catch(() => ({}));
            if (r.status === 401 || r.status === 403) return;
            if (!r.ok || !j.success) throw new Error(j.message || "Pertanyaan belum dapat diproses.");
            const d = j.data;
            if (d.ditolak) { out.innerHTML = `<div class="kd-card" style="margin-top:.75rem"><p style="margin:0">${esc(d.jawaban)}</p></div>`; return; }
            out.innerHTML = `<div class="kd-card kd-tny-ans" style="margin-top:.75rem">
                <p class="kd-card-sub" style="margin:0 0 .25rem">${esc(d.judul)}</p>
                <p class="kd-tny-main">${esc(d.jawaban)}</p>
                ${bars(d)}
                <p class="kd-card-sub" style="margin:.75rem 0 0">Dihitung dari ${nf(d.jumlahKasusDasar)} catatan pelanggaran${d.terpotong ? " · hanya baris teratas ditampilkan" : ""}.</p>
            </div>`;
        } catch (e) {
            msg.textContent = e.message || "Pertanyaan belum dapat diproses."; msg.classList.remove("kd-hidden");
        } finally { run.disabled = false; run.textContent = "Tanyakan"; }
    }

    run.addEventListener("click", ask);
    txt.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } });
    mount.querySelectorAll(".kd-tny-chip").forEach((b) => b.addEventListener("click", () => { txt.value = b.textContent; ask(); }));
})();
