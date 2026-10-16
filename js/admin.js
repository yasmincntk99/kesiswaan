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

    /* ---------- bagian halaman (dipilih lewat sidebar) ---------- */
    // Tidak ada tombol tab di halaman: menu "Catat Pelanggaran / Data Pelanggaran /
    // Perlu Pembinaan" ada di sidebar (js/shell.js) dan memakai hash URL.

    const TABS = ["input", "data", "pembinaan"];
    const TAB_LABEL = { input: "Catat Pelanggaran", data: "Data Pelanggaran", pembinaan: "Perlu Pembinaan" };

    function showTab(name, scroll) {
        if (!TABS.includes(name)) name = "input";
        TABS.forEach((t) => $("panel-" + t).classList.toggle("kd-hidden", t !== name));
        $("adminSection").textContent = TAB_LABEL[name];
        document.dispatchEvent(new CustomEvent("kd:tab", { detail: { tab: name } }));   // sidebar menyorot menu aktif
        if (name === "data") renderData();
        if (name === "pembinaan") renderPembinaan();
        if (scroll) $("adminSection").scrollIntoView({ block: "start", behavior: "smooth" });
    }

    window.addEventListener("hashchange", () => showTab(location.hash.slice(1), true));

    /* ---------- INPUT: kelas -> siswa -> profil -> form ---------- */

    const natural = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
    const QKEY = "kd-pelanggaran-queue";
    const CKEY = "kd-admin-cache";

    function fillJenis() {
        const groups = ["Ringan", "Sedang", "Berat"].map((c) => {
            const items = state.tatib.filter((t) => t.kategori === c);
            return items.length ? `<optgroup label="${c}">${items.map((t) => `<option value="${esc(t.kode)}">[${esc(t.kode)}] ${esc(t.jenis)} (+${t.poin} poin)</option>`).join("")}</optgroup>` : "";
        }).join("");
        $("fKode").innerHTML = `<option value="">— pilih jenis pelanggaran —</option>${groups}`;
    }

    function fillKelas() {
        const cur = $("selKelas").value;
        const kelas = [...new Set(state.siswa.map((s) => s.kelas))].filter(Boolean).sort(natural);
        $("selKelas").innerHTML = `<option value="">— pilih kelas —</option>` + kelas.map((k) => `<option>${esc(k)}</option>`).join("");
        if (cur && kelas.includes(cur)) $("selKelas").value = cur;
    }

    function siswaDiKelas(k) { return state.siswa.filter((s) => s.kelas === k).sort((a, b) => a.nama.localeCompare(b.nama)); }

    function onKelas() {
        const k = $("selKelas").value;
        $("selSiswa").disabled = !k;
        $("selSiswa").innerHTML = k
            ? `<option value="">— pilih nama siswa —</option>` + siswaDiKelas(k).map((s) => `<option value="${esc(s.nis)}">${esc(s.nama)} (NIS ${esc(s.nis)})</option>`).join("")
            : `<option value="">— pilih kelas dulu —</option>`;
        $("rekapBtn").classList.toggle("kd-hidden", !k);
        hideSiswa();
    }

    function hideSiswa() {
        state.picked = null;
        $("sectionProfil").classList.add("kd-hidden");
        $("sectionForm").classList.add("kd-hidden");
    }

    function riwayatOf(nis) {
        const r = ayRange();
        return state.v.filter((x) => x.nis === nis && x.tanggal >= r.from && x.tanggal <= r.to)
            .sort((a, z) => (a.tanggal < z.tanggal ? 1 : a.tanggal > z.tanggal ? -1 : (a.id < z.id ? 1 : -1)));
    }

    function safeImg(url) { return /^https:\/\//i.test(url || "") ? url : ""; }

    function renderProfil() {
        const s = state.picked;
        if (!s) return;
        const rw = riwayatOf(s.nis), total = rw.reduce((a, x) => a + x.poin, 0), tier = tierOf(total);
        $("pNama").textContent = s.nama;
        $("pKelas").textContent = s.kelas;
        $("pNis").textContent = s.nis;
        $("pPoin").textContent = fmt(total);
        $("pTier").textContent = tier ? tier.label : "";
        const img = $("pFoto");
        img.onerror = () => { img.onerror = null; img.removeAttribute("src"); img.style.visibility = "hidden"; };
        img.style.visibility = "";
        if (safeImg(s.foto)) img.src = s.foto; else { img.removeAttribute("src"); img.style.visibility = "hidden"; }
        $("pRiwayat").innerHTML = rw.length ? rw.map((x) => `
            <tr><td>${esc(fmtDate(x.tanggal))}</td><td><strong>${esc(x.jenis)}</strong>${x.catatan && x.catatan !== "-" ? `<br><small style="opacity:.75">Ket: ${esc(x.catatan)}</small>` : ""}</td><td class="num"><strong>+${fmt(x.poin)}</strong></td></tr>`).join("")
            : `<tr><td colspan="3" class="kd-empty">Belum ada catatan pelanggaran.</td></tr>`;
    }

    function pick(nis) {
        const s = state.siswa.find((x) => x.nis === nis);
        if (!s) return hideSiswa();
        $("selKelas").value = s.kelas;
        if ($("selSiswa").value !== nis) { onKelas(); $("selSiswa").value = nis; }
        state.picked = s;
        renderProfil();
        $("sectionProfil").classList.remove("kd-hidden");
        $("sectionForm").classList.remove("kd-hidden");
        updatePreview();
    }

    function currentTatib() { return state.tatib.find((t) => t.kode === $("fKode").value) || null; }

    function updatePreview() {
        const box = $("preview");
        const t = currentTatib();
        $("previewPoin").textContent = `+${t ? t.poin : 0} poin`;
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

    function rowForSheet() {
        const t = currentTatib(), s = state.picked;
        return [`${$("fTanggal").value} ${new Date().toLocaleTimeString("en-GB", { timeZone: "Asia/Jakarta" })}`, s.nis, s.nama, s.kelas, t.jenis, t.poin, $("fCatatan").value || "-", t.kode, $("fSanksi").value, "admin", ""];
    }

    function setMsg(el, text) { el.textContent = text || ""; el.hidden = !text; }

    /* ---- rekap kelas (modal) ---- */

    function closeRekap() { $("rekapModal").classList.add("kd-hidden"); $("rekapBtn").focus(); }
    $("rekapBtn").addEventListener("click", () => {
        const k = $("selKelas").value;
        if (!k) return;
        $("rekapTitle").textContent = `Rekap kelas ${k}`;
        const list = siswaDiKelas(k);
        $("rekapBody").innerHTML = list.length ? list.map((s, i) => {
            const p = pointsOf(s.nis);
            return `<tr><td>${i + 1}</td><td><small>${esc(s.nis)}</small></td><td>${esc(s.nama)}</td><td class="num"><span class="kd-badge-cat" data-cat="${p > 0 ? "Berat" : "Ringan"}">${fmt(p)}</span></td><td><button type="button" class="kd-btn kd-btn--sm" data-nis="${esc(s.nis)}">Pilih</button></td></tr>`;
        }).join("") : `<tr><td colspan="5" class="kd-empty">Tidak ada siswa di kelas ini.</td></tr>`;
        $("rekapModal").classList.remove("kd-hidden");
        $("rekapClose").focus();
    });
    $("rekapClose").addEventListener("click", closeRekap);
    $("rekapModal").addEventListener("click", (e) => { if (e.target === $("rekapModal")) closeRekap(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("rekapModal").classList.contains("kd-hidden")) closeRekap(); });
    $("rekapBody").addEventListener("click", (e) => { const b = e.target.closest("button[data-nis]"); if (b) { closeRekap(); pick(b.dataset.nis); } });

    $("selKelas").addEventListener("change", onKelas);
    $("selSiswa").addEventListener("change", () => pick($("selSiswa").value));
    $("gantiBtn").addEventListener("click", () => { $("selSiswa").value = ""; hideSiswa(); $("selSiswa").focus(); });
    $("fKode").addEventListener("change", updatePreview);
    $("fSanksi").addEventListener("input", () => { $("fSanksi").dataset.auto = "0"; });

    $("resetBtn").addEventListener("click", () => {
        setTimeout(() => { $("fTanggal").value = state.hariIni; $("fSanksi").dataset.auto = ""; updatePreview(); setMsg($("formError")); setMsg($("formOk")); }, 0);
    });

    $("copyBtn").addEventListener("click", async () => {
        if (!state.picked || !currentTatib()) return setMsg($("formError"), "Pilih siswa dan jenis pelanggaran dulu.");
        const text = rowForSheet().map((c) => String(c).replace(/[\t\r\n]+/g, " ")).join("\t");
        try { await navigator.clipboard.writeText(text); setMsg($("formOk"), "Baris disalin. Tempel di baris kosong tab Input_Pelanggaran pada Google Sheet."); }
        catch (e) { setMsg($("formError"), "Tidak bisa menyalin otomatis. Salin manual: " + text); }
    });

    /* ---- antrean offline (hanya NIS + kode + isian; tanpa nama siswa) ---- */

    function getQueue() { try { return JSON.parse(localStorage.getItem(QKEY) || "[]"); } catch (e) { return []; } }
    function setQueue(q) { try { localStorage.setItem(QKEY, JSON.stringify(q)); } catch (e) { /* penyimpanan tidak tersedia */ } renderQueue(); }
    function renderQueue() {
        const n = getQueue().length;
        $("queueBanner").classList.toggle("kd-hidden", n === 0);
        document.dispatchEvent(new CustomEvent("kd:queue"));   // lencana antrean di sidebar
        $("queueCountText").textContent = `Ada ${n} data antrean offline belum terkirim.`;
    }
    const newId = () => "c" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

    async function postItem(item) {
        const r = await fetch(CONFIG.API.PELANGGARAN, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item) });
        const body = await r.json().catch(() => ({}));
        return { r, body };
    }

    let syncing = false;
    async function syncQueue() {
        if (syncing || !navigator.onLine) return;
        syncing = true;
        try {
            let q = getQueue();
            while (q.length) {
                let res;
                try { res = await postItem(q[0]); } catch (e) { break; }          // jaringan putus -> coba lagi nanti
                if (res.r.status === 401) { AdminAuth.logout(); location.reload(); return; }
                if (res.r.status >= 500 || res.body.code === "READ_ONLY") break;  // server belum siap -> tetap antre
                q = q.slice(1);                                                   // sukses / duplikat / ditolak permanen (4xx)
                setQueue(q);
            }
            await load(true);
        } finally { syncing = false; }
    }
    $("syncBtn").addEventListener("click", syncQueue);
    window.addEventListener("online", syncQueue);

    $("inputForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        setMsg($("formError")); setMsg($("formOk"));
        const t = currentTatib();
        if (!state.picked) return setMsg($("formError"), "Pilih siswa terlebih dahulu.");
        if (!t) return setMsg($("formError"), "Pilih jenis pelanggaran.");
        if (!$("fTanggal").value) return setMsg($("formError"), "Tanggal kejadian wajib diisi.");
        if ($("fTanggal").value > state.hariIni) return setMsg($("formError"), "Tanggal tidak boleh di masa depan.");

        const item = { nis: state.picked.nis, kode: t.kode, tanggal: $("fTanggal").value, sanksi: $("fSanksi").value, catatan: $("fCatatan").value, clientId: newId() };
        const afterSave = () => { $("inputForm").reset(); $("fTanggal").value = state.hariIni; $("fSanksi").dataset.auto = ""; updatePreview(); };

        $("saveBtn").disabled = true;
        $("saveBtn").textContent = "Menyimpan…";
        try {
            if (!navigator.onLine) throw Object.assign(new Error("offline"), { offline: true });
            const { r, body } = await postItem(item);

            if (r.status === 401) { AdminAuth.logout(); location.reload(); return; }
            if (!r.ok || !body.success) {
                if (r.status >= 500 && body.code !== "READ_ONLY") throw Object.assign(new Error("server"), { offline: true });
                setMsg($("formError"), body.message || `Gagal menyimpan (HTTP ${r.status}).`);
                if (body.code === "READ_ONLY") $("copyBtn").classList.remove("kd-hidden");
                return;
            }
            setMsg($("formOk"), `Tersimpan: ${body.data.nama} (${body.data.kelas}) · ${body.data.jenis} +${body.data.poin} poin · ${body.data.id}`);
            $("copyBtn").classList.add("kd-hidden");
            await load(true);
            renderProfil();
            afterSave();
        } catch (err) {
            // Jaringan/server bermasalah: simpan di antrean, kirim otomatis nanti (clientId mencegah dobel).
            setQueue([...getQueue(), item]);
            setMsg($("formOk"), "Koneksi bermasalah. Data disimpan di perangkat ini dan dikirim otomatis saat tersambung.");
            afterSave();
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
            try { localStorage.setItem(CKEY, JSON.stringify(res)); } catch (e) { /* abaikan */ }
            applyData(res, silent);
        } catch (e) {
            if (e.status === 401) { AdminAuth.logout(); location.reload(); return; }
            let cached = null;
            try { cached = JSON.parse(localStorage.getItem(CKEY) || "null"); } catch (x) { /* abaikan */ }
            if (cached && cached.data && !navigator.onLine) {
                applyData(cached, silent);
                $("adminMode").textContent = "Offline · data tersimpan di perangkat";
                return;
            }
            $("adminAlert").innerHTML = `<div class="kd-card kd-error" role="alert"><strong>Data tidak dapat dimuat.</strong> <span>${esc(e.message)}</span>${e.detail ? `<br><small>Alasan Google: <code>${esc([e.detail.status, e.detail.reason].filter(Boolean).join(" · "))}</code> ${esc(e.detail.message || "")}<br>Sheet yang dibaca server: <code>${esc(e.detail.sheet || "-")}</code> · Akun: <code>${esc(e.detail.account || "-")}</code></small>` : ""} <button type="button" class="kd-btn kd-btn--sm" id="retry" style="margin-left:.5rem">Coba lagi</button></div>`;
            const r = $("retry"); if (r) r.addEventListener("click", () => load());
        }
    }

    function applyData(res, silent) {
        {
            const d = res.data;
            Object.assign(state, { v: d.violations, siswa: d.siswa, tatib: d.tatib, tingkat: d.tingkat, hariIni: d.hariIni, canWrite: res.canWrite, sheetUrl: res.sheetUrl });

            $("adminMode").textContent = res.mode === "demo" ? "Mode demo (data contoh)" : res.canWrite ? "Terhubung · bisa menyimpan" : "Terhubung · hanya baca";
            $("adminMode").className = "kd-chip " + (res.mode === "demo" ? "kd-chip--demo" : "kd-chip--live");
            if (res.sheetUrl) { $("sheetLink").href = res.sheetUrl; $("sheetLink").classList.remove("kd-hidden"); }
            document.dispatchEvent(new CustomEvent("kd:sheet", { detail: { url: res.sheetUrl || "" } }));

            if (!silent) {
                fillJenis(); fillFilters(); fillKelas();
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
                fillFilters(); fillKelas();
            }
            renderData(); renderPembinaan();
        }
    }

    // Hapus cache data siswa dari perangkat saat admin keluar.
    const _logout = AdminAuth.logout;
    AdminAuth.logout = function () { try { localStorage.removeItem(CKEY); } catch (e) { /* abaikan */ } return _logout.apply(this, arguments); };

    renderQueue();
    showTab(location.hash.slice(1));
    // Tanpa sesi admin, halaman tertutup overlay login (js/admin-auth.js) dan login memuat ulang halaman.
    if (AdminAuth.isLoggedIn()) load().then(syncQueue);

})();
