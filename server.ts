// @ts-nocheck
import { serveDir } from "std/http/file_server.ts";

const port = 8000;

Deno.serve({ port }, async (req) => {
  // Try to serve static files from the dist/ directory
  const response = await serveDir(req, {
    fsRoot: "./dist",
    urlRoot: "",
    showDirListing: false,
    enableCors: true,
  });

  // SPA fallback — ONLY for navigation requests (paths whose last segment has no
  // file extension). A missing static asset (e.g. a stale */assets/index-abc.js*
  // chunk) must return a real 404: serving index.html for it makes the browser
  // parse HTML as JS/CSS and fail with an opaque MIME-type error instead.
  if (response.status === 404) {
    const { pathname } = new URL(req.url);
    const lastSegment = pathname.split("/").pop() || "";
    const looksLikeAsset = lastSegment.includes(".");

    if (!looksLikeAsset) {
      try {
        const indexHtml = await Deno.readTextFile("./dist/index.html");
        return new Response(indexHtml, {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            // Never cache the shell — it references hashed asset filenames that
            // change on every deploy.
            "Cache-Control": "no-cache",
          },
        });
      } catch {
        return new Response("Not Found", { status: 404 });
      }
    }
  }

  return response;
});
