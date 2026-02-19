const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});
process.on("unhandledRejection", (err) => {
  console.error("UNHANDLED REJECTION:", err);
});

const root = process.cwd();
const port = 3000;
const host = "127.0.0.1";

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
};

const server = http.createServer((req, res) => {
  try {
    const reqPath = decodeURIComponent(url.parse(req.url).pathname);
    const safe = path.normalize(reqPath).replace(/^\/+/, "");
    const filePath = path.join(root, safe);

    if (!filePath.startsWith(root)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    let p = filePath;
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
      p = path.join(p, "index.html");
    }

    if (!fs.existsSync(p)) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const ext = path.extname(p).toLowerCase();
    res.writeHead(200, { "Content-Type": mime[ext] || "application/octet-stream" });
    fs.createReadStream(p).pipe(res);
  } catch (e) {
    console.error("REQUEST ERROR:", e);
    res.writeHead(500);
    res.end("Server error");
  }
});

server.on("error", (err) => {
  console.error("SERVER ERROR:", err);
});

server.listen(port, host, () => {
  console.log(`UI server running: http://${host}:${port}/ui/index.html`);
});

// Keep the process alive even in weird environments
setInterval(() => {}, 1 << 30);
