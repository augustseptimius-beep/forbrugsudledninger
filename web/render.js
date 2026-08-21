// Rene render-funktioner: data ind, HTML-streng ud. Ingen DOM, ingen fetch,
// ingen sideeffekter. Det gør hele brugerfladen testbar uden browser eller
// jsdom, og det gør hver funktion til en oplagt React-komponent, hvis
// platformen senere flettes ind i doughnut-projektet.

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

// ---------- Hovedtal ----------

/** Estimatet med interval, eller en ærlig melding om at det ikke kan beregnes. */
export function renderHovedtal(b) {
  const meta = [
    b.kode != null ? `Kommunekode ${esc(b.kode)}` : null,
    b.region ? `Region ${esc(b.region)}` : null,
  ].filter(Boolean).join(" &middot; ");

  const hoved = `<div class="flex items-baseline justify-between gap-3 flex-wrap">
      <h2 class="text-2xl sm:text-3xl font-bold text-gray-900">${esc(b.navn)}</h2>
      <span class="text-xs text-gray-500">${meta}</span>
    </div>`;

  if (b.estimat.utilstraekkeligt) {
    return `<section class="${KORT} p-5 sm:p-6">${hoved}
      <p class="mt-4 text-lg font-semibold text-gray-700">Utilstrækkeligt datagrundlag</p>
      <p class="mt-1 text-sm text-gray-600 max-w-2xl">Et eller flere af de kerneinput,
        estimatet hviler på (disponibel indkomst, personbiler, fuldført byggeri), mangler
        for denne kommune. Vi viser hellere ingenting end et tal, vi ikke kan stå inde for.
        Driverne nedenfor kan stadig læses hver for sig.</p>
    </section>`;
  }

  const { low, high } = b.estimat.aftryk;
  const uoplyst = b.estimat.uoplyst ?? [];

  const advarsel = uoplyst.length === 0 ? "" :
    `<div class="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      <strong class="font-semibold">Estimatet er ufuldstændigt.</strong>
      ${uoplyst.includes("transport") ? `Transportbidraget kan ikke opgøres for denne kommune,
      fordi den regionale bil-km-afvigelse kun er slået op for Nordjylland. Bidraget er
      hverken lagt til eller trukket fra - det er ukendt, og intervallet herover er derfor
      snævrere end virkeligheden.` : `Følgende kunne ikke opgøres: ${esc(uoplyst.join(", "))}.`}
    </div>`;

  const printknap = `<button type="button" onclick="window.print()"
      class="no-print no-embed mt-4 inline-flex items-center gap-1.5 rounded-md border
             border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700
             hover:bg-gray-50 hover:border-gray-400 transition-colors">
      <svg viewBox="0 0 16 16" class="h-4 w-4" aria-hidden="true" fill="none"
        stroke="currentColor" stroke-width="1.5">
        <path d="M4 6V2h8v4M4 12H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-1"/>
        <rect x="4" y="10" width="8" height="4"/></svg>
      Print eller gem som PDF</button>`;

  return `<section class="${KORT} p-5 sm:p-6">${hoved}
    <p class="mt-3 text-sm text-gray-600">Estimeret forbrugsbaseret aftryk pr. borger</p>
    <p class="mt-1">
      <span class="text-4xl sm:text-5xl font-bold tracking-tight text-gray-900">${interval(low, high)}</span>
      <span class="ml-2 text-lg text-gray-600">ton CO2e</span>
    </p>
    <p class="mt-2 text-sm text-gray-600 max-w-2xl">Til sammenligning ligger det nationale
      gennemsnit på cirka 10 ton pr. borger. Intervallet er et førsteordens-skøn, ikke en
      måling, og sammensætningen nedenfor bærer mere indsigt end totalen.</p>
    ${advarsel}
    ${printknap}
  </section>`;
}

// ---------- Nedbrydning ----------

const KOMPONENTER = [
  { noegle: "indkomsteffekt", id: "indkomst", navn: "Indkomst",
    forklaring: "Højere disponibel indkomst end landsgennemsnittet trækker aftrykket op, lavere trækker det ned." },
  { noegle: "transporteffekt", id: "transport", navn: "Transport",
    forklaring: "Regional bil-km-afvigelse. Nordjylland er målt direkte af DTU; de fire øvrige regioner er udledt af pendlingsafstande og kalibreret mod DTU-tallet." },
  { noegle: "byggeeffekt", id: "byggeri", navn: "Byggeri",
    forklaring: "Fuldført byggeri pr. 1.000 indbyggere sammenlignet med landsgennemsnittet." },
];

function soejle(lav, hoj, skala) {
  // Bar omkring en midterakse: negativt til venstre, positivt til højre.
  const MIDTE = 50, BREDDE = 50;
  const x1 = MIDTE + (Math.min(lav, hoj) / skala) * BREDDE;
  const x2 = MIDTE + (Math.max(lav, hoj) / skala) * BREDDE;
  const bredde = Math.max(x2 - x1, 0.8); // synlig streg selv ved nul-bredt interval
  return `<svg viewBox="0 0 100 12" preserveAspectRatio="none" class="h-3 w-full" aria-hidden="true">
      <line x1="50" y1="0" x2="50" y2="12" stroke="currentColor" stroke-width="0.5" class="text-gray-300"/>
      <rect x="${x1.toFixed(2)}" y="3" width="${bredde.toFixed(2)}" height="6" rx="1"
        fill="currentColor" class="text-gray-400"/>
    </svg>`;
}

/** Anker plus de tre effekter. Placeret over driver-tabellen med vilje:
 *  sammensætningen bærer indsigten, ikke totaltallet. */
export function renderNedbrydning(b, konst) {
  if (b.estimat.utilstraekkeligt) return "";
  const k = b.estimat.komponenter;

  const skala = Math.max(
    0.5,
    ...KOMPONENTER.flatMap(({ noegle }) => {
      const v = k[noegle];
      return v ? [Math.abs(v.low), Math.abs(v.high)] : [0];
    })
  );

  const raekker = KOMPONENTER.map(({ noegle, id, navn, forklaring }) => {
    const v = k[noegle];
    // Stablet layout frem for tre kolonner: på en 375 px skærm ville en
    // midterkolonne mellem to faste kolonner blive presset til en splint.
    // Her får søjlen fuld bredde i alle skærmstørrelser.
    const overskrift = (hoejre) => `<div class="flex items-baseline justify-between gap-3">
        <span class="text-sm font-medium text-gray-700">${navn}</span>
        <span class="text-sm whitespace-nowrap">${hoejre}</span>
      </div>`;

    if (v == null) {
      return `<li data-komponent="${id}" class="py-2.5">
        ${overskrift(`<span class="text-gray-500 italic">ikke opgjort</span>${forbehold(forklaring)}`)}
        <div class="mt-1.5 h-3 w-full rounded-sm border border-dashed border-gray-300 bg-gray-50"></div>
      </li>`;
    }
    return `<li data-komponent="${id}" class="py-2.5">
      ${overskrift(`<span class="text-gray-700">${intervalTil(v.low, v.high)} ton</span>${forbehold(forklaring)}`)}
      <div class="mt-1.5">${soejle(v.low, v.high, skala)}</div>
    </li>`;
  }).join("");

  const { low, high } = b.estimat.aftryk;

  return `<section class="${KORT} p-5 sm:p-6 mt-6">
    <h3 class="text-lg font-semibold text-gray-900">Hvad tallet er sat sammen af</h3>
    <p class="mt-1 text-sm text-gray-600 max-w-2xl">Estimatet starter ved det nationale anker
      og justeres for de tre forhold, der kan opgøres på kommuneniveau.</p>
    <div class="mt-4 flex items-baseline justify-between gap-3 border-b border-gray-100 pb-2">
      <span class="text-sm font-medium text-gray-700">Anker
        <span class="text-xs font-normal text-gray-500">nationalt gennemsnit</span></span>
      <span class="text-sm text-gray-700 whitespace-nowrap">${ton(konst.anker)}</span>
    </div>
    <ul class="divide-y divide-gray-100">${raekker}</ul>
    <div class="mt-2 flex items-baseline justify-between gap-3 border-t-2 border-gray-200 pt-3">
      <span class="text-sm font-semibold text-gray-900">Resultat</span>
      <span class="text-sm font-semibold text-gray-900 whitespace-nowrap">${interval(low, high)} ton</span>
    </div>
  </section>`;
}

// ---------- Driver-tabel ----------

// Forbehold, der skal stå VED tallet, ikke gemt i et metodeafsnit. Uden dem
// ligner en tom celle en fejl frem for en kendt begrænsning.
const DRIVER_FORBEHOLD = {
  "El-CO2 pr. kWh":
    "Beregnet af Energinets timedata, vægtet med kommunens eget timeforbrug. Følger " +
    "Energinets lokationsbaserede metode, hvor lokalt produceret vedvarende energi, " +
    "der forbruges samme time, regnes som nul-emission. Tallet beskriver kommunens " +
    "elprofil og egner sig ikke til at lægge sammen på tværs af kommuner.",
  "Boligpris pr. m²":
    "Kvartalstal fra realiserede handler. I kommuner med få handler svinger tallet " +
    "meget fra kvartal til kvartal og skal læses med varsomhed.",
  "Lokal VE-dækning af elforbrug":
    "Lokal vedvarende produktion sat i forhold til kommunens eget elforbrug, time " +
    "for time. Et produktionsmål, ikke et forbrugsmål: strømmen eksporteres til " +
    "det fælles net. Kan overstige 100 % for kommuner, der producerer mere end de " +
    "bruger. Det er denne dækning, der trækker el-CO2-tallet ned i vindkommuner.",
};

// De tre drivere, der faktisk fødes ind i hovedtallet. De øvrige 13 er kontekst.
const I_ESTIMATET = new Set(["Disponibel indkomst", "Byggeaktivitet"]);

/** Andel som procent uden fortegn: en andel er et niveau, ikke en ændring. */
function andel(v) {
  if (v == null || !Number.isFinite(v)) return MANGLER;
  return `${formatér(v * 100, 1)} %`;
}

// Drivere hvis råværdi allerede ER en procent (0-100), ikke en andel (0-1).
const ALLEREDE_PROCENT = new Set(["Lokal VE-dækning af elforbrug"]);

function driverVaerdi(d, v) {
  if (v == null || !Number.isFinite(v)) return MANGLER;
  if (ALLEREDE_PROCENT.has(d.navn)) return `${formatér(v, 1)}\u00A0%`;
  if (d.enhed === "pct.") return d.type === "difference" ? pct(v) : andel(v);
  const a = Math.abs(v);
  return tal(v, a >= 100 ? 0 : a >= 10 ? 1 : 2);
}

function driverAfvigelse(d) {
  if (d.afvigelse == null) return MANGLER;
  // En forskel mellem to andele er procentpoint, ikke en relativ afvigelse.
  return d.type === "difference" ? `${pct(d.afvigelse)}-point` : pct(d.afvigelse);
}

/** Alle 16 drivere mod landsgennemsnittet. Ren visning og kontekst - motoren
 *  rangordner ikke, og tabellen vurderer derfor heller ikke. */
export function renderDriverTabel(b) {
  const raekker = b.drivere.map((d) => {
    const fb = DRIVER_FORBEHOLD[d.navn];
    // Mellemrummet foran badgen er bevidst: uden det læser en skærmlæser
    // "Disponibel indkomsti estimatet" som ét ord.
    const badge = I_ESTIMATET.has(d.navn)
      ? ' <span class="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium ' +
        'text-gray-600 align-middle whitespace-nowrap">i estimatet</span>'
      : "";
    const tom = d.kommuneVaerdi == null;
    return `<tr class="border-t border-gray-100 ${tom ? "text-gray-400" : ""}">
      <td class="py-2 pr-3 text-sm text-gray-700">
        <span class="font-medium text-gray-900">${esc(d.navn)}</span>${badge}${fb ? forbehold(fb) : ""}
        <span class="block text-xs text-gray-500">${esc(d.enhed)}</span>
      </td>
      <td class="py-2 px-3 text-right text-sm tabular-nums whitespace-nowrap ${tom ? "" : "font-medium text-gray-900"}">
        ${driverVaerdi(d, d.kommuneVaerdi)}</td>
      <td class="py-2 px-3 text-right text-sm tabular-nums whitespace-nowrap text-gray-600">
        ${driverVaerdi(d, d.landVaerdi)}</td>
      <td class="py-2 px-3 text-right text-sm tabular-nums whitespace-nowrap text-gray-700">
        ${driverAfvigelse(d)}</td>
      <td class="py-2 pl-3 text-right">${retningsMarkoer(d.retning)}</td>
    </tr>`;
  }).join("");

  return `<section class="${KORT} p-5 sm:p-6 mt-6">
    <h3 class="text-lg font-semibold text-gray-900">Kommunens profil mod landsgennemsnittet</h3>
    <p class="mt-1 text-sm text-gray-600 max-w-2xl">Seksten forhold, der tilsammen beskriver
      forbrugsmønstret. Tre af dem fødes ind i hovedtallet; resten er kontekst, der hjælper
      med at forstå det. Pilen viser retning, ikke om noget er godt eller skidt - den
      vurdering hører til den lokale faglige læsning.</p>
    <div class="mt-4 overflow-x-auto">
      <table class="w-full min-w-[36rem]">
        <thead>
          <tr class="text-xs uppercase tracking-wide text-gray-500">
            <th class="py-2 pr-3 text-left font-medium">Driver</th>
            <th class="py-2 px-3 text-right font-medium">${esc(b.navn)}</th>
            <th class="py-2 px-3 text-right font-medium">Hele landet</th>
            <th class="py-2 px-3 text-right font-medium">Afvigelse</th>
            <th class="py-2 pl-3 text-right font-medium"><span class="sr-only">Retning</span></th>
          </tr>
        </thead>
        <tbody>${raekker}</tbody>
      </table>
    </div>
  </section>`;
}

// ---------- Boligpris-følsomhed ----------

/** Illustrativ følsomhed. Vises kun ved gyldigt mønster - billigere bolig OG
 *  lavere indkomst - fordi modregningen er ræsonneret til netop det mønster.
 *  Aldrig som en falsk symmetrisk korrektion. */
export function renderBoligpris(b) {
  if (!b.boligpris || !b.boligpris.vises) return "";
  const { reeltGab, justeret } = b.boligpris;
  return `<section class="${KORT} p-5 sm:p-6 mt-6">
    <h3 class="text-lg font-semibold text-gray-900">Følsomhed: billigere boliger</h3>
    <p class="mt-1 text-sm text-gray-600 max-w-2xl">Kommunen har både lavere indkomst og
      lavere boligpriser end landsgennemsnittet. En del af indkomstgabet modsvares derfor
      af lavere boligudgifter og frigør købekraft til andet forbrug. Regner man med det,
      bliver det reelle forbrugsgab mindre.</p>
    <dl class="mt-4 grid gap-4 sm:grid-cols-2">
      <div><dt class="text-xs uppercase tracking-wide text-gray-500">Reelt forbrugsgab</dt>
        <dd class="mt-0.5 text-xl font-semibold text-gray-900">${pct(reeltGab)}</dd></div>
      <div><dt class="text-xs uppercase tracking-wide text-gray-500">Justeret indkomsteffekt</dt>
        <dd class="mt-0.5 text-xl font-semibold text-gray-900">${intervalTil(justeret.low, justeret.high)} ton</dd></div>
    </dl>
    <p class="mt-4 text-xs text-gray-500 max-w-2xl">Illustrativ, ikke en del af hovedtallet.
      Modregningen på 45 % er et skøn, ræsonneret til netop dette mønster, og vises derfor
      ikke for kommuner med dyre boliger og høj indkomst, hvor logikken vender.</p>
  </section>`;
}

// ---------- Samlet kommunevisning ----------

/** Rækkefølgen er bevidst: tal, så sammensætning, så profil. Sammensætningen
 *  bærer mere indsigt end totalen og skal læses før driverne. */
export function renderKommune(b, konst) {
  return [
    renderHovedtal(b),
    renderNedbrydning(b, konst),
    renderDriverTabel(b),
    renderBoligpris(b),
    // Bevidst UDEN no-embed: sidens store ansvarsfraskrivelse sidder i
    // sidehovedet og forsvinder i embed-tilstand. En indlejret widget, der
    // viser et autoritativt udseende tal helt uden forbehold, er præcis den
    // risiko, hele resten af designet gardér imod, så en kompakt udgave
    // følger med selve visningen.
    `<section class="mt-6 text-xs text-gray-500 max-w-3xl space-y-2">
      <p><strong class="font-semibold text-gray-600">Uofficielt førsteordens-skøn.</strong>
        Ikke en myndighedsopgørelse og ikke en måling. Tallet er beregnet ud fra offentlige
        data med eksplicitte antagelser og er retningsgivende, ikke præcist. Det er ikke
        egnet til at rangordne kommuner mod hinanden.</p>
      <p>Kilder: Danmarks Statistik (11 tabeller), Finans Danmark BM010, Energinet og DTU.
        Årstal og tabel-id står på <a href="metode.html" class="underline hover:text-gray-700">metodesiden</a>,
        sammen med formlerne og de antagelser, estimatet hviler på.</p>
    </section>`,
  ].filter(Boolean).join("\n");
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
      <h2 class="text-3xl md:text-4xl font-bold text-gray-900">Hvad fylder forbruget i din kommune?</h2>
      <p class="mt-3 text-lg text-gray-600 max-w-2xl mx-auto">Et forbrugsbaseret klimaaftryk
        tæller de udledninger, borgernes forbrug giver anledning til - også dem, der sker uden
        for kommunegrænsen og uden for Danmark. Slå din kommune op og se estimatet, og hvad
        det er sat sammen af.</p>
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

/** Antagelsescellerne med deres faktiske værdier. Værdierne læses fra
 *  konstanterne i data.json, ikke skrevet i hånden, så siden ikke kan komme
 *  til at påstå noget andet end det, motoren regner med. */
const ANKERREGION = "Nordjylland";

function regionsListe(konst, filter) {
  const poster = Object.entries(konst.bilkm_afvigelse_region ?? {})
    .filter(([region]) => filter(region))
    .sort(([a], [b]) => a.localeCompare(b, "da"))
    .map(([region, v]) => `${esc(region)} ${pct(v)}`);
  return poster.join(", ") || "ingen regioner opgjort";
}

export function renderAntagelser(sources, konst) {
  const vaerdier = {
    ENS_GA: ton(konst.anker),
    CONCITO_ELAST: `elasticitet ${tal(konst.elasticitet.low, 2)} til ${tal(konst.elasticitet.high, 2)}, ` +
      `bilkørselsandel ${tal(konst.bilkorsel_andel.low, 2)} til ${tal(konst.bilkorsel_andel.high, 2)}`,
    BYGGEANDEL_KALIBRERING: `${tal(konst.byggeandel.low, 2)} til ${tal(konst.byggeandel.high, 4)}`,
    BOLIGUDGIFT_MODREGNING: andel(konst.boligudgift_modregning),
    // DTU har kun målt Nordjylland; de øvrige fire er udledt af AFSTB4 og
    // kalibreret mod den. De to poster viser derfor hver sin halvdel af
    // regionstabellen, så metodesiden afspejler, hvor tallene kommer fra.
    DTU_TU: regionsListe(konst, (r) => r === ANKERREGION),
  };

  const poster = sources.antagelser.map((a) => `<div class="border-t border-gray-100 py-3">
    <div class="flex items-baseline justify-between gap-3 flex-wrap">
      <span class="text-sm font-medium text-gray-900">${esc(a.navn)}</span>
      <span class="text-sm tabular-nums text-gray-900">${vaerdier[a.id] ?? MANGLER}</span>
    </div>
    <p class="mt-1 text-xs text-gray-500">Anvendes til ${esc(a.anvendes_til)}.
      Ophav: ${a.url ? `<a href="${esc(a.url)}" target="_blank" rel="noopener"
        class="underline hover:text-gray-700">${esc(a.udbyder)}</a>` : esc(a.udbyder)}.
      ${esc(a.forbehold)}</p>
  </div>`).join("");

  return `<div>${poster}</div>`;
}
