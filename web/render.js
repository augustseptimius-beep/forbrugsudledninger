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
const SIGNAL = {
  "markant højere": { tekst: "peger mod meget højere udledning",
    klasse: "bg-red-50 text-red-700 border-red-200", tegn: "▲▲" },
  "højere":         { tekst: "peger mod højere udledning",
    klasse: "bg-amber-50 text-amber-800 border-amber-200", tegn: "▲" },
  "på niveau":      { tekst: "peger hverken op eller ned",
    klasse: "bg-gray-50 text-gray-600 border-gray-200", tegn: "–" },
  "lavere":         { tekst: "peger mod lavere udledning",
    klasse: "bg-emerald-50 text-emerald-700 border-emerald-200", tegn: "▼" },
  "markant lavere": { tekst: "peger mod meget lavere udledning",
    klasse: "bg-emerald-100 text-emerald-800 border-emerald-300", tegn: "▼▼" },
  "uafklaret":      { tekst: "retningen kan ikke afgøres",
    klasse: "bg-gray-50 text-gray-500 border-gray-200", tegn: "?" },
  "kontekst":       { tekst: "", klasse: "", tegn: "" },
  "ukendt":         { tekst: "ingen data",
    klasse: "bg-gray-50 text-gray-400 border-gray-200", tegn: "–" },
};

/** Lille mærkat med signalet. Teksten står altid, så farven kun forstærker. */
function signalMaerkat(signal, ekstraKlasse = "") {
  // Kontekst-nøgletal får intet mærkat. Kategorioverskriften siger allerede,
  // at de ikke peger på en forbrugskategori.
  if (signal === "kontekst") return `<span class="text-xs text-gray-600">&ndash;</span>`;
  const s = SIGNAL[signal] ?? SIGNAL.ukendt;
  return `<span class="inline-flex items-center gap-1 rounded-full border px-2 py-0.5
    text-xs font-medium whitespace-nowrap ${s.klasse} ${ekstraKlasse}">
    <span aria-hidden="true" class="text-[9px] leading-none">${s.tegn}</span>${esc(s.tekst)}</span>`;
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

// Kategoriernes nationale vægt fra CONCITO (2023) s. 16, figur 7. "Kontekst"
// er ikke en CONCITO-kategori og har derfor ingen vægt.
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
  const maks = Math.max(...ens.kategorier.map((k) => k.ton));

  // Vægtrækkefølge, men restposter sidst. "Øvrige investeringer" er den
  // største enkeltkategori og ville ellers åbne overblikket med noget, ingen
  // kommune kan handle på. Bruddet er bevidst og står i pipeline/ens.py.
  const sorteret = [...ens.kategorier].sort((a, x) =>
    (a.restpost ? 1 : 0) - (x.restpost ? 1 : 0) || x.ton - a.ton);

  const raekker = sorteret.map((k) => {
    const drivere = b.drivere.filter(
      (d) => d.kategori === k.navn && d.rolle !== "hjaelper");
    const blind = UDEN_INDIKATOR[k.navn];
    const bredde = (k.ton / maks * 100).toFixed(1);

    // Skraveret søjle når kategorien ikke kan måles. En kategori, vi er blinde
    // på, må ikke ligne en, hvor tallet tilfældigvis er lavt.
    const soejle = blind
      ? `<span class="block h-2.5 rounded-sm border border-dashed border-gray-300
           bg-[repeating-linear-gradient(135deg,#d1d5db_0_4px,transparent_4px_8px)]"
           style="width:${bredde}%"></span>`
      : `<span class="block h-2.5 rounded-sm bg-gray-400" style="width:${bredde}%"></span>`;

    let hoejre;
    if (blind) {
      hoejre = `<div class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2
        text-xs text-amber-900"><strong class="font-semibold">${
        k.navn === "Føde- og drikkevarer" ? "Ingen kommunal indikator."
          : "Ingen kommunal variation."}</strong> ${esc(blind)}</div>`;
    } else {
      const tael = (f) => drivere.filter(f).length;
      const dele = [];
      const op = tael((d) => d.signal.includes("højere"));
      const ned = tael((d) => d.signal.includes("lavere"));
      const niv = tael((d) => d.signal === "på niveau");
      const ua = tael((d) => d.signal === "uafklaret");
      if (op) dele.push(`${op} peger mod højere udledning`);
      if (ned) dele.push(`${ned} peger mod lavere`);
      if (niv) dele.push(`${niv} hverken op eller ned`);
      if (ua) dele.push(`${ua} uafklaret`);

      const udenfor = drivere.filter((d) => udenforNote(d) !== "");
      const punkter = drivere
        .filter((d) => d.afvigelse != null)
        .sort((a, x) => Math.abs(x.afvigelse) - Math.abs(a.afvigelse))
        .map((d) => `<li class="py-1.5 border-b border-dotted border-gray-100 last:border-0">
          <span class="flex items-baseline justify-between gap-3">
            <span class="text-sm text-gray-800">${esc(d.navn)}${udenforNote(d)}</span>
            <span class="text-sm font-semibold tabular-nums whitespace-nowrap">
              ${driverVaerdi(d, d.kommuneVaerdi)}</span>
          </span>
          <span class="block text-xs text-gray-500 tabular-nums">landet
            ${driverVaerdi(d, d.landVaerdi)} &middot; ${driverAfvigelse(d)}${
            d.fordeling && d.fordeling.spaendLav != null
              ? ` &middot; 8 ud af 10 kommuner: ${driverVaerdi(d, d.fordeling.spaendLav)} - ${
                  driverVaerdi(d, d.fordeling.spaendHoej)}`
              : ""}</span>
          ${d.signal !== "kontekst" ? `<span class="block text-xs ${
            d.signal.includes("højere") ? "text-red-700"
              : d.signal.includes("lavere") ? "text-emerald-700" : "text-gray-500"
          }">${esc(SIGNAL[d.signal]?.tekst ?? "")}</span>` : ""}
        </li>`).join("");

      hoejre = `<div>
        <p class="text-xs text-gray-600 mb-1.5"><strong class="font-semibold text-gray-800">${
          drivere.length} ${drivere.length === 1 ? "nøgletal" : "nøgletal"}</strong>${
          dele.length ? ` &middot; ${dele.join(", ")}` : ""}${
          udenfor.length ? ` &middot; <span class="font-semibold text-amber-800">${
            udenfor.length} uden for spændet</span>` : ""}</p>
        <ul class="list-none m-0 p-0">${punkter}</ul>
      </div>`;
    }

    return `<div class="grid grid-cols-1 sm:grid-cols-[13rem_1fr] gap-2 sm:gap-5
      border-t border-gray-100 py-3 first:border-0">
      <div>
        <div class="text-sm font-semibold text-gray-900">${esc(k.navn)}</div>
        <div class="text-xs text-gray-500 tabular-nums mb-1.5">
          <strong class="font-semibold text-gray-700">${tal(k.ton, 2)} ton</strong>
          pr. indbygger &middot; ${tal(k.pct, 1)}&nbsp;%</div>
        <span class="block h-2.5 rounded-sm bg-gray-100">${soejle}</span>
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
    <p class="mt-1 text-sm text-gray-600 max-w-3xl">Kategorierne står i den rækkefølge,
      de fylder nationalt. Værktøjet vælger ikke kategori - det viser, hvad der kan måles
      om kommunen, og hvad der ikke kan.</p>

    <div class="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2">
      <p class="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">
        <strong class="block text-gray-800">Hvad tallet er</strong>
        Kommunens værdi, landsgennemsnittet, og hvor de midterste 8 ud af 10 kommuner
        ligger. Ligger kommunen uden for det spænd, er det markeret.</p>
      <p class="rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-600">
        <strong class="block text-gray-800">Hvad det peger mod</strong>
        Om nøgletallet trækker udledningen op eller ned. Det handler om udledningen,
        ikke om værdien: færre elbiler er en lavere andel, men peger mod højere udledning.</p>
    </div>

    <div class="mt-4">${raekker}</div>

    <p class="mt-4 border-t border-gray-100 pt-3 text-xs text-gray-500 max-w-3xl">
      <strong class="font-semibold text-gray-600">Dette er ikke en prioritering.</strong>
      Rækkefølgen er Energistyrelsens nationale vægte, ikke en vurdering af kommunen.
      Spændene beskriver nøgletallet og er ens på alle 98 kommunesider. Kommunal
      indflydelse kan værktøjet ikke opgøre.</p>
  </section>`;
}

// ---------- Kommunens nøgletal ----------

const DRIVER_FORBEHOLD = {
  "El-CO2 pr. kWh":
    "Beregnet af Energinets timedata, vægtet med kommunens eget timeforbrug. Følger " +
    "Energinets lokationsbaserede metode, hvor lokalt produceret vedvarende energi, " +
    "der forbruges samme time, regnes som nul-emission. Dækker CO2, ikke fuld CO2e.",
  "Lokal VE-dækning af elforbrug":
    "Lokal vedvarende produktion sat i forhold til kommunens eget elforbrug, time for " +
    "time. Et produktionsmål, ikke et forbrugsmål: strømmen eksporteres til det fælles " +
    "net. Kan overstige 100 %.",
  "Husholdningernes CO2 fra energi":
    "Udledningen fra borgernes eget forbrug af varme, varmt vand og el i boligen, " +
    "fordelt på samtlige boliger inklusive fritidshuse. Dækker forbrændingen og " +
    "elnettet, ikke hele livscyklussen bag brændslet - niveauet er derfor lavere end " +
    "CONCITO's nationale tal, men sammenligningen med landet er gyldig, fordi begge " +
    "sider opgøres ens.",
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
    "Står her, fordi de to husholdningstal ikke kan læses uden det. I kommuner med " +
    "mange fritidsboliger er de usikre i begge retninger: fritidshuse bruger energi, " +
    "men mindre end en helårsbolig, så de trækker gennemsnittet ned. Ved værdier over " +
    "cirka 1 skal tallene læses med stor varsomhed.",
  "Boligpris pr. m²":
    "Kvartalstal fra realiserede handler. I kommuner med få handler svinger tallet " +
    "meget fra kvartal til kvartal.",
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
  "Lokal VE-dækning af elforbrug", "Genanvendelsesprocent",
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

/** Hvor de midterste 8 ud af 10 kommuner ligger, i nøgletallets egen enhed.
 *
 *  Afløste en optælling ("markant hos 62 af 98"), som krævede at læseren kendte
 *  en tærskel på 33 % for at kunne bruges. Spændet siger det samme i kroner,
 *  procent eller kvadratmeter og kan læses uden forklaring.
 *
 *  Det afslørede samtidig noget, optællingen skjulte: en parcelhus-andel på
 *  70,5 % ser voldsom ud ved +65,5 %, men ligger inden for det spænd, de fleste
 *  kommuner deler. Den relative afvigelse alene overdrev forskellen.
 *
 *  DETTE ER IKKE EN RANGORDNING. Spændet er en egenskab ved NØGLETALLET og står
 *  ordret ens på alle 98 kommunesider. Tre regler holder den grænse:
 *    1. Vis aldrig mindste- og størsteværdien - de inviterer til "hvem ligger højest?".
 *    2. Vis aldrig kommunens egen placering eller percentil.
 *    3. Navngiv aldrig en anden kommune.
 */
function fordelingsNote(d) {
  const f = d.fordeling;
  if (!f || f.spaendLav == null || f.spaendHoej == null) return "";
  const tip = "De midterste 8 ud af 10 kommuner ligger i dette spænd. Det beskriver, "
    + "hvor spredt nøgletallet er blandt kommunerne - ikke hvor denne kommune "
    + "placerer sig. Værktøjet rangordner ikke kommuner.";
  return `<span class="block text-xs font-normal text-gray-500">8 ud af 10 kommuner:
    ${driverVaerdi(d, f.spaendLav)} - ${driverVaerdi(d, f.spaendHoej)}${forbehold(tip)}</span>`;
}

/** Markerer de få nøgletal, hvor kommunen ligger uden for det spænd, de
 *  midterste 8 ud af 10 kommuner deler. Det er den ene oplysning, der reelt
 *  skiller en kommune ud, og den er sjælden nok til at betyde noget. */
function udenforNote(d) {
  const f = d.fordeling;
  if (!f || d.kommuneVaerdi == null || f.spaendLav == null) return "";
  const over = d.kommuneVaerdi > f.spaendHoej;
  const under = d.kommuneVaerdi < f.spaendLav;
  if (!over && !under) return "";
  return `<span class="ml-1 inline-block rounded border border-amber-200 bg-amber-50
    px-1 py-0.5 text-[10px] font-semibold text-amber-800 align-middle">${
    over ? "over spændet" : "under spændet"}</span>`;
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
  if (kategori === "På tværs af kategorier") {
    return "driver forbruget i alle kategorier, ikke i én";
  }
  if (kategori === "Kontekst") return "beskriver kommunen, peger ikke på én kategori";
  return "";
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
      return `<tr class="border-t border-gray-100 ${tom ? "text-gray-600" : ""}">
        <td class="py-2 pl-3 pr-3 text-sm">
          <span class="font-medium text-gray-900">${esc(d.navn)}</span>${udenforNote(d)}${fb ? forbehold(fb) : ""}
          <span class="block text-xs text-gray-500">${esc(d.enhed)}</span></td>
        <td class="py-2 px-3 text-right text-sm tabular-nums whitespace-nowrap ${tom ? "" : "font-medium text-gray-900"}">
          ${driverVaerdi(d, d.kommuneVaerdi)}</td>
        <td class="py-2 px-3 text-right text-sm tabular-nums whitespace-nowrap text-gray-600">
          ${driverVaerdi(d, d.landVaerdi)}</td>
        <td class="py-2 px-3 text-right text-sm tabular-nums whitespace-nowrap text-gray-700">
          ${driverAfvigelse(d)}${procentpointNote(d)}${fordelingsNote(d)}</td>
        <td class="py-2 pl-3 pr-3 text-right whitespace-nowrap">
          ${signalMaerkat(d.signal)}${d.begrundelse ? forbehold(d.begrundelse) : ""}</td>
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
        <th class="py-2 px-3 text-right font-medium">På niveau</th>
        <th class="py-2 px-3 text-right font-medium">Over eller under</th>
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

