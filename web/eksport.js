// Regnearkseksporten: kommunens tal, kilder og konklusioner som ét regneark.
// Rene funktioner - data ind, arkmodel ud. Ingen DOM, ingen fetch.
//
// HVORFOR DEN IKKE BARE ER EN CSV-FIL MED TALLENE. En eksport, der kun bærer
// de færdige nøgletal, gør læseren til modtager: han kan se, hvad værktøjet
// nåede frem til, men ikke regne med på det. Arket her bærer derfor ALLE TRE
// LAG - rådata, regnestykke og konklusion - og lægger regnestykket i regnearket
// selv som formler frem for at skrive resultatet ind som tal. Retter man et
// rådatafelt på arket Data, regner afvigelsen, niveauet, retningen og
// kategoriens samlede optælling sig om af sig selv.
//
// HVORFOR MAN IKKE OVERSKRIVER KILDENS TAL. Hvert felt har tre kolonner:
// kildens værdi, en tom celle til ens egen værdi, og en anvendt værdi, der
// vælger den egne, når den findes. Det er den samme regel, resten af repoet
// hviler på - intet tal uden kilde - båret over i et regneark: kildens tal
// bliver stående og kan altid ses, den egne værdi står ved siden af med sin
// egen kildeangivelse, og arket siger til, hvis den mangler.
//
// HVAD DEN IKKE GØR. Den lægger ikke nøgletal sammen til et kommunalt
// klimaaftryk, og den tilføjer ikke en eneste koefficient. Den viser de samme
// tal som kommunesiden, med de samme forbehold, i et format man kan regne
// videre i. Nøgletal, som et forbehold har taget af kommunens side, er heller
// ikke med her - og deres rådatafelter er ikke med på arket Data, så arket
// ikke kan regne et tal ud, siden har gode grunde til ikke at vise.

import { TAERSKEL_NIVEAU, TAERSKEL_MARKANT, TAERSKEL_NUL } from "./beregning.js";
import { kilderForDriver, tal } from "./render.js";
import { kolonneNavn } from "./xlsx.js";

// ---------- Feltkatalog ----------
//
// Rådatafelternes menneskelige navne og enheder. De står her og ikke i
// data.json, fordi de er en egenskab ved eksporten, ikke ved datasættet -
// pipelinen ville ellers skulle kende til et regneark, den aldrig ser.
// test/eksport.test.js fejler, hvis et nøgletal læser et felt, der ikke står
// her, så et nyt felt ikke kan slippe ud i arket uden overskrift.
export const FELTTEKST = {
  folketal: ["Folketal", "personer"],
  folketal_forrige: ["Folketal året før", "personer"],
  disp_indkomst: ["Disponibel indkomst pr. person", "kr./år"],
  boliger_parcel: ["Parcel- og stuehuse", "boliger"],
  boliger_raekke: ["Række-, kæde- og dobbelthuse", "boliger"],
  boliger_etage: ["Etageboliger", "boliger"],
  boligareal: ["Gennemsnitligt boligareal", "m²/bolig"],
  byggeri: ["Fuldført byggeri, seneste år", "boliger"],
  biler: ["Husholdningernes personbiler i alt", "biler"],
  biler_el: ["Heraf eldrevne", "biler"],
  biler_plugin: ["Heraf plugin-hybrider", "biler"],
  biler_diesel: ["Heraf dieseldrevne", "biler"],
  biler_benzin: ["Heraf benzindrevne", "biler"],
  opv_boliger_ialt: ["Boliger med kendt opvarmningsform", "boliger"],
  opv_olie: ["Heraf opvarmet med fyringsolie", "boliger"],
  opv_naturgas: ["Heraf opvarmet med naturgas", "boliger"],
  affald_kg: ["Husholdningsaffald pr. indbygger", "kg/pers."],
  genanvendelse_pct: ["Genanvendelsesprocent", "pct. (0-100)"],
  pendlingsafstand_km: ["Gennemsnitlig pendlingsafstand", "km"],
  fritidshuse: ["Fritidshuse", "boliger"],
  foedevare_forbrug_pr_indb: ["Fødevareforbrug pr. indbygger", "kr./indb./år"],
  husholdning_co2_ton: ["Husholdningernes CO2 fra energi", "ton CO2e"],
  husholdning_energi_tj: ["Husholdningernes energiforbrug", "TJ"],
  husholdning_fossil_andel: ["Fossil andel af husholdningernes energi", "andel (0-1)"],
  husholdning_el_tj: ["Husholdningernes elforbrug", "TJ"],
  husholdning_el_co2_ton: ["Husholdningernes CO2 fra el", "ton CO2e"],
  husholdning_fjernvarme_tj: ["Husholdningernes fjernvarmeforbrug", "TJ"],
  husholdning_fjernvarme_co2_ton: ["Husholdningernes CO2 fra fjernvarme", "ton CO2e"],
  indkoeb_drift_pr_indb: ["Kommunens driftsindkøb", "kr./indb./år"],
  indkoeb_anlaeg_pr_indb: ["Kommunens anlægsindkøb, 5-årigt gns.", "kr./indb./år"],
  indkoeb_foedevarer_pr_indb: ["Kommunens indkøb af fødevarer", "kr./indb./år"],
  indkoeb_braendsel_pr_indb: ["Kommunens indkøb af brændsel og drivmidler", "kr./indb./år"],
};

// ---------- Arket Data: kolonnekort ----------

// Kolonnebogstaver ét sted. Formlerne på de øvrige ark peger herind, og en
// flyttet kolonne ville ellers give et ark, der regner på den forkerte.
const KOL = {
  felt: "A", beskrivelse: "B", enhed: "C",
  kommuneKilde: "D", kommuneEgen: "E", kommuneAnvendt: "F",
  landKilde: "G", landEgen: "H", landAnvendt: "I",
  kilde: "J", periode: "K", egenKilde: "L", tjek: "M",
};
export const DATA_FOERSTE = 5;

// ---------- Formeloversættelse ----------

// Et feltnavn, eventuelt med præfikset `land.`. Tal og operatorer rammes ikke.
const IDENT = /[A-Za-zÀ-ÿ_][A-Za-z0-9À-ÿ_]*(?:\.[A-Za-z0-9_]+)*/g;

/** Felterne i en driverformel, delt i kommunens og landets.
 *  Bruges både af oversættelsen og af testen, der holder formlen op mod
 *  nøgletallets oplyste felter. */
export function formelFelter(formel) {
  const kommune = [];
  const land = [];
  for (const [t] of String(formel).matchAll(IDENT)) {
    if (t.startsWith("land.")) {
      const f = t.slice(5);
      if (!land.includes(f)) land.push(f);
    } else if (!kommune.includes(t)) kommune.push(t);
  }
  return { kommune, land };
}

/** Oversæt en driverformel til en Excel-formel over arket Data.
 *
 *  `side` vælger, hvilken kolonne bare feltnavne peger på: kommunens anvendte
 *  værdi eller landets. Præfikset `land.` peger altid på landets, uanset side -
 *  den fælles el-faktor er landets, også i kommunens egen række.
 *
 *  Hele udtrykket pakkes i to værn, som er selve reglen "manglende data må
 *  aldrig vises som nul", skrevet i regneark: er blot ét af felterne tomt,
 *  bliver resultatet tomt, og en division med nul bliver tom frem for en
 *  fejlkode. Uden det første værn ville Excel læse en tom celle som nul og
 *  svare med et tal, ingen har data for. */
export function tilRegnearksformel(formel, raekkeFor, side = "kommune") {
  const { kommune, land } = formelFelter(formel);
  const adresse = (felt, hvor) => {
    const r = raekkeFor[felt];
    if (r == null) throw new Error(`feltet ${felt} står ikke på arket Data`);
    return `Data!$${hvor === "land" ? KOL.landAnvendt : KOL.kommuneAnvendt}$${r}`;
  };
  const udtryk = String(formel).replace(IDENT, (t) => (t.startsWith("land.")
    ? adresse(t.slice(5), "land")
    : adresse(t, side)));
  const brugte = [
    ...kommune.map((f) => adresse(f, side)),
    ...land.map((f) => adresse(f, "land")),
  ];
  const tomme = [...new Set(brugte)].map((a) => `${a}=""`).join(",");
  return `IF(OR(${tomme}),"",IFERROR(${udtryk},""))`;
}

// ---------- Arket Data ----------

// Advarslen står som én fast tekst, fordi arket Læs mig tæller den op med et
// PRÆCIST COUNTIF. Et jokertegn ville være kortere, men regnemotorer er uenige
// om, hvorvidt "?*" rammer en formel, der returnerer en tom streng - og en
// statuslinje, der påstår 32 manglende kildeangivelser, hvor der er nul, er
// værre end ingen statuslinje.
const MANGLER_KILDE = "Din værdi mangler en kildeangivelse";

const TOM = null;
const r = (...celler) => celler;

/** Felterne bag de nøgletal, kommunen faktisk får vist, i driverrækkefølge.
 *
 *  Kun de viste. Et nøgletal, hvis eget tal er ramt af et forbehold, er taget
 *  af kommunens side, og dets rådata hører så heller ikke i arket: ellers
 *  kunne enhver regne det skjulte tal ud af det ark, siden lige har ladet være
 *  med at vise. Felter, flere nøgletal deler, står én gang. */
export function eksportFelter(drivere) {
  const set = [];
  for (const d of drivere) {
    const { kommune, land } = formelFelter(d.formel);
    for (const f of [...kommune, ...land]) {
      if (FELTTEKST[f] && !set.includes(f)) set.push(f);
    }
  }
  return set;
}

function dataArk(felter, kommune, land, sources, navn) {
  const raekkeFor = {};
  const raekker = [
    r({ v: `Rådata for ${navn} og hele landet`, stil: "titel" }),
    r({ v: "Ret kun i de gule kolonner. Kildens egne tal bliver stående, så de "
         + "altid kan ses, og de gule tal bruges, hvor de er udfyldt.", stil: "note" }),
    r(TOM),
    r({ v: "Felt", stil: "overskrift" }, { v: "Beskrivelse", stil: "overskrift" },
      { v: "Enhed", stil: "overskrift" },
      { v: `${navn}: kildens tal`, stil: "overskrift" },
      { v: `${navn}: din værdi`, stil: "overskrift" },
      { v: `${navn}: anvendt`, stil: "overskrift" },
      { v: "Landet: kildens tal", stil: "overskrift" },
      { v: "Landet: din værdi", stil: "overskrift" },
      { v: "Landet: anvendt", stil: "overskrift" },
      { v: "Kilde", stil: "overskrift" }, { v: "Periode", stil: "overskrift" },
      { v: "Din kilde", stil: "overskrift" }, { v: "Tjek", stil: "overskrift" }),
  ];

  for (const felt of felter) {
    const nr = raekker.length + 1;
    raekkeFor[felt] = nr;
    const [tekst, enhed] = FELTTEKST[felt];
    const kilde = sources?.kilder.find((k) => (k.felter ?? []).includes(felt)) ?? null;
    const c = (bogstav) => `${bogstav}${nr}`;
    raekker.push(r(
      { v: felt, stil: "lille" },
      { v: tekst, stil: "tekst" },
      { v: enhed, stil: "tekst" },
      { v: kommune[felt], stil: "raa" },
      { v: "", stil: "indtast" },
      { f: `IF(${c(KOL.kommuneEgen)}="",${c(KOL.kommuneKilde)},${c(KOL.kommuneEgen)})`,
        stil: "anvendt" },
      { v: land[felt], stil: "raa" },
      { v: "", stil: "indtast" },
      { f: `IF(${c(KOL.landEgen)}="",${c(KOL.landKilde)},${c(KOL.landEgen)})`,
        stil: "anvendt" },
      { v: kilde ? (kilde.kort ?? kilde.id) : "", stil: "tekst" },
      { v: kilde?.periode ?? "", stil: "tekst" },
      { v: "", stil: "indtastTekst" },
      // Værnet mod et tal uden afsender. Sætter man en egen værdi ind uden at
      // skrive hvor den kommer fra, siger arket til - det er den ene regel,
      // hele værktøjet hviler på, og den skal overleve turen ud i et regneark.
      { f: `IF(AND(OR(${c(KOL.kommuneEgen)}<>"",${c(KOL.landEgen)}<>""),`
           + `${c(KOL.egenKilde)}=""),"${MANGLER_KILDE}","")`,
        stil: "advarsel", type: "s" },
    ));
  }

  const sidste = raekker.length;
  return {
    raekkeFor,
    ark: {
      navn: "Data",
      kolonner: [{ bredde: 32 }, { bredde: 38 }, { bredde: 14 }, { bredde: 17 },
                 { bredde: 17 }, { bredde: 17 }, { bredde: 17 }, { bredde: 15 },
                 { bredde: 15 }, { bredde: 22 }, { bredde: 11 }, { bredde: 34 },
                 { bredde: 34 }],
      frys: { raekke: 4, kolonne: 2 },
      autofilter: sidste >= DATA_FOERSTE
        ? `A4:${kolonneNavn(13)}${sidste}` : null,
      raekker,
    },
  };
}

// ---------- Arket Nøgletal ----------

const NOEGLE = {
  kategori: "A", noegletal: "B", enhed: "C", rolle: "D",
  kommune: "E", land: "F", afvigelse: "G", procentpoint: "H",
  niveau: "I", antagelse: "J", retning: "K", forbehold: "L", kilde: "M",
};
export const NOEGLE_FOERSTE = 9;
// Tærsklerne står i celler og ikke som tal inde i formlerne. Så kan man flytte
// grænsen for "markant" og se, hvad den gør ved optællingen, uden at rette i
// 21 formler - og man kan se, at grænsen ER en grænse og ikke en måling.
const T_NIVEAU = "$B$5";
const T_MARKANT = "$B$6";
const T_NUL = "$B$7";

const vaerdiStil = (d) => (d.andel === "0-100" ? "beregnetPct100"
  : d.enhed === "pct." ? "beregnetPct" : "beregnet");

/** Retningen som formel, ord for ord den samme som udledningsSignal(). */
function retningsformel(nr) {
  const a = `$${NOEGLE.afvigelse}${nr}`;
  const k = `$${NOEGLE.antagelse}${nr}`;
  const vej = `IF(IF(${k}="hoejere",${a}>0,${a}<0),"højere","lavere")`;
  return `IF(${a}="","ukendt",IF(${k}="uafklaret","uafklaret",`
    + `IF(ABS(${a})<${T_NUL},"på niveau",`
    + `IF(ABS(${a})>=${T_MARKANT},"markant "&${vej},`
    + `IF(ABS(${a})<${T_NIVEAU},"lidt "&${vej},${vej})))))`;
}

/** Afvigelsens størrelse i ord, ord for ord den samme som niveauBaand(). */
function niveauformel(nr) {
  const a = `$${NOEGLE.afvigelse}${nr}`;
  return `IF(${a}="","ukendt",IF(ABS(${a})<${T_NIVEAU},"på niveau",`
    + `IF(ABS(${a})<${T_MARKANT},IF(${a}>0,"over","under"),`
    + `IF(${a}>0,"markant over","markant under"))))`;
}

function kildetekst(d, sources) {
  const { kilder, reference } = kilderForDriver(d, sources);
  const led = kilder.map((k) => `${k.kort ?? k.id}${k.periode ? ` ${k.periode}` : ""}`);
  if (reference) led.push(`metode: ${reference.kort ?? reference.navn}`);
  return led.join(" · ");
}

function noegletalArk(b, raekkeFor, sources) {
  const raekker = [
    r({ v: `Nøgletal for ${b.navn}`, stil: "titel" }),
    r({ v: "Hvert tal er regnet af arket Data. Ret et rådatafelt dér, og både "
         + "afvigelsen, niveauet og retningen her regner sig om.", stil: "note" }),
    r(TOM),
    r({ v: "Tærskler (må gerne ændres - de er en visningsbeslutning uden kilde)",
        stil: "afsnit" }),
    r({ v: "På niveau under", stil: "tekst" }, { v: TAERSKEL_NIVEAU, stil: "vaerdiPct" },
      { v: "afvigelse fra landsgennemsnittet", stil: "lille" }),
    r({ v: "Markant fra", stil: "tekst" }, { v: TAERSKEL_MARKANT, stil: "vaerdiPct" },
      { v: "afvigelse fra landsgennemsnittet", stil: "lille" }),
    r({ v: "Peger ingen vej under", stil: "tekst" }, { v: TAERSKEL_NUL, stil: "vaerdiPct" },
      { v: "afvigelse, der vises som 0,0 %", stil: "lille" }),
    r({ v: "Kategori", stil: "overskrift" }, { v: "Nøgletal", stil: "overskrift" },
      { v: "Enhed", stil: "overskrift" }, { v: "Rolle", stil: "overskrift" },
      { v: b.navn, stil: "overskrift" }, { v: "Landsgennemsnit", stil: "overskrift" },
      { v: "Afvigelse", stil: "overskrift" }, { v: "Procentpoint", stil: "overskrift" },
      { v: "Niveau", stil: "overskrift" },
      { v: "Antagelse om retning", stil: "overskrift" },
      { v: "Peger mod", stil: "overskrift" }, { v: "Forbehold", stil: "overskrift" },
      { v: "Kilde", stil: "overskrift" }),
  ];

  for (const d of b.drivere) {
    const nr = raekker.length + 1;
    const kom = `$${NOEGLE.kommune}${nr}`;
    const lan = `$${NOEGLE.land}${nr}`;
    const mangler = `${kom}="",${lan}=""`;
    const afv = d.type === "relativ"
      ? `IF(OR(${mangler},${lan}=0),"",(${kom}-${lan})/${lan})`
      : `IF(OR(${mangler}),"",${kom}-${lan})`;
    const pp = d.andel
      ? `IF(OR(${mangler}),"",(${kom}-${lan})*${d.andel === "0-1" ? 100 : 1})`
      : null;
    raekker.push(r(
      { v: d.kategori, stil: "tekst" },
      { v: d.navn, stil: "tekst" },
      { v: d.enhed, stil: "tekst" },
      { v: d.rolle === "hjaelper" ? "forklarende" : "hoved", stil: "tekst" },
      { f: tilRegnearksformel(d.formel, raekkeFor, "kommune"), stil: vaerdiStil(d) },
      { f: tilRegnearksformel(d.formel, raekkeFor, "land"), stil: vaerdiStil(d) },
      { f: afv, stil: "afvigelse" },
      pp ? { f: pp, stil: "vaerdi" } : TOM,
      { f: niveauformel(nr), stil: "beregnet", type: "s" },
      // Antagelsen er nøgletallets eneste vurdering, og den står i en celle,
      // så den kan ses - og prøves af. Skriver man "lavere", vender retningen
      // i kolonnen ved siden af.
      { v: d.paavirkning, stil: "tekst" },
      { f: retningsformel(nr), stil: "signal", type: "s" },
      { v: d.spaerret ? "forbehold: ingen retning" : d.forbeholdNote ? "bemærkning" : "",
        stil: "tekst" },
      { v: kildetekst(d, sources), stil: "lille" },
    ));
  }

  const sidste = raekker.length;
  return {
    sidste,
    ark: {
      navn: "Nøgletal",
      kolonner: [{ bredde: 26 }, { bredde: 36 }, { bredde: 15 }, { bredde: 13 },
                 { bredde: 15 }, { bredde: 16 }, { bredde: 13 }, { bredde: 13 },
                 { bredde: 16 }, { bredde: 18 }, { bredde: 18 }, { bredde: 22 },
                 { bredde: 40 }],
      frys: { raekke: NOEGLE_FOERSTE - 1, kolonne: 2 },
      autofilter: sidste >= NOEGLE_FOERSTE
        ? `A${NOEGLE_FOERSTE - 1}:${kolonneNavn(13)}${sidste}` : null,
      raekker,
    },
  };
}

// ---------- Arket Overblik ----------

/** Kategoriens samlede retning som formel: den tæller, den vejer ikke.
 *
 *  Samme regel som samletRetning() i motoren. Hjælpetal tælles ikke med, og de
 *  to slags "ingen retning" holdes adskilt: et nøgletal uden data er ikke det
 *  samme som et, hvor et forbehold holder retningen tilbage. */
function samletRetningFormel(op, ned, paaNiveau, udenRetning, ialt) {
  return `IF(${ialt}>0,IF(${op}>${ned},"højere",IF(${ned}>${op},"lavere",`
    + `IF(${op}>0,"trækker i hver sin retning","på landsgennemsnittet"))),`
    + `IF(${udenRetning}>0,"retningen kan ikke afgøres","ingen nøgletal"))`;
}

function overblikArk(b, ens, noegleSidste) {
  const omraade = (kol) =>
    `Nøgletal!$${kol}$${NOEGLE_FOERSTE}:$${kol}$${Math.max(NOEGLE_FOERSTE, noegleSidste)}`;
  const kategorier = ens
    ? [...ens.kategorier].sort((a, x) => (a.restpost ? 1 : 0) - (x.restpost ? 1 : 0)
        || x.ton - a.ton)
    : b.grupper.map((g) => ({ navn: g.kategori, ton: null, pct: null, note: null }));

  const raekker = [
    r({ v: `Overblik for ${b.navn}`, stil: "titel" }),
    r({ v: "Optællingen TÆLLER, den vejer ikke. Hvert nøgletal tæller ét, uanset "
         + "om det afviger 2 eller 40 procent. En vægtning ville kræve at vide, hvor "
         + "meget hvert nøgletal betyder for udledningen, og det tal findes ikke i "
         + "kilderne. Kategorierne og deres vægt er nationale og ordret ens for alle "
         + "98 kommuner - kun optællingen er kommunens.", stil: "note" }),
    r({ v: "Tallene her er formler over arket Nøgletal. Retter du et rådatafelt på "
         + "arket Data, følger optællingen med.", stil: "note" }),
    r(TOM),
    r({ v: "Kategori", stil: "overskrift" },
      { v: "Andel af nationalt aftryk", stil: "overskrift" },
      { v: "Ton CO2e pr. indb. (DK)", stil: "overskrift" },
      { v: "Nøgletal med retning", stil: "overskrift" },
      { v: "Peger højere", stil: "overskrift" },
      { v: "Peger lavere", stil: "overskrift" },
      { v: "På niveau", stil: "overskrift" },
      { v: "Uden retning", stil: "overskrift" },
      { v: "Uden data", stil: "overskrift" },
      { v: "Samlet retning", stil: "overskrift" },
      { v: "Kategoriens note", stil: "overskrift" }),
  ];

  for (const k of kategorier) {
    const nr = raekker.length + 1;
    const navn = `$A${nr}`;
    // COUNTIFS over arket Nøgletal: kategorien, rollen og retningens ordlyd.
    // Jokertegnet *højere fanger "markant højere", "højere" og "lidt højere",
    // præcis som motorens endsWith.
    const tael = (kriterium) =>
      `COUNTIFS(${omraade(NOEGLE.kategori)},${navn},${omraade(NOEGLE.rolle)},"hoved",`
      + `${omraade(NOEGLE.retning)},${kriterium})`;
    const op = `E${nr}`;
    const ned = `F${nr}`;
    const paaNiveau = `G${nr}`;
    const udenRetning = `H${nr}`;
    raekker.push(r(
      { v: k.navn, stil: "tekst" },
      k.pct != null ? { v: k.pct / 100, stil: "beregnetPct" } : TOM,
      k.ton != null ? { v: k.ton, stil: "ton" } : TOM,
      { f: `${op}+${ned}+${paaNiveau}`, stil: "antal" },
      { f: tael('"*højere"'), stil: "antal" },
      { f: tael('"*lavere"'), stil: "antal" },
      { f: tael('"på niveau"'), stil: "antal" },
      { f: tael('"uafklaret"'), stil: "antal" },
      { f: tael('"ukendt"'), stil: "antal" },
      { f: samletRetningFormel(op, ned, paaNiveau, udenRetning, `D${nr}`),
        stil: "signal", type: "s" },
      { v: k.note ?? "", stil: "lille" },
    ));
  }

  raekker.push(r(TOM));
  raekker.push(r({ v: "Værktøjet lægger ikke kategorierne sammen til et kommunalt "
    + "klimaaftryk. Et sådant tal ville kræve koefficienter, som ingen af kilderne "
    + "har - se arket Læs mig.", stil: "note" }));

  return {
    navn: "Overblik",
    kolonner: [{ bredde: 30 }, { bredde: 14 }, { bredde: 14 }, { bredde: 13 },
               { bredde: 12 }, { bredde: 12 }, { bredde: 11 }, { bredde: 12 },
               { bredde: 11 }, { bredde: 26 }, { bredde: 60 }],
    frys: { raekke: 5, kolonne: 1 },
    raekker,
  };
}

// ---------- Arket Grundlag ----------

function grundlagArk(b, sources) {
  const raekker = [
    r({ v: `Grundlaget bag hvert nøgletal for ${b.navn}`, stil: "titel" }),
    r({ v: "Retningen er værktøjets eneste vurdering. Den står her med sin "
         + "begrundelse og sin kilde, så den kan prøves efter.", stil: "note" }),
    r(TOM),
    r({ v: "Nøgletal", stil: "overskrift" }, { v: "Kategori", stil: "overskrift" },
      { v: "Rolle", stil: "overskrift" },
      { v: "Antagelse om retning", stil: "overskrift" },
      { v: "Afvigelsen måles som", stil: "overskrift" },
      { v: "Regnestykke", stil: "overskrift" },
      { v: "Felter i data", stil: "overskrift" },
      { v: "Kilder", stil: "overskrift" },
      { v: "Begrundelse", stil: "overskrift" },
      { v: "Forbehold for denne kommune", stil: "overskrift" }),
  ];

  for (const d of b.drivere) {
    raekker.push({
      hoejde: 58,
      celler: r(
        { v: d.navn, stil: "tekst" },
        { v: d.kategori, stil: "tekst" },
        { v: d.rolle === "hjaelper" ? "forklarende" : "hoved", stil: "tekst" },
        { v: d.paavirkning, stil: "tekst" },
        { v: d.type === "relativ" ? "relativ afvigelse" : "procentpoint", stil: "tekst" },
        { v: d.formel, stil: "lille" },
        { v: d.felter.join(", "), stil: "lille" },
        { v: kildetekst(d, sources), stil: "lille" },
        { v: d.begrundelse ?? "", stil: "tekst" },
        { v: d.forbeholdNote ?? "", stil: "tekst" },
      ),
    });
  }

  if (b.udeladt.length > 0) {
    raekker.push(r(TOM));
    raekker.push(r({ v: `Nøgletal, der ikke vises for ${b.navn}`, stil: "afsnit" }));
    raekker.push(r({ v: "Et nøgletal, hvis eget tal er ramt af et forbehold, er taget "
      + "af kommunens side, og dets rådata står heller ikke på arket Data. Nøgletal, "
      + "hvor kun retningen er holdt tilbage, står i tabellen ovenfor med deres tal.",
      stil: "note" }));
    raekker.push(r({ v: "Nøgletal", stil: "overskrift" },
      { v: "Kategori", stil: "overskrift" }, { v: "Rolle", stil: "overskrift" },
      { v: "Begrundelse", stil: "overskrift" }));
    for (const u of b.udeladt) {
      raekker.push({
        hoejde: 58,
        celler: r({ v: u.navn, stil: "tekst" }, { v: u.kategori, stil: "tekst" },
          { v: "udeladt", stil: "tekst" }, { v: u.note ?? "", stil: "tekst" }),
      });
    }
  }

  return {
    navn: "Grundlag",
    kolonner: [{ bredde: 34 }, { bredde: 26 }, { bredde: 13 }, { bredde: 18 },
               { bredde: 18 }, { bredde: 46 }, { bredde: 38 }, { bredde: 34 },
               { bredde: 80 }, { bredde: 60 }],
    frys: { raekke: 4, kolonne: 1 },
    raekker,
  };
}

// ---------- Arket Kilder ----------

const link = (url, tekst) => (url
  ? { f: `HYPERLINK("${String(url).replace(/"/g, "")}","${String(tekst).replace(/"/g, "")}")`,
      stil: "link", type: "s" }
  : { v: tekst, stil: "tekst" });

function kilderArk(sources, felter) {
  const brugt = new Set(felter);
  const raekker = [
    r({ v: "Kilder", stil: "titel" }),
    r({ v: "Kataloget kommer fra pipelinen, ikke fra en liste skrevet i hånden. "
         + "Periode og licens er dem, der faktisk blev hentet.", stil: "note" }),
    r(TOM),
    r({ v: "Id", stil: "overskrift" }, { v: "Kilde", stil: "overskrift" },
      { v: "Udbyder", stil: "overskrift" }, { v: "Hentet", stil: "overskrift" },
      { v: "Licens", stil: "overskrift" }, { v: "Periode", stil: "overskrift" },
      { v: "Felter", stil: "overskrift" }, { v: "Bruges i dette ark", stil: "overskrift" },
      { v: "Link", stil: "overskrift" }, { v: "Forbehold", stil: "overskrift" }),
  ];
  for (const k of sources.kilder) {
    const egne = k.felter ?? [];
    raekker.push({
      hoejde: 52,
      celler: r(
        { v: k.id, stil: "lille" }, { v: k.navn, stil: "tekst" },
        { v: k.udbyder ?? "", stil: "tekst" },
        { v: k.metode === "api" ? "API" : "manuelt", stil: "tekst" },
        { v: k.licens ?? "", stil: "tekst" }, { v: k.periode ?? "", stil: "tekst" },
        { v: egne.join(", "), stil: "lille" },
        { v: egne.some((f) => brugt.has(f)) ? "ja" : "nej", stil: "tekst" },
        link(k.url, k.kort ?? k.id),
        { v: k.forbehold ?? "", stil: "tekst" },
      ),
    });
  }

  raekker.push(r(TOM));
  raekker.push(r({ v: "Referencer", stil: "afsnit" }));
  raekker.push(r({ v: "Rapporter, som retningerne og afgrænsningerne er hentet fra. "
    + "De leverer ikke tal til arket; de leverer begrundelserne.", stil: "note" }));
  raekker.push(r({ v: "Id", stil: "overskrift" }, { v: "Reference", stil: "overskrift" },
    { v: "Udgiver", stil: "overskrift" }, { v: "År", stil: "overskrift" },
    { v: "Anvendes til", stil: "overskrift" }, { v: "Sider", stil: "overskrift" },
    { v: "Link", stil: "overskrift" }));
  for (const ref of sources.referencer ?? []) {
    raekker.push({
      hoejde: 66,
      celler: r(
        { v: ref.id, stil: "lille" }, { v: ref.kort ?? ref.navn, stil: "tekst" },
        { v: ref.udgiver ?? "", stil: "tekst" },
        ref.aar != null ? { v: ref.aar, stil: "antal" } : TOM,
        { v: ref.anvendes_til ?? "", stil: "tekst" },
        { v: ref.sider ?? ref.afsnit ?? "", stil: "tekst" },
        link(ref.url, ref.kort ?? ref.id),
      ),
    });
  }

  return {
    navn: "Kilder",
    kolonner: [{ bredde: 30 }, { bredde: 40 }, { bredde: 26 }, { bredde: 11 },
               { bredde: 13 }, { bredde: 11 }, { bredde: 40 }, { bredde: 17 },
               { bredde: 28 }, { bredde: 80 }],
    frys: { raekke: 4, kolonne: 1 },
    raekker,
  };
}

// ---------- Arket Nationalt ----------

function nationaltArk(ens) {
  if (!ens) return null;
  const raekker = [
    r({ v: "Det nationale aftryk", stil: "titel" }),
    r({ v: `${ens.kilde.udgiver}: ${ens.kilde.titel}`, stil: "tekst" }),
    r({ v: "Opgørelsesår", stil: "fed" }, { v: ens.nationalt_aftryk.aar, stil: "antal" }),
    r({ v: "Ton CO2e pr. indbygger", stil: "fed" },
      { v: ens.nationalt_aftryk.ton, stil: "ton" }),
    r({ v: "Note", stil: "fed" }, { v: ens.nationalt_aftryk.note ?? "", stil: "tekst" }),
    r({ v: "Datagrundlag", stil: "fed" }, { v: ens.kilde.datagrundlag ?? "", stil: "tekst" }),
    r({ v: "Link", stil: "fed" }, link(ens.kilde.url, ens.kilde.id)),
    r(TOM),
    r({ v: "Forbrugsgrupper", stil: "afsnit" }),
    r({ v: "Vægtene er nationale og ordret ens for alle 98 kommuner. De siger, hvor "
         + "meget kategorien fylder i Danmarks aftryk, ikke hvor meget den fylder i "
         + "kommunens.", stil: "note" }),
    r({ v: "Kategori", stil: "overskrift" },
      { v: "Ton CO2e pr. indb.", stil: "overskrift" },
      { v: "Andel", stil: "overskrift" }, { v: "Restpost", stil: "overskrift" },
      { v: "Poster i opgørelsen", stil: "overskrift" }, { v: "Note", stil: "overskrift" }),
  ];
  for (const k of ens.kategorier) {
    raekker.push({
      hoejde: 44,
      celler: r({ v: k.navn, stil: "tekst" }, { v: k.ton, stil: "ton" },
        { v: k.pct / 100, stil: "beregnetPct" },
        { v: k.restpost ? "ja" : "", stil: "tekst" },
        { v: (k.poster ?? []).join("; "), stil: "lille" },
        { v: k.note ?? "", stil: "tekst" }),
    });
  }
  raekker.push(r(TOM));
  raekker.push(r({ v: "Udvikling", stil: "afsnit" }));
  raekker.push(r({ v: "År", stil: "overskrift" },
    { v: "Ton CO2e pr. indbygger", stil: "overskrift" }));
  for (const u of ens.udvikling ?? []) {
    raekker.push(r({ v: u.aar, stil: "antal" }, { v: u.ton, stil: "ton" }));
  }

  return {
    navn: "Nationalt",
    kolonner: [{ bredde: 32 }, { bredde: 18 }, { bredde: 12 }, { bredde: 11 },
               { bredde: 52 }, { bredde: 70 }],
    raekker,
  };
}

// ---------- Arket Læs mig ----------

function laesMigArk(b, sources, ens, genereret, url, felter, dataSidste) {
  const tael = (kol) => `COUNTA(Data!$${kol}$${DATA_FOERSTE}:$${kol}$${dataSidste})`;
  const raekker = [
    r({ v: `Forbrugsbaserede udledninger: ${b.navn}`, stil: "titel" }),
    r({ v: "Uofficielt værktøj. Ingen myndighed står bag. Tallene er faktuelle "
         + "nøgletal fra offentlige registre, stillet op mod landsgennemsnittet og sat "
         + "ved siden af Energistyrelsens nationale opgørelse. De er ikke en beregning "
         + "af kommunens klimaaftryk, ikke en myndighedsopgørelse, og de egner sig "
         + "ikke til at rangordne kommuner mod hinanden.", stil: "note" }),
    r(TOM),
    r({ v: "Kommune", stil: "fed" }, { v: b.navn, stil: "tekst" }),
    r({ v: "Kommunekode", stil: "fed" }, { v: b.kode, stil: "antal" }),
    r({ v: "Region", stil: "fed" }, { v: b.region ?? "", stil: "tekst" }),
    r({ v: "Datasæt hentet", stil: "fed" }, { v: sources.genereret ?? "", stil: "tekst" }),
    r({ v: "Ark dannet", stil: "fed" }, { v: genereret, stil: "tekst" }),
    ens ? r({ v: "Nationalt aftryk", stil: "fed" },
      // Dansk komma. Tallet står i brødtekst, ikke i en talcelle, så
      // regnearkets eget format når det ikke.
      { v: `${tal(ens.nationalt_aftryk.ton, 2)} ton CO2e pr. indbygger `
           + `(${ens.kilde.udgiver}, ${ens.nationalt_aftryk.aar})`, stil: "tekst" }) : TOM,
    url ? r({ v: "Kommunens side", stil: "fed" }, link(url, url)) : TOM,
    r(TOM),
    r({ v: "Arkene", stil: "afsnit" }),
    r({ v: "Overblik", stil: "fed" },
      { v: "Kategori for kategori: kategoriens vægt i Danmarks aftryk, og hvor mange "
           + "af kommunens nøgletal der peger hver sin vej. Optællingen tæller, den "
           + "vejer ikke.", stil: "tekst" }),
    r({ v: "Nøgletal", stil: "fed" },
      { v: "Kommunens tal, landsgennemsnittet, afvigelsen og retningen. Alle tal er "
           + "formler over arket Data.", stil: "tekst" }),
    r({ v: "Data", stil: "fed" },
      { v: "Rådata med kilde og periode. Det er her, du retter.", stil: "tekst" }),
    r({ v: "Grundlag", stil: "fed" },
      { v: "Hvorfor hvert nøgletal peger, som det gør, hvilke felter det læser, og "
           + "hvilke forbehold der gælder for netop denne kommune.", stil: "tekst" }),
    r({ v: "Kilder", stil: "fed" },
      { v: "Kildekataloget med tabel-id, årgang, licens og forbehold, plus de "
           + "rapporter, retningerne er hentet fra.", stil: "tekst" }),
    ens ? r({ v: "Nationalt", stil: "fed" },
      { v: "Energistyrelsens forbrugsgrupper med vægt og udviklingen over årene.",
        stil: "tekst" }) : TOM,
    r(TOM),
    r({ v: "Sådan sætter du dine egne tal ind", stil: "afsnit" }),
    r({ v: "1.", stil: "fed" },
      { v: "Gå til arket Data og find feltet. De gule celler er dine.", stil: "tekst" }),
    r({ v: "2.", stil: "fed" },
      { v: "Skriv din værdi i kolonnen \"din værdi\". Kildens eget tal bliver "
           + "stående ved siden af, så forskellen altid kan ses.", stil: "tekst" }),
    r({ v: "3.", stil: "fed" },
      { v: "Skriv hvor tallet kommer fra i kolonnen \"Din kilde\". Kolonnen Tjek "
           + "siger til, hvis den mangler. Det er den ene regel, hele værktøjet "
           + "hviler på: intet tal uden kilde.", stil: "tekst" }),
    r({ v: "4.", stil: "fed" },
      { v: "Arkene Nøgletal og Overblik regner sig om af sig selv. Vil du prøve en "
           + "anden grænse for \"markant\", står tærsklerne øverst på arket Nøgletal, "
           + "og vil du prøve en anden retningsantagelse, står den i kolonnen "
           + "\"Antagelse om retning\" samme sted.", stil: "tekst" }),
    r({ v: "5.", stil: "fed" },
      { v: "Sletter du din værdi igen, falder arket tilbage på kildens tal.",
        stil: "tekst" }),
    r(TOM),
    r({ v: "Status", stil: "afsnit" }),
    r({ v: "Rådatafelter i arket", stil: "fed" }, { v: felter.length, stil: "antal" }),
    r({ v: "Egne værdier indsat", stil: "fed" },
      { f: `${tael(KOL.kommuneEgen)}+${tael(KOL.landEgen)}`, stil: "antal" }),
    r({ v: "Felter uden kildeangivelse", stil: "fed" },
      { f: `COUNTIF(Data!$${KOL.tjek}$${DATA_FOERSTE}:$${KOL.tjek}$${dataSidste},`
           + `"${MANGLER_KILDE}")`, stil: "antal" }),
    r({ v: "Nøgletal vist", stil: "fed" }, { v: b.drivere.length, stil: "antal" }),
    r({ v: "Nøgletal udeladt for kommunen", stil: "fed" },
      { v: b.udeladt.length, stil: "antal" }),
    r(TOM),
    r({ v: "Det arket ikke gør", stil: "afsnit" }),
    r({ v: "Det lægger ikke nøgletallene sammen til et kommunalt klimaaftryk i ton. "
         + "Et sådant tal ville kræve en indkomstelasticitet, en bilkørselsandel og en "
         + "byggeandel, som hverken CONCITO (2023) eller NIRAS (2024) har, og som ingen "
         + "offentlig kilde fordeler på kommuner. Det tilføjer heller ingen "
         + "koefficient af sig selv: hvert tal på arkene er enten hentet fra et "
         + "offentligt register eller afskrevet fra en navngiven rapport med "
         + "sidehenvisning.", stil: "note" }),
    r({ v: "Retningen er værktøjets eneste vurdering, og den handler om udledningen, "
         + "ikke om værdien: færre elbiler er en lavere andel, men peger mod højere "
         + "udledning. Kan retningen ikke begrundes på en kilde, står den som "
         + "uafklaret frem for at blive gættet.", stil: "note" }),
    r({ v: "Tærsklerne på arket Nøgletal er en visningsbeslutning uden kilde. Råtallet "
         + "står altid ved siden af, så man kan se gennem båndet.", stil: "note" }),
    r({ v: "Licens: data fra Danmarks Statistik under CC BY 4.0. Se arket Kilder for "
         + "den enkelte kildes licens og forbehold.", stil: "note" }),
  ].filter(Boolean);

  return {
    navn: "Læs mig",
    gitter: false,
    kolonner: [{ bredde: 32 }, { bredde: 110 }],
    raekker,
  };
}

// ---------- Samlingen ----------

/** Filnavn uden mappe: kommune, dato og endelse. Æ, Ø og Å og mellemrum går
 *  igennem for mange filsystemer og mailklienter uden at overleve, så de
 *  oversættes frem for at blive fjernet. */
export function eksportFilnavn(navn, dato) {
  const ren = String(navn)
    .replace(/æ/gi, "ae").replace(/ø/gi, "oe").replace(/å/gi, "aa")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `forbrugsudledninger-${ren.toLowerCase()}-${dato}.xlsx`;
}

/** Hele projektmappen for én kommune.
 *
 *  `b` er beregnKommune()'s resultat - altså præcis de nøgletal, kommunens egen
 *  side viser, med de samme forbehold. Eksporten vælger ikke selv, hvad der
 *  kommer med; den følger motoren. */
export function byggProjektmappe({ b, kommune, land, sources, ens, genereret, url = null }) {
  const felter = eksportFelter(b.drivere);
  const { ark: data, raekkeFor } = dataArk(felter, kommune, land, sources, b.navn);
  const dataSidste = Math.max(DATA_FOERSTE, data.raekker.length);
  const { ark: noegletal, sidste } = noegletalArk(b, raekkeFor, sources);
  return [
    laesMigArk(b, sources, ens, genereret, url, felter, dataSidste),
    overblikArk(b, ens, sidste),
    noegletal,
    data,
    grundlagArk(b, sources),
    kilderArk(sources, felter),
    nationaltArk(ens),
  ].filter(Boolean);
}
