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

/** Egen tooltip. Browserens native title har 0,5-1 sekunds forsinkelse og
 *  opfører sig forskelligt fra browser til browser; forbehold skal vises
 *  straks. tabindex gør den tilgængelig for tastaturbrugere. */
export function forbehold(tekst) {
  return (
    '<span class="tip inline-flex align-middle ml-1" tabindex="0" ' +
    `role="note" aria-label="Forbehold: ${esc(tekst)}">` +
    '<svg viewBox="0 0 16 16" class="h-3.5 w-3.5 text-amber-500" aria-hidden="true">' +
    '<circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/>' +
    '<line x1="8" y1="4.5" x2="8" y2="9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>' +
    '<circle cx="8" cy="11.5" r="0.9" fill="currentColor"/></svg>' +
    '<span class="tip-boks rounded-md bg-gray-900 px-2.5 py-1.5 text-xs font-normal ' +
    `leading-snug text-white shadow-lg">${esc(tekst)}</span></span>`
  );
}

const KORT = "kort-print rounded-lg border border-gray-200 bg-white";

// Farve og form for, hvad et nøgletals afvigelse peger mod for udledningen.
// Formen bærer signalet lige så meget som farven, og teksten står altid ved
// siden af - farve må aldrig være eneste bærer af betydning.
const SIGNAL = {
  "markant højere": { tekst: "markant højere", klasse: "bg-red-50 text-red-700 border-red-200", tegn: "▲▲" },
  "højere":         { tekst: "højere",         klasse: "bg-amber-50 text-amber-800 border-amber-200", tegn: "▲" },
  "på niveau":      { tekst: "på niveau",      klasse: "bg-gray-50 text-gray-600 border-gray-200", tegn: "–" },
  "lavere":         { tekst: "lavere",         klasse: "bg-emerald-50 text-emerald-700 border-emerald-200", tegn: "▼" },
  "markant lavere": { tekst: "markant lavere", klasse: "bg-emerald-100 text-emerald-800 border-emerald-300", tegn: "▼▼" },
  "uafklaret":      { tekst: "uafklaret",      klasse: "bg-gray-50 text-gray-500 border-gray-200", tegn: "?" },
  "ukendt":         { tekst: "ingen data",     klasse: "bg-gray-50 text-gray-400 border-gray-200", tegn: "–" },
};

/** Lille mærkat med signalet. Teksten står altid, så farven kun forstærker. */
function signalMaerkat(signal, ekstraKlasse = "") {
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
function nationalVaegt(c, kategori) {
  if (kategori === "Øvrigt forbrug") {
    const navngivne = ["Transport", "Fødevarer", "Boliger", "El og varme"];
    const rest = c.kategorier.filter((k) => !navngivne.includes(k.navn));
    return { ton: rest.reduce((s, k) => s + k.ton, 0), pct: rest.reduce((s, k) => s + k.pct, 0) };
  }
  const k = c.kategorier.find((x) => x.navn === kategori);
  return k ? { ton: k.ton, pct: k.pct } : null;
}

/** De konkrete fund øverst: hvad stikker ud, med navn og tal.
 *
 *  Erstatter en tidligere optælling af mærkater pr. kategori. Den var abstrakt
 *  - "1 markant højere, 1 lavere" fortalte ikke hvilke nøgletal det handlede
 *  om - og krævede fire liniers brugsanvisning for at kunne læses. */
export function renderFund(b, c) {
  const relevante = b.drivere.filter(
    (d) => d.rolle !== "hjaelper" && d.afvigelse != null);
  const efterUdsving = (liste) =>
    [...liste].sort((a, x) => Math.abs(x.afvigelse) - Math.abs(a.afvigelse));

  const hoejere = efterUdsving(relevante.filter((d) => d.signal.includes("højere"))).slice(0, 3);
  const lavere = efterUdsving(relevante.filter((d) => d.signal.includes("lavere"))).slice(0, 3);
  const uafklaret = efterUdsving(relevante.filter((d) => d.signal === "uafklaret")).slice(0, 2);

  const punkt = (d) => `<li class="flex items-baseline justify-between gap-3 py-1.5">
      <span class="text-sm text-gray-900">${esc(d.navn)}
        <span class="text-xs text-gray-500">${esc(d.kategori)}</span></span>
      <span class="text-sm tabular-nums font-medium whitespace-nowrap
        ${d.signal.includes("højere") ? "text-red-700"
          : d.signal.includes("lavere") ? "text-emerald-700" : "text-gray-500"}">
        ${driverAfvigelse(d)}</span>
    </li>`;

  const spalte = (titel, undertitel, liste, farve) => `<div class="flex-1 min-w-[15rem]">
      <h3 class="text-sm font-semibold ${farve}">${titel}</h3>
      <p class="text-xs text-gray-500">${undertitel}</p>
      ${liste.length
        ? `<ul class="mt-1 divide-y divide-gray-100">${liste.map(punkt).join("")}</ul>`
        : `<p class="mt-2 text-sm text-gray-400 italic">ingen</p>`}
    </div>`;

  const mad = c.kategorier.find((k) => k.navn === "Fødevarer");

  return `<section class="${KORT} p-5 sm:p-6">
    <div class="flex items-baseline justify-between gap-3 flex-wrap">
      <h2 class="text-lg font-semibold text-gray-900">Det stikker ud</h2>
      <span class="text-xs text-gray-500">sammenlignet med landsgennemsnittet</span>
    </div>

    <div class="mt-4 flex flex-wrap gap-x-8 gap-y-5">
      ${spalte("Peger mod højere udledning", "største udsving", hoejere, "text-red-700")}
      ${spalte("Peger mod lavere udledning", "største udsving", lavere, "text-emerald-700")}
      ${spalte("Kan ikke afgøres", "retningen har ingen kildebelagt begrundelse", uafklaret, "text-gray-600")}
    </div>

    <p class="mt-5 border-t border-gray-100 pt-3 text-xs text-gray-500 max-w-3xl">
      Et minustal kan godt pege mod <em>højere</em> udledning: lavere genanvendelse end
      landsgennemsnittet betyder mere nyt materiale, og færre elbiler betyder mere
      benzin og diesel. Retningen afhænger af nøgletallet, ikke af fortegnet.</p>
    <p class="mt-2 text-xs text-gray-500 max-w-3xl">
      Fødevarer udgør <strong>${tal(mad.ton, 1)} ton</strong> af danskernes samlede
      forbrugsudledning på ${tal(c.nationalt_aftryk.ton, 1)} ton
      (${kildeHenvisning(c, mad.side)}), og der findes ingen offentligt tilgængelig
      kommunal indikator for dem. Værktøjet er blindt på den kategori.</p>
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
    "hvad der tæller som genanvendt, har ændret sig over tid.",
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
  return d.type === "difference" ? `${pct(d.afvigelse)}-point` : pct(d.afvigelse);
}

function kategoriNote(c, kategori) {
  if (kategori === "Transport") {
    const bil = c.transport_underkategorier.find((x) => x.navn.startsWith("Kørsel"));
    return `heraf kørsel i personlige transportmidler ${tal(bil.ton, 1)} ton`;
  }
  if (kategori === "El og varme") {
    return "husholdningstallene dækker forbrændingen og elnettet, ikke hele livscyklussen";
  }
  if (kategori === "Øvrigt forbrug") return "flere af CONCITO's mindre varegrupper";
  if (kategori === "Kontekst") return "beskriver kommunen, peger ikke på én kategori";
  return "";
}

/** Én samlet tabel med alle nøgletal, grupperet efter kategori.
 *
 *  Erstatter fem foldbare kort. Nitten rækker er ikke meget, og at skulle
 *  klikke fem gange for at se dem gjorde sammenligning på tværs umulig. */
export function renderIndikatorer(b, c) {
  const grupper = b.grupper.map((g) => {
    const vaegt = nationalVaegt(c, g.kategori);
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
      return `<tr class="border-t border-gray-100 ${tom ? "text-gray-400" : ""}">
        <td class="py-2 pl-3 pr-3 text-sm">
          <span class="font-medium text-gray-900">${esc(d.navn)}</span>${fb ? forbehold(fb) : ""}
          <span class="block text-xs text-gray-500">${esc(d.enhed)}</span></td>
        <td class="py-2 px-3 text-right text-sm tabular-nums whitespace-nowrap ${tom ? "" : "font-medium text-gray-900"}">
          ${driverVaerdi(d, d.kommuneVaerdi)}</td>
        <td class="py-2 px-3 text-right text-sm tabular-nums whitespace-nowrap text-gray-600">
          ${driverVaerdi(d, d.landVaerdi)}</td>
        <td class="py-2 px-3 text-right text-sm tabular-nums whitespace-nowrap text-gray-700">
          ${driverAfvigelse(d)}</td>
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
    <div class="mt-4 -mx-3 overflow-x-auto">
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

/** Rækkefølge: kommunens overskrift, det nationale grundlag, kommunens
 *  nøgletal pr. kategori, og til sidst hvad der ikke kan vises. */
export function renderKommune(b, c) {
  return [
    renderKommuneOverskrift(b),
    renderFund(b, c),
    renderIndikatorer(b, c),
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

  return `<div class="overflow-x-auto">
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

