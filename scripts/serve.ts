// serve.ts -- static file server for the dashboard
// Maps / -> site/index.html, /data/analysis.json -> output/analysis.json

import { join } from "node:path";

const PORT = 3000;

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    let path = url.pathname;

    if (path === "/" || path === "/index.html") {
      return new Response(Bun.file("site/index.html"));
    }

    if (path === "/data/analysis.json") {
      return new Response(Bun.file("output/analysis.json"), {
        headers: { "Content-Type": "application/json" },
      });
    }

    // Serve other files from site/ directory
    const filePath = join("site", path);
    const file = Bun.file(filePath);
    if (await file.exists()) {
      return new Response(file);
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`Dashboard: http://localhost:${PORT}`);
