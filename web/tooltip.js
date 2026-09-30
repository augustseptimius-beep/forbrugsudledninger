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

// To udseender. Tekst-tooltippen er mørk og kort. Grafen ved udviklingspilen er en
// lys kort med hvid flade, fordi grafens farver er valgt til en hvid baggrund.
const BOKS_FAELLES =
  "pointer-events-none fixed z-50 hidden rounded-md text-xs font-normal leading-snug shadow-lg ";
const BOKS_TEKST =
  BOKS_FAELLES + "max-w-[min(20rem,calc(100vw-1rem))] bg-gray-900 px-2.5 py-1.5 text-white";
const BOKS_GRAF =
  BOKS_FAELLES + "max-w-[calc(100vw-1rem)] border border-gray-200 bg-white p-2.5 text-gray-700";

let boks = null;

// Pilen, boksen viser i øjeblikket. Musen går fra pilens ikon til dens tekst uden at forlade
// pilen, og så skal boksen ikke bygges forfra.
let aktiv = null;

// Grafen tegnes først ved hover. widget.js melder en funktion, der får nøglen fra
// pilens data-graf og giver tooltippens HTML tilbage. Boksen bygges altså af tal
// hver gang og gemmes ikke: der ligger ingen tegning i siden, før nogen beder om
// den, og ingen tegning at holde ajour, når datasættet opdateres.
let grafKilde = null;

/** Melder, hvordan en graf bygges. Kaldes af widget.js, når kommunens tal er regnet. */
export function saetGrafKilde(fn) {
  grafKilde = fn;
}

function hentBoks() {
  if (boks) return boks;
  boks = document.createElement("div");
  boks.id = "tip-boks";
  boks.setAttribute("role", "tooltip");
  boks.className = BOKS_TEKST;
  document.body.appendChild(boks);
  return boks;
}

const TRIGGER = "[data-tip], [data-graf]";

function vis(trigger) {
  const b = hentBoks();
  if (trigger === aktiv && !b.classList.contains("hidden")) return;
  const nogle = trigger.getAttribute("data-graf");
  // HTML'en kommer fra render.js, som escaper alt dynamisk indhold. Boksen får
  // aldrig tekst fra en fremmed kilde.
  const graf = nogle != null && grafKilde ? grafKilde(nogle) : "";
  if (graf) {
    b.className = BOKS_GRAF;
    b.innerHTML = graf;
  } else {
    const tekst = trigger.getAttribute("data-tip");
    if (!tekst) return;
    b.className = BOKS_TEKST;
    b.textContent = tekst;
  }
  b.classList.remove("hidden");

  const t = trigger.getBoundingClientRect();
  const egen = b.getBoundingClientRect();

  // Vandret: centreret over triggeren, men klemt ind i vinduet, så boksen
  // aldrig løber ud over kanten - det var netop fejlen i den gamle løsning.
  let x = t.left + t.width / 2 - egen.width / 2;
  x = Math.max(MARGEN, Math.min(x, window.innerWidth - egen.width - MARGEN));

  // Lodret: over triggeren, med mindre der ikke er plads. Er der heller ikke plads
  // under, klemmes boksen ind i vinduet: en graf er højere end en tekst.
  const over = t.top - egen.height - MARGEN;
  let y = over >= MARGEN ? over : t.bottom + MARGEN;
  y = Math.max(MARGEN, Math.min(y, window.innerHeight - egen.height - MARGEN));

  b.style.left = `${Math.round(x)}px`;
  b.style.top = `${Math.round(y)}px`;
  aktiv = trigger;
}

function skjul() {
  aktiv = null;
  if (boks) boks.classList.add("hidden");
}

/** Installerer én delegeret lytter for hele siden. Kaldes én gang. */
export function installerTooltips(rod = document) {
  const find = (e) => e.target?.closest?.(TRIGGER);
  // Mus og pen har hover. Berøring har ikke: et tryk på pilen viser boksen, og et tryk et
  // andet sted skjuler den. Tooltippen lytter på pointer-hændelser og ikke på mus-hændelser,
  // fordi en berøringsskærm sender mus-hændelser efter et tryk, herunder et mouseout, der ville
  // skjule boksen igen i samme øjeblik, som den blev vist.
  const hover = (e) => e.pointerType === "mouse" || e.pointerType === "pen";
  rod.addEventListener("pointerover", (e) => { if (!hover(e)) return; const t = find(e); if (t) vis(t); });
  // Forlader musen pilens ikon for dens tekst, forlader den ikke pilen.
  rod.addEventListener("pointerout", (e) => {
    if (!hover(e)) return;
    const t = find(e);
    if (t && !t.contains?.(e.relatedTarget)) skjul();
  });
  rod.addEventListener("pointerup", (e) => {
    if (hover(e)) return;
    const t = find(e);
    if (t) vis(t); else skjul();
  });
  rod.addEventListener("focusin", (e) => { const t = find(e); if (t) vis(t); });
  rod.addEventListener("focusout", (e) => { if (find(e)) skjul(); });
  // Boksen følger ikke med ved scroll eller resize; den skjules i stedet, så
  // den aldrig står et forkert sted.
  window.addEventListener("scroll", skjul, { passive: true, capture: true });
  window.addEventListener("resize", skjul, { passive: true });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") skjul(); });
}
