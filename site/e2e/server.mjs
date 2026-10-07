import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, sep, extname } from "node:path";
const root = resolve(".");
const types = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};
createServer(async (req, res) => {
  try {
    const path = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    const file = resolve(
      root,
      "." + path + (path.endsWith("/") ? "index.html" : ""),
    );
    if (!file.startsWith(root + sep)) {
      res.writeHead(403).end();
      return;
    }
    res
      .writeHead(200, {
        "Content-Type":
          (types[extname(file)] ?? "application/octet-stream") +
          "; charset=utf-8",
      })
      .end(await readFile(file));
  } catch {
    res.writeHead(404).end();
  }
}).listen(Number(process.env.SITE_TEST_PORT), "127.0.0.1");
