// Rene render-funktioner: data ind, HTML-streng ud. Ingen DOM, ingen fetch,
// ingen sideeffekter. Det gør hele brugerfladen testbar uden browser eller
// jsdom, og det gør hver funktion til en oplagt React-komponent, hvis
// platformen senere flettes ind i doughnut-projektet.

// Optællingen bor i motoren, hvor den er testet - ikke her.
import { optaelSignaler } from "./beregning.js";

// ---------- Formatering ----------

const HTML_ENTITETER = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** Escaper HTML. Data kommer fra vores egen data.json, men rendering via
 *  innerHTML uden escaping er en vane, der før eller siden bider. */
export function esc(v) {
  if (v == null) return "";
  return String(v).replace(/[&<>"']/g, (c) => HTML_ENTITETER[c]);
}

const MANGLER = "–"; // tankestreg, ikke bindestreg: markerer fravær af data

function formatér(v, dec) {
  // 0 gange et negativt tal giver -0 i IEEE 754, og Intl formaterer det
  // trofast som "-0,0". Byggeeffektens lave ende rammer præcis det, så
  // negativt nul normaliseres væk her ét sted for alle formateringer.
  if (v === 0) v = 0;
  return new Intl.NumberFormat("da-DK", {
    minimumFractionDigits: dec,
    maximumFractionDigits: dec,
  }).format(v);
}

/** Dansk taldformatering. null, undefined og NaN giver tankestreg - aldrig nul. */
export function tal(v, dec = 0) {
  if (v == null || !Number.isFinite(v)) return MANGLER;
  return formatér(v, dec);
}

/** Procent med eksplicit fortegn. Fortegnet sættes selv i stedet for at lade
 *  Intl gøre det, fordi nogle ICU-versioner bruger U+2212 frem for almindelig
 *  bindestreg, og så bliver output uforudsigeligt på tværs af miljøer. */
export function pct(v, dec = 1) {
  if (v == null || !Number.isFinite(v)) return MANGLER;
  const fortegn = v > 0 ? "+" : v < 0 ? "-" : "";
  // Hårdt mellemrum (U+00A0) foran procenttegnet: dansk typografi, og det
  // forhindrer at tallet ombrydes væk fra sin enhed i en smal tabelcelle.
  return `${fortegn}${formatér(Math.abs(v) * 100, dec)}\u00A0%`;
}

/** Ton CO2e med ét decimal. */
export function ton(v) {
  if (v == null || !Number.isFinite(v)) return MANGLER;
  return `${formatér(v, 1)} ton`;
}

/** Interval mellem to tal, enkelt dash som husreglen foreskriver.
 *  Vises altid stigende: komponenternes low og high refererer til
 *  elasticitetens lave og høje ende, ikke til den mindste og største værdi,
 *  så for negative effekter er low det største tal. Uden sortering ville
 *  indkomsteffekten stå som "-0,4 - -0,6", hvilket læses forkert. */
export function interval(a, b, adskiller = " - ") {
  if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b)) return MANGLER;
  return `${formatér(Math.min(a, b), 1)}${adskiller}${formatér(Math.max(a, b), 1)}`;
}

/** Interval med ordet "til" i stedet for en streg. Bruges hvor tallene kan
 *  være negative: "-0,6 - -0,4" er reelt ulæseligt, mens "-0,6 til -0,4"
 *  ikke er til at misforstå. Hovedtallet er altid positivt og beholder
 *  stregen, fordi den ser bedre ud i stor visning. */
export function intervalTil(a, b) {
  return interval(a, b, " til ");
}

// ---------- Retningsmarkør ----------

// Formen bærer retningen, ikke farven: cirka 8 % af mænd er farveblinde.
// Overtaget fra doughnut-projektets TrendMarker.
//
// Markøren er bevidst NEUTRAL grå og vurderer ikke godt eller dårligt.
// Motoren udleder kun retning af afvigelsens fortegn, og specen forbyder
// auto-prioritering. En grøn/rød skala ville påtvinge en normativ dom, som
// metoden ikke har truffet - og den ville være direkte forkert for drivere
// som el-bil-andel, hvor "over land" er en fordel.
const MARKOERER = {
  "over land": {
    form: '<path d="M6 1.5 L10.5 9 L1.5 9 Z" fill="currentColor"/>',
    farve: "text-gray-500",
    label: "over landsgennemsnittet",
  },
  "under land": {
    form: '<path d="M6 10.5 L1.5 3 L10.5 3 Z" fill="currentColor"/>',
    farve: "text-gray-500",
    label: "under landsgennemsnittet",
  },
  "på niveau": {
    form: '<line x1="1.5" y1="6" x2="10.5" y2="6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    farve: "text-gray-400",
    label: "på niveau med landsgennemsnittet",
  },
  kontekst: {
    form:
      '<rect x="1" y="1" width="10" height="10" rx="1.5" fill="none" stroke="currentColor" stroke-width="1"/>' +
      '<line x1="1" y1="11" x2="11" y2="1" stroke="currentColor" stroke-width="1"/>' +
      '<line x1="1" y1="6" x2="6" y2="1" stroke="currentColor" stroke-width="1"/>' +
      '<line x1="6" y1="11" x2="11" y2="6" stroke="currentColor" stroke-width="1"/>',
    farve: "text-gray-300",
    label: "ingen retning opgjort",
  },
};

/** SVG-markør for en drivers retning. Formen skelner, farven gør ikke. */
export function retningsMarkoer(retning) {
  const m = MARKOERER[retning] ?? MARKOERER.kontekst;
  return (
    `<svg viewBox="0 0 12 12" class="inline-block h-3 w-3 shrink-0 ${m.farve}" ` +
    `role="img" aria-label="${esc(m.label)}">${m.form}</svg>`
  );
}

// ---------- Forbehold ----------

/** Forbeholdsikon med tooltip. Selve boksen tegnes af tooltip.js i
 *  document.body, fordi en boks inde i elementet bliver klippet væk af
 *  nøgletalstabellens overflow. Teksten står i data-tip og i aria-label, så
 *  den også når skærmlæsere. tabindex gør den tilgængelig fra tastaturet. */
export function forbehold(tekst) {
  return (
    `<span class="inline-flex align-middle ml-1" tabindex="0" role="note" ` +
    `data-tip="${esc(tekst)}" aria-label="Forbehold: ${esc(tekst)}">` +
    '<svg viewBox="0 0 16 16" class="h-3.5 w-3.5 text-amber-500" aria-hidden="true">' +
    '<circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
    '<line x1="8" y1="4.5" x2="8" y2="9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
    '<circle cx="8" cy="11.5" r="0.9" fill="currentColor"/></svg></span>'
  );
}

const KORT = "kort-print rounded-lg border border-gray-200 bg-white";

// Hvad afvigelsen peger mod for UDLEDNINGEN - ikke om værdien er høj eller lav.
// De to er ikke det samme, og ordet "markant" skjulte forskellen: en lav
// el-bilandel er en lav værdi, men peger mod en HØJ udledning. Teksten siger
// nu "peger mod ..." hele vejen, så den ikke kan læses som en beskrivelse af
// selve tallet. Værdien står altid ved siden af og taler for sig selv.
//
// Formen bærer signalet lige så meget som farven, og teksten står altid ved
// siden af - farve må aldrig være eneste bærer af betydning.
//
// Der er intet mærkat for en retning, der ikke kan afgøres. Et hovednøgletal
// uden retning tages af kommunens side (se beregnKommune), og et hjælpetal uden
// retning står uden mærkat.
//
// Under 10 % peger nøgletallet "lidt": retningen står, men svagt, og formen er
// en åben trekant. Kun en afvigelse, der vises som 0,0 %, peger hverken op eller ned.
const SIGNAL = {
  "markant højere": { tekst: "peger mod meget højere udledning",
    klasse: "bg-red-50 text-red-700 border-red-200", tegn: "▲▲" },
  "højere":         { tekst: "peger mod højere udledning",
    klasse: "bg-amber-50 text-amber-800 border-amber-200", tegn: "▲" },
  "lidt højere":    { tekst: "peger lidt mod højere udledning",
    klasse: "bg-gray-50 text-gray-700 border-gray-200", tegn: "△" },
  "på niveau":      { tekst: "peger hverken op eller ned",
    klasse: "bg-gray-50 text-gray-600 border-gray-200", tegn: "–" },
  "lidt lavere":    { tekst: "peger lidt mod lavere udledning",
    klasse: "bg-gray-50 text-gray-700 border-gray-200", tegn: "▽" },
  "lavere":         { tekst: "peger mod lavere udledning",
    klasse: "bg-emerald-50 text-emerald-700 border-emerald-200", tegn: "▼" },
  "markant lavere": { tekst: "peger mod meget lavere udledning",
    klasse: "bg-emerald-100 text-emerald-800 border-emerald-300", tegn: "▼▼" },
  "ukendt":         { tekst: "ingen data",
    klasse: "bg-gray-50 text-gray-400 border-gray-200", tegn: "–" },
};

/** Lille mærkat med signalet. Teksten står altid, så farven kun forstærker. */
function signalMaerkat(signal, ekstraKlasse = "", stor = false) {
  const s = SIGNAL[signal] ?? SIGNAL.ukendt;
  // Overblikket bruger den store udgave: retningen er hele pointen dér, og i
  // mikroskrift blev den overset. Tabellen beholder den lille, hvor pladsen
  // er trang og råtallet står ved siden af.
  const stoerrelse = stor
    ? "text-sm px-2.5 py-1 font-semibold"
    : "text-xs px-2 py-0.5 font-medium";
  const tegnStoerrelse = stor ? "text-[11px]" : "text-[9px]";
  return `<span class="inline-flex items-center gap-1 rounded-full border whitespace-nowrap
    ${stoerrelse} ${s.klasse} ${ekstraKlasse}">
    <span aria-hidden="true" class="${tegnStoerrelse} leading-none">${s.tegn}</span>${esc(s.tekst)}</span>`;
}

// ---------- Danmarks forbrugsudledning (CONCITO) ----------

function kildeHenvisning(c, side, tekst) {
  const k = c.kilder.find((x) => x.id === "CONCITO_2023");
  const label = tekst || `${k.udgiver} (${k.aar}) s. ${side}`;
  return `<a href="${esc(k.url)}" target="_blank" rel="noopener"
    class="underline decoration-dotted hover:text-gray-900">${esc(label)}</a>`;
}

/** CONCITO's nationale opgørelse. Samme for alle kommuner - det er et
 *  nationalt tal, og værktøjet regner det ikke om til kommuneniveau. */
export function renderNationaltAftryk(c) {
  const n = c.nationalt_aftryk;
  const maks = Math.max(...c.kategorier.map((k) => k.ton));

  const rækker = c.kategorier.map((k) => `<li class="flex items-center gap-3 py-1.5">
      <span class="w-44 shrink-0 text-sm text-gray-700">${esc(k.navn)}</span>
      <span class="flex-1 min-w-0">
        <span class="block h-2.5 rounded-sm bg-gray-300" style="width:${(k.ton / maks * 100).toFixed(1)}%"></span>
      </span>
      <span class="w-24 shrink-0 text-right text-sm tabular-nums text-gray-900 whitespace-nowrap">
        ${tal(k.ton, 1)} ton</span>
      <span class="w-12 shrink-0 text-right text-xs tabular-nums text-gray-500">${k.pct}&nbsp;%</span>
    </li>`).join("");

  const andre = c.andre_opgoerelser.map((o) =>
    `<li>${esc(o.navn)}: <strong>${tal(o.ton, 1)} ton</strong> (${kildeHenvisning(c, o.side)})</li>`).join("");

  const noter = c.noter.map((n) =>
    `<li class="mt-2"><strong class="font-medium text-gray-700">${esc(n.emne)}.</strong>
      ${esc(n.tekst)}</li>`).join("");

  return `<section class="${KORT} p-5 sm:p-6">
    <h2 class="text-lg font-semibold text-gray-900">Danmarks forbrugsudledning</h2>
    <p class="mt-1 text-sm text-gray-600 max-w-3xl">Tallene herunder er nationale og
      gælder hele landet. De er ikke beregnet af dette værktøj, men afskrevet fra
      ${kildeHenvisning(c, n.side, "CONCITO's rapport")} med sidehenvisning.</p>

    <p class="mt-4">
      <span class="text-3xl font-bold tracking-tight text-gray-900">${tal(n.ton, 1)} ton CO2e</span>
      <span class="ml-2 text-sm text-gray-600">pr. dansker, ${esc(n.aar)}</span>
    </p>
    <p class="mt-1 text-xs text-gray-500">${esc(n.opgoerelse)}, gengivet i
      ${kildeHenvisning(c, n.side)}: &raquo;${esc(n.citat)}&laquo;</p>

    <h3 class="mt-6 text-sm font-semibold text-gray-900">Fordelt på varegrupper og tjenester</h3>
    <p class="text-xs text-gray-500">${kildeHenvisning(c, 16)}, figur 7</p>
    <ul class="mt-3 divide-y divide-gray-100">${rækker}</ul>

    <details class="mt-5 text-xs text-gray-500">
      <summary class="cursor-pointer font-medium text-gray-600 hover:text-gray-900">
        Forbehold ved de nationale tal</summary>
      <ul class="mt-2 space-y-1">${noter}</ul>
      <p class="mt-3 font-medium text-gray-600">Andre offentliggjorte opgørelser:</p>
      <ul class="mt-1 list-disc pl-5 space-y-1">${andre}</ul>
    </details>
  </section>`;
}

/** Energistyrelsens nationale vægt for en forbrugsgruppe. */
function nationalVaegt(ens, kategori) {
  const k = ens.kategorier.find((x) => x.navn === kategori);
  return k ? { ton: k.ton, pct: k.pct } : null;
}

// ---------- Kategorioverblik ----------

// Kategorier uden kommunale nøgletal. De står med i overblikket - de udgør
// tilsammen halvdelen af aftrykket, og et overblik, der kun viser det, vi kan
// måle, ville pege klimakoordinatoren mod de forkerte kategorier.
const UDEN_INDIKATOR = {
  "Føde- og drikkevarer":
    "Der findes ingen offentligt tilgængelig kommunal indikator for fødevareforbrug. "
    + "Behovet må antages at ligge på nationalt niveau.",
  "Offentligt forbrug":
    "Fordeles ligeligt på alle borgere og varierer derfor ikke mellem kommuner "
    + "(NIRAS 2024, afsnit 4.3.1, s. 29).",
  "Øvrige investeringer":
    "Erhvervets og samfundets investeringer i anlæg, maskiner, forskning og "
    + "erhvervsbyggeri. Tæller med i aftrykket, men er ikke borgernes eget forbrug.",
};

/** Enheden efter værdien. Springes over for procenter, hvor driverVaerdi
 *  allerede har sat tegnet - "16,2 % pct." ville være volapyk. */
function enhedSuffiks(d) {
  if (!d.enhed || d.enhed === "pct.") return "";
  return `\u00A0${esc(d.enhed)}`;
}

// Konklusionen og optællingen tæller kun udsving på 10 % eller mere som en
// retning. De små står for sig: talte et udsving på 6 % med, ville det stå lige
// med et på 40 %, og konklusionen tæller - den vejer ikke.
const peger = (vej) => (d) => d.signal === vej || d.signal === `markant ${vej}`;
const pegerLidt = (d) => d.signal.startsWith("lidt ");

/** Kantfarven på konklusionsboksen følger konklusionens retning. Farven
 *  forstærker kun; teksten bærer altid signalet. */
function kantFarve(drivere) {
  const op = drivere.filter(peger("højere")).length;
  const ned = drivere.filter(peger("lavere")).length;
  if (op > 0 && ned === 0) return "border-red-400";
  if (ned > 0 && op === 0) return "border-emerald-400";
  return "border-gray-300";
}

/** Samlet konklusion for en kategori.
 *
 *  TÆLLER, VEJER IKKE. Konklusionen siger, hvilken vej nøgletallene peger, og
 *  hvor mange der peger hver vej. Den siger IKKE, at kategorien som helhed
 *  ligger over eller under landsgennemsnittet - det ville kræve en vægtning af
 *  nøgletal mod hinanden, som ikke findes i nogen kilde, og værktøjet har
 *  intet mål for kategorien som helhed.
 *
 *  Formuleringen holder den grænse: "nøgletallene peger mod ...", aldrig
 *  "kategorien ligger ...". */
function kategoriKonklusion(drivere) {
  const tael = (f) => drivere.filter(f).length;
  const op = tael(peger("højere"));
  const ned = tael(peger("lavere"));
  const lidt = tael(pegerLidt);
  const niveau = tael((d) => d.signal === "på niveau");
  const retningsbaerende = op + ned;

  let tekst;
  let klasse = "text-gray-700";
  if (retningsbaerende === 0) {
    tekst = lidt > 0
      ? "Nøgletallene peger kun lidt - ingen ligger 10 % eller mere fra landsgennemsnittet."
      : niveau > 0
        ? "Nøgletallene ligger på landsgennemsnittet."
        : "Der er ingen data for nøgletallene.";
    klasse = "text-gray-600";
  } else if (ned === 0 || op === 0) {
    const antal = Math.max(op, ned);
    const vej = op > 0 ? "højere" : "lavere";
    klasse = op > 0 ? "text-red-800" : "text-emerald-800";
    const indled = antal === 1 ? "Det eneste nøgletal, der afviger 10 % eller mere, peger"
      : antal === 2 ? "Begge nøgletal, der afviger 10 % eller mere, peger"
      : `Alle ${antal} nøgletal, der afviger 10 % eller mere, peger`;
    tekst = `${indled} mod ${vej} udledning end landsgennemsnittet.`;
  } else {
    klasse = "text-gray-700";
    tekst = `${op} nøgletal peger mod højere udledning og ${ned} mod lavere - `
      + "de trækker i hver sin retning.";
  }

  const forbehold = [];
  if (retningsbaerende > 1) forbehold.push("nøgletallene er talt, ikke vejet mod hinanden");

  return `<p class="text-base font-semibold leading-snug ${klasse}">${esc(tekst)}</p>${
    forbehold.length
      ? `<p class="text-xs text-gray-500 mt-0.5">${
          forbehold.map(esc).join(" &middot; ")}</p>`
      : ""}`;
}

/** Kategorioverblikket øverst på kommunesiden.
 *
 *  HVORFOR DET AFLØSTE "DET STIKKER UD". Den gamle sektion sorterede efter rå
 *  afvigelse og viste derfor systematisk de nøgletal, hvor spredningen mellem
 *  kommuner er størst - ikke dem, der betyder mest. Værre: den var tavs om de
 *  kategorier, hvor værktøjet ingen nøgletal har, og de udgør halvdelen af
 *  aftrykket. En koordinator, der skal udpege væsentlige forbrugskategorier,
 *  ville blive ført mod Energi og forsyning, fordi det er dér, vi har fem tal.
 *
 *  Rækkefølgen er Energistyrelsens nationale vægt, faldende. Det er kildens
 *  egen ordning, ikke vores, og den modvirker skævheden.
 *
 *  Værktøjet vælger IKKE kategori. Det viser vægten, hvad der kan måles, og
 *  hvad der ikke kan. */
export function renderKategorioverblik(b, ens) {
  // Vægtrækkefølge, men restposter sidst. "Øvrige investeringer" er den
  // største enkeltkategori og ville ellers åbne overblikket med noget, ingen
  // kommune kan handle på. Bruddet er bevidst og står i pipeline/ens.py.
  const sorteret = [...ens.kategorier].sort((a, x) =>
    (a.restpost ? 1 : 0) - (x.restpost ? 1 : 0) || x.ton - a.ton);

  const raekker = sorteret.map((k) => {
    const drivere = b.drivere.filter(
      (d) => d.kategori === k.navn && d.rolle !== "hjaelper");
    const blind = UDEN_INDIKATOR[k.navn];

    let hoejre;
    if (blind) {
      hoejre = `<div class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2
        text-xs text-amber-900"><strong class="font-semibold">${
        k.navn === "Føde- og drikkevarer" ? "Ingen kommunal indikator."
          : "Ingen kommunal variation."}</strong> ${esc(blind)}</div>`;
    } else {
      const tael = (f) => drivere.filter(f).length;
      const dele = [];
      const op = tael(peger("højere"));
      const ned = tael(peger("lavere"));
      const lidt = tael(pegerLidt);
      const niv = tael((d) => d.signal === "på niveau");
      if (op) dele.push(`${op} peger mod højere udledning`);
      if (ned) dele.push(`${ned} peger mod lavere`);
      if (lidt) dele.push(`${lidt} peger lidt`);
      if (niv) dele.push(`${niv} hverken op eller ned`);

      const punkter = drivere
        .filter((d) => d.afvigelse != null)
        .sort((a, x) => Math.abs(x.afvigelse) - Math.abs(a.afvigelse))
        .map((d) => `<li class="py-1.5 border-b border-dotted border-gray-100 last:border-0">
          <span class="flex items-baseline justify-between gap-3">
            <span class="text-sm text-gray-800">${esc(d.navn)}</span>
            <span class="text-sm font-semibold tabular-nums whitespace-nowrap
              inline-flex items-baseline gap-1.5">
              ${d.retning !== "kontekst" ? retningsMarkoer(d.retning) : ""}
              ${driverVaerdi(d, d.kommuneVaerdi)}${enhedSuffiks(d)}</span>
          </span>
          <span class="block text-xs text-gray-500 tabular-nums">landet
            ${driverVaerdi(d, d.landVaerdi)}${enhedSuffiks(d)} &middot; ${driverAfvigelse(d)}</span>
          <span class="mt-1 block">${signalMaerkat(d.signal, "", true)}</span>
        </li>`).join("");

      hoejre = `<div>
        <div class="mb-2 rounded-md border-l-4 ${kantFarve(drivere)} bg-gray-50 px-3 py-2.5">
          ${kategoriKonklusion(drivere)}
        </div>
        <p class="text-xs text-gray-500 mb-1.5"><strong class="font-medium text-gray-700">${
          drivere.length} nøgletal</strong>${
          dele.length ? ` &middot; ${dele.join(", ")}` : ""}</p>
        <ul class="list-none m-0 p-0">${punkter}</ul>
      </div>`;
    }

    // Både tallet og søjlen er NATIONALE og ordret ens på alle 98 kommunesider.
    // Uden ordet "nationalt" læses "1,84 ton pr. indbygger" på Albertslunds side
    // som Albertslunds eget transportaftryk - et tal, værktøjet slet ikke kan
    // opgøre. aria-label gentager det for skærmlæsere, som ikke ser søjlen.
    // Ingen søjle. Den viste kategoriens andel af det NATIONALE aftryk og var
    // derfor ordret ens på alle 98 kommunesider - den bar ingen oplysning om
    // kommunen, mens alt andet på siden gør. Tallet står i teksten lige over.
    return `<div class="grid grid-cols-1 sm:grid-cols-[13rem_1fr] gap-2 sm:gap-5
      border-t border-gray-100 py-3 first:border-0">
      <div>
        <div class="text-sm font-semibold text-gray-900">${esc(k.navn)}</div>
        <div class="text-xs text-gray-500 tabular-nums">Nationalt
          <strong class="font-semibold text-gray-700">${tal(k.ton, 2)} ton</strong>
          pr. indbygger &middot; ${tal(k.pct, 1)}&nbsp;% af aftrykket</div>
      </div>
      ${hoejre}
    </div>`;
  }).join("");

  return `<section class="${KORT} p-5 sm:p-6">
    <div class="flex items-baseline justify-between gap-3 flex-wrap">
      <h2 class="text-xl font-bold text-gray-900">Forbrugskategorier i ${esc(b.navn)}</h2>
      <span class="text-sm text-gray-600">Energistyrelsen ${esc(ens.nationalt_aftryk.aar)}
        &middot; ${tal(ens.nationalt_aftryk.ton, 2)} ton pr. indbygger</span>
    </div>
    <p class="mt-1 text-sm text-gray-600 max-w-3xl">Til venstre står kategoriens vægt i
      det <strong>nationale</strong> aftryk. Den er ens på alle 98 kommunesider og siger
      intet om ${esc(b.navn)}. Til højre står det, der faktisk er målt om kommunen.
      Værktøjet vælger ikke kategori.</p>

    <div class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
      <p class="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">
        <strong class="block text-gray-800">Hvad tallet er</strong>
        Kommunens værdi og landsgennemsnittet, med afvigelsen mellem dem.
        Værktøjet sammenligner ikke kommuner med hinanden.</p>
      <p class="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">
        <strong class="block text-gray-800">Hvad det peger mod</strong>
        Om nøgletallet trækker udledningen op eller ned. Det handler om udledningen,
        ikke om værdien: færre elbiler er en lavere andel, men peger mod højere udledning.</p>
    </div>

    <div class="mt-4">${raekker}</div>

    <p class="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-500 max-w-3xl">
      <strong class="font-semibold text-gray-600">Dette er ikke en prioritering.</strong>
      Rækkefølgen er Energistyrelsens nationale vægte, ikke en vurdering af kommunen.
      Kommunal indflydelse kan værktøjet ikke opgøre.</p>
  </section>`;
}

// ---------- Kommunens nøgletal ----------

const DRIVER_FORBEHOLD = {
  "Husholdningernes CO2 fra energi":
    "Udledningen fra borgernes eget forbrug af varme, varmt vand og el i boligen, " +
    "fordelt på samtlige boliger inklusive fritidshuse. Strømmen er regnet med landets " +
    "fælles udledning pr. kWh: Klimaregnskabets egen el-faktor lader kommunens " +
    "vindmøller og solceller tælle som nul hos kommunens egne forbrugere, men strøm " +
    "deles på det fælles net. Fjernvarmen er regnet med sit lokale nets udledning. " +
    "Dækker forbrændingen og elnettet, ikke hele livscyklussen bag brændslet - " +
    "niveauet er derfor lavere end CONCITO's nationale tal, men sammenligningen med " +
    "landet er gyldig, fordi begge sider opgøres ens.",
  "Fjernvarmens CO2 pr. kWh":
    "Husholdningernes fjernvarme i kommunen, fra Klimaregnskabet.dk. Udledningen " +
    "beregnes pr. fjernvarmenet efter Energistyrelsens anbefaling og fordeles på de " +
    "kommuner, der aftager varme fra nettet. Står der en streg, har kommunens " +
    "husholdninger ingen fjernvarme. Tallet siger, hvor ren fjernvarmen er - hvor " +
    "meget den fylder, ses i husholdningernes CO2.",
  "Husholdningernes energiforbrug":
    "Al energi brugt i boligerne: fjernvarme, gas, olie, brænde, varmepumper og el til " +
    "alt andet. Erhverv, fremstilling og transport er ikke med. Fordelt på samtlige " +
    "boliger inklusive fritidshuse, fordi fritidsboligers energi indgår, mens deres " +
    "ejere er registreret i en anden kommune.",
  "Fossil andel af husholdningernes energi":
    "Naturgas, fyringsolie og LPG som andel af husholdningernes samlede energiforbrug. " +
    "Modsat 'Fossil opvarmning', der tæller antal boliger, er dette den faktiske " +
    "energimængde.",
  "Fritidshuse pr. helårsbolig":
    "Står her, fordi de to husholdningstal pr. bolig ikke kan læses uden det. " +
    "Fritidshuse bruger energi, men mindre end en helårsbolig, så de trækker " +
    "gennemsnittet ned. Over 1 - flere fritidshuse end helårsboliger - vises de to " +
    "tal derfor ikke.",
  "Gennemsnitlig pendlingsafstand":
    "Afstand til arbejde for beskæftigede med bopæl i kommunen. Siger intet om " +
    "transportmiddel og dækker kun arbejdsturen, ikke indkøb, fritid og andre ærinder.",
  "Genanvendelsesprocent":
    "Opgjort efter kommunens indberetning til Danmarks Statistik. Definitionen af, " +
    "hvad der tæller som genanvendt, har ændret sig over tid. Procenten er desuden " +
    "ramt af den samme indberetningsfejl som husholdningsaffaldet: forsvinder " +
    "restaffaldet fra en kommunes regnskab, udgør de genanvendelige fraktioner en " +
    "kunstigt høj andel af det, der er tilbage. Se forbeholdet ved Husholdningsaffald.",
  "Husholdningsaffald":
    "Danmarks Statistiks eget nøgletal, ikke en beregning her. DST oplyser selv, at " +
    "kommunefordelte affaldsmængder er mere usikre end totalerne, blandt andet fordi " +
    "affald kan afleveres i en anden kommune, og fordi genbrugspladser bruges af " +
    "borgere fra flere kommuner. For 2023 slår det tydeligt igennem: flere kommuner, " +
    "der deler et fælleskommunalt affaldsselskab, har fået hinandens restaffald " +
    "bogført, så nogle står urealistisk lavt og andre urealistisk højt. Lagt sammen " +
    "inden for hvert selskab er niveauet normalt, og landsgennemsnittet er upåvirket. " +
    "Tallet står, som DST har offentliggjort det, og er ikke rettet her.",
};

const ALLEREDE_PROCENT = new Set([
  "Genanvendelsesprocent",
]);
const ANDEL_SOM_PROCENT = new Set(["Fossil andel af husholdningernes energi"]);

function andel(v) {
  if (v == null || !Number.isFinite(v)) return MANGLER;
  return `${formatér(v * 100, 1)} %`;
}

function driverVaerdi(d, v) {
  if (v == null || !Number.isFinite(v)) return MANGLER;
  if (ALLEREDE_PROCENT.has(d.navn)) return `${formatér(v, 1)} %`;
  if (ANDEL_SOM_PROCENT.has(d.navn)) return andel(v);
  if (d.enhed === "pct.") return d.type === "difference" ? pct(v) : andel(v);
  const a = Math.abs(v);
  return tal(v, a >= 100 ? 0 : a >= 10 ? 1 : 2);
}

function driverAfvigelse(d) {
  if (d.afvigelse == null) return MANGLER;
  return d.type === "difference" ? `${pct(d.afvigelse)} procentpoint` : pct(d.afvigelse);
}

/** Procentpoint ved siden af den relative afvigelse, for de nøgletal der er
 *  andele. "+283 %" lyder ekstremt; "+27,7 procentpoint" er den samme forskel
 *  sagt, så den kan forstås. Begge står, fordi begge er sande. */
function procentpointNote(d) {
  if (d.procentpoint == null) return "";
  const fortegn = d.procentpoint > 0 ? "+" : d.procentpoint < 0 ? "-" : "";
  return `<span class="block text-xs font-normal text-gray-500">
    ${fortegn}${formatér(Math.abs(d.procentpoint), 1)} procentpoint</span>`;
}

function kategoriNote(c, kategori) {
  if (kategori === "Transport") {
    const bil = c.transport_underkategorier.find((x) => x.navn.startsWith("Kørsel"));
    return `CONCITO opgør kørsel i personlige transportmidler til ${tal(bil.ton, 1)} ton `
      + "af transportens samlede aftryk (anden opgørelse end Energistyrelsens)";
  }
  if (kategori === "Energi og forsyning") {
    return "husholdningstallene dækker forbrændingen og elnettet, ikke hele livscyklussen";
  }
  if (kategori === "Bolig og byggeri") {
    return "selve byggeriet - boligernes energiforbrug hører til Energi og forsyning";
  }
  return "";
}

/** De nøgletal, der er taget af kommunens side, fordi deres retning ikke kan
 *  afgøres her. Et hul skal forklares, ikke gemmes. Nøgletal med samme
 *  begrundelse samles, så forbeholdet står én gang. */
function udeladtNote(b) {
  if (b.udeladt.length === 0) return "";
  const prNote = new Map();
  for (const u of b.udeladt) prNote.set(u.note, [...(prNote.get(u.note) ?? []), u.navn]);
  const punkter = [...prNote].map(([note, navne]) => {
    const opremset = navne.length > 1
      ? `${navne.slice(0, -1).join(", ")} og ${navne.at(-1)}` : navne[0];
    return `<li class="mt-1"><strong class="font-medium text-gray-700">${esc(opremset)}.</strong>
      ${esc(note)}</li>`;
  }).join("");
  return `<div class="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-500 max-w-3xl">
      <p><strong class="font-semibold text-gray-600">Vises ikke for ${esc(b.navn)}.</strong>
        Et nøgletal, hvis retning ikke kan afgøres for kommunen, er taget af siden.</p>
      <ul class="mt-1 list-none m-0 p-0">${punkter}</ul>
    </div>`;
}

/** Én samlet tabel med alle nøgletal, grupperet efter kategori.
 *
 *  Erstatter fem foldbare kort. Nitten rækker er ikke meget, og at skulle
 *  klikke fem gange for at se dem gjorde sammenligning på tværs umulig. */
export function renderIndikatorer(b, c, ens) {
  const grupper = b.grupper.map((g) => {
    const vaegt = ens ? nationalVaegt(ens, g.kategori) : null;
    const note = kategoriNote(c, g.kategori);
    const overskrift = `<tr class="bg-gray-50">
      <th colspan="5" class="px-3 py-2 text-left">
        <span class="text-sm font-semibold text-gray-900">${esc(g.kategori)}</span>
        ${vaegt ? `<span class="ml-2 text-xs font-normal text-gray-600">nationalt
          ${tal(vaegt.ton, 1)} ton &middot; ${vaegt.pct}&nbsp;% af aftrykket</span>` : ""}
        ${note ? `<span class="block text-xs font-normal text-gray-500">${note}</span>` : ""}
      </th></tr>`;

    const raekker = g.drivere.map((d) => {
      const fb = DRIVER_FORBEHOLD[d.navn];
      const tom = d.kommuneVaerdi == null;
      // Et hjælpetal uden retning får intet mærkat; begrundelsen ved ikonet siger,
      // hvad det forklarer. Et hovednøgletal uden retning når aldrig hertil -
      // beregnKommune tager det af kommunens side.
      const maerkat = d.signal === "uafklaret" ? "" : signalMaerkat(d.signal);
      return `<tr class="border-t border-gray-100 ${tom ? "text-gray-600" : ""}">
        <td class="py-2 pl-3 pr-3 text-sm">
          <span class="font-medium text-gray-900">${esc(d.navn)}</span>${fb ? forbehold(fb) : ""}
          <span class="block text-xs text-gray-500">${esc(d.enhed)}</span></td>
        <td class="py-2 px-3 text-right text-sm tabular-nums whitespace-nowrap ${tom ? "" : "font-medium text-gray-900"}">
          ${driverVaerdi(d, d.kommuneVaerdi)}</td>
        <td class="py-2 px-3 text-right text-sm tabular-nums whitespace-nowrap text-gray-600">
          ${driverVaerdi(d, d.landVaerdi)}</td>
        <td class="py-2 px-3 text-right text-sm tabular-nums whitespace-nowrap text-gray-700">
          ${driverAfvigelse(d)}${procentpointNote(d)}</td>
        <td class="py-2 pl-3 pr-3 text-right whitespace-nowrap">
          ${maerkat}${d.begrundelse ? forbehold(d.begrundelse) : ""}</td>
      </tr>`;
    }).join("");

    return overskrift + raekker;
  }).join("");

  return `<section class="${KORT} mt-6 p-5 sm:p-6">
    <h2 class="text-lg font-semibold text-gray-900">Alle nøgletal</h2>
    <p class="mt-1 text-sm text-gray-600 max-w-3xl">Grupperet efter den forbrugskategori,
      de vedrører. "Peger mod" er den eneste vurdering i værktøjet - hold musen over
      ikonet for at se begrundelsen for hvert enkelt nøgletal.</p>
    <div class="mt-4 -mx-3 overflow-x-auto tabel-scroll">
      <table class="w-full min-w-[36rem]">
        <thead><tr class="text-xs uppercase tracking-wide text-gray-500">
          <th class="py-2 pl-3 pr-3 text-left font-medium">Nøgletal</th>
          <th class="py-2 px-3 text-right font-medium">${esc(b.navn)}</th>
          <th class="py-2 px-3 text-right font-medium">Hele landet</th>
          <th class="py-2 px-3 text-right font-medium">Forskel</th>
          <th class="py-2 pl-3 pr-3 text-right font-medium">Peger mod</th>
        </tr></thead>
        <tbody>${grupper}</tbody>
      </table>
    </div>
    ${udeladtNote(b)}
  </section>`;
}

// ---------- Hvad værktøjet ikke kan vise ----------

/** De huller, der er kendte og bevidste. Skal stå i outputtet, ikke gemmes. */
export function renderHuller(c) {
  const mad = c.kategorier.find((k) => k.navn === "Fødevarer");
  const okse = c.foedevare_underkategorier.find((x) => x.navn === "Oksekød");
  const anbefalinger = c.niras_anbefalinger.map((a) => `<li class="mt-2">
      <strong class="font-medium text-gray-700">${esc(a.omraade)}.</strong>
      ${esc(a.anbefaling)}
      <span class="block text-gray-500">${esc(a.tilgaengelighed)}
        (NIRAS 2024, afsnit ${esc(a.afsnit)}, s. ${esc(a.side)})</span>
    </li>`).join("");
  const niras = c.kilder.find((k) => k.id === "NIRAS_2024");

  return `<section class="${KORT} p-5 sm:p-6 mt-6">
    <h3 class="text-lg font-semibold text-gray-900">Hvad værktøjet ikke kan vise</h3>

    <p class="mt-2 text-sm text-gray-700 max-w-3xl"><strong>Fødevarer.</strong>
      CONCITO opgør fødevarer til <strong>${tal(mad.ton, 1)} ton</strong> pr. dansker
      (${mad.pct}&nbsp;%), heraf oksekød alene <strong>${tal(okse.ton, 1)} ton</strong>
      (${okse.pct_af_foedevarer}&nbsp;% af fødevarerne), ${kildeHenvisning(c, okse.side)}.
      Det er den næststørste kategori i det nationale aftryk, og der findes ingen
      offentligt tilgængelig kommunal indikator for den. Værktøjet er derfor blindt
      på en femtedel af aftrykket.</p>

    <p class="mt-3 text-sm text-gray-700 max-w-3xl"><strong>Et samlet kommunalt tal.</strong>
      Værktøjet beregner ikke, hvor mange ton CO2e en kommunes borgere udleder. Et
      sådant tal ville kræve koefficienter, der ikke findes i nogen af kilderne.
      <a href="${esc(niras.url)}" target="_blank" rel="noopener"
        class="underline decoration-dotted hover:text-gray-900">NIRAS' anbefaling til
        en kommunal beregningsmodel</a> hviler på datagrundlag, der ikke er offentligt
      tilgængelige:</p>
    <ul class="mt-2 text-sm text-gray-700 max-w-3xl">${anbefalinger}</ul>
  </section>`;
}

// ---------- Samlet kommunevisning ----------

export function renderKommuneOverskrift(b) {
  const meta = [
    b.kode != null ? `Kommunekode ${esc(b.kode)}` : null,
    b.region ? `Region ${esc(b.region)}` : null,
  ].filter(Boolean).join(" &middot; ");

  const printknap = `<button type="button" onclick="window.print()"
      class="no-print no-embed mt-4 inline-flex items-center gap-1.5 rounded-md border
             border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700
             hover:bg-gray-50 hover:border-gray-400 transition-colors">
      <svg viewBox="0 0 16 16" class="h-4 w-4" aria-hidden="true" fill="none"
        stroke="currentColor" stroke-width="1.5">
        <path d="M4 6V2h8v4M4 12H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-1"/>
        <rect x="4" y="10" width="8" height="4"/></svg>
      Print eller gem som PDF</button>`;

  return `<section class="mb-6">
    <div class="flex items-baseline justify-between gap-3 flex-wrap">
      <h2 class="text-2xl sm:text-3xl font-bold text-gray-900">${esc(b.navn)}</h2>
      <span class="text-xs text-gray-500">${meta}</span>
    </div>
    <p class="mt-2 text-sm text-gray-600 max-w-3xl">Kommunens offentligt tilgængelige
      nøgletal sammenlignet med landsgennemsnittet, grupperet efter den forbrugskategori
      de vedrører. Alle tal er hentet direkte fra de kilder, der står på
      <a href="metode.html" class="underline hover:text-gray-900">metodesiden</a>.
      Værktøjet lægger dem ikke sammen til et samlet klimaaftryk - se hvorfor nederst.</p>
    ${printknap}
  </section>`;
}

/** Kompakt forbehold, der KUN vises i embed-tilstand.
 *
 *  Sidehovedets amber-banner bærer .no-embed og forsvinder i en iframe. Det er
 *  netop den situation, hvor en læser møder tallene på en kommunes egen side
 *  uden at vide, at ingen myndighed står bag - og hvor forvekslingen med en
 *  officiel opgørelse derfor er lettest. Bundforbeholdet overlever embed, men
 *  står først efter hele tabellen.
 *
 *  Linket åbner i nyt faneblad: i en iframe ville det ellers indlejre
 *  metodesiden inde i værtssidens ramme. */
function embedForbehold() {
  return `<section class="kun-embed mb-5 rounded-md border border-amber-200 bg-amber-50
      px-3 py-2 text-xs text-amber-900">
    <strong class="font-semibold">Uofficielt værktøj.</strong>
    Faktuelle nøgletal fra offentlige registre, stillet op mod landsgennemsnittet
    og sat ved siden af CONCITO's nationale opgørelse. Ikke en beregning af
    kommunens klimaaftryk og ikke en myndighedsopgørelse.
    <a href="metode.html" target="_blank" rel="noopener"
       class="underline hover:text-amber-950">Se metode og kilder</a>.
  </section>`;
}

/** Rækkefølge: kommunens overskrift, det nationale grundlag, kommunens
 *  nøgletal pr. kategori, og til sidst hvad der ikke kan vises. */
export function renderKommune(b, c, ens) {
  return [
    embedForbehold(),
    renderKommuneOverskrift(b),
    ens ? renderKategorioverblik(b, ens) : "",
    renderIndikatorer(b, c, ens),
    renderHuller(c),
    `<section class="mt-6 text-xs text-gray-500 max-w-3xl">
      <p><strong class="font-semibold text-gray-600">Uofficielt værktøj.</strong>
        Ingen myndighed står bag. Tallene er faktuelle nøgletal fra offentlige
        registre, sammenholdt med CONCITO's nationale opgørelse. De er ikke en
        beregning af kommunens klimaaftryk og egner sig ikke til at rangordne
        kommuner mod hinanden. Kilder med tabel-id, årstal og sidehenvisning står på
        <a href="metode.html" class="underline hover:text-gray-700">metodesiden</a>.</p>
    </section>`,
  ].filter(Boolean).join("\n");
}
// ---------- Kilder og antagelser (metodesiden) ----------

const METODE_MAERKAT = {
  api: { tekst: "API", klasse: "bg-gray-100 text-gray-700" },
  manuel: { tekst: "Manuel", klasse: "bg-amber-100 text-amber-800" },
};

/** Kildetabellen. Perioder kommer fra sources.json, som pipelinen genererer,
 *  så årstallene ikke kan drive fra det, der faktisk blev hentet. */
export function renderKilder(sources) {
  const raekker = sources.kilder.map((k) => {
    const m = METODE_MAERKAT[k.metode] ?? METODE_MAERKAT.api;
    const navn = k.url
      ? `<a href="${esc(k.url)}" target="_blank" rel="noopener"
           class="underline hover:text-gray-900">${esc(k.navn)}</a>`
      : esc(k.navn);
    return `<tr class="border-t border-gray-100">
      <td class="py-2 pr-3 text-sm"><span class="font-mono text-xs text-gray-900">${esc(k.id)}</span></td>
      <td class="py-2 px-3 text-sm text-gray-700">${navn}${k.forbehold ? forbehold(k.forbehold) : ""}</td>
      <td class="py-2 px-3 text-sm text-gray-600 whitespace-nowrap">${esc(k.udbyder)}</td>
      <td class="py-2 px-3 text-sm text-gray-600 whitespace-nowrap">${esc(k.periode) || MANGLER}</td>
      <td class="py-2 px-3 text-sm whitespace-nowrap">
        <span class="rounded px-1.5 py-0.5 text-[10px] font-medium ${m.klasse}">${m.tekst}</span></td>
      <td class="py-2 pl-3 text-xs text-gray-500 whitespace-nowrap">${esc(k.licens)}</td>
    </tr>`;
  }).join("");

  return `<div class="overflow-x-auto tabel-scroll">
    <table class="w-full min-w-[40rem]">
      <thead><tr class="text-xs uppercase tracking-wide text-gray-500">
        <th class="py-2 pr-3 text-left font-medium">Tabel</th>
        <th class="py-2 px-3 text-left font-medium">Kilde</th>
        <th class="py-2 px-3 text-left font-medium">Udbyder</th>
        <th class="py-2 px-3 text-left font-medium">Periode</th>
        <th class="py-2 px-3 text-left font-medium">Hentning</th>
        <th class="py-2 pl-3 text-left font-medium">Licens</th>
      </tr></thead>
      <tbody>${raekker}</tbody>
    </table>
    <p class="mt-3 text-xs text-gray-500">Genereret ${esc(sources.genereret)}.</p>
  </div>`;
}

/** Hvor ofte hvert nøgletal giver et markant udsving.
 *
 *  Tabellen er selve ærligheden om tærsklerne: den viser sort på hvidt, at
 *  ordet "markant" dækker over 80 af 98 kommuner på ét nøgletal og ingen på et
 *  andet. Den GENERERES af beregnFordeling ud fra de faktiske 98 kommuner og
 *  må aldrig skrives i hånden, så tallene ikke kan drive fra data. */
export function renderTaerskelfordeling(fordeling) {
  const raekker = Object.entries(fordeling)
    .filter(([, f]) => f && f.n)
    .map(([navn, f]) => `<tr class="border-t border-gray-100">
      <td class="py-2 pr-3 text-sm text-gray-900">${esc(navn)}</td>
      <td class="py-2 px-3 text-right text-sm tabular-nums text-gray-600">${f.paaNiveau}</td>
      <td class="py-2 px-3 text-right text-sm tabular-nums text-gray-600">${f.mellem}</td>
      <td class="py-2 px-3 text-right text-sm tabular-nums font-medium text-gray-900">${f.markant}</td>
      <td class="py-2 px-3 text-right text-sm tabular-nums text-gray-600">${pct(f.medianAbs)}</td>
      <td class="py-2 pl-3 text-right text-sm tabular-nums text-gray-600">${pct(f.p90Abs)}</td>
    </tr>`).join("");

  return `<div class="overflow-x-auto tabel-scroll">
    <table class="w-full min-w-[38rem]">
      <thead><tr class="text-xs uppercase tracking-wide text-gray-500">
        <th class="py-2 pr-3 text-left font-medium">Nøgletal</th>
        <th class="py-2 px-3 text-right font-medium">Under 10 %</th>
        <th class="py-2 px-3 text-right font-medium">10-33 %</th>
        <th class="py-2 px-3 text-right font-medium">Markant</th>
        <th class="py-2 px-3 text-right font-medium">Median</th>
        <th class="py-2 pl-3 text-right font-medium">90-percentil</th>
      </tr></thead>
      <tbody>${raekker}</tbody>
    </table>
    <p class="mt-3 text-xs text-gray-500">Antal kommuner i hvert bånd, samt median og
      90-percentil af den absolutte afvigelse. Tallene beskriver nøgletallet, ikke den
      enkelte kommune, og er ens på alle kommunesider.</p>
  </div>`;
}

/** Energistyrelsens kategorier med de poster, hver af dem lægger sammen.
 *  Grupperingen er vores, tallene er kildens - derfor står posterne med, så
 *  enhver sum kan efterprøves mod Energistyrelsens eget ark. */
export function renderEnsKategorier(ens) {
  const raekker = ens.kategorier.map((k) => `<tr class="border-t border-gray-100 align-top">
    <td class="py-2 pr-3 text-sm text-gray-900">${esc(k.navn)}
      ${k.note ? `<span class="block text-xs text-gray-500">${esc(k.note)}</span>` : ""}</td>
    <td class="py-2 px-3 text-right text-sm tabular-nums whitespace-nowrap text-gray-900">
      ${tal(k.ton, 2)}</td>
    <td class="py-2 px-3 text-right text-sm tabular-nums whitespace-nowrap text-gray-600">
      ${tal(k.pct, 1)}&nbsp;%</td>
    <td class="py-2 pl-3 text-xs text-gray-500">${k.poster.map(esc).join("<br>")}</td>
  </tr>`).join("");

  const noter = ens.noter.map((n) => `<li class="mt-2">
    <strong class="font-medium text-gray-700">${esc(n.emne)}.</strong> ${esc(n.tekst)}</li>`).join("");

  return `<p class="text-sm text-gray-700 max-w-3xl">Danmarks samlede forbrugsbaserede
      klimaaftryk var <strong>${tal(ens.nationalt_aftryk.ton, 2)} ton CO2e pr. indbygger</strong>
      i ${esc(ens.nationalt_aftryk.aar)} (${esc(ens.nationalt_aftryk.note)}).
      <a href="${esc(ens.kilde.url)}" target="_blank" rel="noopener"
         class="underline decoration-dotted hover:text-gray-900">${esc(ens.kilde.udgiver)},
         ${esc(ens.kilde.titel)}</a>.</p>
    <div class="mt-4 overflow-x-auto tabel-scroll">
      <table class="w-full min-w-[38rem]">
        <thead><tr class="text-xs uppercase tracking-wide text-gray-500">
          <th class="py-2 pr-3 text-left font-medium">Kategori</th>
          <th class="py-2 px-3 text-right font-medium">Ton pr. indb.</th>
          <th class="py-2 px-3 text-right font-medium">Andel</th>
          <th class="py-2 pl-3 text-left font-medium">Energistyrelsens poster</th>
        </tr></thead>
        <tbody>${raekker}</tbody>
      </table>
    </div>
    <details class="mt-4 text-xs text-gray-500">
      <summary class="cursor-pointer font-medium text-gray-600 hover:text-gray-900">
        Forbehold ved de nationale tal</summary>
      <ul class="mt-2 space-y-1">${noter}</ul>
    </details>`;
}

/** De faglige referencer bag de nationale sammenligningstal.
 *  Der er ingen antagelser at vise: værktøjet indeholder ingen koefficienter. */
export function renderReferencer(sources) {
  const poster = (sources.referencer || []).map((r) => `<div class="border-t border-gray-100 py-3">
    <div class="text-sm font-medium text-gray-900">
      <a href="${esc(r.url)}" target="_blank" rel="noopener"
         class="underline hover:text-gray-700">${esc(r.navn)}</a>
      <span class="font-normal text-gray-500">&middot; ${esc(r.udgiver)}, ${esc(r.aar)}</span>
    </div>
    <p class="mt-1 text-xs text-gray-500">Anvendes til: ${esc(r.anvendes_til)}.</p>
    <p class="mt-0.5 text-xs text-gray-500">Sidehenvisninger: ${esc(r.sider)}.</p>
  </div>`).join("");
  return `<div>${poster}</div>`;
}

// ---------- Forside ----------

/** Kommunekort til søgeresultatet. Mønster fra doughnuts KommuneSearch. */
export function renderKommuneKort(kommuner) {
  if (kommuner.length === 0) {
    return `<p class="col-span-full py-8 text-center text-gray-500">Ingen kommuner fundet.</p>`;
  }
  return kommuner.map((k) => `<a href="?kommune=${encodeURIComponent(k.kode)}"
      class="block rounded-lg border border-gray-200 bg-white p-4 no-underline
             hover:border-green-600 hover:bg-green-50 hover:shadow-md transition-all">
      <h3 class="text-lg font-semibold text-gray-900">${esc(k.navn)}</h3>
      <p class="mt-1 text-sm text-gray-500">Region ${esc(k.region)}</p>
    </a>`).join("");
}

/** Forsidens hero og søgefelt. */
export function renderForside() {
  return `<div class="mb-10 text-center">
      <h2 class="text-3xl md:text-4xl font-bold text-gray-900">Hvordan ser din kommune ud?</h2>
      <p class="mt-3 text-lg text-gray-600 max-w-2xl mx-auto">Et forbrugsbaseret klimaaftryk
        tæller de udledninger, borgernes forbrug giver anledning til - også dem, der sker
        uden for kommunegrænsen og uden for Danmark. Slå din kommune op og se dens nøgletal
        mod landsgennemsnittet, sat ved siden af CONCITO's nationale opgørelse.</p>
    </div>
    <div class="mb-8">
      <div class="relative">
        <svg class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-5 h-5" fill="none"
          stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
        <label for="soeg" class="sr-only">Søg efter en kommune</label>
        <input id="soeg" type="search" autocomplete="off" placeholder="Søg efter en kommune ..."
          class="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg bg-white
                 focus:outline-none focus:ring-2 focus:ring-green-600 focus:border-transparent">
      </div>
      <p id="soege-status" class="text-sm text-gray-600 mt-2" role="status" aria-live="polite"></p>
    </div>
    <div id="resultater" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"></div>`;
}

