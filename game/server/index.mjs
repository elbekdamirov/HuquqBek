import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat, readFile } from "node:fs/promises";
import { createGzip } from "node:zlib";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { handleApi, setRuntimeCredentials } from "./api.mjs";

const root = path.resolve(fileURLToPath(new URL("../dist/", import.meta.url)));
const port = Number(process.env.HUQUQBEK_PORT || 4197);
const version = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
).version;
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".wav": "audio/wav",
};
const compressible = new Set([
  ".html",
  ".js",
  ".mjs",
  ".css",
  ".json",
  ".webmanifest",
  ".svg",
]);

const server = createServer(async (req, res) => {
  if (await handleApi(req, res)) return;
  if (!["GET", "HEAD"].includes(req.method)) {
    res.writeHead(405);
    res.end();
    return;
  }
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    if (["/__huquqbek_health", "/__qonunverse_health"].includes(pathname)) {
      res.writeHead(200, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      });
      res.end(JSON.stringify({ app: "HuquqBek", version }));
      return;
    }
    const filename = path.resolve(
      root,
      "." + (pathname === "/" ? "/index.html" : pathname),
    );
    if (!filename.startsWith(root + path.sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    const info = await stat(filename);
    if (!info.isFile()) throw Error();
    const ext = path.extname(filename);
    const etag = `W/"${info.size.toString(36)}-${Math.floor(info.mtimeMs).toString(36)}"`;
    // Hashed build output never changes for a given name; everything else revalidates cheaply with the ETag.
    const hashed = /\/assets\/[^/]+-[A-Za-z0-9_-]{8}\.(js|css)$/.test(pathname);
    const headers = {
      "Content-Type": mime[ext] || "application/octet-stream",
      ETag: etag,
      "Last-Modified": info.mtime.toUTCString(),
      "Cache-Control": hashed
        ? "public, max-age=31536000, immutable"
        : ext === ".glb" || ext === ".png"
          ? "public, max-age=86400, must-revalidate"
          : "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Permissions-Policy": "microphone=(self)",
      Vary: "Accept-Encoding",
    };
    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, headers);
      res.end();
      return;
    }
    const gzip =
      compressible.has(ext) &&
      /\bgzip\b/.test(req.headers["accept-encoding"] || "") &&
      info.size > 1024;
    if (gzip) headers["Content-Encoding"] = "gzip";
    else headers["Content-Length"] = info.size;
    res.writeHead(200, headers);
    if (req.method === "HEAD") {
      res.end();
      return;
    }
    const stream = createReadStream(filename);
    (gzip ? stream.pipe(createGzip({ level: 6 })) : stream).pipe(res);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
server.listen(port, "127.0.0.1", () =>
  console.log(`HuquqBek: http://127.0.0.1:${port}/`),
);

// Optional ephemeral stdin channel for a local launcher. Only a confirmation is emitted.
if (process.env.HUQUQBEK_STDIN_SECRETS === "1") {
  let buffer = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => {
    buffer += chunk;
    if (buffer.length > 16000) {
      buffer = "";
      return;
    }
    if (buffer.includes("\n")) {
      try {
        setRuntimeCredentials(JSON.parse(buffer.trim()));
        console.log("Runtime provider credentials loaded into memory.");
      } catch {
        console.log("Runtime configuration was not accepted.");
      }
      buffer = "";
    }
  });
}
