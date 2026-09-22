// Metodesidens dynamiske dele. Kilder og antagelser hentes fra de genererede
// datafiler frem for at stå skrevet i HTML, så årstal og værdier ikke kan
// drive fra det, motoren faktisk regner med.

import { renderKilder, renderReferencer, renderNationaltAftryk,
         renderTaerskelfordeling, renderEnsKategorier,
         renderForbehold } from "./render.js";
import { beregnFordeling, beregnForbehold } from "./beregning.js";
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
const fordelingEl = document.getElementById("taerskelfordeling");
const ensEl = document.getElementById("ens-kategorier");
const forbeholdEl = document.getElementById("forbehold");

try {
  // data.json hentes nu også her, fordi tærskelfordelingen skal REGNES af de
  // faktiske 98 kommuner. Skrives den i hånden, kan den drive fra data.
  const [sources, concito, data, ens] = await Promise.all([
    hent("data/sources.json"), hent("data/concito.json"), hent("data/data.json"),
    hent("data/ens.json")]);
  if (kilderEl) kilderEl.innerHTML = renderKilder(sources);
  if (referencerEl) referencerEl.innerHTML = renderReferencer(sources);
  if (nationaltEl) nationaltEl.innerHTML = renderNationaltAftryk(concito);
  if (ensEl) ensEl.innerHTML = renderEnsKategorier(ens);
  if (fordelingEl) {
    fordelingEl.innerHTML = renderTaerskelfordeling(beregnFordeling(data.kommuner, data.land));
  }
  // Forbeholdene udledes af de faktiske 98, så metodesiden ikke skal navngive
  // ramte kommuner i hånden og blive stående, når en kilde retter sig.
  if (forbeholdEl) {
    forbeholdEl.innerHTML = renderForbehold(beregnForbehold(data.kommuner, data.land));
  }
} catch (e) {
  const besked = `Kunne ikke hente kildeoversigten (${e.message}).
    Forbeholdene ovenfor gælder uanset.`;
  fejl(kilderEl, besked);
  fejl(referencerEl, besked);
  fejl(nationaltEl, besked);
  fejl(fordelingEl, besked);
  fejl(ensEl, besked);
  fejl(forbeholdEl, besked);
}
