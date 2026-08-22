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
const DRIVERE = [
  { navn: "Disponibel indkomst", enhed: "kr.", val: (m) => m.disp_indkomst,
    type: "relativ", kategori: KATEGORI.OEVRIGT },
  { navn: "Nettoformue (gns.)", enhed: "kr.", val: (m) => m.formue_gns,
    type: "relativ", kategori: KATEGORI.OEVRIGT },
  { navn: "Nettoformue (median)", enhed: "kr.", val: (m) => m.formue_median,
    type: "relativ", kategori: KATEGORI.OEVRIGT },
  { navn: "Gini-koefficient", enhed: "indeks", val: (m) => m.gini,
    type: "ingen", kategori: KATEGORI.KONTEKST },
  { navn: "Befolkningsudvikling", enhed: "pct.", val: vaekst,
    type: "difference", kategori: KATEGORI.KONTEKST },
  { navn: "Befolkningstæthed", enhed: "pers./km²", val: taethed,
    type: "relativ", kategori: KATEGORI.KONTEKST },
  { navn: "Gennemsnitligt boligareal", enhed: "m²/bolig", val: (m) => m.boligareal,
    type: "relativ", kategori: KATEGORI.BOLIGER },
  { navn: "Parcelhus-andel", enhed: "pct.", val: parcelAndel,
    type: "relativ", kategori: KATEGORI.BOLIGER },
  { navn: "Byggeaktivitet", enhed: "pr. 1.000 indb.", val: byggeriPr1000,
    type: "relativ", kategori: KATEGORI.BOLIGER },
  { navn: "Biler pr. indbygger", enhed: "biler/pers.", val: bilerPrIndb,
    type: "relativ", kategori: KATEGORI.TRANSPORT },
  { navn: "El- og plugin-hybridandel", enhed: "pct.", val: elPluginAndel,
    type: "relativ", kategori: KATEGORI.TRANSPORT },
  { navn: "Diesel-andel", enhed: "pct.", val: dieselAndel,
    type: "relativ", kategori: KATEGORI.TRANSPORT },
  { navn: "Gennemsnitlig pendlingsafstand", enhed: "km", val: (m) => m.pendlingsafstand_km,
    type: "relativ", kategori: KATEGORI.TRANSPORT },
  { navn: "Husholdningernes CO2 fra energi", enhed: "ton CO2e/bolig",
    val: husholdningCo2PrBolig, type: "relativ", kategori: KATEGORI.EL_VARME },
  { navn: "Husholdningernes energiforbrug", enhed: "GJ/bolig",
    val: husholdningEnergiPrBolig, type: "relativ", kategori: KATEGORI.EL_VARME },
  { navn: "Fossil andel af husholdningernes energi", enhed: "pct.",
    val: (m) => m.husholdning_fossil_andel, type: "relativ", kategori: KATEGORI.EL_VARME },
  { navn: "Fossil opvarmning", enhed: "pct.", val: fossilOpv,
    type: "relativ", kategori: KATEGORI.EL_VARME },
  { navn: "Fritidshuse pr. helårsbolig", enhed: "boliger/bolig",
    val: fritidshusPrBolig, type: "relativ", kategori: KATEGORI.EL_VARME },
  { navn: "El-CO2 pr. kWh", enhed: "g/kWh", val: (m) => m.elco2_g_kwh,
    type: "relativ", kategori: KATEGORI.EL_VARME },
  { navn: "Lokal VE-dækning af elforbrug", enhed: "pct.", val: (m) => m.ve_daekning_pct,
    type: "relativ", kategori: KATEGORI.EL_VARME },
  { navn: "Husholdningsaffald", enhed: "kg/pers.", val: (m) => m.affald_kg,
    type: "relativ", kategori: KATEGORI.OEVRIGT },
  { navn: "Genanvendelsesprocent", enhed: "pct.", val: (m) => m.genanvendelse_pct,
    type: "relativ", kategori: KATEGORI.OEVRIGT },
  { navn: "Boligpris pr. m²", enhed: "kr./m²", val: (m) => m.boligpris_m2,
    type: "relativ", kategori: KATEGORI.KONTEKST },
];

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
      kommuneVaerdi: kv, landVaerdi: lv, afvigelse: afv,
      retning: afv == null ? "kontekst" : afv > 0 ? "over land" : afv < 0 ? "under land" : "på niveau",
    };
  });
}

/** Indikatorerne grupperet efter CONCITO-kategori, i kategoriernes rækkefølge. */
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
