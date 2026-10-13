/*
==========================================================
SMANSASOO Kesiswaan Portal
Panel admin (pages/admin.html) -- dijaga js/admin-auth.js
API: GET/POST /api/pelanggaran (token otomatis ditambahkan)
==========================================================
*/
(function () {

    const { esc, fmt, fmtDate, getJSON } = KD;
    const $ = (id) => document.getElementById(id);

    const state = { v: [], siswa: [], tatib: [], tingkat: [], canWrite: false, sheetUrl: "", hariIni: "", picked: null };
    const PAGE = 25;
    let page = 1;

    /* ---------- util ---------- */

    function tierOf(points) {
        return state.tingkat.find((t) => points >= t.min && (t.max === null || points <= t.max)) || state.tingkat[0];
    }

    function ayRange() {
        const [y, m] = state.hariIni.split("-").map(Number);
        const s = m >= 7 ? y : y - 1;
        return { from: `${s}-07-01`, to: `${s + 1}-06-30`, label: `${s}/${s + 1}` };
    }

    function pointsOf(nis) {
        const r = ayRange();
        return state.v.filter((x) => x.nis === nis && x.tanggal >= r.from && x.tanggal <= r.to).reduce((s, x) => s + x.poin, 0);
    }

    function csvCell(v) {
        let s = String(v === null || v === undefined ? "" : v);
        if (/^[=+\-@]/.test(s)) s = "'" + s;          // cegah formula injection
        return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    }

    function downloadCSV(name, header, rows) {
        const body = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");
        const blob = new Blob(["﻿" + body], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }

    /* ---------- tab ---------- */

    const TABS = ["input", "data", "pembinaan"];

    function showTab(name, focus) {
        if (!TABS.includes(name)) name = "input";
        TABS.forEach((t) => {
            const sel = t === name;
            $("tab-" + t).setAttribute("aria-selected", String(sel));
            $("tab-" + t).tabIndex = sel ? 0 : -1;
            $("panel-" + t).classList.toggle("kd-hidden", !sel);
        });
        if (focus) $("tab-" + name).focus();
        if (name === "data") renderData();
        if (name === "pembinaan") renderPembinaan();
    }

    document.querySelectorAll(".kd-tab").forEach((b) => {
        b.addEventListener("click", () => { history.replaceState(null, "", "#" + b.dataset.tab); showTab(b.dataset.tab); });
        b.addEventListener("keydown", (e) => {
            const i = TABS.indexOf(b.dataset.tab);
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                const n = TABS[(i + (e.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length];
                history.replaceState(null, "", "#" + n);
                showTab(n, true);
            }
        });
    });
    window.addEventListener("hashchange", () => showTab(location.hash.slice(1)));

    /* ---------- INPUT ---------- */

    function fillJenis() {
        const groups = ["Ringan", "Sedang", "Berat"].map((c) => {
            const items = state.tatib.filter((t) => t.kategori === c);
            return items.length ? `<optgroup label="${c}">${items.map((t) => `<option value="${esc(t.kode)}">${esc(t.kode)} · ${esc(t.jenis)} (${t.poin} poin)</option>`).join("")}</optgroup>` : "";
        }).join("");
        $("fKode").innerHTML = `<option value="">— pilih jenis pelanggaran —</option>${groups}`;
    }

    function renderSuggest(q) {
        const list = $("siswaList");
        const query = q.trim().toLowerCase();
        if (query.length < 2) { list.classList.add("kd-hidden"); $("siswaSearch").setAttribute("aria-expanded", "false"); return; }
        const hits = state.siswa.filter((s) => s.nama.toLowerCase().includes(query) || s.nis.includes(query) || s.nisn.includes(query)).slice(0, 8);
        list.innerHTML = hits.length
            ? hits.map((s) => `<li role="option"><button type="button" data-nis="${esc(s.nis)}"><span>${esc(s.nama)}</span><small>${esc(s.kelas)} · ${esc(s.nis)}</small></button></li>`).join("")
            : `<li class="kd-empty" role="option" aria-disabled="true">Tidak ada siswa cocok.</li>`;
        list.classList.remove("kd-hidden");
        $("siswaSearch").setAttribute("aria-expanded", "true");
    }

    function pick(nis) {
        const s = state.siswa.find((x) => x.nis === nis);
        if (!s) return;
        state.picked = s;
        $("siswaList").classList.add("kd-hidden");
        $("siswaSearch").classList.add("kd-hidden");
        $("siswaSearch").setAttribute("aria-expanded", "false");
        const pts = pointsOf(s.nis);
        $("siswaPicked").classList.remove("kd-hidden");
        $("siswaPicked").innerHTML = `<span><strong>${esc(s.nama)}</strong><br><small>Kelas ${esc(s.kelas)} · NIS ${esc(s.nis)} · ${fmt(pts)} poin tahun ini</small></span><button type="button" id="unpick">Ganti</button>`;
        $("unpick").addEventListener("click", unpick);
        updatePreview();
    }

    function unpick() {
        state.picked = null;
        $("siswaPicked").classList.add("kd-hidden");
        $("siswaSearch").classList.remove("kd-hidden");
        $("siswaSearch").value = "";
        $("siswaSearch").focus();
        updatePreview();
    }

    function currentTatib() { return state.tatib.find((t) => t.kode === $("fKode").value) || null; }

    function updatePreview() {
        const box = $("preview");
        const t = currentTatib();
        if (!state.picked || !t) { box.classList.add("kd-hidden"); return; }
        const before = pointsOf(state.picked.nis), after = before + t.poin;
        const tb = tierOf(before), ta = tierOf(after);
        box.classList.remove("kd-hidden");
        box.innerHTML = `Poin <strong>${fmt(before)}</strong> → <strong>${fmt(after)}</strong> (+${fmt(t.poin)}) · Tingkat: <strong>${esc(ta.label)}</strong>`
            + (ta.label !== tb.label ? `<br>⚠️ Naik dari <em>${esc(tb.label)}</em>. Tindak lanjut: ${esc(ta.tindakan)}` : "");
        if (!$("fSanksi").value || $("fSanksi").dataset.auto === "1") {
            $("fSanksi").value = ta.label !== "Pembinaan Ringan" ? ta.label : "";
            $("fSanksi").dataset.auto = "1";
        }
    }

    function rowForSheet(id) {
        const t = currentTatib(), s = state.picked;
        return [id || "(otomatis)", $("fTanggal").value, s.nis, s.nama, s.kelas, t.kode, t.jenis, t.kategori, t.poin, $("fSanksi").value, "admin", $("fCatatan").value];
    }

    function setMsg(el, text) { el.textContent = text || ""; el.hidden = !text; }

    $("siswaSearch").addEventListener("input", (e) => renderSuggest(e.target.value));
    $("siswaSearch").addEventListener("keydown", (e) => { if (e.key === "Escape") renderSuggest(""); });
    $("siswaList").addEventListener("click", (e) => { const b = e.target.closest("button[data-nis]"); if (b) pick(b.dataset.nis); });
    $("fKode").addEventListener("change", updatePreview);
    $("fSanksi").addEventListener("input", () => { $("fSanksi").dataset.auto = "0"; });

    $("resetBtn").addEventListener("click", () => {
        setTimeout(() => { unpick(); $("fTanggal").value = state.hariIni; $("fSanksi").dataset.auto = ""; setMsg($("formError")); setMsg($("formOk")); $("copyBtn").classList.add("kd-hidden"); }, 0);
    });

    $("copyBtn").addEventListener("click", async () => {
        if (!state.picked || !currentTatib()) return;
        const text = rowForSheet().map((c) => String(c).replace(/[\t\r\n]+/g, " ")).join("\t");
        try { await navigator.clipboard.writeText(text); setMsg($("formOk"), "Baris disalin. Tempel di baris kosong tab PELANGGARAN pada Google Sheet."); }
        catch (e) { setMsg($("formError"), "Tidak bisa menyalin otomatis. Salin manual: " + text); }
    });

    $("inputForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        setMsg($("formError")); setMsg($("formOk"));
        const t = currentTatib();
        if (!state.picked) return setMsg($("formError"), "Pilih siswa terlebih dahulu.");
        if (!t) return setMsg($("formError"), "Pilih jenis pelanggaran.");
        if (!$("fTanggal").value) return setMsg($("formError"), "Tanggal kejadian wajib diisi.");
        if ($("fTanggal").value > state.hariIni) return setMsg($("formError"), "Tanggal tidak boleh di masa depan.");

        $("saveBtn").disabled = true;
        $("saveBtn").textContent = "Menyimpan…";
        try {
            const r = await fetch(CONFIG.API.PELANGGARAN, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ nis: state.picked.nis, kode: t.kode, tanggal: $("fTanggal").value, sanksi: $("fSanksi").value, catatan: $("fCatatan").value })
            });
            const body = await r.json().catch(() => ({}));

            if (r.status === 401) { AdminAuth.logout(); location.reload(); return; }
            if (!r.ok || !body.success) {
                setMsg($("formError"), body.message || `Gagal menyimpan (HTTP ${r.status}).`);
                if (body.code === "READ_ONLY") $("copyBtn").classList.remove("kd-hidden");
                return;
            }
            setMsg($("formOk"), `Tersimpan: ${body.data.nama} (${body.data.kelas}) · ${body.data.jenis} +${body.data.poin} poin · ${body.data.id}`);
            $("copyBtn").classList.add("kd-hidden");
            await load(true);
            $("inputForm").reset();
            unpick();
            $("fTanggal").value = state.hariIni;
            $("fSanksi").dataset.auto = "";
        } catch (err) {
            setMsg($("formError"), "Tidak bisa terhubung ke server.");
        } finally {
            $("saveBtn").disabled = false;
            $("saveBtn").textContent = "Simpan Pelanggaran";
        }
    });

    /* ---------- DATA ---------- */

    function filtered() {
        const q = $("qText").value.trim().toLowerCase(), k = $("qKelas").value, c = $("qKat").value, b = $("qBulan").value;
        return state.v.filter((x) =>
            (!q || x.nama.toLowerCase().includes(q) || x.nis.includes(q) || x.jenis.toLowerCase().includes(q)) &&
            (!k || x.kelas === k) && (!c || x.kategori === c) && (!b || x.tanggal.slice(0, 7) === b))
            .sort((a, z) => (a.tanggal < z.tanggal ? 1 : a.tanggal > z.tanggal ? -1 : (a.id < z.id ? 1 : -1)));
    }

    function renderData() {
        const rows = filtered();
        const pages = Math.max(1, Math.ceil(rows.length / PAGE));
        page = Math.min(page, pages);
        const slice = rows.slice((page - 1) * PAGE, page * PAGE);
        $("dataBody").innerHTML = slice.length ? slice.map((x) => `
            <tr><td>${esc(fmtDate(x.tanggal))}</td><td>${esc(x.nama)}<br><small style="opacity:.7">${esc(x.nis)}</small></td><td>${esc(x.kelas)}</td>
            <td>${esc(x.jenis)}${x.catatan ? `<br><small style="opacity:.7">${esc(x.catatan)}</small>` : ""}</td>
            <td><span class="kd-badge-cat" data-cat="${esc(x.kategori)}">${esc(x.kategori)}</span></td><td class="num">${fmt(x.poin)}</td></tr>`).join("")
            : `<tr><td colspan="6" class="kd-empty">Tidak ada data yang cocok.</td></tr>`;
        $("dataCount").textContent = `${fmt(rows.length)} catatan`;
        $("pageInfo").textContent = `Halaman ${page} dari ${pages}`;
        $("prevPage").disabled = page <= 1;
        $("nextPage").disabled = page >= pages;
    }

    ["qText", "qKelas", "qKat", "qBulan"].forEach((id) => $(id).addEventListener("input", () => { page = 1; renderData(); }));
    $("prevPage").addEventListener("click", () => { page--; renderData(); });
    $("nextPage").addEventListener("click", () => { page++; renderData(); });
    $("csvData").addEventListener("click", () => downloadCSV(`pelanggaran-${state.hariIni}.csv`,
        ["ID", "Tanggal", "NIS", "Nama", "Kelas", "Kode", "Jenis", "Kategori", "Poin", "Sanksi", "Pencatat", "Catatan"],
        filtered().map((x) => [x.id, x.tanggal, x.nis, x.nama, x.kelas, x.kode, x.jenis, x.kategori, x.poin, x.sanksi, x.pencatat, x.catatan])));

    function fillFilters() {
        const kelas = [...new Set(state.v.map((x) => x.kelas).concat(state.siswa.map((s) => s.kelas)))].filter(Boolean).sort();
        $("qKelas").innerHTML = `<option value="">Semua</option>` + kelas.map((k) => `<option>${esc(k)}</option>`).join("");
        const bulan = [...new Set(state.v.map((x) => x.tanggal.slice(0, 7)))].sort().reverse();
        $("qBulan").innerHTML = `<option value="">Semua</option>` + bulan.map((b) => { const [y, m] = b.split("-"); return `<option value="${b}">${KD.MONTHS[Number(m) - 1]} ${y}</option>`; }).join("");
        $("minTier").innerHTML = state.tingkat.map((t, i) => `<option value="${i}"${i === 1 ? " selected" : ""}>${esc(t.label)} (≥ ${t.min})</option>`).join("");
    }

    /* ---------- PEMBINAAN ---------- */

    function pembinaanRows() {
        const r = ayRange();
        const map = new Map();
        state.v.filter((x) => x.tanggal >= r.from && x.tanggal <= r.to).forEach((x) => {
            const e = map.get(x.nis) || { nis: x.nis, nama: x.nama, kelas: x.kelas, poin: 0, kasus: 0 };
            e.poin += x.poin; e.kasus++; map.set(x.nis, e);
        });
        const min = state.tingkat[Number($("minTier").value) || 0].min;
        return [...map.values()].filter((e) => e.poin >= min).sort((a, b) => b.poin - a.poin);
    }

    function renderPembinaan() {
        const rows = pembinaanRows();
        $("pembinaanSub").textContent = `Poin kumulatif tahun ajaran ${ayRange().label} · ${fmt(rows.length)} siswa`;
        $("pembinaanBody").innerHTML = rows.length ? rows.map((e) => { const t = tierOf(e.poin); return `
            <tr><td>${esc(e.nama)}<br><small style="opacity:.7">${esc(e.nis)}</small></td><td>${esc(e.kelas)}</td><td class="num"><strong>${fmt(e.poin)}</strong></td><td class="num">${fmt(e.kasus)}</td>
            <td><span class="kd-tier" data-w="${esc(t.warna)}" style="margin:0 0 .3rem">${esc(t.label)}</span><br><small>${esc(t.tindakan)}</small></td></tr>`; }).join("")
            : `<tr><td colspan="5" class="kd-empty">Tidak ada siswa pada tingkat ini.</td></tr>`;
    }

    $("minTier").addEventListener("change", renderPembinaan);
    $("csvPembinaan").addEventListener("click", () => downloadCSV(`perlu-pembinaan-${state.hariIni}.csv`,
        ["NIS", "Nama", "Kelas", "Poin", "Kasus", "Tingkat", "Tindak lanjut"],
        pembinaanRows().map((e) => { const t = tierOf(e.poin); return [e.nis, e.nama, e.kelas, e.poin, e.kasus, t.label, t.tindakan]; })));

    /* ---------- load ---------- */

    async function load(silent) {
        try {
            const res = await getJSON(CONFIG.API.PELANGGARAN);
            const d = res.data;
            Object.assign(state, { v: d.violations, siswa: d.siswa, tatib: d.tatib, tingkat: d.tingkat, hariIni: d.hariIni, canWrite: res.canWrite, sheetUrl: res.sheetUrl });

            $("adminMode").textContent = res.mode === "demo" ? "Mode demo (data contoh)" : res.canWrite ? "Terhubung · bisa menyimpan" : "Terhubung · hanya baca";
            $("adminMode").className = "kd-chip " + (res.mode === "demo" ? "kd-chip--demo" : "kd-chip--live");
            if (res.sheetUrl) { $("sheetLink").href = res.sheetUrl; $("sheetLink").classList.remove("kd-hidden"); }

            if (!silent) {
                fillJenis(); fillFilters();
                $("fTanggal").value = state.hariIni; $("fTanggal").max = state.hariIni;
                if (!res.canWrite) {
                    $("adminAlert").innerHTML = `<div class="kd-card" role="status"><strong>${res.mode === "demo" ? "Mode demo." : "Mode hanya baca."}</strong>
                        <span class="kd-card-sub" style="display:block;margin:.25rem 0 0">${res.mode === "demo"
                            ? "Atur GOOGLE_SHEET_ID di Vercel untuk memakai data sungguhan."
                            : "Service account belum diatur, jadi pelanggaran baru diisi langsung di Google Sheet."} Tombol “Salin baris” tetap tersedia setelah mengisi form.</span></div>`;
                    $("copyBtn").classList.remove("kd-hidden");
                }
                if (AdminAuth.insecure()) {
                    $("adminAlert").insertAdjacentHTML("beforeend", `<div class="kd-card" role="alert" style="margin-top:1rem;border-color:rgba(255,201,60,.6)">⚠️ Server masih memakai kredensial & kunci sesi bawaan dari kode publik. Atur <code>ADMIN_PASSWORD</code> dan <code>ADMIN_SESSION_SECRET</code> di Vercel.</div>`);
                }
            } else {
                fillFilters();
            }
            renderData(); renderPembinaan();
        } catch (e) {
            if (e.status === 401) { AdminAuth.logout(); location.reload(); return; }
            $("adminAlert").innerHTML = `<div class="kd-card kd-error" role="alert"><strong>Data tidak dapat dimuat.</strong> <span>${esc(e.message)}</span> <button type="button" class="kd-btn kd-btn--sm" id="retry" style="margin-left:.5rem">Coba lagi</button></div>`;
            const r = $("retry"); if (r) r.addEventListener("click", () => load());
        }
    }

    showTab(location.hash.slice(1));
    load();

})();
