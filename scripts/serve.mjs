import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 4173);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".svg": "image/svg+xml" };

createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "apps/console/index.html";
    const candidate = normalize(join(root, relativePath));
    if (!candidate.startsWith(root)) throw Object.assign(new Error("Denied"), { status: 403 });
    let target = candidate;
    if ((await stat(target)).isDirectory()) target = join(target, "index.html");
    const body = await readFile(target);
    response.writeHead(200, { "content-type": types[extname(target).toLowerCase()] || "application/octet-stream", "cache-control": "no-store" });
    response.end(body);
  } catch (error) {
    response.writeHead(error.status || 404, { "content-type": "text/plain; charset=utf-8" });
    response.end(error.status === 403 ? "Forbidden" : "Not found");
  }
}).listen(port, "127.0.0.1", () => {
  console.log(`AIMS UI preview: http://127.0.0.1:${port}/apps/console/?demo=1`);
});
