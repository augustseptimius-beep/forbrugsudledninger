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

const parcelAndel = (m) =>
  m.boliger_parcel / (m.boliger_parcel + m.boliger_raekke + m.boliger_etage);
const dieselAndel = (m) => m.biler_diesel / m.biler;
const elPluginAndel = (m) => (m.biler_el + m.biler_plugin) / m.biler;
const fossilOpv = (m) => (m.opv_olie + m.opv_naturgas) / m.opv_boliger_ialt;
const taethed = (m) => m.folketal / m.areal;
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
const husholdningCo2PrBolig = (m) => m.husholdning_co2_ton / alleBoliger(m);
const husholdningEnergiPrBolig = (m) => (m.husholdning_energi_tj * 1000) / alleBoliger(m);
const fritidshusPrBolig = (m) => m.fritidshuse / helaarsboliger(m);

// Hvilken vej et nøgletal peger, hvis værdien er høj.
//   "hoejere"    en høj værdi peger mod højere udledning end landsgennemsnittet
//   "lavere"     en høj værdi peger mod lavere udledning
//   "uafklaret"  retningen kan ikke afgøres på et kildebelagt grundlag
//
// Dette er den ENESTE vurdering i hele værktøjet, og den er tilføjet efter
// eksplicit ønske, fordi en mur af procenttal ikke er et overblik. Hvert
// nøgletal bærer sin begrundelse i PAAVIRKNING nedenfor. Kan retningen ikke
// begrundes, står den som uafklaret frem for at blive gættet.
export const PAAVIRKNING = {
  hoejere: "hoejere", lavere: "lavere", uafklaret: "uafklaret",
};

// Energistyrelsens forbrugsgrupper (Global Afrapportering 2026, data for 2024).
// Afløste CONCITO's fem kategorier, fordi ENS' tal er nyere, opdateres årligt
// og summerer eksakt til hovedtallet. Vægtene står i pipeline/ens.py.
//
// TVAERS og KONTEKST er ikke ENS-kategorier. TVAERS rummer nøgletal, der driver
// forbruget på tværs af alle kategorier; KONTEKST beskriver kommunen uden at
// pege på en forbrugskategori. Ingen af dem får en national vægt.
export const KATEGORI = {
  TRANSPORT: "Transport",
  FOEDEVARER: "Føde- og drikkevarer",
  PRODUKTER: "Forbrugsprodukter og services",
  ENERGI: "Energi og forsyning",
  BOLIG_BYGGERI: "Bolig og byggeri",
  TVAERS: "På tværs af kategorier",
  KONTEKST: "Kontekst",
};

// Hver driver: hvordan værdien beregnes, hvordan afvigelsen dannes, og hvilken
// af Energistyrelsens forbrugsgrupper den oplyser om.
// afvigelsestype: "relativ" = (k−l)/l, "difference" = k−l, "ingen" = kun kontekst.
//
// rolle: "hjaelper" markerer nøgletal, der kun findes for at kvalificere et
// andet tal - lokal VE-dækning forklarer el-CO2, fritidshuse pr. helårsbolig
// forklarer husholdningstallene. De står i tabellen som alle andre, men holdes
// ude af overblikkets fremhævelser, hvor de ellers ville fortrænge de tal, de
// er sat i verden for at forklare.
const DRIVERE = [
  { navn: "Disponibel indkomst", enhed: "kr.", val: (m) => m.disp_indkomst,
    type: "relativ", kategori: KATEGORI.TVAERS, paavirkning: "hoejere",
    begrundelse: "CONCITO (2023) s. 6 og s. 30: klimaaftrykket hænger tæt sammen med "
      + "indkomstniveauet, og forbrugsprofilerne stiger fra 8,7 til 25 ton med indkomst." },
  { navn: "Nettoformue (gns.)", enhed: "kr.", val: (m) => m.formue_gns,
    type: "relativ", kategori: KATEGORI.KONTEKST, paavirkning: "uafklaret",
    begrundelse: "Formue er ikke det samme som forbrug. CONCITO kobler aftrykket til "
      + "indkomst, ikke til formue, så retningen kan ikke afgøres på kildens grundlag." },
  { navn: "Nettoformue (median)", enhed: "kr.", val: (m) => m.formue_median,
    type: "relativ", kategori: KATEGORI.KONTEKST, paavirkning: "uafklaret",
    begrundelse: "Samme forbehold som gennemsnitsformuen." },
  { navn: "Gini-koefficient", enhed: "indeks", val: (m) => m.gini,
    type: "ingen", kategori: KATEGORI.KONTEKST, paavirkning: "uafklaret",
    begrundelse: "Ulighed siger noget om fordelingen af forbrug, ikke om niveauet." },
  { navn: "Befolkningsudvikling", enhed: "pct.", val: vaekst,
    type: "difference", kategori: KATEGORI.KONTEKST, paavirkning: "uafklaret",
    begrundelse: "Tallene er pr. borger, så befolkningsudvikling påvirker dem ikke "
      + "direkte." },
  { navn: "Befolkningstæthed", enhed: "pers./km²", val: taethed,
    type: "relativ", kategori: KATEGORI.KONTEKST, paavirkning: "uafklaret",
    begrundelse: "Tæthed hænger sammen med både boligtype og transportafstand, som "
      + "begge opgøres hver for sig. Den tælles ikke med igen her." },
  { navn: "Gennemsnitligt boligareal", enhed: "m²/bolig", val: (m) => m.boligareal,
    type: "relativ", kategori: KATEGORI.ENERGI, rolle: "hjaelper", paavirkning: "hoejere",
    begrundelse: "Større boliger koster mere varme. Står som forklarende tal under "
      + "energiforbruget, ikke under byggeriet: det er nybyggeriet, der giver "
      + "byggeriets udledning, ikke størrelsen på de huse, der allerede står." },
  { navn: "Parcelhus-andel", enhed: "pct.", val: parcelAndel,
    andel: "0-1",
    type: "relativ", kategori: KATEGORI.ENERGI, rolle: "hjaelper", paavirkning: "hoejere",
    begrundelse: "Fritliggende huse har mere ydervæg pr. bolig end lejligheder og "
      + "bruger derfor mere varme. Forklarer energiforbruget; den stående boligmasses "
      + "sammensætning siger intet om, hvor meget der bygges." },
  { navn: "Byggeaktivitet", enhed: "pr. 1.000 indb.", val: byggeriPr1000,
    type: "relativ", kategori: KATEGORI.BOLIG_BYGGERI, paavirkning: "hoejere",
    begrundelse: "Nybyggeri kræver materialer. Energistyrelsen opgør investering i "
      + "boliger til 0,48 ton pr. indbygger (2024). Det er selve byggeriet, der "
      + "tæller her - boligernes energiforbrug hører til Energi og forsyning." },
  { navn: "Biler pr. indbygger", enhed: "biler/pers.", val: bilerPrIndb,
    type: "relativ", kategori: KATEGORI.TRANSPORT, paavirkning: "hoejere",
    begrundelse: "Flere biler betyder både mere kørsel og flere producerede "
      + "køretøjer. Energistyrelsen opgør husholdningernes transport plus køb af "
      + "køretøjer til 1,84 ton pr. indbygger (2024), den største enkeltkategori." },
  { navn: "El- og plugin-hybridandel", enhed: "pct.", val: elPluginAndel,
    andel: "0-1",
    type: "relativ", kategori: KATEGORI.TRANSPORT, paavirkning: "lavere",
    begrundelse: "En elbil udleder mindre pr. kørt kilometer end en tilsvarende "
      + "benzin- eller dieselbil på et dansk elnet." },
  { navn: "Diesel-andel", enhed: "pct.", val: dieselAndel,
    andel: "0-1",
    type: "relativ", kategori: KATEGORI.TRANSPORT, paavirkning: "uafklaret",
    begrundelse: "En dieselbil udleder typisk MINDRE CO2 pr. kilometer end en "
      + "benzinbil, men køres til gengæld længere. Retningen for CO2 kan ikke "
      + "afgøres på et kildebelagt grundlag, og gættes derfor ikke." },
  { navn: "Gennemsnitlig pendlingsafstand", enhed: "km", val: (m) => m.pendlingsafstand_km,
    type: "relativ", kategori: KATEGORI.TRANSPORT, paavirkning: "hoejere",
    begrundelse: "Længere afstand til arbejde betyder flere kørte kilometer. Siger "
      + "dog intet om transportmiddel." },
  { navn: "Husholdningernes CO2 fra energi", enhed: "ton CO2e/bolig",
    val: husholdningCo2PrBolig, type: "relativ", kategori: KATEGORI.ENERGI,
    paavirkning: "hoejere",
    begrundelse: "Målt udledning fra borgernes eget energiforbrug i boligen." },
  { navn: "Husholdningernes energiforbrug", enhed: "GJ/bolig",
    val: husholdningEnergiPrBolig, type: "relativ", kategori: KATEGORI.ENERGI,
    paavirkning: "hoejere",
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
  { navn: "Fritidshuse pr. helårsbolig", enhed: "boliger/bolig",
    val: fritidshusPrBolig, type: "relativ", kategori: KATEGORI.ENERGI,
    rolle: "hjaelper", paavirkning: "uafklaret",
    begrundelse: "Findes kun for at kvalificere husholdningstallene." },
  { navn: "El-CO2 pr. kWh", enhed: "g/kWh", val: (m) => m.elco2_g_kwh,
    type: "relativ", kategori: KATEGORI.ENERGI, paavirkning: "hoejere",
    begrundelse: "Højere udledning pr. forbrugt kilowatt-time." },
  { navn: "Lokal VE-dækning af elforbrug", enhed: "pct.", val: (m) => m.ve_daekning_pct,
    andel: "0-100",
    type: "relativ", kategori: KATEGORI.ENERGI, rolle: "hjaelper",
    paavirkning: "uafklaret",
    begrundelse: "Et produktionsmål. Den grønne strøm indgår allerede i det "
      + "landsdækkende mix, alle forbruger, så den må ikke tælles som en reduktion "
      + "i kommunens eget forbrug." },
  // De to affaldsnøgletal stod en periode som uafklarede for ALLE 98 kommuner,
  // fordi DST's kommunefordeling for 2023 er upålidelig for nogle af dem.
  // Det var for groft: fejlen rammer de kommuner, der deler indberetning med
  // hinanden, ikke de øvrige 85. Retningen står derfor igen, og forbeholdet
  // sættes pr. kommune ud fra affald_indberetning - se INDBERETNING_FORBEHOLD.
  { navn: "Husholdningsaffald", enhed: "kg/pers.", val: (m) => m.affald_kg,
    type: "relativ", kategori: KATEGORI.PRODUKTER, paavirkning: "hoejere",
    forbeholdFelt: "affald_indberetning",
    begrundelse: "Mere affald peger mod et større materielt forbrug." },
  { navn: "Genanvendelsesprocent", enhed: "pct.", val: (m) => m.genanvendelse_pct,
    andel: "0-100",
    type: "relativ", kategori: KATEGORI.PRODUKTER, paavirkning: "lavere",
    forbeholdFelt: "affald_indberetning",
    begrundelse: "Genanvendte materialer erstatter produktion af nye." },
  { navn: "Boligpris pr. m²", enhed: "kr./m²", val: (m) => m.boligpris_m2,
    type: "relativ", kategori: KATEGORI.KONTEKST, paavirkning: "uafklaret",
    begrundelse: "Boligpris siger noget om købekraft og boligtype, som begge opgøres "
      + "hver for sig." },
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
      + "påviseligt bogført på hinanden for det viste år. Tallet står som "
      + "Danmarks Statistik har offentliggjort det, men det beskriver ikke "
      + "kommunen alene, og retningen gættes derfor ikke.",
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
 *  værktøjet. "uafklaret" når retningen ikke kan begrundes på kildens grundlag,
 *  og "på niveau" når afvigelsen er for lille til at pege nogen vej. */
export function udledningsSignal(afvigelse, paavirkning, kategori) {
  // Kontekst-nøgletal beskriver kommunen uden at pege på en forbrugskategori.
  // Et "uafklaret"-mærkat på dem er redundant - kategorien siger det allerede,
  // og fire ekstra mærkater fik værktøjet til at se rådvildt ud.
  if (kategori === KATEGORI.KONTEKST) return "kontekst";
  if (afvigelse == null || !Number.isFinite(afvigelse)) return "ukendt";
  if (paavirkning == null || paavirkning === "uafklaret") return "uafklaret";
  if (Math.abs(afvigelse) < TAERSKEL_NIVEAU) return "på niveau";
  const peger_op = paavirkning === "hoejere" ? afvigelse > 0 : afvigelse < 0;
  const markant = Math.abs(afvigelse) >= TAERSKEL_MARKANT;
  if (peger_op) return markant ? "markant højere" : "højere";
  return markant ? "markant lavere" : "lavere";
}

/** Sikker beregning: returnerer null hvis resultatet ikke er et endeligt tal
 *  (manglende felt giver NaN/Infinity, som Number.isFinite fanger). */
function sikker(fn, m) {
  const v = fn(m);
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
 *  - eller null for nøgletal uden afvigelse (Gini). */
export function beregnFordeling(kommuner, land) {
  const tabeller = kommuner.map((k) => driverTabel(k, land));
  const fordeling = {};

  DRIVERE.forEach((d, i) => {
    const raekker = tabeller.map((t) => t[i]);
    const afvigelser = raekker.map((r) => r.afvigelse).filter((v) => v != null);
    if (afvigelser.length === 0) {
      fordeling[d.navn] = null; // fx Gini, der har type "ingen"
      return;
    }
    const abs = afvigelser.map(Math.abs).sort((a, b) => a - b);

    fordeling[d.navn] = {
      // n er antal kommuner MED en afvigelse - ikke 98. Boligpris pr. m²
      // mangler for én kommune, og en optælling "af 98" ville påstå en
      // dækning, værktøjet ikke har.
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
    // Kildens pålidelighed for netop denne kommune kan spærre retningen og
    // lægger under alle omstændigheder sin note til begrundelsen.
    const forbehold = d.forbeholdFelt
      ? INDBERETNING_FORBEHOLD[kommune[d.forbeholdFelt]] ?? null
      : null;
    const paavirkning = forbehold?.spaerrer ? "uafklaret" : (d.paavirkning ?? "uafklaret");
    const begrundelse = forbehold
      ? [d.begrundelse, forbehold.note].filter(Boolean).join(" ")
      : (d.begrundelse ?? null);

    const kv = sikker(d.val, kommune);
    const lv = sikker(d.val, land);
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
    // "på niveau" og gøre næsten alle 0-100-andele "markante".
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
      signal: udledningsSignal(afv, paavirkning, d.kategori),
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
  const pr_signal = { "markant højere": 0, "højere": 0, "på niveau": 0,
                      "lavere": 0, "markant lavere": 0, uafklaret: 0,
                      kontekst: 0, ukendt: 0 };
  for (const d of drivere) {
    if (d.rolle === "hjaelper") continue;
    pr_signal[d.signal] = (pr_signal[d.signal] ?? 0) + 1;
  }
  return {
    pr_signal,
    sumHoejere: pr_signal["markant højere"] + pr_signal["højere"],
    sumLavere: pr_signal["markant lavere"] + pr_signal["lavere"],
    ialt: Object.values(pr_signal).reduce((a, b) => a + b, 0),
  };
}

export function driverePrKategori(drivere) {
  // Rækkefølge efter Energistyrelsens nationale vægt, faldende. Fødevarer og
  // Offentligt forbrug har ingen kommunale nøgletal og optræder derfor ikke
  // her, kun i kategorioverblikket.
  const raekkefoelge = [KATEGORI.TRANSPORT, KATEGORI.PRODUKTER, KATEGORI.ENERGI,
                        KATEGORI.BOLIG_BYGGERI, KATEGORI.TVAERS, KATEGORI.KONTEKST];
  return raekkefoelge
    .map((kategori) => ({ kategori, drivere: drivere.filter((d) => d.kategori === kategori) }))
    .filter((g) => g.drivere.length > 0);
}

// Felter, der efterspørges; bruges til at rapportere manglende data pr. kommune.
const FORVENTEDE_FELTER = [
  "disp_indkomst", "folketal", "folketal_forrige", "areal", "formue_gns", "formue_median",
  "gini", "boliger_parcel", "boliger_raekke", "boliger_etage", "boligareal", "byggeri",
  "biler", "biler_el", "biler_plugin", "biler_diesel", "opv_boliger_ialt", "opv_olie",
  "opv_naturgas", "affald_kg", "genanvendelse_pct", "elco2_g_kwh", "boligpris_m2",
  "ve_daekning_pct", "pendlingsafstand_km", "fritidshuse",
  "husholdning_co2_ton", "husholdning_energi_tj", "husholdning_fossil_andel",
];

/** Fuld sammenligning for én kommune: indikatortabel, gruppering og manglende felter. */
export function beregnKommune(kommune, land) {
  const drivere = driverTabel(kommune, land);
  return {
    navn: kommune.navn,
    kode: kommune.kode,
    region: kommune.region,
    drivere,
    grupper: driverePrKategori(drivere),
    manglende: FORVENTEDE_FELTER.filter((f) => kommune[f] == null),
  };
}
