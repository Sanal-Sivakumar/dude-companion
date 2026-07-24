import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Dude Companion landing page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Dude Companion — A tiny roommate for your desktop<\/title>/i);
  assert.match(html, /A tiny roommate for your desktop\./);
  assert.match(html, /curl -fsSL https:\/\/this-site\/install\.sh \| bash/);
  assert.match(html, /Swing and release/);
  assert.match(html, /Computer control without the mystery\./);
  assert.match(html, /Tiny privacy department\./);
  assert.match(html, /src="\/male\.png"/);
  assert.match(html, /src="\/female\.png"/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("ships the production metadata, assets, and verified installer", async () => {
  const [page, layout, packageJson, installer] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../public/install.sh", import.meta.url), "utf8"),
  ]);

  assert.match(page, /Dude Companion/);
  assert.match(page, /navigator\.clipboard\.writeText/);
  assert.match(layout, /generateMetadata/);
  assert.match(layout, /summary_large_image/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.doesNotMatch(page + layout, /codex-preview|_sites-preview/);

  assert.match(installer, /Sanal-Sivakumar\/dude-companion\/releases\/download\/v0\.1\.0/);
  assert.match(installer, /shasum -a 256/);
  assert.match(installer, /EXPECTED_SHA="[a-f0-9]{64}"/);
  assert.match(installer, /ditto .*Dude Companion\.app/);
  assert.doesNotMatch(installer, /sk_|gsk_|api[_-]?key/i);

  await Promise.all([
    access(new URL("../public/male.png", import.meta.url)),
    access(new URL("../public/female.png", import.meta.url)),
    access(new URL("../public/og.png", import.meta.url)),
  ]);
});
