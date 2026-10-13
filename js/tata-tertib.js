/* Halaman Tata Tertib: GET /api/tata-tertib */
(function () {

    const { esc, getJSON } = KD;

    const tiersEl = document.getElementById("ttTiers");
    const tableEl = document.getElementById("ttTable");

    function fail(el, msg) {
        el.innerHTML = `<p class="kd-empty" role="alert">${esc(msg)}</p>`;
    }

    getJSON(CONFIG.API.TATA_TERTIB).then(({ data }) => {

        tiersEl.innerHTML = `<ol class="kd-timeline">${data.tingkat.map((t) => `
            <li>
                <span class="kd-range" data-w="${esc(t.warna)}">${t.min}${t.max === null ? "+" : "–" + t.max}</span>
                <div><strong>${esc(t.label)}</strong><span>${esc(t.tindakan)}</span></div>
            </li>`).join("")}</ol>`;

        const groups = ["Ringan", "Sedang", "Berat"].map((cat) => ({
            cat, items: data.pelanggaran.filter((p) => p.kategori === cat)
        })).filter((g) => g.items.length);

        tableEl.innerHTML = groups.map((g) => `
            <h3 style="margin:1rem 0 .5rem;font-size:var(--font-md)"><span class="kd-badge-cat" data-cat="${g.cat}">${g.cat}</span></h3>
            <div class="kd-table-wrap"><table class="kd-table">
                <caption class="kd-sr">Pelanggaran kategori ${g.cat}</caption>
                <thead><tr><th scope="col">Kode</th><th scope="col">Jenis pelanggaran</th><th scope="col" class="num">Poin</th></tr></thead>
                <tbody>${g.items.map((p) => `<tr><td>${esc(p.kode)}</td><td>${esc(p.jenis)}</td><td class="num">${p.poin}</td></tr>`).join("")}</tbody>
            </table></div>`).join("");

    }).catch((e) => { fail(tiersEl, e.message); fail(tableEl, e.message); });

})();
