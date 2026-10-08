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

// Strøm og fjernvarme har hver sin kommunale faktor.
//
// Klimaregnskabet giver hver kommune sin egen el-udledning ud fra den el, der
// produceres i kommunen. Den bruges ikke: husholdningernes elforbrug (TJ) ganges i
// stedet med Energinets miljødeklaration for kommunen (husholdning_el_faktor, g CO2e
// pr. kWh, 125 %-metoden), som er myndighedens eget kommunale tal. Energinet lader
// vedvarende energi produceret i kommunen dække kommunens forbrug først og dækker
// resten med transmissionsnettets blanding inklusive import. Landets faktor er det
// elforbrugsvægtede gennemsnit af kommunernes, så landstallet er summen af
// kommunernes. Se pipeline/energinet.py og metodesiden.
//
// Mangler faktoren, mangler nøgletallet: et felt, der mangler, er null, og null er
// nul i JavaScript. elFaktor() giver NaN i stedet, så regnestykket ender som "ingen
// data" og ikke som en elforbruger uden udledning.
//
// Fjernvarme leveres i rør fra kommunens eget net, og Klimaregnskabet beregner
// faktoren pr. net efter Energistyrelsens anbefaling. Den bruges, som den er.
const KWH_PR_TJ = 1e12 / 3.6e6;
const elFaktor = (m) => m.husholdning_el_faktor ?? NaN;
const husholdningCo2PrBolig = (m) =>
  (m.husholdning_co2_ton - m.husholdning_el_co2_ton
    + (m.husholdning_el_tj * KWH_PR_TJ * elFaktor(m)) / 1e6) / alleBoliger(m);
const fjernvarmeCo2PrKwh = (m) =>
  (m.husholdning_fjernvarme_co2_ton * 1e6) / (m.husholdning_fjernvarme_tj * KWH_PR_TJ);

// Forbehold, der gælder for netop én kommune. En driver med et forbehold kalder
// funktionen med kommunens data; får den {spaerrer, skjuler, note} tilbage,
// lægges noten til begrundelsen.
//
// DE TO FLAG GØR HVER SIT, og forskellen er hele pointen:
//
//   spaerrer  retningen kan ikke afgøres, så nøgletallet står uden RETNING -
//             men med et mærkat, der siger hvorfor. Tallet selv er rigtigt og
//             bliver stående.
//   skjuler   selve tallet er ramt, så det tages af kommunens side. Noten
//             står i stedet under tabellen. Indebærer spaerrer - det udledes i
//             driverTabel, så et forbehold ikke kan glemme at sætte begge.
//
// De var længe det samme flag, og det kostede: færgeforbeholdet var ment som
// det første - kommentaren nedenfor sagde "tallet fjernes ikke" - men fjernede
// i praksis alle fire indkøbsnøgletal fra Læsø, Samsø og Ærø. Færgen gør
// SAMMENLIGNINGEN pr. indbygger skæv, ikke bogføringen; kronerne er udløst og
// brændstoffet brændt. Affaldsforbeholdet er det modsatte: dér er tonnagen
// bogført på den forkerte kommune, og så er tallet ikke kommunens at vise.
//
// Fritidshuse: husholdningstallene er fordelt på samtlige boliger, og et
// fritidshus bruger mindre energi end en helårsbolig. Har kommunen flere
// fritidshuse end helårsboliger, trækkes gennemsnittet ned med en størrelse, der
// ikke kan opgøres, og et "lavere" ville være fordelingens, ikke kommunens.
// Grænsen er metodesidens egen formulering. Den fossile andel rammes ikke - den
// er ikke fordelt på boliger.
const FRITIDSHUS_FORBEHOLD = {
  spaerrer: true, skjuler: true,
  note: "Kommunen har flere fritidshuse end helårsboliger. Husholdningstallene er "
    + "fordelt på samtlige boliger, og da et fritidshus bruger mindre energi end en "
    + "helårsbolig, trækkes gennemsnittet ned med en størrelse, der ikke kan opgøres. "
    + "Et lavere tal ville derfor være fordelingens, ikke kommunens.",
};
const fritidshusForbehold = (m) => (fritidshusPrBolig(m) > 1 ? FRITIDSHUS_FORBEHOLD : null);
const affaldForbehold = (m) => INDBERETNING_FORBEHOLD[m.affald_indberetning] ?? null;

/** Gennemsnitsindkomsten er følsom over for få personer med meget stor
 *  kapitalindkomst. I en lille kommune kan én husstand flytte gennemsnittet
 *  flere procent, og så beskriver tallet ikke længere, hvordan borgerne lever.
 *
 *  Retningen spærres IKKE. Tallet er rigtigt: pengene er der, og de er
 *  borgernes. Men de er så skævt fordelt, at gennemsnittet siger noget andet
 *  end det læseren tror. Læseren skal have det at vide, ikke fratages tallet.
 *
 *  Pipelinen finder dem ved at holde væksten i disponibel indkomst op mod
 *  kommunens egen lønvækst over tre år - se klassificer_indkomst i
 *  fetch_dst.py. */
const INDKOMST_FORBEHOLD = {
  trukket_af_faa: {
    spaerrer: false,
    note: "Bemærk: kommunens disponible indkomst er vokset markant hurtigere end "
      + "lønnen i kommunen over de seneste tre år. Forskellen kommer fra "
      + "kapitalindkomst hos få personer, og gennemsnittet er derfor trukket op "
      + "af nogle få husstande frem for af, hvordan borgerne i almindelighed lever.",
  },
};
const indkomstForbehold = (m) => INDKOMST_FORBEHOLD[m.indkomst_robusthed] ?? null;

/** Kommunens indkøb domineres af hovedkonto 2, Transport og infrastruktur.
 *
 *  Det er færgedrift. Læsø, Samsø og Ærø bruger 42-52 % af deres samlede
 *  indkøb dér, mod 5,3 % for landet, og næste kommune på listen er Bornholm
 *  med 17,4 %. Færgen er en regional transportopgave, som kommunen betaler,
 *  og den gør sammenligningen pr. indbygger meningsløs for netop dem.
 *
 *  Retningen spærres, men tallet fjernes IKKE: kronerne er udløst, og
 *  brændstoffet er brændt. Det er sammenligningen med landsgennemsnittet, der
 *  ikke holder, ikke bogføringen - derfor spaerrer uden skjuler, så tallet står
 *  med forbeholdet ved siden af frem for at forsvinde.
 *  Pipelinen sætter feltet - se indkoeb.klassificer_faergedrift. */
const INDKOEB_FORBEHOLD = {
  faergedrift: {
    spaerrer: true,
    note: "Kommunen driver færge, og hovedkonto 2, Transport og infrastruktur, "
      + "fylder over en tredjedel af kommunens samlede indkøb mod 5 procent for "
      + "landet. Indkøbet pr. indbygger er derfor ikke sammenligneligt: det måler "
      + "først og fremmest en regional transportopgave, kommunen betaler for en "
      + "befolkning, der er meget mindre end færgens opland.",
  },
};
const indkoebForbehold = (m) => INDKOEB_FORBEHOLD[m.indkoeb_forbehold] ?? null;

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
// beregnKommune - medmindre det er markeret `kunTal: true`: så er manglen på retning
// et bevidst valg, og tallet vises som tal uden mærkat.
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
  // Kategorien stod uden ét eneste kommunalt nøgletal, med henvisning til
  // NIRAS (2024) s. 29: offentligt forbrug fordeles ligeligt på alle borgere.
  // Det er rigtigt om NIRAS' fordelingsmodel og forkert om virkeligheden -
  // kommunernes eget indkøb varierer og ligger offentligt i DST REGK11. Se
  // pipeline/indkoeb.py for afgrænsningen.
  OFFENTLIGT: "Offentligt forbrug",
};

// Hver driver: hvordan værdien beregnes, hvordan afvigelsen dannes, og hvilken
// af Energistyrelsens forbrugsgrupper den oplyser om.
// afvigelsestype: "relativ" = (k−l)/l, "difference" = k−l.
//
// felter: de felter i data.json, nøgletallet faktisk læser. De er selve
// kildeangivelsen: web/data/sources.json siger, hvilken kilde der ejer hvert
// felt, og kommunesiden slår op dér frem for at have en liste over kilder
// skrevet i hånden ved siden af. Listen holdes ærlig af testen "hvert nøgletal
// oplyser præcis de felter, det læser", som sporer opslagene i val().
//
// formel: samme regnestykke som val(), skrevet som en almindelig
// aritmetisk streng over feltnavnene. Den findes for regnearkseksporten, der
// oversætter feltnavne til celleadresser, så den, der henter arket, kan rette
// et rådatafelt og se afvigelsen, niveauet og retningen regne sig om. Et bart
// feltnavn betyder kommunens tal; præfikset `land.` betyder landets. Den er
// IKKE motorens sandhed - val() er - og test/formel.test.js kører begge over
// alle 98 kommuner og landet og fejler ved første tal, der ikke er ens. Ændrer
// du et regnestykke, skal formlen følge med, ellers stopper testen dig.
//
// ogsaaKilder og metodekilde: en kilde, der bidrager uden at eje et felt.
// Fødevareforbruget er det eneste tilfælde - se nøgletallet nedenfor.
//
// prisForskydning: for et nøgletal, der er et gennemsnit over flere år, hører beløbet til
// prisniveauet i vinduets midte og ikke til slutåret. Antallet af år, midten ligger før
// slutåret. Uden den ville et femårsgennemsnit blive sat i priser to år for sent, og
// ændringen mellem to vinduer ville miste to års inflationsforskel.
//
// faste: nøgletal i kroner. Historikken bag udviklingspilen står i årets egne
// priser, og motoren sætter kronebeløbene i det seneste års prisniveau, før de
// sammenlignes (se driverSerie). Ellers ville en stigning, der blot følger
// priserne, ligne en udvikling, og alle 98 kommuner ville pege samme vej. En test
// holder flaget på hvert nøgletal, hvis enhed er kroner.
//
// rolle: "hjaelper" markerer nøgletal, der kun findes for at kvalificere et
// andet tal - fritidshuse pr. helårsbolig forklarer husholdningstallene,
// befolkningsudviklingen forklarer byggeaktiviteten, affaldstallene er kontekst
// til det forbrug, disponibel indkomst beskriver. De står i tabellen som alle andre,
// men holdes ude af overblikket, hvor de ellers ville fortrænge de tal, de er
// sat i verden for at forklare.
// Eksporteret, så testen kan køre hvert regnestykke gennem en proxy og se
// efter, at nøgletallet oplyser præcis de felter, det læser. Listen er
// modellens specifikation - læs den, ændr den ikke udefra.
export const DRIVERE = [
  // Står under Forbrugsprodukter og services. Kilderne kobler også indkomsten til
  // flyrejser (NIRAS s. 20) og regner fødevarer med til "øvrigt forbrug" (NIRAS
  // s. 22), men nøgletallet står kun ét sted, så det ikke tæller dobbelt i
  // overblikket. Det lå tidligere i en egen kategori, "På tværs af kategorier",
  // som ikke findes blandt Energistyrelsens - og nåede derfor aldrig overblikket.
  { navn: "Disponibel indkomst", enhed: "kr./år", val: (m) => m.disp_indkomst,
    faste: true,
    felter: ["disp_indkomst"],
    formel: "disp_indkomst",
    type: "relativ", kategori: KATEGORI.PRODUKTER, paavirkning: "hoejere",
    forbehold: indkomstForbehold,
    begrundelse: "CONCITO (2023) s. 27: mennesker med lav indkomst forbruger ofte færre "
      + "ting og sager og rejser mindre. NIRAS (2024) s. 27 anbefaler at undersøge, om "
      + "borgernes øvrige forbrug kan skaleres efter indkomsten. Sammenhængen er ikke "
      + "mekanisk: CONCITO's forbrugsprofiler går fra 8,7 til 15 ton i den laveste "
      + "indkomstgruppe og fra 12 til 25 ton i den højeste (s. 28-29), fordi pengene kan "
      + "bruges mere eller mindre klimavenligt (s. 6)." },
  // Fødevarekategoriens eneste kommunale nøgletal. Det GENTAGER indkomsten og
  // står med efter eksplicit valg: Osei-Owusu et al. (2020) fordeler
  // fødevareforbruget som regionens forbrugskvotient gange kommunens samlede
  // disponible indkomst (SI, ligning S9-S11), så hele den kommunale variation
  // kommer derfra. Målt over de 98 kommuner er r = +0,97 mod disponibel
  // indkomst, altså samme leje som de nøgletal, der er taget af siden nedenfor.
  //
  // Det bliver alligevel stående, fordi alternativet er en tom kategori, der
  // fylder 17 % af det nationale aftryk. En kategori uden retning læses som en
  // kategori uden problem. Dubletten er skrevet ind i begrundelsen, så læseren
  // ser den frem for at opdage den.
  { navn: "Fødevareforbrug pr. indbygger", enhed: "kr./indb./år",
    faste: true,
    val: (m) => m.foedevare_forbrug_pr_indb,
    felter: ["foedevare_forbrug_pr_indb"],
    formel: "foedevare_forbrug_pr_indb",
    // FU17 ejer feltet, men tallet er FU17's regionskvotient ganget med
    // kommunens samlede disponible indkomst fra INDKF111, efter fordelingsnøglen
    // i Osei-Owusu et al. (2020). Alle tre skal stå ved nøgletallet, ellers
    // ligner det et forbrugstal hentet direkte for kommunen.
    ogsaaKilder: ["INDKF111"], metodekilde: "OSEI_OWUSU_2020",
    type: "relativ", kategori: KATEGORI.FOEDEVARER, paavirkning: "hoejere",
    // Tallet ER kommunens disponible indkomst ganget med en regionskvotient, så
    // et gennemsnit trukket af få personer slår lige så hårdt igennem her.
    forbehold: indkomstForbehold,
    begrundelse: "Forbrugsudgiften til fødevarer, ikke en udledning: værktøjet "
      + "beregner intet kommunalt aftryk. Mere forbrug betyder flere producerede "
      + "fødevarer, og Osei-Owusu et al. (2020) opgør netop fødevareforbruget til "
      + "kommunens del af det nationale aftryk. Tallet er beregnet, ikke målt - "
      + "det er regionens forbrugskvotient ganget med kommunens disponible "
      + "indkomst, og det gentager derfor indkomsten (r = +0,97 over de 98 "
      + "kommuner). Det siger noget om, hvor meget der bruges på mad, ikke om "
      + "hvad der spises: kilden regner med landsgennemsnitlig kost i alle "
      + "kommuner (s. 4 og s. 8), så den kan ikke se forskel på oksekød og "
      + "bønner." },
  // Taget af siden, fordi de gentog tal, der allerede står der - målt over alle
  // 98 kommuner: nettoformue (gns. og median) fulgte disponibel indkomst
  // (r = +0,95 og +0,84), befolkningstætheden fulgte biler pr. indbygger
  // (r = -0,76), boligprisen fulgte indkomst og tæthed (r = +0,69 og +0,78), og
  // parcelhus-andelen fulgte boligarealet (r = +0,92). Gini-koefficienten hentes
  // stadig, men vises ikke: ulighed siger noget om fordelingen af forbruget, ikke
  // om niveauet, og hører til en vurdering af rimelig og retfærdig omstilling.
  { navn: "Befolkningsudvikling", enhed: "pct.", val: vaekst,
    felter: ["folketal", "folketal_forrige"],
    formel: "folketal / folketal_forrige - 1",
    type: "difference", kategori: KATEGORI.BOLIG_BYGGERI, rolle: "hjaelper",
    paavirkning: "uafklaret",
    begrundelse: "Står her for at forklare byggeaktiviteten: en kommune, der vokser, "
      + "bygger flere boliger. Nøgletallene er opgjort pr. borger, så væksten peger ikke "
      + "selv mod en højere eller lavere udledning." },
  { navn: "Gennemsnitligt boligareal", enhed: "m²/bolig", val: (m) => m.boligareal,
    felter: ["boligareal"],
    formel: "boligareal",
    type: "relativ", kategori: KATEGORI.ENERGI, rolle: "hjaelper", paavirkning: "hoejere",
    begrundelse: "Større boliger koster mere varme - NIRAS (2024) s. 18 nævner "
      + "boligstørrelsen blandt det, rumvarmen følger. Står som forklarende tal under "
      + "energiforbruget, ikke under byggeriet: det er nybyggeriet, der giver "
      + "byggeriets udledning, ikke størrelsen på de huse, der allerede står." },
  { navn: "Byggeaktivitet", enhed: "pr. 1.000 indb.", val: byggeriPr1000,
    felter: ["byggeri", "folketal"],
    formel: "byggeri / folketal * 1000",
    type: "relativ", kategori: KATEGORI.BOLIG_BYGGERI, paavirkning: "hoejere",
    begrundelse: "Nybyggeri kræver materialer. Energistyrelsen opgør investering i "
      + "boliger til 0,48 ton pr. indbygger (2024). Det er selve byggeriet, der "
      + "tæller her - boligernes energiforbrug hører til Energi og forsyning." },
  { navn: "Biler pr. indbygger", enhed: "biler/pers.", val: bilerPrIndb,
    felter: ["biler", "folketal"],
    formel: "biler / folketal",
    type: "relativ", kategori: KATEGORI.TRANSPORT, paavirkning: "hoejere",
    begrundelse: "Flere biler betyder både mere kørsel og flere producerede "
      + "køretøjer. Energistyrelsen opgør husholdningernes transport plus køb af "
      + "køretøjer til 1,84 ton pr. indbygger (2024), den største enkeltkategori. Kun "
      + "husholdningernes egne biler tælles: firma- og leasingbiler står på "
      + "virksomhedens adresse, ikke der, hvor de bruges." },
  { navn: "El- og plugin-hybridandel", enhed: "pct.", val: elPluginAndel,
    andel: "0-1", felter: ["biler_el", "biler_plugin", "biler"],
    formel: "(biler_el + biler_plugin) / biler",
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
    andel: "0-1", felter: ["biler_benzin", "biler_diesel", "biler"],
    formel: "(biler_benzin + biler_diesel) / biler",
    type: "relativ", kategori: KATEGORI.TRANSPORT, paavirkning: "hoejere",
    begrundelse: "Benzin- og dieselbiler tilsammen. En fossilbil udleder mere "
      + "CO2 pr. kørt kilometer end en el- eller plugin-hybridbil på et dansk "
      + "elnet, uanset hvordan de fossile biler fordeler sig på de to brændstoffer." },
  { navn: "Gennemsnitlig pendlingsafstand", enhed: "km", val: (m) => m.pendlingsafstand_km,
    felter: ["pendlingsafstand_km"],
    formel: "pendlingsafstand_km",
    type: "relativ", kategori: KATEGORI.TRANSPORT, paavirkning: "hoejere",
    begrundelse: "Længere afstand til arbejde betyder flere kørte kilometer. Siger "
      + "dog intet om transportmiddel." },
  { navn: "Husholdningernes CO2 fra energi", enhed: "ton CO2e/bolig",
    val: husholdningCo2PrBolig,
    felter: ["husholdning_co2_ton", "husholdning_el_co2_ton", "husholdning_el_tj",
             "husholdning_el_faktor",
             "boliger_parcel", "boliger_raekke", "boliger_etage", "fritidshuse"],
    formel: "(husholdning_co2_ton - husholdning_el_co2_ton"
      + " + husholdning_el_tj * (1000000000000 / 3600000) * husholdning_el_faktor / 1000000)"
      + " / (boliger_parcel + boliger_raekke + boliger_etage + fritidshuse)",
    type: "relativ", kategori: KATEGORI.ENERGI,
    paavirkning: "hoejere", forbehold: fritidshusForbehold,
    begrundelse: "Udledningen fra borgernes eget energiforbrug i boligen. Strømmen er "
      + "regnet med kommunens miljødeklaration fra Energinet, hvor vedvarende energi "
      + "produceret i kommunen dækker kommunens forbrug først; fjernvarmen med sit "
      + "lokale nets." },
  { navn: "Husholdningernes energiforbrug", enhed: "GJ/bolig",
    val: husholdningEnergiPrBolig,
    felter: ["husholdning_energi_tj", "boliger_parcel", "boliger_raekke",
             "boliger_etage", "fritidshuse"],
    formel: "husholdning_energi_tj * 1000"
      + " / (boliger_parcel + boliger_raekke + boliger_etage + fritidshuse)",
    type: "relativ", kategori: KATEGORI.ENERGI,
    paavirkning: "hoejere", forbehold: fritidshusForbehold,
    begrundelse: "Mere energi brugt i boligen. Udledningen afhænger dog af, hvilken "
      + "energikilde der bruges - se de to øvrige nøgletal." },
  { navn: "Fossil andel af husholdningernes energi", enhed: "pct.",
    val: (m) => m.husholdning_fossil_andel, andel: "0-1",
    felter: ["husholdning_fossil_andel"],
    formel: "husholdning_fossil_andel",
    type: "relativ", kategori: KATEGORI.ENERGI,
    paavirkning: "hoejere",
    begrundelse: "Naturgas, fyringsolie og LPG udleder ved forbrændingen." },
  { navn: "Fossil opvarmning", enhed: "pct.", val: fossilOpv,
    andel: "0-1", felter: ["opv_olie", "opv_naturgas", "opv_boliger_ialt"],
    formel: "(opv_olie + opv_naturgas) / opv_boliger_ialt",
    type: "relativ", kategori: KATEGORI.ENERGI, paavirkning: "hoejere",
    begrundelse: "Olie- og gasfyr udleder ved forbrændingen i boligen." },
  { navn: "Fjernvarmens CO2 pr. kWh", enhed: "g CO2e/kWh", val: fjernvarmeCo2PrKwh,
    felter: ["husholdning_fjernvarme_co2_ton", "husholdning_fjernvarme_tj"],
    formel: "husholdning_fjernvarme_co2_ton * 1000000 /"
      + " (husholdning_fjernvarme_tj * (1000000000000 / 3600000))",
    type: "relativ", kategori: KATEGORI.ENERGI, paavirkning: "hoejere",
    begrundelse: "Hvor meget CO2 der følger med hver kWh fjernvarme, husholdningerne "
      + "aftager. Fjernvarme leveres i rør fra kommunens eget net, så tallet er "
      + "kommunens eget - modsat strøm, der deles på det fælles net. Tallet siger, "
      + "hvor ren fjernvarmen er, ikke hvor meget den fylder i kommunen." },
  { navn: "Fritidshuse pr. helårsbolig", enhed: "boliger/bolig",
    val: fritidshusPrBolig,
    felter: ["fritidshuse", "boliger_parcel", "boliger_raekke", "boliger_etage"],
    formel: "fritidshuse / (boliger_parcel + boliger_raekke + boliger_etage)",
    type: "relativ", kategori: KATEGORI.ENERGI,
    rolle: "hjaelper", paavirkning: "uafklaret",
    begrundelse: "Findes kun for at kvalificere husholdningstallene." },
  // De to affaldsnøgletal stod en periode som uafklarede for ALLE 98 kommuner,
  // fordi DST's kommunefordeling for 2023 er upålidelig for nogle af dem.
  // Det var for groft: fejlen rammer de kommuner, der deler indberetning med
  // hinanden, ikke de øvrige 85. Retningen står derfor igen, og forbeholdet
  // sættes pr. kommune ud fra affald_indberetning - se INDBERETNING_FORBEHOLD.
//
// Begge er hjælpetal efter eksplicit valg: de er kontekst, ikke mål for
// forbruget, og står med mærkat i tabellen uden at tælle i overblikket. Dér
// afgør disponibel indkomst alene, hvilken vej Forbrugsprodukter og services
// peger. Målt over de 91 kommuner, hvor affaldet vises, fulgte det ikke
// indkomsten (r = -0,25), og husholdningsaffaldet rummer haveaffald, hvis andel
// svinger fra under 1 til knap 50 % mellem kommunerne.
  { navn: "Husholdningsaffald", enhed: "kg/pers.", val: (m) => m.affald_kg,
    felter: ["affald_kg"],
    formel: "affald_kg",
    type: "relativ", kategori: KATEGORI.PRODUKTER, rolle: "hjaelper", paavirkning: "hoejere",
    forbehold: affaldForbehold,
    begrundelse: "Mere affald peger mod et større materielt forbrug." },
  { navn: "Genanvendelsesprocent", enhed: "pct.", val: (m) => m.genanvendelse_pct,
    andel: "0-100", felter: ["genanvendelse_pct"],
    formel: "genanvendelse_pct",
    type: "relativ", kategori: KATEGORI.PRODUKTER, rolle: "hjaelper", paavirkning: "lavere",
    forbehold: affaldForbehold,
    begrundelse: "Genanvendte materialer erstatter produktion af nye." },
  // --- Kommunens eget indkøb ---
  //
  // De fire nøgletal nedenfor er de eneste i værktøjet, der handler om
  // kommunen som ORGANISATION og ikke om borgerne. De står UDEN RETNING
  // (`paavirkning: "uafklaret"` med `kunTal: true`): en kommunal udgift i kroner
  // er stigende eller faldende, men værktøjet er ikke smagsdommer over, om det er
  // rigtigt eller forkert. Demografi, udlicitering, opgaveflytning og priser flytter
  // tallet uden at røre ved klimaindsatsen, og et grønt eller rødt signal ville sige
  // mere, end kronerne kan bære. Det gælder niveauet mod landet og udviklingspilen. De står her, fordi
  // Energistyrelsen henfører det offentlige forbrug til borgernes aftryk
  // (1,15 ton pr. indbygger, 11,9 %), og fordi kommunen selv er den eneste
  // aktør på siden, der kan handle direkte på tallet.
  //
  // DE ER KRONER, IKKE TON. Energistyrelsen ganger indkøb i kroner med en
  // emissionsfaktor pr. indkøbskategori, men modellens indkøbsdata er
  // fakturadata fra SKI kategoriseret på UNSPSC (GA23 baggrundsnotat 6 s. 8),
  // og hverken data, hierarki eller faktorer er offentlige eller fordelt på
  // kommuner. Der findes altså ingen offentlig nøgle fra DST's artskontoplan
  // til faktorerne, og værktøjet opfinder ikke en.
  //
  // DE GENTAGER IKKE INDKOMSTEN. Målt over de 98 kommuner er korrelationen
  // mellem driftsindkøb og disponibel indkomst r = -0,10. Det er det første
  // nøgletal på siden, der ikke er indkomst i forklædning - fødevareforbruget
  // ligger på r = +0,97.
  { navn: "Kommunens driftsindkøb", enhed: "kr./indb./år",
    faste: true,
    val: (m) => m.indkoeb_drift_pr_indb,
    felter: ["indkoeb_drift_pr_indb"],
    formel: "indkoeb_drift_pr_indb",
    metodekilde: "ENS_GA23_INDKOEB",
    type: "relativ", kategori: KATEGORI.OFFENTLIGT, paavirkning: "uafklaret", kunTal: true,
    forbehold: indkoebForbehold,
    begrundelse: "Kommunens eget køb af varer og tjenesteydelser hos leverandører, "
      + "pr. indbygger. Energistyrelsen beregner indkøbets klimaaftryk som kroner "
      + "gange en emissionsfaktor (baggrundsnotat 6, s. 5), men om flere kroner er "
      + "en forkert eller rigtig retning, kan tallet ikke afgøre: det følger ikke "
      + "indkomsten (r = -0,10 over de 98 kommuner), men det følger "
      + "alderssammensætningen (r = +0,52 mod andelen på 75 år og derover), og en "
      + "lille kommune har færre borgere at dele de faste opgaver på. Derfor står "
      + "tallet uden retning. Forsyningsvirksomhederne er trukket fra i alle "
      + "kommuner, fordi nogle har dem i regnskabet og andre i selskab." },
  // Anlæg udjævnes over fem år, drift gør ikke. Grunden står i indkoeb.py:
  // driftens afvigelse korrelerer r = +0,98 fra år til år, anlæggets kun
  // +0,75, mens to adskilte femårsvinduer når +0,71. Ét skolebyggeri kan
  // flytte en lille kommune flere hundrede procent på et enkelt år.
  { navn: "Kommunens anlægsindkøb", enhed: "kr./indb./år",
    // Femårsgennemsnit (pipeline/indkoeb.py): tallet for et år er et middel af de fem år, der
    // slutter i året, og hører til prisniveauet i vinduets midte, to år før slutåret.
    faste: true, prisForskydning: 2,
    val: (m) => m.indkoeb_anlaeg_pr_indb,
    felter: ["indkoeb_anlaeg_pr_indb"],
    formel: "indkoeb_anlaeg_pr_indb",
    metodekilde: "ENS_GA23_INDKOEB",
    type: "relativ", kategori: KATEGORI.OFFENTLIGT, paavirkning: "uafklaret", kunTal: true,
    forbehold: indkoebForbehold,
    begrundelse: "Kommunens køb til anlægsprojekter, gennemsnit over fem "
      + "regnskabsår. Byggeri og anlæg er den største enkeltpost i det offentlige "
      + "indkøbs klimaaftryk, og udledningen pr. indkøbskrone er samtidig høj "
      + "(Energistyrelsen, baggrundsnotat 6, s. 4). Tallet står uden retning: et "
      + "stort anlægsår kan være en energirenovering eller et nyt skolebyggeri, og "
      + "kronerne siger ikke hvilket. Femårsgennemsnittet er nødvendigt, fordi ét "
      + "enkelt byggeri ellers ville flytte en lille kommune flere hundrede procent "
      + "på ét år." },
  { navn: "Kommunens indkøb af brændsel og drivmidler", enhed: "kr./indb./år",
    faste: true,
    val: (m) => m.indkoeb_braendsel_pr_indb,
    felter: ["indkoeb_braendsel_pr_indb"],
    formel: "indkoeb_braendsel_pr_indb",
    metodekilde: "KL_2022_INDKOEB",
    type: "relativ", kategori: KATEGORI.OFFENTLIGT, paavirkning: "uafklaret", kunTal: true,
    forbehold: indkoebForbehold,
    begrundelse: "Diesel, benzin og fyringsbrændsel til kommunens egen drift. KL "
      + "(2022) fremhæver brændstof og køretøjer som det indkøbsområde, der har det "
      + "største klimaaftryk pr. indkøbskrone. Tallet er kommunens udgift, ikke "
      + "mængden: falder prisen, falder tallet, uden at der er købt mindre. Derfor "
      + "står det uden retning." },
  { navn: "Kommunens indkøb af fødevarer", enhed: "kr./indb./år",
    faste: true,
    val: (m) => m.indkoeb_foedevarer_pr_indb,
    felter: ["indkoeb_foedevarer_pr_indb"],
    formel: "indkoeb_foedevarer_pr_indb",
    metodekilde: "ENS_GA23_INDKOEB",
    type: "relativ", kategori: KATEGORI.OFFENTLIGT, paavirkning: "uafklaret", kunTal: true,
    forbehold: indkoebForbehold,
    begrundelse: "Mad til plejehjem, daginstitutioner, skoler og kantiner. "
      + "Energistyrelsen opgør fødevarer og kantinedrift som eget indkøbsområde "
      + "(baggrundsnotat 6, s. 4). Tallet afhænger stærkt af, hvor mange borgere "
      + "kommunen bespiser, og af om køkkendriften er udliciteret: er den lagt ud, "
      + "bogføres maden som en tjenesteydelse og ikke her. Et fald kan derfor være "
      + "en bogføringsændring, og tallet står uden retning." },
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
    spaerrer: true, skjuler: true,
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
 *  med, så et nøgletal kan læse landets tal (`land.felt` i formlen); ingen gør det
 *  lige nu, for el-faktoren er kommunens egen og landets er et felt i landets række. */
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

/** Forbeholdene, som de faktisk rammer årets 98 kommuner.
 *
 *  HVORFOR DEN FINDES. Metodesiden skrev tidligere de ramte kommuner af i
 *  hånden - "de syv ejerkommuner bag Norfors og Reno Djurs (Allerød, ...)".
 *  Den slags prosa er kun rigtig indtil næste dataopdatering: retter et
 *  affaldsselskab sin indberetning, falder forbeholdet bort af sig selv i
 *  pipelinen, mens sætningen bliver stående. Nu udleder siden listen af
 *  datasættet, så den ikke kan komme bagud.
 *
 *  Grupperet på forbeholdets note, fordi det er noten, der er forbeholdets
 *  identitet - den står ordret på hver ramt kommuneside.
 *
 *  Returnerer en liste af {virkning, note, noegletal, kommuner}, hvor virkning
 *  er en af:
 *    "skjuler"   tallet selv er ramt og tages af kommunens side
 *    "spaerrer"  tallet står, men uden retning
 *    "note"      tallet og retningen står; forbeholdet er en bemærkning
 *  Sorteret med det, der griber hårdest ind, først. */
export const FORBEHOLD_VIRKNING = ["skjuler", "spaerrer", "note"];

/** Dansk sortering, så Æ, Ø og Å lander bagest og ikke som A og O. */
const DA = (a, b) => a.localeCompare(b, "da");

export function beregnForbehold(kommuner, land) {
  const grupper = new Map();
  for (const k of kommuner) {
    for (const d of driverTabel(k, land)) {
      if (!d.forbeholdNote) continue;
      const virkning = d.skjult ? "skjuler" : d.spaerret ? "spaerrer" : "note";
      const noegle = `${virkning}\u0000${d.forbeholdNote}`;
      if (!grupper.has(noegle)) {
        grupper.set(noegle, { virkning, note: d.forbeholdNote,
                              noegletal: new Set(), kommuner: new Set() });
      }
      const g = grupper.get(noegle);
      g.noegletal.add(d.navn);
      g.kommuner.add(k.navn);
    }
  }
  return [...grupper.values()]
    .map((g) => ({ virkning: g.virkning, note: g.note,
                   noegletal: [...g.noegletal], kommuner: [...g.kommuner].sort(DA) }))
    .sort((a, b) => FORBEHOLD_VIRKNING.indexOf(a.virkning) - FORBEHOLD_VIRKNING.indexOf(b.virkning)
      || a.noegletal[0].localeCompare(b.noegletal[0], "da"));
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
    // andele. Med et landsgennemsnit på 9,2 % bliver 46,7 % til "+409 %",
    // hvilket lyder ekstremt for en forskel på 38 procentpoint. Tallene er
    // 2024-datasættets yderpunkt for fossil andel af husholdningernes energi;
    // metodesiden viser samme eksempel og har en test på det.
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
      // Bevidst uden retning: tallet vises, men vurderes ikke (kommunale udgifter).
      kunTal: d.kunTal === true,
      // Kildeangivelsen følger nøgletallet hele vejen ud i tabellen.
      felter: d.felter ?? [],
      // Regnestykket og andelsformen følger med ud i tabellen af samme grund
      // som felterne: regnearkseksporten bygger en Excel-formel og vælger
      // talformat ud fra dem, og den skal kunne gøre det på rækken alene.
      // Slog den nøgletallet op i DRIVERE på navnet, ville et omdøbt nøgletal
      // knække eksporten stille.
      formel: d.formel ?? null,
      andel: d.andel ?? null,
      ogsaaKilder: d.ogsaaKilder ?? [],
      metodekilde: d.metodekilde ?? null,
      paavirkning,
      begrundelse,
      kommuneVaerdi: kv, landVaerdi: lv, afvigelse: afv,
      procentpoint: pp,
      retning: afv == null ? "kontekst" : afv > 0 ? "over land" : afv < 0 ? "under land" : "på niveau",
      baand: niveauBaand(afv),
      signal: udledningsSignal(afv, paavirkning),
      // Forbeholdets note for sig. Spærrer forbeholdet retningen, står
      // nøgletallet med et forbeholdsmærkat i stedet for en retning; skjuler
      // det tallet, er noten den begrundelse, siden giver under tabellen.
      forbeholdNote: forbehold?.note ?? null,
      // skjuler INDEBÆRER spaerrer, og det udledes her frem for at stå som en
      // regel, hver ny forbeholdsdefinition skal huske. Skrev nogen
      // {skjuler: true} uden spaerrer, ville nøgletallet blive taget af siden
      // og samtidig bære en rigtig retning - og beregnForbehold ville føre det
      // under "skjuler", mens signalet sagde "markant højere".
      spaerret: forbehold?.spaerrer === true || forbehold?.skjuler === true,
      skjult: forbehold?.skjuler === true,
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

/** Kategoriens SAMLEDE RETNING: hvert nøgletal tæller ét.
 *
 *  ALLE NØGLETAL VEJER LIGE. Et udsving på 2 % tæller nøjagtig som et på 40 %.
 *  Det er en bevidst beslutning og forskellen på denne optælling og mærkatet
 *  ved det enkelte nøgletal, hvor 10 %-tærsklen afgør, om der står "peger" eller
 *  "peger lidt". Ville man veje de store udsving tungere, skulle man vide, hvor
 *  meget hvert nøgletal betyder for udledningen - og det tal findes ikke i
 *  nogen af kilderne. Så hellere tælle åbent end veje i blinde.
 *
 *  DEN SIGER IKKE, AT KATEGORIEN LIGGER HØJT ELLER LAVT. Den siger, hvor mange
 *  af kategoriens nøgletal der peger hver sin vej. Tallene bag står i tabellen,
 *  så læseren kan se optællingen efter.
 *
 *  Hjælpetal tæller ikke med. De står for at forklare et andet nøgletal
 *  (fritidshuse forklarer husholdningstallene, affaldet er kontekst til
 *  indkomsten), og i Forbrugsprodukter og services ville de to affaldstal
 *  ellers udgøre flertallet over det ene nøgletal, kategorien har.
 *  Nøgletal uden retning tælles for sig - de må ikke forsvinde tavst. Og de
 *  tælles i TO bunker, fordi de to grunde ikke er den samme:
 *
 *    udenData      tallet findes ikke for kommunen. Der står en tankestreg.
 *    udenRetning   tallet findes, men et forbehold spærrer retningen -
 *                  færgekommunernes indkøb. At kalde det "uden data" ville
 *                  sige, at kommunen ikke har købt ind, og det har den. */
export function samletRetning(drivere) {
  const talte = drivere.filter((d) => d.rolle !== "hjaelper");
  const medData = talte.filter((d) => d.signal !== "ukendt" && d.signal !== "uafklaret");
  const op = medData.filter((d) => d.signal.endsWith("højere")).length;
  const ned = medData.filter((d) => d.signal.endsWith("lavere")).length;
  const paaNiveau = medData.filter((d) => d.signal === "på niveau").length;
  const udenRetning = talte.filter((d) => d.signal === "uafklaret").length;
  // Del af udenRetning: tal, der står uden retning med vilje og uden forbehold.
  // Rendering skal kunne skille dem fra dem, et forbehold holder tilbage.
  const udenVurdering = talte.filter((d) => d.signal === "uafklaret" && d.kunTal && !d.spaerret).length;
  const udenData = talte.filter((d) => d.signal === "ukendt").length;
  const retning =
    medData.length > 0 ? (op > ned ? "højere" : ned > op ? "lavere"
                          : op > 0 ? "delt" : "på niveau")
    : udenRetning > 0 ? "ingen retning"
    : "ingen data";
  return { retning, op, ned, paaNiveau, udenData, udenRetning, udenVurdering, talte: medData.length };
}

export function driverePrKategori(drivere) {
  // Rækkefølge efter Energistyrelsens nationale vægt, faldende. Både Fødevarer
  // og Offentligt forbrug stod tidligere uden kommunalt nøgletal og optrådte
  // kun i kategorioverblikket; begge er kommet til - se fødevarenøgletallet og
  // nøgletallene for kommunens eget indkøb i DRIVERE.
  const raekkefoelge = [KATEGORI.TRANSPORT, KATEGORI.FOEDEVARER, KATEGORI.PRODUKTER,
                        KATEGORI.OFFENTLIGT, KATEGORI.ENERGI, KATEGORI.BOLIG_BYGGERI];
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
  "pendlingsafstand_km", "fritidshuse", "foedevare_forbrug_pr_indb",
  "indkoeb_drift_pr_indb", "indkoeb_anlaeg_pr_indb",
  "indkoeb_foedevarer_pr_indb", "indkoeb_braendsel_pr_indb",
  "husholdning_co2_ton", "husholdning_energi_tj", "husholdning_fossil_andel",
  "husholdning_el_tj", "husholdning_el_co2_ton", "husholdning_el_faktor",
  "husholdning_fjernvarme_tj", "husholdning_fjernvarme_co2_ton",
];

/** Om et nøgletal vises på kommunens side.
 *
 *  To forskellige grunde til at stå uden retning, og kun den ene tager tallet
 *  af siden:
 *
 *    Et FORBEHOLD, DER SKJULER, siger at tallet selv er ramt - affaldstonnagen
 *    er bogført på nabokommunen, husholdningstallet er delt med for mange
 *    boliger. Så vises det ikke, og noten står under tabellen i stedet.
 *
 *    Et FORBEHOLD, DER KUN SPÆRRER, siger at tallet er rigtigt, men ikke
 *    sammenligneligt - færgekommunernes indkøb. Tallet bliver stående uden
 *    mærkat, med forbeholdet ved siden af.
 *
 *    Et hovednøgletal, hvis retning slet ikke kan begrundes af kilderne, vises
 *    ikke. Den regel er værktøjets egen og har intet med kommunen at gøre.
 *    Undtaget er nøgletal markeret `kunTal`: de er kommunale udgifter, hvor
 *    værktøjet bevidst ikke vurderer retningen. De vises som tal.
 *
 *  Hjælpetal uden retning er undtaget den sidste regel: de fleste har aldrig en
 *  retning, fordi de står for at forklare et andet nøgletal, og ville ellers
 *  forsvinde fra alle 98 sider.
 *  Manglende data ("ukendt") rammes heller ikke - dér står en tankestreg. */
const vises = (d) => !d.skjult
  && (d.rolle === "hjaelper" || d.kunTal || d.spaerret || d.signal !== "uafklaret");

/** Fuld sammenligning for én kommune: indikatortabel, gruppering, udeladte
 *  nøgletal og manglende felter.
 *
 *  udvikling er kommunens udvikling over tid, {nøgletalsnavn: udvikling}, fra
 *  beregnUdvikling(). Udelades den, står rækkerne uden udvikling, og siden viser
 *  hverken kolonne eller optælling - så en historik, der ikke kunne hentes,
 *  koster siden en kolonne og ikke en fejl. Er den med, får hver række sin
 *  udvikling, eller null, hvis nøgletallet ikke har nogen. */
export function beregnKommune(kommune, land, udvikling) {
  const alle = driverTabel(kommune, land);
  const drivere = alle.filter(vises)
    .map((d) => (udvikling === undefined ? d : { ...d, udvikling: udvikling?.[d.navn] ?? null }));
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

// ---------- Udvikling over tid ----------
//
// Hvert nøgletal har en historik på op til ti år, og pilen ved siden af siger,
// om kommunen bevæger sig mod lavere udledning (rigtig retning), mod højere
// udledning (forkert retning) eller ingen vej. Metoden er doughnut-platformens
// retningspile (docs/arkitektur-og-beregningsregler.md T1-T4 dér) med de
// tilpasninger, dette værktøjs egne regler kræver.
//
//   Regnet på nøgletallets egen værdi. Serien er nøgletallets regnestykke,
//   val(), kørt på hvert års felter: samme funktion som rækken i tabellen. Det
//   seneste punkt er derfor tallet på siden, og pilen kan ikke beskrive et andet
//   tal end det, læseren har foran sig. test/historik.test.js holder de to fast.
//
//   Retningen kommer fra nøgletallets paavirkning, ikke fra en ny antagelse. Et
//   nøgletal, der peger mod højere udledning, når det stiger, er rigtigt, når det
//   falder. Et nøgletal, hvis retning kilderne ikke kan begrunde, har ingen
//   vurdering, kun en grå pil. Værktøjet foretager stadig kun den ene slags
//   vurdering.
//
//   Endepunkterne midles over tre år i hver ende, når serien har mindst seks
//   punkter, så ét afvigende år ikke afgør billedet. Er den kortere, sammenlignes
//   første og sidste punkt direkte.
//
//   "Rigtig" og "langsomt" skilles ad af medianen for kommunerne. Bevæger en
//   kommune sig mod lavere udledning, men langsommere end de fleste, er
//   retningen rigtig og tempoet lavt. Sammenligningen sker med fortegn: når de
//   fleste kommuner bevæger sig den forkerte vej, er en kommune, der bevæger sig
//   den rigtige, ikke langsom.
//
//   Kronebeløb sættes i samme prisniveau (faste: true). Historikken rummer
//   forbrugerprisindekset (DST PRIS8), og et beløb fra 2016 regnes op til 2024-
//   priser, før det sammenlignes med 2024.
//
//   Manglende tal er huller, aldrig nul. Et år, hvor et felt mangler, står som
//   null i serien, og serien tegnes uden det punkt.
//
// Nogle nøgletal har ingen tidsserie: Klimaregnskabets årgange kræver en API-
// nøgle, og en kilde, der er yngre end vinduet, giver en kortere serie. De står
// som "ingen" og ikke med et opdigtet forløb.

/** Antal år, der midles i hver ende af serien, når den er lang nok. */
export const N_ENDEPUNKT = 3;

/** Under så mange punkter sammenlignes første og sidste punkt direkte. */
export const MIN_AAR_FOR_GENNEMSNIT = 6;

/** En relativ ændring under 1 % er "stort set uændret". */
export const TAERSKEL_UAENDRET_PCT = 1;

/** For andele er en ændring under 1 procentpoint uændret, når niveauet er mindst
 *  10 %. Ved lave andele er en ændring på 1 procentpoint stor i forhold til
 *  niveauet og tæller derfor som en ændring. */
export const TAERSKEL_UAENDRET_PP = 1;
export const NIVEAU_FOR_PP_REGEL = 10;

/** Vækstrater (befolkningsudviklingen) ligger ved 0-1 %. En ændring på under 0,1
 *  procentpoint i den gennemsnitlige vækst er uændret. */
export const TAERSKEL_UAENDRET_VAEKST_PP = 0.1;

export const UDVIKLING_RETNINGER = ["rigtig", "tempo", "stagneret", "forkert", "kontekst", "ingen"];

/** Feltenes værdier ved `trin` år tilbage, som et objekt et nøgletal kan regne på.
 *
 *  Et hul UDELADES i stedet for at stå som null. I JavaScripts regnemaskine er
 *  null nul (null / 42572 er 0), og et manglende tal ville så ende som en
 *  måling. Et felt, der ikke findes, giver NaN i regnestykket, og sikker() gør
 *  det til null. */
function postVedTrin(raekker, trin) {
  const post = {};
  for (const [felt, raekke] of Object.entries(raekker ?? {})) {
    const v = raekke[raekke.length - 1 - trin];
    if (v != null) post[felt] = v;
  }
  return post;
}

/** Årstallet nøgletallets seneste punkt hører til: det ældste af de perioder, dets
 *  felter er fra. Byggeri fra 2024 delt med folketallet i 2026 hører til 2024.
 *  null, hvis et felt ikke har en periode i historikken. */
export function driverAar(d, historik) {
  const aar = (d.felter ?? []).map((f) => historik?.felter?.[f]?.aar);
  return aar.length > 0 && aar.every(Number.isFinite) ? Math.min(...aar) : null;
}

/** Faktoren, der sætter et beløb fra `aar` i `nu`s prisniveau. null uden indeks. */
function prisFaktor(priser, nu, aar) {
  const p = priser?.aar;
  const a = p?.[String(nu)];
  const b = p?.[String(aar)];
  return Number.isFinite(a) && Number.isFinite(b) && b > 0 ? a / b : null;
}

/** Nøgletallets serie for kommunen og for landet, ældste år først.
 *
 *  Hvert punkt er nøgletallets eget regnestykke kørt på det års felter - felterne
 *  går bagud fra hver deres nyeste periode, så et nøgletal, der kombinerer felter
 *  fra forskellige perioder, kombinerer dem på samme måde i hvert år. Et år, hvor
 *  et af felterne mangler, står som null.
 *
 *  Returnerer null, hvis historikken ikke kender kommunen eller nøgletallets
 *  felter. */
export function driverSerie(d, historik, kode) {
  const nu = driverAar(d, historik);
  const kommune = historik?.kommuner?.[String(kode)];
  if (nu == null || !kommune || !historik.land) return null;

  const fors = d.prisForskydning ?? 0;
  const aar = [], k = [], l = [];
  for (let trin = historik.vindue; trin >= 0; trin--) {
    const kp = postVedTrin(kommune, trin);
    const lp = postVedTrin(historik.land, trin);
    const faktor = d.faste ? prisFaktor(historik.priser, nu - fors, nu - fors - trin) : 1;
    const juster = (v) => (v == null || faktor == null ? null : v * faktor);
    aar.push(nu - trin);
    k.push(juster(sikker(d.val, kp, lp)));
    l.push(juster(sikker(d.val, lp, lp)));
  }
  return { aar, kommune: k, land: l, faste: d.faste === true, prisAar: d.faste ? nu - fors : null };
}

/** Endepunkterne af en serie: første og sidste punkt, eller gennemsnittet af de
 *  første og sidste tre, når der er mindst seks. Punkter uden tal tælles ikke med.
 *  null, hvis der er færre end to punkter - ét punkt er ikke en udvikling. */
export function endepunkter(aar, vaerdier) {
  const p = [];
  aar.forEach((a, i) => { if (vaerdier[i] != null) p.push([a, vaerdier[i]]); });
  const n = p.length;
  if (n < 2) return null;
  if (n < MIN_AAR_FOR_GENNEMSNIT) {
    return { start: p[0][1], slut: p[n - 1][1], n, midlet: false,
             startLabel: String(p[0][0]), slutLabel: String(p[n - 1][0]) };
  }
  const foerste = p.slice(0, N_ENDEPUNKT);
  const sidste = p.slice(-N_ENDEPUNKT);
  const snit = (x) => x.reduce((sum, [, v]) => sum + v, 0) / x.length;
  const label = (x) => (x[0][0] === x.at(-1)[0] ? String(x[0][0]) : `${x[0][0]}-${x.at(-1)[0]}`);
  return { start: snit(foerste), slut: snit(sidste), n, midlet: true,
           startLabel: label(foerste), slutLabel: label(sidste) };
}

/** Ændringen mellem to endepunkter: relativt i procent, og for andele og
 *  vækstrater også i procentpoint. En relativ ændring fra nul er ikke defineret. */
export function aendring(d, start, slut) {
  const pct = start === 0 ? null : ((slut - start) / Math.abs(start)) * 100;
  const skala = d.andel === "0-1" ? 100 : d.andel === "0-100" ? 1 : d.type === "difference" ? 100 : null;
  return { pct, pp: skala == null ? null : (slut - start) * skala };
}

/** Er ændringen så lille, at den ikke skal kaldes en bevægelse? */
function erUaendret(d, start, slut, { pct, pp }) {
  if (d.type === "difference") return Math.abs(pp) < TAERSKEL_UAENDRET_VAEKST_PP;
  // En serie, der står i nul i begge ender, har ingen relativ ændring at måle, men er uændret.
  if (start === slut) return true;
  if (pct != null && Math.abs(pct) < TAERSKEL_UAENDRET_PCT) return true;
  if (d.andel) {
    const niveau = Math.max(Math.abs(start), Math.abs(slut)) * (d.andel === "0-1" ? 100 : 1);
    if (niveau >= NIVEAU_FOR_PP_REGEL && Math.abs(pp) < TAERSKEL_UAENDRET_PP) return true;
  }
  return false;
}

/** Stiger værdien mod lavere udledning? true: en stigning er rigtig. false: et
 *  fald er rigtigt. null: retningen kan ikke afgøres, og nøgletallet står uden
 *  vurdering. Følger rækkens paavirkning, så et forbehold, der spærrer retningen,
 *  spærrer den også her. */
function opErGodt(paavirkning) {
  return paavirkning === "lavere" ? true : paavirkning === "hoejere" ? false : null;
}

/** Klassificerer en ændring. Rækkefølgen er doughnut-platformens: uden tal først,
 *  så uændret, så uden vurdering, og først derefter retning og tempo.
 *
 *  refMaal er medianen af kommunernes ændring for samme nøgletal. */
export function klassificerUdvikling(maal, godtOp, refMaal, uaendret) {
  if (maal == null) return "ingen";
  if (uaendret) return "stagneret";
  if (godtOp == null) return "kontekst";
  // Mod målet er positiv, uanset om nøgletallet ønskes op eller ned.
  const m = godtOp ? maal : -maal;
  const mRef = refMaal == null ? null : (godtOp ? refMaal : -refMaal);
  if (m <= 0) return "forkert";
  if (mRef == null || m >= mRef) return "rigtig";
  return "tempo";
}

function median(tal) {
  if (tal.length === 0) return null;
  const s = [...tal].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** Ændringen, klassifikationen hviler på: relativt for de fleste, procentpoint for
 *  vækstrater, hvor en relativ ændring af en ændring ikke betyder noget.
 *
 *  Starter serien i nul, er den relative ændring ikke defineret, men retningen er det:
 *  en stigning fra nul er en stigning, uanset hvor stor den er. Ændringen tælles så som
 *  uendelig med fortegn, så nøgletallet kan få en retning og ikke står som "ingen
 *  tidsserie", mens grafen ligger lige ved siden af. Den uendelige ændring sætter ikke
 *  medianen (se beregnUdvikling) og står ikke som et procenttal i teksten. */
const maalFor = (d, a, ep) => {
  if (d.type === "difference") return a.pp;
  if (a.pct != null) return a.pct;
  return ep.slut === ep.start ? 0 : ep.slut > ep.start ? Infinity : -Infinity;
};

/** Udviklingen for alle kommuner og alle nøgletal.
 *
 *  Returnerer et Map: kommunekode -> {nøgletalsnavn: udvikling}, eller null uden
 *  historik. En udvikling er
 *    {retning, n, serie, start, slut, startLabel, slutLabel, midlet, pct, pp,
 *     op, landStart, landSlut}
 *  hvor retning er en af UDVIKLING_RETNINGER, serie er {aar, kommune, land, faste,
 *  prisAar} (eller null uden serie), og op siger, om værdien steg mellem
 *  endepunkterne - det er pilens retning, mens farven siger, om det var godt.
 *
 *  MEDIANEN regnes over kommunerne, hvor nøgletallet vises med en retning. En
 *  kommune, hvis tal et forbehold har taget af siden, og en, hvis retning et
 *  forbehold spærrer, sætter ikke målestokken for de andre: deres serie er ikke
 *  sammenlignelig, og deres pil viser ingen vurdering.
 *
 *  Alle kommuner regnes samtidig, fordi medianen kræver dem, men kun den valgte
 *  kommunes serie tegnes - og først, når man peger på pilen. */
export function beregnUdvikling(kommuner, land, historik) {
  if (!historik?.kommuner || !historik.land) return null;
  const tabeller = kommuner.map((k) => driverTabel(k, land));
  const resultat = new Map(kommuner.map((k) => [k.kode, {}]));

  DRIVERE.forEach((d, i) => {
    const poster = kommuner.map((k, j) => {
      const raekke = tabeller[j][i];
      const serie = driverSerie(d, historik, k.kode);
      const ep = serie ? endepunkter(serie.aar, serie.kommune) : null;
      const a = ep ? aendring(d, ep.start, ep.slut) : null;
      return { k, raekke, serie, ep, a, maal: a ? maalFor(d, a, ep) : null };
    });
    // Kun endelige ændringer: en stigning fra nul har ingen størrelse at sammenligne med.
    const reference = median(poster
      .filter((p) => Number.isFinite(p.maal) && !p.raekke.skjult && !p.raekke.spaerret)
      .map((p) => p.maal));

    for (const p of poster) {
      const { k, raekke, serie, ep, a } = p;
      let udvikling;
      if (!serie || !ep) {
        udvikling = { retning: "ingen", n: 0, serie: serie ?? null };
      } else {
        const lep = endepunkter(serie.aar, serie.land);
        udvikling = {
          retning: klassificerUdvikling(
            p.maal, opErGodt(raekke.paavirkning), reference, erUaendret(d, ep.start, ep.slut, a)),
          n: ep.n, serie, midlet: ep.midlet,
          start: ep.start, slut: ep.slut, startLabel: ep.startLabel, slutLabel: ep.slutLabel,
          pct: a.pct, pp: a.pp, op: ep.slut >= ep.start,
          landStart: lep?.start ?? null, landSlut: lep?.slut ?? null,
        };
      }
      resultat.get(k.kode)[d.navn] = udvikling;
    }
  });
  return resultat;
}

/** Kategoriens samlede udvikling: hvor mange nøgletal der bevæger sig hver vej.
 *  TÆLLER, VEJER IKKE - samme regel som samletRetning(). Hjælpetal tæller ikke
 *  med, af samme grund. "Rigtig" og "langsomt" lægges sammen, fordi begge går den
 *  rigtige vej; et nøgletal uden vurdering (uafklaret retning eller et forbehold)
 *  tælles for sig, og et uden tidsserie for sig. */
export function samletUdvikling(drivere) {
  const talte = drivere.filter((d) => d.rolle !== "hjaelper");
  const retning = (d) => d.udvikling?.retning ?? "ingen";
  const tael = (...retninger) => talte.filter((d) => retninger.includes(retning(d))).length;
  return {
    rigtig: tael("rigtig", "tempo"),
    langsomt: tael("tempo"),
    forkert: tael("forkert"),
    uaendret: tael("stagneret"),
    udenVurdering: tael("kontekst"),
    udenTidsserie: tael("ingen"),
    talte: talte.length,
  };
}

/** Hvordan kommunerne fordeler sig på hvert nøgletals udvikling, og hvilken periode
 *  udviklingen dækker. Til metodesiden, hvor tallene regnes af årets datasæt og
 *  ikke skrives i hånden. Som beregnFordeling() beskriver den nøgletallet, ikke
 *  den enkelte kommune: ingen kommune navngives, og ingen rangordnes.
 *
 *  Kommuner, hvor nøgletallet er taget af siden, tælles ikke med. */
export function beregnUdviklingFordeling(kommuner, land, historik) {
  const udvikling = beregnUdvikling(kommuner, land, historik);
  if (!udvikling) return null;
  const tabeller = kommuner.map((k) => driverTabel(k, land));

  return DRIVERE.map((d, i) => {
    const antal = Object.fromEntries(UDVIKLING_RETNINGER.map((r) => [r, 0]));
    let skjult = 0;
    const aendringer = [];
    kommuner.forEach((k, j) => {
      const raekke = tabeller[j][i];
      if (raekke.skjult) { skjult++; return; }
      const u = udvikling.get(k.kode)[d.navn];
      antal[u.retning]++;
      if (u.retning !== "ingen" && !raekke.spaerret) {
        const m = d.type === "difference" ? u.pp : u.pct;
        if (m != null) aendringer.push(m);
      }
    });
    // Perioden er landets: alle år i vinduet, hvor landet har tal.
    const serie = driverSerie(d, historik, kommuner[0].kode);
    const lep = serie ? endepunkter(serie.aar, serie.land) : null;
    return {
      navn: d.navn, kategori: d.kategori, rolle: d.rolle ?? "hoved",
      faste: d.faste === true, type: d.type, andel: d.andel ?? null,
      ...antal, skjult,
      aarFra: lep ? Number(lep.startLabel.slice(0, 4)) : null,
      aarTil: lep ? Number(lep.slutLabel.slice(-4)) : null,
      startLabel: lep?.startLabel ?? null, slutLabel: lep?.slutLabel ?? null,
      n: lep?.n ?? 0, median: median(aendringer),
    };
  });
}
