/* Cek poin siswa: GET /api/cek-poin?nis=... */
(function () {

    const { esc, fmt, fmtDate, countUp, getJSON } = KD;

    const form = document.getElementById("cpForm");
    const input = document.getElementById("keyword");
    const btn = document.getElementById("cpBtn");
    const out = document.getElementById("cpResult");
    let tingkat = null;

    function nextTier(points, list) {
        return list.find((t) => t.min > points) || null;
    }

    async function ensureTiers() {
        if (tingkat) return tingkat;
        try { tingkat = (await getJSON(CONFIG.API.TATA_TERTIB)).data.tingkat; } catch (e) { tingkat = []; }
        return tingkat;
    }

    function render(d, tiers) {

        const nxt = nextTier(d.totalPoin, tiers);
        const cap = nxt ? nxt.min : Math.max(d.totalPoin, 1);
        const pct = Math.min(100, Math.round((d.totalPoin / cap) * 100));

        const rows = d.riwayat.length ? `
            <div class="kd-table-wrap"><table class="kd-table">
                <thead><tr><th>Tanggal</th><th>Pelanggaran</th><th>Kategori</th><th class="num">Poin</th></tr></thead>
                <tbody>${d.riwayat.map((v) => `
                    <tr><td>${esc(fmtDate(v.tanggal))}</td><td>${esc(v.jenis)}${v.sanksi ? `<br><small style="opacity:.75">Tindak lanjut: ${esc(v.sanksi)}</small>` : ""}</td>
                    <td><span class="kd-badge-cat" data-cat="${esc(v.kategori)}">${esc(v.kategori)}</span></td><td class="num">+${fmt(v.poin)}</td></tr>`).join("")}
                </tbody></table></div>`
            : `<p class="kd-empty">🎉 Belum ada pelanggaran tercatat pada tahun ajaran ini. Pertahankan!</p>`;

        out.innerHTML = `
        <article class="kd-card">
            <div class="kd-score">
                <div class="kd-score-num" id="cpNum">0</div>
                <div class="kd-score-meta">
                    <h2>${esc(d.nama)}</h2>
                    <p>Kelas ${esc(d.kelas)} · NIS ${esc(d.nis)} · ${esc(d.periode)}</p>
                    <span class="kd-tier" data-w="${esc(d.tingkat.warna)}">${esc(d.tingkat.label)}</span>
                </div>
            </div>
            <div class="kd-progress" role="img" aria-label="${d.totalPoin} poin${nxt ? ` dari ${nxt.min} menuju ${esc(nxt.label)}` : ""}">
                <span style="width:0" data-w="${pct}"></span>
            </div>
            <div class="kd-progress-cap"><span>0</span><span>${nxt ? `${fmt(nxt.min - d.totalPoin)} poin lagi menuju ${esc(nxt.label)}` : "Tingkat tertinggi"}</span></div>
            <div class="kd-note-box"><strong>Tindak lanjut:</strong> ${esc(d.tingkat.tindakan)}</div>
        </article>
        <article class="kd-card">
            <h2 class="kd-card-title">Riwayat Pelanggaran</h2>
            <p class="kd-card-sub">${fmt(d.riwayat.length)} catatan pada ${esc(d.periode)}</p>
            ${rows}
        </article>`;

        countUp(document.getElementById("cpNum"), d.totalPoin);
        requestAnimationFrame(() => requestAnimationFrame(() => {
            const bar = out.querySelector(".kd-progress span");
            if (bar) bar.style.width = bar.dataset.w + "%";
        }));
        out.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
    }

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const key = input.value.trim();

        if (key.length < 4) {
            out.innerHTML = `<div class="kd-card kd-error" role="alert"><p>Masukkan NIS minimal 4 digit.</p></div>`;
            input.focus();
            return;
        }

        btn.disabled = true;
        btn.textContent = "Mencari…";
        out.innerHTML = `<div class="kd-card"><div class="kd-skel" style="height:120px"></div></div>`;

        try {
            const [payload, tiers] = await Promise.all([
                getJSON(`${CONFIG.API.CEK_POIN}?nis=${encodeURIComponent(key)}`),
                ensureTiers()
            ]);
            render(payload.data, tiers);
        } catch (e) {
            out.innerHTML = `<div class="kd-card kd-error" role="alert"><h2 class="kd-card-title">${e.status === 404 ? "Data tidak ditemukan" : "Terjadi kendala"}</h2><p class="kd-card-sub">${esc(e.message)}</p></div>`;
        } finally {
            btn.disabled = false;
            btn.textContent = "Cari →";
        }
    });

})();
