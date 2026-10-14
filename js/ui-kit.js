/* Helper kecil bersama untuk semua halaman Kesiswaan. */
window.KD = (() => {

    const esc = (s) => String(s === null || s === undefined ? "" : s)
        .replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

    const nf = new Intl.NumberFormat("id-ID");
    const fmt = (n) => nf.format(Number(n) || 0);

    const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

    function fmtDate(iso) {
        const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
        return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : "";
    }

    const reduceMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function countUp(node, to) {
        const target = Number(to) || 0;
        if (reduceMotion() || target === 0) { node.textContent = fmt(target); return; }
        const t0 = performance.now(), dur = 700;
        (function step(t) {
            const p = Math.min(1, (t - t0) / dur);
            node.textContent = fmt(Math.round(target * (1 - Math.pow(1 - p, 3))));
            if (p < 1) requestAnimationFrame(step);
        })(t0);
    }

    async function getJSON(url, timeout) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), timeout || (window.CONFIG && CONFIG.API_TIMEOUT) || 12000);
        try {
            const r = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
            let body = {};
            try { body = await r.json(); } catch (e) { /* bukan JSON */ }
            if (!r.ok || body.success === false) {
                const err = new Error(body.message || `Permintaan gagal (HTTP ${r.status}).`);
                err.status = r.status;
                err.detail = body.detail;
                throw err;
            }
            return body;
        } catch (e) {
            if (e.name === "AbortError") throw new Error("Server terlalu lama merespons. Coba lagi.");
            throw e;
        } finally { clearTimeout(timer); }
    }

    return { esc, fmt, fmtDate, countUp, getJSON, MONTHS };

})();
