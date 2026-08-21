// Metodesidens dynamiske dele. Kilder og antagelser hentes fra de genererede
// datafiler frem for at stå skrevet i HTML, så årstal og værdier ikke kan
// drive fra det, motoren faktisk regner med.

import { renderKilder, renderAntagelser } from "./render.js";

async function hent(sti) {
  const svar = await fetch(sti);
  if (!svar.ok) throw new Error(`${sti}: HTTP ${svar.status}`);
  return svar.json();
}

function fejl(el, besked) {
  if (el) el.innerHTML = `<p class="text-sm text-gray-500">${besked}</p>`;
}

const kilderEl = document.getElementById("kilder");
const antagelserEl = document.getElementById("antagelser");

try {
  const [sources, data] = await Promise.all([hent("data/sources.json"), hent("data/data.json")]);
  if (kilderEl) kilderEl.innerHTML = renderKilder(sources);
  if (antagelserEl) antagelserEl.innerHTML = renderAntagelser(sources, data.konstanter);
} catch (e) {
  const besked = `Kunne ikke hente kildeoversigten (${e.message}).
    Formlerne og forbeholdene ovenfor gælder uanset.`;
  fejl(kilderEl, besked);
  fejl(antagelserEl, besked);
}
