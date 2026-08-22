// Metodesidens dynamiske dele. Kilder og antagelser hentes fra de genererede
// datafiler frem for at stå skrevet i HTML, så årstal og værdier ikke kan
// drive fra det, motoren faktisk regner med.

import { renderKilder, renderReferencer, renderNationaltAftryk } from "./render.js";
import { installerTooltips } from "./tooltip.js";

async function hent(sti) {
  const svar = await fetch(sti);
  if (!svar.ok) throw new Error(`${sti}: HTTP ${svar.status}`);
  return svar.json();
}

function fejl(el, besked) {
  if (el) el.innerHTML = `<p class="text-sm text-gray-500">${besked}</p>`;
}

installerTooltips();

const kilderEl = document.getElementById("kilder");
const referencerEl = document.getElementById("referencer");
const nationaltEl = document.getElementById("nationalt");

try {
  const [sources, concito] = await Promise.all([
    hent("data/sources.json"), hent("data/concito.json")]);
  if (kilderEl) kilderEl.innerHTML = renderKilder(sources);
  if (referencerEl) referencerEl.innerHTML = renderReferencer(sources);
  if (nationaltEl) nationaltEl.innerHTML = renderNationaltAftryk(concito);
} catch (e) {
  const besked = `Kunne ikke hente kildeoversigten (${e.message}).
    Forbeholdene ovenfor gælder uanset.`;
  fejl(kilderEl, besked);
  fejl(referencerEl, besked);
  fejl(nationaltEl, besked);
}
