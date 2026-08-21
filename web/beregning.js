// Ren beregningsmotor for forbrugsbaserede udledninger. Ingen I/O.
// Alle konstanter sendes ind via `konst`-argumentet.

/** Relativ afvigelse (kommune − land) / land. Returnerer null hvis input mangler. */
export function afvigelse(kommuneVal, landVal) {
  if (kommuneVal == null || landVal == null || landVal === 0) return null;
  return (kommuneVal - landVal) / landVal;
}

/** Indkomsteffekt i ton. Fortegn følger afvigelsen: negativ når fattigere, positiv når rigere.
 *  Erstatter v5's =-anker*ABS(dev)*elasticitet, som var hardcodet til en kommune under land. */
export function indkomsteffekt(incDev, konst) {
  return {
    low: konst.anker * incDev * konst.elasticitet.low,
    high: konst.anker * incDev * konst.elasticitet.high,
  };
}

/** Fuldført byggeri pr. 1.000 indbyggere (seneste år). */
export function byggeriPr1000(m) {
  if (m.byggeri == null || m.folketal == null || m.folketal === 0) return null;
  return (m.byggeri / m.folketal) * 1000;
}

/** Byggeeffekt i ton. Data-drevet: skalerer med byggeaktivitets-afvigelsen.
 *  Negativ (reduktion) under land, positiv (tillæg) over land.
 *  byggeandel.high er kalibreret så Thisted rammer v5's 0–0,2 ton. */
export function byggeeffekt(byggeDev, konst) {
  return {
    low: konst.anker * konst.byggeandel.low * byggeDev,
    high: konst.anker * konst.byggeandel.high * byggeDev,
  };
}

/** Transporteffekt i ton via regional bil-km-proxy. Null hvis regionen er ukendt. */
export function transporteffekt(region, konst) {
  const dev = konst.bilkm_afvigelse_region[region];
  if (dev == null) return null;
  return {
    low: konst.anker * konst.bilkorsel_andel.low * dev,
    high: konst.anker * konst.bilkorsel_andel.high * dev,
  };
}

/** Samlet førsteordens-estimat pr. borger med interval.
 *  Kerneinput (indkomst, biler, byggeri) skal være til stede; ellers utilstrækkeligt.
 *
 *  Komponenter, der ikke kan opgøres, returneres som null og listes i `uoplyst`.
 *  De bidrager med nul til intervallet - aritmetisk som før - men brugerfladen
 *  skal vise dem som "ikke opgjort", aldrig som et målt nul. Uden den skelnen
 *  læser de fire regioner uden DTU-transporttal et ukendt bidrag som en måling. */
export function estimat(kommune, land, konst) {
  const kerneMangler =
    kommune.disp_indkomst == null || kommune.biler == null || kommune.byggeri == null;
  if (kerneMangler) {
    return { utilstraekkeligt: true, komponenter: null, aftryk: null, uoplyst: [] };
  }

  const incDev = afvigelse(kommune.disp_indkomst, land.disp_indkomst);
  const byggeDev = afvigelse(byggeriPr1000(kommune), byggeriPr1000(land));

  const ie = indkomsteffekt(incDev, konst);
  const be = byggeeffekt(byggeDev, konst);
  const te = transporteffekt(kommune.region, konst);

  const uoplyst = te === null ? ["transport"] : [];
  const teBidrag = te ?? { low: 0, high: 0 };

  const lav = konst.anker + Math.min(ie.low, ie.high) + Math.min(teBidrag.low, teBidrag.high) + Math.min(be.low, be.high);
  const hoj = konst.anker + Math.max(ie.low, ie.high) + Math.max(teBidrag.low, teBidrag.high) + Math.max(be.low, be.high);

  return {
    utilstraekkeligt: false,
    komponenter: { indkomsteffekt: ie, transporteffekt: te, byggeeffekt: be },
    aftryk: { low: lav, high: hoj },
    uoplyst,
  };
}

/** Illustrativ købekrafts-følsomhed (ikke i hovedtallet). Vises KUN når mønstret er gyldigt:
 *  billigere bolig OG lavere indkomst end land (begge afvigelser negative). Aldrig falsk symmetrisk. */
export function boligprisFolsomhed(kommune, land, konst) {
  const incDev = afvigelse(kommune.disp_indkomst, land.disp_indkomst);
  const boligDev = afvigelse(kommune.boligpris_m2, land.boligpris_m2);
  if (incDev == null || boligDev == null) return null;

  const vises = incDev < 0 && boligDev < 0;
  if (!vises) {
    // Ingen falsk symmetri: uden et gyldigt mønster (billigere bolig OG lavere indkomst)
    // ville et beregnet tal være meningsløst, så justeret/reeltGab er null.
    return { vises: false, reeltGab: null, justeret: null };
  }

  const reeltGab = incDev * (1 - konst.boligudgift_modregning);
  return {
    vises: true,
    reeltGab,
    justeret: {
      low: konst.anker * reeltGab * konst.elasticitet.low,
      high: konst.anker * reeltGab * konst.elasticitet.high,
    },
  };
}

const parcelAndel = (m) =>
  m.boliger_parcel / (m.boliger_parcel + m.boliger_raekke + m.boliger_etage);
const dieselAndel = (m) => m.biler_diesel / m.biler;
const elPluginAndel = (m) => (m.biler_el + m.biler_plugin) / m.biler;
const fossilOpv = (m) => (m.opv_olie + m.opv_naturgas) / m.opv_boliger_ialt;
const taethed = (m) => m.folketal / m.areal;
const bilerPrIndb = (m) => m.biler / m.folketal;
const vaekst = (m) => m.folketal / m.folketal_forrige - 1;

// Hver driver: hvordan værdien beregnes + hvordan afvigelsen dannes.
// afvigelsestype: "relativ" = (k−l)/l, "difference" = k−l, "ingen" = kun kontekst.
const DRIVERE = [
  { navn: "Disponibel indkomst", enhed: "kr.", val: (m) => m.disp_indkomst, type: "relativ" },
  { navn: "Nettoformue (gns.)", enhed: "kr.", val: (m) => m.formue_gns, type: "relativ" },
  { navn: "Nettoformue (median)", enhed: "kr.", val: (m) => m.formue_median, type: "relativ" },
  { navn: "Gini-koefficient", enhed: "indeks", val: (m) => m.gini, type: "ingen" },
  { navn: "Befolkningsudvikling", enhed: "pct.", val: vaekst, type: "difference" },
  { navn: "Befolkningstæthed", enhed: "pers./km²", val: taethed, type: "relativ" },
  { navn: "Gennemsnitligt boligareal", enhed: "m²/bolig", val: (m) => m.boligareal, type: "relativ" },
  { navn: "Parcelhus-andel", enhed: "pct.", val: parcelAndel, type: "relativ" },
  { navn: "Byggeaktivitet", enhed: "pr. 1.000 indb.", val: byggeriPr1000, type: "relativ" },
  { navn: "Biler pr. indbygger", enhed: "biler/pers.", val: bilerPrIndb, type: "relativ" },
  { navn: "El- og plugin-hybridandel", enhed: "pct.", val: elPluginAndel, type: "relativ" },
  { navn: "Diesel-andel", enhed: "pct.", val: dieselAndel, type: "relativ" },
  { navn: "Fossil opvarmning", enhed: "pct.", val: fossilOpv, type: "relativ" },
  { navn: "Husholdningsaffald", enhed: "kg/pers.", val: (m) => m.affald_kg, type: "relativ" },
  { navn: "El-CO2 pr. kWh", enhed: "g/kWh", val: (m) => m.elco2_g_kwh, type: "relativ" },
  { navn: "Boligpris pr. m²", enhed: "kr./m²", val: (m) => m.boligpris_m2, type: "relativ" },
  // Lokal VE-dækning er et PRODUKTIONSMÅL og hører logisk sammen med el-CO2:
  // Energinets kommunedeklaration krediterer lokalt forbrugt vedvarende
  // energi som nul-emission, så uden dækningsgraden kan en læser ikke se,
  // hvorfor en vindkommune ligger lavt på el-CO2.
  { navn: "Lokal VE-dækning af elforbrug", enhed: "pct.", val: (m) => m.ve_daekning_pct, type: "relativ" },
];

/** Sikker beregning: returnerer null hvis resultatet ikke er et endeligt tal
 *  (manglende felt giver NaN/Infinity, som Number.isFinite fanger). */
function sikker(fn, m) {
  const v = fn(m);
  return Number.isFinite(v) ? v : null;
}

/** Byg driver-tabellen: værdi, landsværdi, afvigelse (efter type) og retning. */
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
      navn: d.navn, enhed: d.enhed, type: d.type,
      kommuneVaerdi: kv, landVaerdi: lv, afvigelse: afv,
      retning: afv == null ? "kontekst" : afv > 0 ? "over land" : afv < 0 ? "under land" : "på niveau",
    };
  });
}

// Felter, der efterspørges; bruges til at rapportere manglende data pr. kommune.
const FORVENTEDE_FELTER = [
  "disp_indkomst", "folketal", "folketal_forrige", "areal", "formue_gns", "formue_median",
  "gini", "boliger_parcel", "boliger_raekke", "boliger_etage", "boligareal", "byggeri",
  "biler", "biler_el", "biler_plugin", "biler_diesel", "opv_boliger_ialt", "opv_olie",
  "opv_naturgas", "affald_kg", "genanvendelse_pct", "elco2_g_kwh", "boligpris_m2",
  "ve_daekning_pct",
];

/** Fuld beregning for én kommune: estimat + boligpris-følsomhed + driver-tabel + manglende felter. */
export function beregnKommune(kommune, land, konst) {
  const manglende = FORVENTEDE_FELTER.filter((f) => kommune[f] == null);
  return {
    navn: kommune.navn,
    kode: kommune.kode,
    region: kommune.region,
    estimat: estimat(kommune, land, konst),
    boligpris: boligprisFolsomhed(kommune, land, konst),
    drivere: driverTabel(kommune, land),
    manglende,
  };
}
