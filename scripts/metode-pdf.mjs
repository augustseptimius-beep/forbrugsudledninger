// Trykker metodesiden som PDF: web/metode.pdf.
//
// HVORFOR EN FÆRDIG FIL OG IKKE KUN BROWSERENS UDSKRIFT.
// Metoden skal kunne lægges på en sag ved siden af kommunens regneark. En fil,
// der hentes med ét klik, ser ens ud for alle og kræver ikke, at man kender
// "Gem som PDF" i udskriftsdialogen. Browserens udskrift virker stadig og
// bruger samme printlayout (se web/styles/input.css).
//
// HVORDAN.
// Scriptet serverer web/ på en ledig port, lader headless Chrome hente siden,
// og trykker den, når metode.js har sat data-klar på <body>. Chrome kan ikke
// selv vente på et flag, så der køres to gange: først --dump-dom for at se, at
// tabellerne faktisk kom med, derefter --print-to-pdf med samme tidsbudget.
// Mangler flaget, fejler scriptet hellere end at udgive en PDF uden tabeller.
//
// Ingen afhængigheder: Node's egen http-server og den Chrome, der er på
// maskinen. GitHub's ubuntu-runner har google-chrome; lokalt kan stien
// sættes med CHROME=/sti/til/chrome.
//
// Brug: npm run pdf

import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const koer = promisify(execFile);
const WEB = fileURLToPath(new URL("../web/", import.meta.url));
const UD = join(WEB, "metode.pdf");
const TIDSBUDGET_MS = "20000";

const TYPER = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml", ".pdf": "application/pdf",
};

const KANDIDATER = [
  process.env.CHROME,
  "google-chrome", "google-chrome-stable", "chromium", "chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

async function findChrome() {
  for (const k of KANDIDATER) {
    try {
      await koer(k, ["--version"]);
      return k;
    } catch { /* prøv den næste */ }
  }
  throw new Error("Fandt ingen Chrome eller Chromium. Sæt CHROME=/sti/til/chrome.");
}

function startServer() {
  const server = createServer(async (req, res) => {
    const sti = decodeURIComponent(new URL(req.url, "http://x").pathname);
    const fil = normalize(join(WEB, sti === "/" ? "index.html" : sti));
    if (!fil.startsWith(WEB)) { res.writeHead(403).end(); return; }
    try {
      if (!(await stat(fil)).isFile()) throw new Error("ikke en fil");
      res.writeHead(200, { "content-type": TYPER[extname(fil)] ?? "application/octet-stream" });
      res.end(await readFile(fil));
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok(server)));
}

const chrome = await findChrome();
const server = await startServer();
const url = `http://127.0.0.1:${server.address().port}/metode.html`;

// --no-sandbox: siden er vores egen og serveres lokalt, og Chromes sandkasse
// kan ikke starte som root eller på runnere, der spærrer user namespaces.
const faelles = ["--headless", "--no-sandbox", "--disable-gpu",
  `--virtual-time-budget=${TIDSBUDGET_MS}`];

try {
  const { stdout: dom } = await koer(chrome, [...faelles, "--dump-dom", url],
    { maxBuffer: 64 * 1024 * 1024 });
  if (!/<body[^>]*data-klar="ja"/.test(dom)) {
    throw new Error("metode.js blev ikke færdig inden tidsbudgettet - tabellerne mangler. "
      + "Ingen PDF skrevet.");
  }

  await koer(chrome, [...faelles, "--no-pdf-header-footer",
    "--generate-pdf-document-outline", `--print-to-pdf=${UD}`, url]);

  const hoved = (await readFile(UD)).subarray(0, 5).toString("latin1");
  const stoerrelse = (await stat(UD)).size;
  if (hoved !== "%PDF-" || stoerrelse < 20_000) {
    throw new Error(`${UD} ligner ikke en færdig PDF (${stoerrelse} byte).`);
  }
  console.log(`Skrev ${UD} (${Math.round(stoerrelse / 1024)} kB).`);
} finally {
  server.close();
}
