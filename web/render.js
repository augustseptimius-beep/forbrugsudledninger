// Rene render-funktioner: data ind, HTML-streng ud. Ingen DOM, ingen fetch,
// ingen sideeffekter. Det gør hele brugerfladen testbar uden browser eller
// jsdom, og det gør hver funktion til en oplagt React-komponent, hvis
// platformen senere flettes ind i doughnut-projektet.

// Optællingen bor i motoren, hvor den er testet - ikke her.
import { samletRetning, TAERSKEL_NIVEAU, TAERSKEL_MARKANT } from "./beregning.js";

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

// ---------- Kommunens nøgletal, kategori for kategori ----------

// Kategorier uden kommunale nøgletal. De står med, selv om der ikke er en
// tabel at vise - de udgør tilsammen en tredjedel af aftrykket, og en oversigt,
// der kun viser det, vi kan måle, ville pege klimakoordinatoren mod de forkerte
// kategorier.
//
// Føde- og drikkevarer stod her, med teksten "Der findes ingen offentligt
// tilgængelig kommunal indikator for fødevareforbrug". Det passede ikke:
// Osei-Owusu et al. (2020) fordeler fødevareforbruget på alle 98 kommuner, og
// kategorien har nu et nøgletal. Det gentager ganske vist indkomsten - se
// begrundelsen i beregning.js.
//
// Teksten siger det, Energistyrelsens egen beskrivelse af kategorien IKKE
// siger: hvorfor der ingen tabel er. Gentog den beskrivelsen, stod det samme
// to gange i træk i den samme overskrift.
const UDEN_INDIKATOR = {
  "Offentligt forbrug": {
    overskrift: "Ingen kommunal variation.",
    tekst: "Værktøjet har derfor intet kommunalt nøgletal for kategorien "
      + "(NIRAS 2024, afsnit 4.3.1, s. 29).",
  },
  "Øvrige investeringer": {
    // Ikke "ingen variation": investeringerne varierer givetvis mellem
    // kommuner. Der findes bare ingen offentlig kilde, der fordeler dem.
    overskrift: "Intet kommunalt nøgletal.",
    tekst: "Ingen offentligt tilgængelig kilde fordeler erhvervets og samfundets "
      + "investeringer på kommuner, og de er ikke borgernes eget forbrug.",
  },
};

const NEUTRAL_MAERKAT = "bg-gray-50 text-gray-700 border-gray-300";

/** Kategoriens samlede retning som ét mærkat.
 *
 *  TÆLLER, VEJER IKKE. Mærkatet siger, hvor mange af kategoriens nøgletal der
 *  peger hver sin vej, og hvert nøgletal tæller ét, uanset hvor stort udsvinget
 *  er. Det siger IKKE, at kategorien som helhed ligger over eller under
 *  landsgennemsnittet - det ville kræve en vægtning af nøgletal mod hinanden,
 *  som ikke findes i nogen kilde.
 *
 *  Optællingen står i selve teksten ("3 af 4 nøgletal"), så læseren kan se den
 *  efter i tabellen nedenunder frem for at tage mærkatet på ordet. */
function samletMaerkat(s) {
  const [tekst, klasse, tegn] =
    s.retning === "højere" ? ["peger mod højere udledning", SIGNAL["højere"].klasse, "▲"]
    : s.retning === "lavere" ? ["peger mod lavere udledning", SIGNAL["lavere"].klasse, "▼"]
    : s.retning === "delt" ? ["trækker i hver sin retning", NEUTRAL_MAERKAT, ""]
    : s.retning === "på niveau" ? ["på landsgennemsnittet", NEUTRAL_MAERKAT, "–"]
    : ["ingen data", SIGNAL.ukendt.klasse, "–"];

  // Selve regnestykket står under mærkatet, ikke inde i det. Læseren skal kunne
  // tælle rækkerne i tabellen efter uden at skulle læse et helt mærkat først.
  const enige = (antal) => (antal === s.talte
    ? (s.talte === 1 ? "kategoriens ene nøgletal" : `alle ${tal(s.talte)} nøgletal`)
    : `${tal(antal)} af ${tal(s.talte)} nøgletal`);
  const led = [];
  if (s.retning === "delt") led.push(`${tal(s.op)} mod ${tal(s.ned)} nøgletal`);
  else if (s.retning === "højere") led.push(enige(s.op));
  else if (s.retning === "lavere") led.push(enige(s.ned));
  else if (s.retning === "på niveau") led.push(enige(s.paaNiveau));
  if (s.udenData > 0) {
    led.push(`${tal(s.udenData)} uden data`);
  }

  return `<div class="sm:text-right">
    <div class="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Samlet retning</div>
    <span class="mt-1 inline-flex items-center gap-1 rounded-full border whitespace-nowrap
      text-sm px-2.5 py-1 font-semibold ${klasse}">${
      tegn ? `<span aria-hidden="true" class="text-[11px] leading-none">${tegn}</span>` : ""
    }${esc(tekst)}</span>
    <span class="mt-1 block text-xs text-gray-500 tabular-nums">${esc(led.join(" \u00b7 "))}</span>
  </div>`;
}

// ---------- Kildeangivelse pr. nøgletal ----------

/** Kilderne bag ét nøgletal, slået op i kildekataloget.
 *
 *  Kildeangivelsen skrives IKKE i hånden her. Nøgletallet oplyser selv, hvilke
 *  felter i data.json det læser (feltet `felter` i beregning.js), og
 *  sources.json siger, hvilken kilde der ejer hvert felt. En tabel kan derfor
 *  ikke skifte navn, id eller årgang, uden at kommunesiden følger med, og et
 *  nyt nøgletal kan ikke slippe ud uden kilde - se test/kildeangivelse.test.js.
 *
 *  ogsaaKilder dækker den kilde, der bidrager uden at eje et felt:
 *  fødevareforbruget skaleres med kommunens samlede disponible indkomst fra
 *  INDKF111. metodekilde er den rapport, fordelingsnøglen kommer fra. */
export function kilderForDriver(d, sources) {
  if (!sources) return { kilder: [], reference: null };
  const ids = [];
  const tilfoej = (id) => { if (id && !ids.includes(id)) ids.push(id); };
  for (const felt of d.felter ?? []) {
    tilfoej(sources.kilder.find((k) => (k.felter ?? []).includes(felt))?.id);
  }
  for (const id of d.ogsaaKilder ?? []) tilfoej(id);
  return {
    kilder: ids.map((id) => sources.kilder.find((k) => k.id === id)).filter(Boolean),
    reference: d.metodekilde
      ? (sources.referencer ?? []).find((r) => r.id === d.metodekilde) ?? null
      : null,
  };
}

// whitespace-nowrap: "DST BIL54 2026M01" må ikke brække midt i et tabel-id på
// en smal skærm - så ligner det to kilder.
const kildeLink = (url, tekst) => (url
  ? `<a href="${esc(url)}" target="_blank" rel="noopener"
       class="whitespace-nowrap underline decoration-dotted hover:text-gray-900">${esc(tekst)}</a>`
  : `<span class="whitespace-nowrap">${esc(tekst)}</span>`);

/** Kildelinjen under nøgletallets navn: tabel, årgang og link til kilden.
 *
 *  Den står ved hvert enkelt nøgletal og ikke kun samlet på metodesiden, fordi
 *  det er dér, læseren står med tallet i hånden og skal kunne se, hvor det kommer
 *  fra - og fordi en kommuneside, der printes eller lægges i en iframe, ellers
 *  ville stå med tal uden afsender. */
function kildeLinje(d, sources) {
  const { kilder, reference } = kilderForDriver(d, sources);
  if (kilder.length === 0 && !reference) return "";
  const led = kilder.map((k) =>
    kildeLink(k.url, `${k.kort ?? k.id}${k.periode ? ` ${k.periode}` : ""}`));
  if (reference) {
    led.push(`metode: ${kildeLink(reference.url, reference.kort ?? reference.navn)}`);
  }
  return `<span class="mt-0.5 block text-xs text-gray-500">Kilde: ${
    led.join(" &middot; ")}</span>`;
}

// ---------- Nøgletallenes egne forbehold ----------

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
  // Procentpoint har ikke også et procenttegn. Der stod "-0,8 % procentpoint",
  // som er to enheder på samme tal, og læses let som en procentvis forskel.
  if (d.type === "difference") {
    const fortegn = d.afvigelse > 0 ? "+" : d.afvigelse < 0 ? "-" : "";
    return `${fortegn}${formatér(Math.abs(d.afvigelse) * 100, 1)}\u00A0procentpoint`;
  }
  return pct(d.afvigelse);
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

// Hele sætninger, ikke parentesfragmenter: noten står nu efter kategoriens
// beskrivelse, hvor et lille bogstav og en ekstra parentes så forkert ud.
function kategoriNote(c, kategori) {
  if (kategori === "Transport") {
    const bil = c.transport_underkategorier.find((x) => x.navn.startsWith("Kørsel"));
    return `CONCITO opgør kørsel i personlige transportmidler til ${tal(bil.ton, 1)} ton `
      + "af transportens samlede aftryk - en anden opgørelse end Energistyrelsens.";
  }
  if (kategori === "Energi og forsyning") {
    return "Husholdningstallene dækker forbrændingen og elnettet, ikke hele livscyklussen.";
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

/** Én række: nøgletallets navn, enhed, kilde, tallene og retningen. */
function noegletalRaekke(d, sources) {
  const fb = DRIVER_FORBEHOLD[d.navn];
  const tom = d.kommuneVaerdi == null;
  // Et hjælpetal uden retning får intet mærkat; begrundelsen ved ikonet siger,
  // hvad det forklarer. Et hovednøgletal uden retning når aldrig hertil -
  // beregnKommune tager det af kommunens side.
  const maerkat = d.signal === "uafklaret" ? "" : signalMaerkat(d.signal);
  // Hjælpetallene er mærket i selve tabellen, fordi den samlede retning holder
  // dem ude. Står det kun i den lille skrift under tabellen, ser optællingen
  // forkert ud for den, der tæller rækkerne efter.
  const hjaelper = d.rolle === "hjaelper"
    ? `<span class="ml-1.5 align-middle rounded bg-gray-100 px-1.5 py-0.5
        text-[10px] font-medium text-gray-600">forklarende</span>`
    : "";
  return `<tr class="border-t border-gray-100 ${tom ? "text-gray-600" : ""}">
    <td class="py-2.5 pl-3 pr-3 text-sm align-top">
      <span class="font-medium text-gray-900">${esc(d.navn)}</span>${fb ? forbehold(fb) : ""}${hjaelper}
      <span class="block text-xs text-gray-500">${esc(d.enhed)}</span>
      ${kildeLinje(d, sources)}</td>
    <td class="py-2.5 px-3 text-right text-sm tabular-nums whitespace-nowrap align-top ${tom ? "" : "font-medium text-gray-900"}">
      ${driverVaerdi(d, d.kommuneVaerdi)}</td>
    <td class="py-2.5 px-3 text-right text-sm tabular-nums whitespace-nowrap align-top text-gray-600">
      ${driverVaerdi(d, d.landVaerdi)}</td>
    <td class="py-2.5 px-3 text-right text-sm tabular-nums whitespace-nowrap align-top text-gray-700">
      ${driverAfvigelse(d)}${procentpointNote(d)}</td>
    <td class="py-2.5 pl-3 pr-3 text-right whitespace-nowrap align-top">
      ${maerkat}${d.begrundelse ? forbehold(d.begrundelse) : ""}</td>
  </tr>`;
}

/** Kategoriens tabel. Hovednøgletallene først, hjælpetallene sidst, så
 *  rækkefølgen svarer til den optælling, mærkatet ovenfor viser. */
function noegletalTabel(b, drivere, sources) {
  const raekker = [...drivere]
    .sort((a, x) => (a.rolle === "hjaelper" ? 1 : 0) - (x.rolle === "hjaelper" ? 1 : 0))
    .map((d) => noegletalRaekke(d, sources)).join("");
  return `<div class="overflow-x-auto tabel-scroll">
    <table class="w-full min-w-[38rem]">
      <thead><tr class="text-xs uppercase tracking-wide text-gray-500">
        <th class="py-2 pl-3 pr-3 text-left font-medium">Nøgletal</th>
        <th class="py-2 px-3 text-right font-medium">${esc(b.navn)}</th>
        <th class="py-2 px-3 text-right font-medium">Hele landet</th>
        <th class="py-2 px-3 text-right font-medium">Forskel</th>
        <th class="py-2 pl-3 pr-3 text-right font-medium">Peger mod</th>
      </tr></thead>
      <tbody>${raekker}</tbody>
    </table>
  </div>`;
}

/** Ét kategoriafsnit: overskrift med vægt og beskrivelse, den samlede retning,
 *  og kategoriens nøgletal.
 *
 *  VÆGTEN ER NATIONAL. "Transport 1,84 ton pr. indbygger" på Albertslunds side
 *  ville ellers læses som Albertslunds eget transportaftryk - et tal, værktøjet
 *  slet ikke kan opgøre. Derfor står ordet "nationalt" ved tallet hver gang, og
 *  hele overskriften er ordret ens på alle 98 kommunesider.
 *
 *  Beskrivelsen er Energistyrelsens egen note til kategorien, hentet fra
 *  ens.json. Den skrives ikke her, så kategorien ikke kan komme til at betyde
 *  én ting på metodesiden og en anden på kommunesiden. */
function kategoriAfsnit(k, b, c, sources, maksPct) {
  const drivere = b.drivere.filter((d) => d.kategori === k.navn);
  const blind = UDEN_INDIKATOR[k.navn];
  const note = kategoriNote(c, k.navn);

  const andel = k.pct != null ? `<p class="mt-1 text-xs text-gray-600 tabular-nums">
      <strong class="font-semibold text-gray-800">${tal(k.pct, 1)}&nbsp;%</strong>
      af Danmarks forbrugsbaserede udledninger &middot; nationalt
      ${tal(k.ton, 2)} ton pr. indbygger</p>
    <span aria-hidden="true" class="mt-1.5 block h-1.5 w-32 rounded-sm bg-gray-200">
      <span class="block h-1.5 rounded-sm bg-gray-400"
        style="width:${(k.pct / maksPct * 100).toFixed(1)}%"></span></span>` : "";

  const beskrivelse = k.note || blind
    ? `<p class="mt-2 text-sm text-gray-700 max-w-3xl">${esc(k.note ?? "")}${
        blind ? ` <strong class="font-semibold text-gray-900">${esc(blind.overskrift)}</strong>
          ${esc(blind.tekst)}` : ""}${
        note ? ` <span class="text-gray-500">${note}</span>` : ""}</p>`
    : "";

  const retning = blind ? "" : samletMaerkat(samletRetning(drivere));

  const indhold = blind
    ? ""
    : drivere.length > 0
      ? noegletalTabel(b, drivere, sources)
      : `<p class="px-4 py-3 text-sm text-gray-600">Ingen af kategoriens nøgletal kan
          opgøres for ${esc(b.navn)}. Begrundelsen står under tabellerne.</p>`;

  return `<section class="kategori-print rounded-lg border border-gray-200 bg-white overflow-hidden">
    <div class="border-b border-gray-200 bg-gray-50 px-4 py-3">
      <div class="flex items-start justify-between gap-x-4 gap-y-2 flex-wrap">
        <div class="min-w-0">
          <h3 class="text-base font-bold text-gray-900">${esc(k.navn)}</h3>
          ${andel}
        </div>
        ${retning}
      </div>
      ${beskrivelse}
    </div>
    ${indhold}
  </section>`;
}

/** Kommunens nøgletal, kategori for kategori.
 *
 *  HVORFOR ÉT AFSNIT OG IKKE TO. Siden havde før et kategorioverblik øverst og
 *  en samlet tabel nedenunder. Overblikket sagde, hvilken vej hvert nøgletal
 *  pegede, tabellen sagde det samme igen med tal ved siden af, og læseren
 *  skulle holde de to steder op mod hinanden for at se, hvad et mærkat
 *  byggede på. Nu står vægten, beskrivelsen, den samlede retning og tallene
 *  samlet i hver sin kategori.
 *
 *  Rækkefølgen er Energistyrelsens nationale vægt, faldende, med restposter
 *  sidst. Det er kildens egen ordning, ikke vores. Den modvirker den skævhed,
 *  en sortering efter udsving ville give: så ville kategorien med flest tal
 *  fylde mest, uanset hvor lidt den vejer.
 *
 *  Kategorier uden kommunale nøgletal står med. De udgør en tredjedel af
 *  aftrykket, og en oversigt, der kun viser det målbare, ville pege en
 *  klimakoordinator mod de forkerte kategorier.
 *
 *  Værktøjet vælger IKKE kategori. Det viser vægten, hvad der kan måles, og
 *  hvad der ikke kan. */
export function renderIndikatorer(b, c, ens, sources) {
  // Vægtrækkefølge, men restposter sidst. "Øvrige investeringer" er den
  // største enkeltkategori og ville ellers åbne siden med noget, ingen
  // kommune kan handle på. Bruddet er bevidst og står i pipeline/ens.py.
  const kategorier = ens
    ? [...ens.kategorier].sort((a, x) =>
        (a.restpost ? 1 : 0) - (x.restpost ? 1 : 0) || x.ton - a.ton)
    : b.grupper.map((g) => ({ navn: g.kategori, ton: null, pct: null, note: null }));
  const maksPct = Math.max(...kategorier.map((k) => k.pct ?? 0), 1);

  const afsnit = kategorier
    .map((k) => kategoriAfsnit(k, b, c, sources, maksPct)).join("\n");

  const niveau = tal(TAERSKEL_NIVEAU * 100);
  const markant = tal(TAERSKEL_MARKANT * 100);
  const nationalt = ens
    ? `<span class="text-sm text-gray-600">Energistyrelsen ${esc(ens.nationalt_aftryk.aar)}
        &middot; ${tal(ens.nationalt_aftryk.ton, 2)} ton pr. indbygger</span>`
    : "";

  return `<section id="noegletal" class="${KORT} p-5 sm:p-6">
    <div class="flex items-baseline justify-between gap-3 flex-wrap">
      <h2 class="text-xl font-bold text-gray-900">Alle nøgletal for ${esc(b.navn)}</h2>
      ${nationalt}
    </div>
    <p class="mt-1 text-sm text-gray-600 max-w-3xl">Nøgletallene er grupperet efter den
      forbrugskategori, de vedrører. Kategoriens vægt og beskrivelse er national og ordret
      ens på alle 98 kommunesider - kun tallene i tabellerne handler om ${esc(b.navn)}.
      Kilden står under hvert nøgletal.</p>

    <div class="mt-4 space-y-4">${afsnit}</div>

    <p class="mt-5 border-t border-gray-100 pt-3 text-xs text-gray-500 max-w-3xl">
      ▲ og ▼ peger mod højere og lavere udledning og afviger ${niveau}&nbsp;% eller mere
      fra landsgennemsnittet, ▲▲ og ▼▼ ${markant}&nbsp;% eller mere. △ og ▽ peger kun lidt,
      altså under ${niveau}&nbsp;%. Retningen handler om udledningen, ikke om værdien:
      færre elbiler er en lavere andel, men peger mod højere udledning.</p>
    <p class="mt-2 text-xs text-gray-500 max-w-3xl">
      <strong class="font-semibold text-gray-600">Den samlede retning tæller, den vejer
      ikke.</strong> Hvert nøgletal tæller ét, uanset om det afviger 2 eller 40&nbsp;% -
      at veje de store udsving tungere ville kræve at vide, hvor meget hvert nøgletal
      betyder for udledningen, og det tal findes ikke i kilderne. Mærkatet siger derfor,
      hvor mange af kategoriens nøgletal der peger hver sin vej, ikke at kategorien som
      helhed ligger over eller under landsgennemsnittet. Nøgletal mærket
      <span class="rounded bg-gray-100 px-1 py-0.5 text-[10px] font-medium text-gray-600">forklarende</span>
      står for at kvalificere et andet tal og tælles ikke med.</p>
    <p class="mt-2 text-xs text-gray-500 max-w-3xl">
      <strong class="font-semibold text-gray-600">Dette er ikke en prioritering.</strong>
      Nøgletallene er talt, ikke vejet mod hinanden, og rækkefølgen er Energistyrelsens
      nationale vægt. Kommunal indflydelse kan værktøjet ikke opgøre. Hele kildekataloget
      med tabel-id, årgang, licens og forbehold står på
      <a href="metode.html" class="underline hover:text-gray-700">metodesiden</a>.</p>
    ${udeladtNote(b)}
  </section>`;
}

// ---------- Hvad værktøjet ikke kan vise ----------

// Offentligt forbrug står i NIRAS' liste, men kræver ingen data: det fordeles
// ligeligt og varierer ikke mellem kommuner. Det siger overblikkets række
// allerede, med samme kilde.
const I_OVERBLIKKET = new Set(["Offentligt forbrug og investeringer"]);

/** De huller, der er kendte og bevidste. Skal stå i outputtet, ikke gemmes.
 *
 *  Fødevarehullet står i overblikket og gentages ikke her. Afsnittet brugte
 *  CONCITO's 2,5 ton, mens overblikket bruger Energistyrelsens 1,65 ton - to
 *  nationale tal for samme kategori på samme side. */
export function renderHuller(c) {
  const anbefalinger = c.niras_anbefalinger
    .filter((a) => !I_OVERBLIKKET.has(a.omraade))
    .map((a) => `<li class="mt-2">
      <strong class="font-medium text-gray-700">${esc(a.omraade)}.</strong>
      ${esc(a.anbefaling)}
      <span class="block text-gray-500">${esc(a.tilgaengelighed)}
        (NIRAS 2024, afsnit ${esc(a.afsnit)}, s. ${esc(a.side)})</span>
    </li>`).join("");
  const niras = c.kilder.find((k) => k.id === "NIRAS_2024");

  return `<section class="${KORT} p-5 sm:p-6 mt-6">
    <h3 class="text-lg font-semibold text-gray-900">Hvad værktøjet ikke kan vise</h3>

    <p class="mt-2 text-sm text-gray-700 max-w-3xl"><strong>Et samlet kommunalt tal.</strong>
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
      class="no-print no-embed inline-flex items-center gap-1.5 rounded-md border
             border-gray-300 bg-white px-2.5 py-1 text-xs text-gray-700
             hover:bg-gray-50 hover:border-gray-400 transition-colors">
      <svg viewBox="0 0 16 16" class="h-3.5 w-3.5" aria-hidden="true" fill="none"
        stroke="currentColor" stroke-width="1.5">
        <path d="M4 6V2h8v4M4 12H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-1"/>
        <rect x="4" y="10" width="8" height="4"/></svg>
      Print eller gem som PDF</button>`;

  return `<section class="mb-5">
    <div class="flex items-center justify-between gap-x-4 gap-y-2 flex-wrap">
      <h2 class="text-2xl sm:text-3xl font-bold text-gray-900">${esc(b.navn)}</h2>
      <div class="flex items-center gap-3 flex-wrap">
        <span class="text-xs text-gray-500">${meta}</span>${printknap}
      </div>
    </div>
    <p class="mt-2 text-sm text-gray-600 max-w-3xl">Offentligt tilgængelige nøgletal for
      kommunen, stillet op mod landsgennemsnittet. Værktøjet lægger dem ikke sammen til et
      samlet klimaaftryk - se hvorfor nederst. Kilderne står på
      <a href="metode.html" class="underline hover:text-gray-900">metodesiden</a>.</p>
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

/** Rækkefølge: kommunens overskrift, kommunens nøgletal kategori for kategori,
 *  og til sidst hvad der ikke kan vises.
 *
 *  Kategorioverblikket er væk som selvstændigt afsnit. Det sagde, hvilken vej
 *  hvert nøgletal pegede, og tabellen sagde det samme igen med tallene ved
 *  siden af. De to er nu ét afsnit, hvor vægten og den samlede retning står
 *  over kategoriens egne tal. */
export function renderKommune(b, c, ens, sources) {
  return [
    embedForbehold(),
    renderKommuneOverskrift(b),
    renderIndikatorer(b, c, ens, sources),
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

