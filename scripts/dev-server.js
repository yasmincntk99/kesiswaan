/*
 Server lokal untuk pengembangan (tanpa Vercel CLI):
   node scripts/dev-server.js [port]
 Menyajikan file statis + menjalankan handler di /api seperti Vercel.
*/
const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const root = path.join(__dirname, "..");
const port = Number(process.argv[2]) || 3000;
const types = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg", ".ico": "image/x-icon", ".svg": "image/svg+xml" };

http.createServer(async (req, res) => {
    const u = url.parse(req.url, true);
    let p = decodeURIComponent(u.pathname);

    if (p.startsWith("/api/")) {
        let name = p.slice(5).replace(/[^a-z0-9-]/gi, "");
        // Meniru "rewrites" vercel.json: endpoint yang digabung ke /api/layanan
        if (["ai-catat", "eksekutif", "perapian", "qr", "ringkasan", "tanya", "walikelas"].includes(name)) { u.query.op = name; name = "layanan"; }
        const file = path.join(root, "api", name + ".js");
        if (!fs.existsSync(file)) { res.writeHead(404, { "Content-Type": "application/json" }); return res.end('{"success":false}'); }
        let raw = "";
        for await (const c of req) raw += c;
        req.query = u.query;
        try { req.body = raw ? JSON.parse(raw) : {}; } catch (e) { req.body = {}; }
        res.status = (c) => { res.statusCode = c; return res; };
        res.json = (b) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(b)); };
        res.send = (b) => res.end(typeof b === "string" || Buffer.isBuffer(b) ? b : JSON.stringify(b));
        try { return await require(file)(req, res); } catch (e) { res.statusCode = 500; return res.end(String(e)); }
    }

    if (p === "/") p = "/index.html";
    if (!path.extname(p) && fs.existsSync(path.join(root, p + ".html"))) p += ".html";
    const file = path.normalize(path.join(root, p));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end("Not found"); }
    res.setHeader("Content-Type", types[path.extname(file)] || "application/octet-stream");
    fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log("http://localhost:" + port));
