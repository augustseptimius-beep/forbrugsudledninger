// Ren sammenligningsmotor. Ingen I/O, ingen DOM.
//
// VIGTIGT OM HVAD DENNE FIL IKKE GØR.
// Den beregner ikke et kommunalt klimaaftryk i ton. Et sådant estimat ville
// kræve koefficienter, der ikke kan kildebelægges - en indkomstelasticitet,
// en bilkørselsandel og en byggeandel - og de tal fandtes ikke i hverken
// CONCITO (2023) eller NIRAS (2024). NIRAS' anbefalede model hviler på
// DTU's Transportvaneundersøgelse, Energi- og CO2-Regnskabet på adresseniveau
// og en kommerciel forbrugersegmenteringsmodel; ingen af delene er offentligt
// tilgængelige. Se `pipeline/concito.py` for anbefalingerne med sidehenvisning.
//
// Filen sammenligner derfor kommunens faktuelle, offentligt tilgængelige
// nøgletal med landsgennemsnittet, og kobler hver indikator til den
// forbrugsgruppe, Energistyrelsen opgør nationalt. Fortolkningen af, hvad
// tallene betyder for CO2, ligger hos kilderne - ikke her.

/** Relativ afvigelse (kommune − land) / land. Returnerer null hvis input mangler. */
export function afvigelse(kommuneVal, landVal) {
  if (kommuneVal == null || landVal == null || landVal === 0) return null;
  return (kommuneVal - landVal) / landVal;
}

/** Fuldført byggeri pr. 1.000 indbyggere (seneste år). */
export function byggeriPr1000(m) {
  if (m.byggeri == null || m.folketal == null || m.folketal === 0) return null;
  return (m.byggeri / m.folketal) * 1000;
}

const fossilBilAndel = (m) => (m.biler_benzin + m.biler_diesel) / m.biler;
const elPluginAndel = (m) => (m.biler_el + m.biler_plugin) / m.biler;
const fossilOpv = (m) => (m.opv_olie + m.opv_naturgas) / m.opv_boliger_ialt;
const bilerPrIndb = (m) => m.biler / m.folketal;
const vaekst = (m) => m.folketal / m.folketal_forrige - 1;
const helaarsboliger = (m) => m.boliger_parcel + m.boliger_raekke + m.boliger_etage;

// Husholdningernes energi og udledning fordeles på SAMTLIGE boliger, ikke på
// indbyggere. Fritidsboliger bruger energi, men deres ejere er registreret i
// en anden kommune. Målt på tværs af alle 98 kommuner følger tallet pr.
// indbygger sommerhustætheden næsten lige så tæt som boligstørrelsen; fordelt
// på alle boliger forsvinder den sammenhæng, og tallet følger i stedet
// boligstørrelse og andelen af fritliggende huse - altså det, det bør følge.
// Se pipeline/fetch_klimaregnskabet.py for de målte sammenhænge.
const alleBoliger = (m) => helaarsboliger(m) + (m.fritidshuse ?? 0);
const husholdningEnergiPrBolig = (m) => (m.husholdning_energi_tj * 1000) / alleBoliger(m);
const fritidshusPrBolig = (m) => m.fritidshuse / helaarsboliger(m);

// Strøm er fælles, fjernvarme er lokal.
//
// Klimaregnskabet giver hver kommune sin egen el-faktor ud fra den el, der
// produceres i kommunen, så lokal vind og sol tæller som nul hos kommunens egne
// forbrugere. Strøm deles på det fælles net, og en vindmølle gør ikke kommunens
// eget forbrug renere - den gør alles. Husholdningernes strøm regnes derfor med
// landets fælles faktor: landets el-udledning delt med landets elforbrug, fra
// samme opgørelse og samme år. Summen over landet er uændret.
//
// Fjernvarme leveres i rør fra kommunens eget net, og Klimaregnskabet beregner
// faktoren pr. net efter Energistyrelsens anbefaling. Den bruges, som den er.
const KWH_PR_TJ = 1e12 / 3.6e6;
const faellesElFaktor = (land) => land.husholdning_el_co2_ton / land.husholdning_el_tj;
const husholdningCo2PrBolig = (m, land) =>
  (m.husholdning_co2_ton - m.husholdning_el_co2_ton
    + m.husholdning_el_tj * faellesElFaktor(land)) / alleBoliger(m);
const fjernvarmeCo2PrKwh = (m) =>
  (m.husholdning_fjernvarme_co2_ton * 1e6) / (m.husholdning_fjernvarme_tj * KWH_PR_TJ);

// Forbehold, der gælder for netop én kommune. En driver med et forbehold kalder
// funktionen med kommunens data; får den {spaerrer, note} tilbage, lægges noten
// til begrundelsen. Er spaerrer sand, spærres retningen, og nøgletallet vises
// ikke på kommunens side - noten står i stedet under tabellen.
//
// Fritidshuse: husholdningstallene er fordelt på samtlige boliger, og et
// fritidshus bruger mindre energi end en helårsbolig. Har kommunen flere
// fritidshuse end helårsboliger, trækkes gennemsnittet ned med en størrelse, der
// ikke kan opgøres, og et "lavere" ville være fordelingens, ikke kommunens.
// Grænsen er metodesidens egen formulering. Den fossile andel rammes ikke - den
// er ikke fordelt på boliger.
const FRITIDSHUS_FORBEHOLD = {
  spaerrer: true,
  note: "Kommunen har flere fritidshuse end helårsboliger. Husholdningstallene er "
    + "fordelt på samtlige boliger, og da et fritidshus bruger mindre energi end en "
    + "helårsbolig, trækkes gennemsnittet ned med en størrelse, der ikke kan opgøres. "
    + "Et lavere tal ville derfor være fordelingens, ikke kommunens.",
};
const fritidshusForbehold = (m) => (fritidshusPrBolig(m) > 1 ? FRITIDSHUS_FORBEHOLD : null);
const affaldForbehold = (m) => INDBERETNING_FORBEHOLD[m.affald_indberetning] ?? null;

// Hvilken vej et nøgletal peger, hvis værdien er høj.
//   "hoejere"    en høj værdi peger mod højere udledning end landsgennemsnittet
//   "lavere"     en høj værdi peger mod lavere udledning
//   "uafklaret"  retningen kan ikke afgøres på et kildebelagt grundlag
//
// Dette er den ENESTE vurdering i hele værktøjet, og den er tilføjet efter
// eksplicit ønske, fordi en mur af procenttal ikke er et overblik. Hvert
// nøgletal bærer sin begrundelse i PAAVIRKNING nedenfor. Kan retningen ikke
// begrundes, står den som uafklaret frem for at blive gættet. Et hovednøgletal,
// der står som uafklaret for en kommune, vises ikke på kommunens side - se
// beregnKommune.
export const PAAVIRKNING = {
  hoejere: "hoejere", lavere: "lavere", uafklaret: "uafklaret",
};

// Energistyrelsens forbrugsgrupper (Global Afrapportering 2026, data for 2024).
// Afløste CONCITO's fem kategorier, fordi ENS' tal er nyere, opdateres årligt
// og summerer eksakt til hovedtallet. Vægtene står i pipeline/ens.py.
//
// Ethvert nøgletal skal stå i en af Energistyrelsens kategorier, ellers når
// det ikke overblikket - det holdes af testen "ethvert nøgletal med en retning
// når overblikket". Kontekst-kategorien er fjernet: dens nøgletal gentog tal,
// der allerede står på siden (se "ingen to nøgletal på siden siger det samme").
export const KATEGORI = {
  TRANSPORT: "Transport",
  FOEDEVARER: "Føde- og drikkevarer",
  PRODUKTER: "Forbrugsprodukter og services",
  ENERGI: "Energi og forsyning",
  BOLIG_BYGGERI: "Bolig og byggeri",
};

// Hver driver: hvordan værdien beregnes, hvordan afvigelsen dannes, og hvilken
// af Energistyrelsens forbrugsgrupper den oplyser om.
// afvigelsestype: "relativ" = (k−l)/l, "difference" = k−l.
//
// rolle: "hjaelper" markerer nøgletal, der kun findes for at kvalificere et
// andet tal - fritidshuse pr. helårsbolig forklarer husholdningstallene,
// befolkningsudviklingen forklarer byggeaktiviteten. De står i tabellen som
// alle andre, men holdes
// ude af overblikkets fremhævelser, hvor de ellers ville fortrænge de tal, de
// er sat i verden for at forklare.
const DRIVERE = [
  // Står under Forbrugsprodukter og services. Kilderne kobler også indkomsten til
  // flyrejser (NIRAS s. 20) og regner fødevarer med til "øvrigt forbrug" (NIRAS
  // s. 22), men nøgletallet står kun ét sted, så det ikke tæller dobbelt i
  // overblikket. Det lå tidligere i en egen kategori, "På tværs af kategorier",
  // som ikke findes blandt Energistyrelsens - og nåede derfor aldrig overblikket.
  { navn: "Disponibel indkomst", enhed: "kr.", val: (m) => m.disp_indkomst,
    type: "relativ", kategori: KATEGORI.PRODUKTER, paavirkning: "hoejere",
    begrundelse: "CONCITO (2023) s. 27: mennesker med lav indkomst forbruger ofte færre "
      + "ting og sager og rejser mindre. NIRAS (2024) s. 27 anbefaler at undersøge, om "
      + "borgernes øvrige forbrug kan skaleres efter indkomsten. Sammenhængen er ikke "
      + "mekanisk: CONCITO's forbrugsprofiler går fra 8,7 til 15 ton i den laveste "
      + "indkomstgruppe og fra 12 til 25 ton i den højeste (s. 28-29), fordi pengene kan "
      + "bruges mere eller mindre klimavenligt (s. 6)." },
  // Taget af siden, fordi de gentog tal, der allerede står der - målt over alle
  // 98 kommuner: nettoformue (gns. og median) fulgte disponibel indkomst
  // (r = +0,95 og +0,84), befolkningstætheden fulgte biler pr. indbygger
  // (r = -0,76), boligprisen fulgte indkomst og tæthed (r = +0,69 og +0,78), og
  // parcelhus-andelen fulgte boligarealet (r = +0,92). Gini-koefficienten hentes
  // stadig, men vises ikke: ulighed siger noget om fordelingen af forbruget, ikke
  // om niveauet, og hører til en vurdering af rimelig og retfærdig omstilling.
  { navn: "Befolkningsudvikling", enhed: "pct.", val: vaekst,
    type: "difference", kategori: KATEGORI.BOLIG_BYGGERI, rolle: "hjaelper",
    paavirkning: "uafklaret",
    begrundelse: "Står her for at forklare byggeaktiviteten: en kommune, der vokser, "
      + "bygger flere boliger. Nøgletallene er opgjort pr. borger, så væksten peger ikke "
      + "selv mod en højere eller lavere udledning." },
  { navn: "Gennemsnitligt boligareal", enhed: "m²/bolig", val: (m) => m.boligareal,
    type: "relativ", kategori: KATEGORI.ENERGI, rolle: "hjaelper", paavirkning: "hoejere",
    begrundelse: "Større boliger koster mere varme - NIRAS (2024) s. 18 nævner "
      + "boligstørrelsen blandt det, rumvarmen følger. Står som forklarende tal under "
      + "energiforbruget, ikke under byggeriet: det er nybyggeriet, der giver "
      + "byggeriets udledning, ikke størrelsen på de huse, der allerede står." },
  { navn: "Byggeaktivitet", enhed: "pr. 1.000 indb.", val: byggeriPr1000,
    type: "relativ", kategori: KATEGORI.BOLIG_BYGGERI, paavirkning: "hoejere",
    begrundelse: "Nybyggeri kræver materialer. Energistyrelsen opgør investering i "
      + "boliger til 0,48 ton pr. indbygger (2024). Det er selve byggeriet, der "
      + "tæller her - boligernes energiforbrug hører til Energi og forsyning." },
  { navn: "Biler pr. indbygger", enhed: "biler/pers.", val: bilerPrIndb,
    type: "relativ", kategori: KATEGORI.TRANSPORT, paavirkning: "hoejere",
    begrundelse: "Flere biler betyder både mere kørsel og flere producerede "
      + "køretøjer. Energistyrelsen opgør husholdningernes transport plus køb af "
      + "køretøjer til 1,84 ton pr. indbygger (2024), den største enkeltkategori. Kun "
      + "husholdningernes egne biler tælles: firma- og leasingbiler står på "
      + "virksomhedens adresse, ikke der, hvor de bruges." },
  { navn: "El- og plugin-hybridandel", enhed: "pct.", val: elPluginAndel,
    andel: "0-1",
    type: "relativ", kategori: KATEGORI.TRANSPORT, paavirkning: "lavere",
    begrundelse: "En elbil udleder mindre pr. kørt kilometer end en tilsvarende "
      + "benzin- eller dieselbil på et dansk elnet." },
  // Afløste Diesel-andel, som stod som uafklaret: en dieselbil udleder mindre
  // CO2 pr. kilometer end en benzinbil, men køres længere, og fordelingen
  // mellem de to kunne derfor ikke tolkes. Summen kan.
  //
  // Bemærk, at de øvrige drivmidler i BIL54 udgør under 0,1 pct. af bilparken
  // i hver kommune. Fossil-andelen er derfor tæt på præcis komplementet til
  // el- og plugin-hybridandelen ovenfor - målt over alle 98 kommuner er
  // korrelationen -1,00. De står som to nøgletal efter eksplicit valg, ikke
  // fordi de bærer hver sin oplysning.
  { navn: "Fossil-andel", enhed: "pct.", val: fossilBilAndel,
    andel: "0-1",
    type: "relativ", kategori: KATEGORI.TRANSPORT, paavirkning: "hoejere",
    begrundelse: "Benzin- og dieselbiler tilsammen. En fossilbil udleder mere "
      + "CO2 pr. kørt kilometer end en el- eller plugin-hybridbil på et dansk "
      + "elnet, uanset hvordan de fossile biler fordeler sig på de to brændstoffer." },
  { navn: "Gennemsnitlig pendlingsafstand", enhed: "km", val: (m) => m.pendlingsafstand_km,
    type: "relativ", kategori: KATEGORI.TRANSPORT, paavirkning: "hoejere",
    begrundelse: "Længere afstand til arbejde betyder flere kørte kilometer. Siger "
      + "dog intet om transportmiddel." },
  { navn: "Husholdningernes CO2 fra energi", enhed: "ton CO2e/bolig",
    val: husholdningCo2PrBolig, type: "relativ", kategori: KATEGORI.ENERGI,
    paavirkning: "hoejere", forbehold: fritidshusForbehold,
    begrundelse: "Udledningen fra borgernes eget energiforbrug i boligen. Strømmen er "
      + "regnet med samme udledning pr. kWh i alle kommuner, fordi den deles på det "
      + "fælles net; fjernvarmen med sit lokale nets." },
  { navn: "Husholdningernes energiforbrug", enhed: "GJ/bolig",
    val: husholdningEnergiPrBolig, type: "relativ", kategori: KATEGORI.ENERGI,
    paavirkning: "hoejere", forbehold: fritidshusForbehold,
    begrundelse: "Mere energi brugt i boligen. Udledningen afhænger dog af, hvilken "
      + "energikilde der bruges - se de to øvrige nøgletal." },
  { navn: "Fossil andel af husholdningernes energi", enhed: "pct.",
    val: (m) => m.husholdning_fossil_andel, andel: "0-1",
    type: "relativ", kategori: KATEGORI.ENERGI,
    paavirkning: "hoejere",
    begrundelse: "Naturgas, fyringsolie og LPG udleder ved forbrændingen." },
  { navn: "Fossil opvarmning", enhed: "pct.", val: fossilOpv,
    andel: "0-1",
    type: "relativ", kategori: KATEGORI.ENERGI, paavirkning: "hoejere",
    begrundelse: "Olie- og gasfyr udleder ved forbrændingen i boligen." },
  { navn: "Fjernvarmens CO2 pr. kWh", enhed: "g CO2e/kWh", val: fjernvarmeCo2PrKwh,
    type: "relativ", kategori: KATEGORI.ENERGI, paavirkning: "hoejere",
    begrundelse: "Hvor meget CO2 der følger med hver kWh fjernvarme, husholdningerne "
      + "aftager. Fjernvarme leveres i rør fra kommunens eget net, så tallet er "
      + "kommunens eget - modsat strøm, der deles på det fælles net. Tallet siger, "
      + "hvor ren fjernvarmen er, ikke hvor meget den fylder i kommunen." },
  { navn: "Fritidshuse pr. helårsbolig", enhed: "boliger/bolig",
    val: fritidshusPrBolig, type: "relativ", kategori: KATEGORI.ENERGI,
    rolle: "hjaelper", paavirkning: "uafklaret",
    begrundelse: "Findes kun for at kvalificere husholdningstallene." },
  // De to affaldsnøgletal stod en periode som uafklarede for ALLE 98 kommuner,
  // fordi DST's kommunefordeling for 2023 er upålidelig for nogle af dem.
  // Det var for groft: fejlen rammer de kommuner, der deler indberetning med
  // hinanden, ikke de øvrige 85. Retningen står derfor igen, og forbeholdet
  // sættes pr. kommune ud fra affald_indberetning - se INDBERETNING_FORBEHOLD.
  { navn: "Husholdningsaffald", enhed: "kg/pers.", val: (m) => m.affald_kg,
    type: "relativ", kategori: KATEGORI.PRODUKTER, paavirkning: "hoejere",
    forbehold: affaldForbehold,
    begrundelse: "Mere affald peger mod et større materielt forbrug." },
  { navn: "Genanvendelsesprocent", enhed: "pct.", val: (m) => m.genanvendelse_pct,
    andel: "0-100",
    type: "relativ", kategori: KATEGORI.PRODUKTER, paavirkning: "lavere",
    forbehold: affaldForbehold,
    begrundelse: "Genanvendte materialer erstatter produktion af nye." },
];

// Tærskler for, hvornår en afvigelse kaldes markant. De er en PRÆSENTATIONS-
// beslutning uden kilde - råtallet står altid ved siden af, så læseren kan se
// gennem båndet. Tærsklerne er skrevet frem på metodesiden.
//
// Eksporteret, fordi beregnFordeling(), mærkatet og metodesidens tabel SKAL
// tælle på de samme tærskler. Lå de tre steder hver for sig, kunne de komme
// til at sige forskellige ting om det samme tal.
export const TAERSKEL_NIVEAU = 0.10;
export const TAERSKEL_MARKANT = 0.33;

/** Beskriver afvigelsens størrelse i ord. Ren beskrivelse, ingen vurdering. */
export function niveauBaand(afvigelse) {
  if (afvigelse == null || !Number.isFinite(afvigelse)) return "ukendt";
  const a = Math.abs(afvigelse);
  if (a < TAERSKEL_NIVEAU) return "på niveau";
  if (a < TAERSKEL_MARKANT) return afvigelse > 0 ? "over" : "under";
  return afvigelse > 0 ? "markant over" : "markant under";
}

/** Forbehold, som kildens egen pålidelighed lægger på et nøgletal for NETOP
 *  denne kommune. Feltet sættes af pipelinen (fetch_dst.klassificer_affald).
 *
 *  Forskellen mellem de to niveauer er bevisbyrden. "bekraeftet_fejl" bygger på
 *  et eftervist bytte af tonnage mellem kommuner, der deler affaldsselskab -
 *  der VED vi, at tallet ikke beskriver kommunen, og retningen spærres.
 *  De to "usikker"-tilstande er blot et stort spring fra året før eller en
 *  fraktion, der næsten mangler. Ingen af delene er et bevis for en fejl: en
 *  lille ø kan springe af naturlige grunde. Retningen spærres derfor ikke -
 *  årsagen oplyses, og læseren tager selv højde for den. De holdes adskilt,
 *  fordi en kommune, hvis fraktion mangler, ikke har svinget. */
const INDBERETNING_FORBEHOLD = {
  bekraeftet_fejl: {
    spaerrer: true,
    note: "Kommunen deler affaldsindberetning med nabokommuner, og tonnagen er "
      + "påviseligt bogført på hinanden for det seneste opgjorte år. Danmarks "
      + "Statistiks tal beskriver derfor ikke kommunen alene.",
  },
  usikker_fraktion: {
    spaerrer: false,
    note: "Bemærk: en affaldsfraktion, der fylder meget i alle andre kommuner, er "
      + "næsten fraværende i kommunens indberetning for det viste år. Det kan være "
      + "et hul i indberetningen snarere end en forskel i forbruget.",
  },
  usikker_spring: {
    spaerrer: false,
    note: "Bemærk: kommunens restaffald viser et usædvanligt stort udsving fra "
      + "året før. Det behøver ikke være en fejl - små kommuner svinger naturligt "
      + "- men tallet er mindre stabilt end de øvriges.",
  },
};

/** Hvad afvigelsen peger mod for udledningen - den eneste vurdering i
 *  værktøjet. "uafklaret" når retningen ikke kan begrundes på kildens grundlag.
 *
 *  Under 10 % er der stadig en retning, og enhver kan se, om tallet ligger over
 *  eller under landet - signalet siger derfor "lidt" frem for ingenting. Kun en
 *  afvigelse, der vises som 0,0 %, peger ingen vej ("på niveau"). */
export const TAERSKEL_NUL = 0.0005;
export function udledningsSignal(afvigelse, paavirkning) {
  if (afvigelse == null || !Number.isFinite(afvigelse)) return "ukendt";
  if (paavirkning == null || paavirkning === "uafklaret") return "uafklaret";
  if (Math.abs(afvigelse) < TAERSKEL_NUL) return "på niveau";
  const pegerOp = paavirkning === "hoejere" ? afvigelse > 0 : afvigelse < 0;
  const vej = pegerOp ? "højere" : "lavere";
  if (Math.abs(afvigelse) < TAERSKEL_NIVEAU) return `lidt ${vej}`;
  return Math.abs(afvigelse) >= TAERSKEL_MARKANT ? `markant ${vej}` : vej;
}

/** Sikker beregning: returnerer null hvis resultatet ikke er et endeligt tal
 *  (manglende felt giver NaN/Infinity, som Number.isFinite fanger). Landet gives
 *  med, fordi husholdningernes strøm regnes med landets fælles el-faktor. */
function sikker(fn, m, land) {
  const v = fn(m, land);
  return Number.isFinite(v) ? v : null;
}

/** Percentil ved lineær interpolation på et sorteret array. */
function percentil(sorteret, p) {
  if (sorteret.length === 0) return null;
  if (sorteret.length === 1) return sorteret[0];
  const i = (sorteret.length - 1) * p;
  const lav = Math.floor(i);
  const hoej = Math.ceil(i);
  if (lav === hoej) return sorteret[lav];
  return sorteret[lav] + (sorteret[hoej] - sorteret[lav]) * (i - lav);
}

/** Hvordan landets kommuner fordeler sig på HVERT nøgletal.
 *
 *  HVORFOR DEN FINDES. Tærsklerne er de samme for alle nøgletal, men
 *  nøgletallene er ikke lige spredte. "Fossil andel af husholdningernes energi"
 *  ligger mindst 33 % fra landsgennemsnittet i 80 af 98 kommuner; "Gennemsnitligt
 *  boligareal" gør det i ingen. Ordet "markant" betyder derfor ikke det samme
 *  fra række til række, og uden denne optælling kan en læser ikke se det.
 *
 *  HVOR DEN VISES. Kun på metodesiden, i tærskeltabellen. Den stod tidligere
 *  også som et spænd ("8 ud af 10 kommuner: X - Y") under hvert nøgletal på
 *  kommunesiden. Det er fjernet: en læser af én kommunes side sammenligner ikke
 *  på tværs af kommuner, så spændet var en tredje talstørrelse at holde styr på
 *  uden et spørgsmål, den besvarede.
 *
 *  HVAD DEN IKKE ER. Den rangordner ikke kommuner. Alt herunder er en egenskab
 *  ved NØGLETALLET, ikke ved kommunen: de samme tal gælder ordret på alle 98
 *  kommunesider. Tre regler holder den grænse, og de må ikke brydes:
 *    1. Returnér aldrig kommunens egen placering eller percentil.
 *    2. Vis aldrig mindste- og størsteværdien - de inviterer til spørgsmålet
 *       "hvem ligger højest?", som værktøjet ikke besvarer.
 *    3. Navngiv aldrig en anden kommune.
 *  Det er samme slags operation som optaelSignaler(): den tæller, den vejer
 *  ikke. Ingen ny koefficient, intet nyt datagrundlag - kun de tærskler, der
 *  allerede er dokumenteret på metodesiden.
 *
 *  Returnerer {[driverNavn]: {n, paaNiveau, mellem, markant, medianAbs, p90Abs}}
 *  - eller null for et nøgletal, ingen af kommunerne har en afvigelse på. */
export function beregnFordeling(kommuner, land) {
  const tabeller = kommuner.map((k) => driverTabel(k, land));
  const fordeling = {};

  DRIVERE.forEach((d, i) => {
    const raekker = tabeller.map((t) => t[i]);
    const afvigelser = raekker.map((r) => r.afvigelse).filter((v) => v != null);
    if (afvigelser.length === 0) {
      fordeling[d.navn] = null;
      return;
    }
    const abs = afvigelser.map(Math.abs).sort((a, b) => a - b);

    fordeling[d.navn] = {
      // n er antal kommuner MED en afvigelse - ikke 98. Mangler et tal for en
      // kommune, ville en optælling "af 98" påstå en dækning, værktøjet ikke har.
      n: afvigelser.length,
      paaNiveau: abs.filter((a) => a < TAERSKEL_NIVEAU).length,
      mellem: abs.filter((a) => a >= TAERSKEL_NIVEAU && a < TAERSKEL_MARKANT).length,
      markant: abs.filter((a) => a >= TAERSKEL_MARKANT).length,
      medianAbs: percentil(abs, 0.5),
      p90Abs: percentil(abs, 0.9),
    };
  });
  return fordeling;
}

/** Byg indikatortabellen: værdi, landsværdi, afvigelse (efter type) og retning. */
export function driverTabel(kommune, land) {
  return DRIVERE.map((d) => {
    // Et forbehold for netop denne kommune kan spærre retningen og lægger under
    // alle omstændigheder sin note til begrundelsen.
    const forbehold = d.forbehold?.(kommune) ?? null;
    const paavirkning = forbehold?.spaerrer ? "uafklaret" : (d.paavirkning ?? "uafklaret");
    const begrundelse = forbehold
      ? [d.begrundelse, forbehold.note].filter(Boolean).join(" ")
      : (d.begrundelse ?? null);

    const kv = sikker(d.val, kommune, land);
    const lv = sikker(d.val, land, land);
    let afv = null;
    if (kv != null && lv != null) {
      if (d.type === "relativ") afv = afvigelse(kv, lv);
      else if (d.type === "difference") afv = kv - lv;
    }
    // Procentpoint ved siden af den relative afvigelse for de nøgletal, der er
    // andele. Med et landsgennemsnit på 9,8 % bliver 37,5 % til "+283 %",
    // hvilket lyder ekstremt for en forskel på 28 procentpoint.
    //
    // VIGTIGT: dette er et RENT VISNINGSFELT. Læg ikke andelene om til
    // type "difference" for at opnå det samme - niveauBaand() og
    // udledningsSignal() bruger de samme 0,10/0,33-tærskler på hvad der end
    // står i afvigelse, så en omlægning ville kollapse alle 0-1-andele til
    // "lidt" og gøre næsten alle 0-100-andele "markante".
    let pp = null;
    if (d.andel && kv != null && lv != null) {
      pp = (kv - lv) * (d.andel === "0-1" ? 100 : 1);
    }
    return {
      navn: d.navn, enhed: d.enhed, type: d.type, kategori: d.kategori,
      rolle: d.rolle ?? "hoved",
      paavirkning,
      begrundelse,
      kommuneVaerdi: kv, landVaerdi: lv, afvigelse: afv,
      procentpoint: pp,
      retning: afv == null ? "kontekst" : afv > 0 ? "over land" : afv < 0 ? "under land" : "på niveau",
      baand: niveauBaand(afv),
      signal: udledningsSignal(afv, paavirkning),
      // Forbeholdets note for sig. Spærrer forbeholdet retningen, vises
      // nøgletallet ikke, og noten er den begrundelse, siden giver i stedet.
      forbeholdNote: forbehold?.note ?? null,
    };
  });
}

/** Indikatorerne grupperet efter Energistyrelsens forbrugsgruppe. */
/** Tæller nøgletallenes signaler i en kategori. TÆLLER - vejer ikke. En
 *  vægtet score ville kræve et grundlag, der ikke findes i nogen kilde.
 *
 *  Optællingen ligger i sit eget felt `pr_signal`, og summerne har egne navne.
 *  Lå de side om side, ville nøglen "lavere" betyde to ting - og summen ville
 *  stille overskrive optællingen. */
export function optaelSignaler(drivere) {
  const pr_signal = { "markant højere": 0, "højere": 0, "lidt højere": 0, "på niveau": 0,
                      "lidt lavere": 0, "lavere": 0, "markant lavere": 0, uafklaret: 0,
                      ukendt: 0 };
  for (const d of drivere) {
    if (d.rolle === "hjaelper") continue;
    pr_signal[d.signal] = (pr_signal[d.signal] ?? 0) + 1;
  }
  return {
    pr_signal,
    sumHoejere: pr_signal["markant højere"] + pr_signal["højere"],
    sumLavere: pr_signal["markant lavere"] + pr_signal["lavere"],
    sumLidt: pr_signal["lidt højere"] + pr_signal["lidt lavere"],
    ialt: Object.values(pr_signal).reduce((a, b) => a + b, 0),
  };
}

export function driverePrKategori(drivere) {
  // Rækkefølge efter Energistyrelsens nationale vægt, faldende. Fødevarer og
  // Offentligt forbrug har ingen kommunale nøgletal og optræder derfor ikke
  // her, kun i kategorioverblikket.
  const raekkefoelge = [KATEGORI.TRANSPORT, KATEGORI.PRODUKTER, KATEGORI.ENERGI,
                        KATEGORI.BOLIG_BYGGERI];
  return raekkefoelge
    .map((kategori) => ({ kategori, drivere: drivere.filter((d) => d.kategori === kategori) }))
    .filter((g) => g.drivere.length > 0);
}

// Felter, der efterspørges; bruges til at rapportere manglende data pr. kommune.
const FORVENTEDE_FELTER = [
  "disp_indkomst", "folketal", "folketal_forrige",
  "gini", "boliger_parcel", "boliger_raekke", "boliger_etage", "boligareal", "byggeri",
  "biler", "biler_el", "biler_plugin", "biler_diesel", "biler_benzin",
  "opv_boliger_ialt", "opv_olie",
  "opv_naturgas", "affald_kg", "genanvendelse_pct",
  "pendlingsafstand_km", "fritidshuse",
  "husholdning_co2_ton", "husholdning_energi_tj", "husholdning_fossil_andel",
  "husholdning_el_tj", "husholdning_el_co2_ton",
  "husholdning_fjernvarme_tj", "husholdning_fjernvarme_co2_ton",
];

/** Om et nøgletal vises på kommunens side.
 *
 *  Et nøgletal, hvis retning ikke kan afgøres for netop denne kommune, vises
 *  ikke. Det sker, når et forbehold spærrer retningen: affaldstallene hos
 *  kommuner, der deler indberetning, og husholdningstallene pr. bolig, hvor der
 *  er flere fritidshuse end helårsboliger.
 *
 *  Hjælpetal er undtaget. De har aldrig en retning, fordi de står for at
 *  forklare et andet nøgletal, og ville ellers forsvinde fra alle 98 sider.
 *  Manglende data ("ukendt") rammes heller ikke - dér står en tankestreg. */
const vises = (d) => d.rolle === "hjaelper" || d.signal !== "uafklaret";

/** Fuld sammenligning for én kommune: indikatortabel, gruppering, udeladte
 *  nøgletal og manglende felter. */
export function beregnKommune(kommune, land) {
  const alle = driverTabel(kommune, land);
  const drivere = alle.filter(vises);
  return {
    navn: kommune.navn,
    kode: kommune.kode,
    region: kommune.region,
    drivere,
    grupper: driverePrKategori(drivere),
    // Det, der er taget af siden, med begrundelsen. Siden nævner det under
    // tabellen, så et nøgletal aldrig forsvinder uden forklaring.
    udeladt: alle.filter((d) => !vises(d)).map((d) => ({
      navn: d.navn, kategori: d.kategori, note: d.forbeholdNote ?? d.begrundelse,
    })),
    manglende: FORVENTEDE_FELTER.filter((f) => kommune[f] == null),
  };
}
