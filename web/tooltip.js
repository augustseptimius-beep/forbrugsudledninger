// Tooltips, der ikke kan klippes væk.
//
// Boksen lå tidligere inde i sit eget element med position:absolute. Det
// virker, indtil elementet står i en container med overflow - og
// nøgletalstabellen har overflow-x for at kunne scrolles på smal skærm. Når
// den ene akse ikke er "visible", bliver den anden også klippende, så boksen
// blev skåret af både til siden og opad.
//
// Løsningen er én enkelt boks i document.body, placeret med position:fixed ud
// fra triggerens plads på skærmen. Samme greb som i doughnut-projektet.
//
// Browserens egen title-attribut er stadig fravalgt: den har 0,5-1 sekunds
// forsinkelse og opfører sig forskelligt fra browser til browser.

const MARGEN = 8;

let boks = null;

function hentBoks() {
  if (boks) return boks;
  boks = document.createElement("div");
  boks.id = "tip-boks";
  boks.setAttribute("role", "tooltip");
  boks.className =
    "pointer-events-none fixed z-50 hidden max-w-[min(20rem,calc(100vw-1rem))] " +
    "rounded-md bg-gray-900 px-2.5 py-1.5 text-xs font-normal leading-snug " +
    "text-white shadow-lg";
  document.body.appendChild(boks);
  return boks;
}

function vis(trigger) {
  const tekst = trigger.getAttribute("data-tip");
  if (!tekst) return;
  const b = hentBoks();
  b.textContent = tekst;
  b.classList.remove("hidden");

  const t = trigger.getBoundingClientRect();
  const egen = b.getBoundingClientRect();

  // Vandret: centreret over triggeren, men klemt ind i vinduet, så boksen
  // aldrig løber ud over kanten - det var netop fejlen i den gamle løsning.
  let x = t.left + t.width / 2 - egen.width / 2;
  x = Math.max(MARGEN, Math.min(x, window.innerWidth - egen.width - MARGEN));

  // Lodret: over triggeren, med mindre der ikke er plads.
  const over = t.top - egen.height - MARGEN;
  const y = over >= MARGEN ? over : t.bottom + MARGEN;

  b.style.left = `${Math.round(x)}px`;
  b.style.top = `${Math.round(y)}px`;
}

function skjul() {
  if (boks) boks.classList.add("hidden");
}

/** Installerer én delegeret lytter for hele siden. Kaldes én gang. */
export function installerTooltips(rod = document) {
  const find = (e) => e.target?.closest?.("[data-tip]");
  rod.addEventListener("mouseover", (e) => { const t = find(e); if (t) vis(t); });
  rod.addEventListener("mouseout", (e) => { if (find(e)) skjul(); });
  rod.addEventListener("focusin", (e) => { const t = find(e); if (t) vis(t); });
  rod.addEventListener("focusout", (e) => { if (find(e)) skjul(); });
  // Boksen følger ikke med ved scroll eller resize; den skjules i stedet, så
  // den aldrig står et forkert sted.
  window.addEventListener("scroll", skjul, { passive: true, capture: true });
  window.addEventListener("resize", skjul, { passive: true });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") skjul(); });
}
