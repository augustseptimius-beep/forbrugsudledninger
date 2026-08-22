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
// forbrugskategori, CONCITO opgør nationalt. Fortolkningen af, hvad tallene
// betyder for CO2, ligger hos CONCITO - ikke her.

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

// Kategorierne er CONCITO's egne fra "Danmarks globale forbrugsudledninger"
// (2023) s. 16, figur 7. "Kontekst" er ikke en CONCITO-kategori, men markerer
// indikatorer, der beskriver kommunen uden at pege på én forbrugskategori.
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

export const KATEGORI = {
  TRANSPORT: "Transport",
  BOLIGER: "Boliger",
  EL_VARME: "El og varme",
  OEVRIGT: "Øvrigt forbrug",
  KONTEKST: "Kontekst",
};

// Hver driver: hvordan værdien beregnes, hvordan afvigelsen dannes, og hvilken
// af CONCITO's forbrugskategorier den oplyser om.
// afvigelsestype: "relativ" = (k−l)/l, "difference" = k−l, "ingen" = kun kontekst.
//
// rolle: "hjaelper" markerer nøgletal, der kun findes for at kvalificere et
// andet tal - lokal VE-dækning forklarer el-CO2, fritidshuse pr. helårsbolig
// forklarer husholdningstallene. De står i tabellen som alle andre, men holdes
// ude af overblikkets fremhævelser, hvor de ellers ville fortrænge de tal, de
// er sat i verden for at forklare.
const DRIVERE = [
  { navn: "Disponibel indkomst", enhed: "kr.", val: (m) => m.disp_indkomst,
    type: "relativ", kategori: KATEGORI.OEVRIGT, paavirkning: "hoejere",
    begrundelse: "CONCITO (2023) s. 6 og s. 30: klimaaftrykket hænger tæt sammen med "
      + "indkomstniveauet, og forbrugsprofilerne stiger fra 8,7 til 25 ton med indkomst." },
  { navn: "Nettoformue (gns.)", enhed: "kr.", val: (m) => m.formue_gns,
    type: "relativ", kategori: KATEGORI.OEVRIGT, paavirkning: "uafklaret",
    begrundelse: "Formue er ikke det samme som forbrug. CONCITO kobler aftrykket til "
      + "indkomst, ikke til formue, så retningen kan ikke afgøres på kildens grundlag." },
  { navn: "Nettoformue (median)", enhed: "kr.", val: (m) => m.formue_median,
    type: "relativ", kategori: KATEGORI.OEVRIGT, paavirkning: "uafklaret",
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
    type: "relativ", kategori: KATEGORI.BOLIGER, paavirkning: "hoejere",
    begrundelse: "Større boliger kræver flere byggematerialer og mere energi at "
      + "opvarme. CONCITO (2023) s. 16 opgør boliger til 1,6 ton pr. dansker." },
  { navn: "Parcelhus-andel", enhed: "pct.", val: parcelAndel,
    type: "relativ", kategori: KATEGORI.BOLIGER, paavirkning: "hoejere",
    begrundelse: "Fritliggende huse er større og har mere ydervæg pr. bolig end "
      + "lejligheder, og bruger derfor mere materiale og energi." },
  { navn: "Byggeaktivitet", enhed: "pr. 1.000 indb.", val: byggeriPr1000,
    type: "relativ", kategori: KATEGORI.BOLIGER, paavirkning: "hoejere",
    begrundelse: "Nybyggeri kræver materialer, hvis udledning ligger i boliger-"
      + "kategorien, CONCITO (2023) s. 16." },
  { navn: "Biler pr. indbygger", enhed: "biler/pers.", val: bilerPrIndb,
    type: "relativ", kategori: KATEGORI.TRANSPORT, paavirkning: "hoejere",
    begrundelse: "Flere biler betyder både mere kørsel og flere producerede "
      + "køretøjer. CONCITO (2023) s. 17 opgør kørsel i personlige transportmidler "
      + "til 1,0 ton og køb af køretøjer til 0,4 ton." },
  { navn: "El- og plugin-hybridandel", enhed: "pct.", val: elPluginAndel,
    type: "relativ", kategori: KATEGORI.TRANSPORT, paavirkning: "lavere",
    begrundelse: "En elbil udleder mindre pr. kørt kilometer end en tilsvarende "
      + "benzin- eller dieselbil på et dansk elnet." },
  { navn: "Diesel-andel", enhed: "pct.", val: dieselAndel,
    type: "relativ", kategori: KATEGORI.TRANSPORT, paavirkning: "uafklaret",
    begrundelse: "En dieselbil udleder typisk MINDRE CO2 pr. kilometer end en "
      + "benzinbil, men køres til gengæld længere. Retningen for CO2 kan ikke "
      + "afgøres på et kildebelagt grundlag, og gættes derfor ikke." },
  { navn: "Gennemsnitlig pendlingsafstand", enhed: "km", val: (m) => m.pendlingsafstand_km,
    type: "relativ", kategori: KATEGORI.TRANSPORT, paavirkning: "hoejere",
    begrundelse: "Længere afstand til arbejde betyder flere kørte kilometer. Siger "
      + "dog intet om transportmiddel." },
  { navn: "Husholdningernes CO2 fra energi", enhed: "ton CO2e/bolig",
    val: husholdningCo2PrBolig, type: "relativ", kategori: KATEGORI.EL_VARME,
    paavirkning: "hoejere",
    begrundelse: "Målt udledning fra borgernes eget energiforbrug i boligen." },
  { navn: "Husholdningernes energiforbrug", enhed: "GJ/bolig",
    val: husholdningEnergiPrBolig, type: "relativ", kategori: KATEGORI.EL_VARME,
    paavirkning: "hoejere",
    begrundelse: "Mere energi brugt i boligen. Udledningen afhænger dog af, hvilken "
      + "energikilde der bruges - se de to øvrige nøgletal." },
  { navn: "Fossil andel af husholdningernes energi", enhed: "pct.",
    val: (m) => m.husholdning_fossil_andel, type: "relativ", kategori: KATEGORI.EL_VARME,
    paavirkning: "hoejere",
    begrundelse: "Naturgas, fyringsolie og LPG udleder ved forbrændingen." },
  { navn: "Fossil opvarmning", enhed: "pct.", val: fossilOpv,
    type: "relativ", kategori: KATEGORI.EL_VARME, paavirkning: "hoejere",
    begrundelse: "Olie- og gasfyr udleder ved forbrændingen i boligen." },
  { navn: "Fritidshuse pr. helårsbolig", enhed: "boliger/bolig",
    val: fritidshusPrBolig, type: "relativ", kategori: KATEGORI.EL_VARME,
    rolle: "hjaelper", paavirkning: "uafklaret",
    begrundelse: "Findes kun for at kvalificere husholdningstallene." },
  { navn: "El-CO2 pr. kWh", enhed: "g/kWh", val: (m) => m.elco2_g_kwh,
    type: "relativ", kategori: KATEGORI.EL_VARME, paavirkning: "hoejere",
    begrundelse: "Højere udledning pr. forbrugt kilowatt-time." },
  { navn: "Lokal VE-dækning af elforbrug", enhed: "pct.", val: (m) => m.ve_daekning_pct,
    type: "relativ", kategori: KATEGORI.EL_VARME, rolle: "hjaelper",
    paavirkning: "uafklaret",
    begrundelse: "Et produktionsmål. Den grønne strøm indgår allerede i det "
      + "landsdækkende mix, alle forbruger, så den må ikke tælles som en reduktion "
      + "i kommunens eget forbrug." },
  { navn: "Husholdningsaffald", enhed: "kg/pers.", val: (m) => m.affald_kg,
    type: "relativ", kategori: KATEGORI.OEVRIGT, paavirkning: "hoejere",
    begrundelse: "Mere affald afspejler et større materielt forbrug. Bruges som "
      + "indikator, fordi kommunalt indkøbsaftryk ikke findes offentligt." },
  { navn: "Genanvendelsesprocent", enhed: "pct.", val: (m) => m.genanvendelse_pct,
    type: "relativ", kategori: KATEGORI.OEVRIGT, paavirkning: "lavere",
    begrundelse: "Genanvendte materialer erstatter produktion af nye." },
  { navn: "Boligpris pr. m²", enhed: "kr./m²", val: (m) => m.boligpris_m2,
    type: "relativ", kategori: KATEGORI.KONTEKST, paavirkning: "uafklaret",
    begrundelse: "Boligpris siger noget om købekraft og boligtype, som begge opgøres "
      + "hver for sig." },
];

// Tærskler for, hvornår en afvigelse kaldes markant. De er en PRÆSENTATIONS-
// beslutning uden kilde - råtallet står altid ved siden af, så læseren kan se
// gennem båndet. Tærsklerne er skrevet frem på metodesiden.
const TAERSKEL_NIVEAU = 0.10;
const TAERSKEL_MARKANT = 0.33;

/** Beskriver afvigelsens størrelse i ord. Ren beskrivelse, ingen vurdering. */
export function niveauBaand(afvigelse) {
  if (afvigelse == null || !Number.isFinite(afvigelse)) return "ukendt";
  const a = Math.abs(afvigelse);
  if (a < TAERSKEL_NIVEAU) return "på niveau";
  if (a < TAERSKEL_MARKANT) return afvigelse > 0 ? "over" : "under";
  return afvigelse > 0 ? "markant over" : "markant under";
}

/** Hvad afvigelsen peger mod for udledningen - den eneste vurdering i
 *  værktøjet. "uafklaret" når retningen ikke kan begrundes på kildens grundlag,
 *  og "på niveau" når afvigelsen er for lille til at pege nogen vej. */
export function udledningsSignal(afvigelse, paavirkning) {
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

/** Byg indikatortabellen: værdi, landsværdi, afvigelse (efter type) og retning. */
export function driverTabel(kommune, land) {
  return DRIVERE.map((d) => {
    const kv = sikker(d.val, kommune);
    const lv = sikker(d.val, land);
    let afv = null;
    if (kv != null && lv != null) {
      if (d.type === "relativ") afv = afvigelse(kv, lv);
      else if (d.type === "difference") afv = kv - lv;
    }
    return {
      navn: d.navn, enhed: d.enhed, type: d.type, kategori: d.kategori,
      rolle: d.rolle ?? "hoved",
      paavirkning: d.paavirkning ?? "uafklaret",
      begrundelse: d.begrundelse ?? null,
      kommuneVaerdi: kv, landVaerdi: lv, afvigelse: afv,
      retning: afv == null ? "kontekst" : afv > 0 ? "over land" : afv < 0 ? "under land" : "på niveau",
      baand: niveauBaand(afv),
      signal: udledningsSignal(afv, d.paavirkning),
    };
  });
}

/** Indikatorerne grupperet efter CONCITO-kategori, i kategoriernes rækkefølge. */
/** Tæller nøgletallenes signaler i en kategori. TÆLLER - vejer ikke. En
 *  vægtet score ville kræve et grundlag, der ikke findes i nogen kilde.
 *
 *  Optællingen ligger i sit eget felt `pr_signal`, og summerne har egne navne.
 *  Lå de side om side, ville nøglen "lavere" betyde to ting - og summen ville
 *  stille overskrive optællingen. */
export function optaelSignaler(drivere) {
  const pr_signal = { "markant højere": 0, "højere": 0, "på niveau": 0,
                      "lavere": 0, "markant lavere": 0, uafklaret: 0, ukendt: 0 };
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
  const raekkefoelge = [KATEGORI.TRANSPORT, KATEGORI.BOLIGER, KATEGORI.EL_VARME,
                        KATEGORI.OEVRIGT, KATEGORI.KONTEKST];
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
