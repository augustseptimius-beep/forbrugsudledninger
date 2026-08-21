// Tyndt DOM-lag. Al formatering og HTML-opbygning bor i render.js, al
// beregning i beregning.js. Denne fil henter data, læser URL'en og sætter
// resultatet ind i siden - intet andet.

import { beregnKommune } from "./beregning.js";
import { renderKommune, renderForside, renderKommuneKort } from "./render.js";

const app = document.getElementById("app");

/** Embed-tilstand: ?embed=1 skjuler header, footer og navigation, så siden
 *  kan lægges i en iframe på en anden platform. */
function anvendEmbed() {
  const params = new URLSearchParams(location.search);
  if (params.get("embed") === "1") document.body.classList.add("embed");
}

function visFejl(besked) {
  app.innerHTML = `<div class="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-900">
    ${besked}</div>`;
}

function visForside(data) {
  app.innerHTML = renderForside();
  const input = document.getElementById("soeg");
  const resultater = document.getElementById("resultater");
  const status = document.getElementById("soege-status");

  // Sorteret én gang: 98 poster er småt, men listen genbruges ved hvert tastetryk.
  const alle = [...data.kommuner].sort((a, b) => a.navn.localeCompare(b.navn, "da"));

  function opdater() {
    const term = input.value.trim().toLowerCase();
    const fundet = term ? alle.filter((k) => k.navn.toLowerCase().includes(term)) : alle;
    resultater.innerHTML = renderKommuneKort(fundet);
    status.textContent = term
      ? `${fundet.length} ${fundet.length === 1 ? "kommune" : "kommuner"} fundet`
      : `Alle ${alle.length} kommuner`;
  }

  input.addEventListener("input", opdater);
  opdater();
  input.focus({ preventScroll: true });
}

function visKommune(data, concito, kommune) {
  const b = beregnKommune(kommune, data.land);
  document.title = `${kommune.navn} - Forbrugsbaserede udledninger`;
  app.innerHTML = `
    <a href="index.html" class="no-embed inline-flex items-center gap-1 text-sm text-gray-500
       hover:text-gray-900 transition-colors mb-4 no-print">
      <span aria-hidden="true">&larr;</span> Alle kommuner
    </a>
    ${renderKommune(b, concito)}`;
}

async function start() {
  anvendEmbed();
  let data, concito;
  try {
    const [d, c] = await Promise.all([fetch("data/data.json"), fetch("data/concito.json")]);
    if (!d.ok) throw new Error(`data.json: HTTP ${d.status}`);
    if (!c.ok) throw new Error(`concito.json: HTTP ${c.status}`);
    [data, concito] = await Promise.all([d.json(), c.json()]);
  } catch (fejl) {
    visFejl(`Kunne ikke hente datagrundlaget (${fejl.message}). Siden skal serveres over
      http, ikke åbnes direkte fra filsystemet.`);
    return;
  }

  // Kommunekode i URL'en frem for navn: koden er stabil, den er allerede nøgle
  // i data.json, og den undgår æ, ø og å i query-strengen.
  const kode = new URLSearchParams(location.search).get("kommune");
  if (!kode) return visForside(data);

  const kommune = data.kommuner.find((k) => String(k.kode) === String(kode));
  if (!kommune) {
    visFejl(`Kender ikke kommunekode ${kode}.
      <a href="index.html" class="underline">Se listen over alle kommuner</a>.`);
    return;
  }
  visKommune(data, concito, kommune);
}

start();
