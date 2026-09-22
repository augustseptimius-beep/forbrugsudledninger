import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beregnKommune, beregnFordeling, driverTabel } from "../web/beregning.js";
import { renderKommune } from "../web/render.js";

// Kører mod det ægte datasæt, ikke mod fixtures. Fanger felter, der findes
// for én kommune, men mangler for en anden.
const data = JSON.parse(readFileSync(new URL("../web/data/data.json", import.meta.url)));
const concito = JSON.parse(readFileSync(new URL("../web/data/concito.json", import.meta.url)));
const ens = JSON.parse(readFileSync(new URL("../web/data/ens.json", import.meta.url)));

test("datasættet indeholder alle 98 kommuner", () => {
  assert.equal(data.kommuner.length, 98);
});

test("datasættet indeholder ingen beregningskoefficienter", () => {
  // Der er ingen model at parametrisere længere.
  assert.ok(!("konstanter" in data));
});

test("alle 98 kommuner kan renderes uden at kaste", () => {
  for (const k of data.kommuner) {
    const html = renderKommune(beregnKommune(k, data.land), concito, ens);
    assert.ok(html.length > 2000, `${k.navn}: mistænkeligt kort output`);
  }
});

test("intet kommuneoutput lækker undefined, NaN eller null", () => {
  for (const k of data.kommuner) {
    const html = renderKommune(beregnKommune(k, data.land), concito, ens);
    assert.ok(!html.includes("undefined"), `${k.navn}: undefined i output`);
    assert.ok(!html.includes("NaN"), `${k.navn}: NaN i output`);
    assert.ok(!/>\s*null\s*</.test(html), `${k.navn}: null i output`);
  }
});

test("alle kommuner har pendlingsafstand i km", () => {
  const uden = data.kommuner.filter((k) => k.pendlingsafstand_km == null);
  assert.deepEqual(uden.map((k) => k.navn), []);
});

test("hver kommunes nøgletal er grupperet under en kategori", () => {
  for (const k of data.kommuner.slice(0, 5)) {
    const b = beregnKommune(k, data.land);
    const igrupper = b.grupper.flatMap((g) => g.drivere).length;
    assert.equal(igrupper, b.drivere.length, `${k.navn}: nøgletal faldt ud af grupperingen`);
  }
});

test("ingen to nøgletal på siden siger det samme", () => {
  // Et nøgletal, der følger et andet næsten helt på tværs af de 98 kommuner,
  // lægger ingen oplysning til - det gentager den, og i overblikket tæller det
  // med to gange. Nettoformuen fulgte disponibel indkomst (r = +0,95), og
  // parcelhus-andelen fulgte boligarealet (r = +0,92); begge er taget af siden.
  // Grænsen 0,9 er en præsentationsbeslutning uden kilde.
  //
  // Fossil-andel og el- og plugin-hybridandelen er hinandens komplement
  // (r = -1,00) og står begge efter eksplicit valg - se beregning.js.
  //
  // Fødevareforbruget følger disponibel indkomst (r = +0,94), fordi kilden
  // netop fordeler forbruget efter indkomsten. Det er en ægte dublet, og den
  // står her som undtagelse frem for som en løsnet grænse: fødevarerne fylder
  // 1,65 ton af det nationale aftryk, og en kategori uden retning læses som en
  // kategori uden problem. Dubletten er skrevet ind i nøgletallets begrundelse,
  // så læseren ser den. Grænsen på 0,9 gælder uændret for alle andre par.
  const UNDTAGET = new Set(["El- og plugin-hybridandel|Fossil-andel",
                            "Disponibel indkomst|Fødevareforbrug pr. indbygger"]);
  const korrelation = (par) => {
    const n = par.length;
    const mx = par.reduce((s, [x]) => s + x, 0) / n;
    const my = par.reduce((s, [, y]) => s + y, 0) / n;
    const t = par.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0);
    const nx = Math.sqrt(par.reduce((s, [x]) => s + (x - mx) ** 2, 0));
    const ny = Math.sqrt(par.reduce((s, [, y]) => s + (y - my) ** 2, 0));
    return t / (nx * ny);
  };
  const tabeller = data.kommuner.map((k) => driverTabel(k, data.land));
  const navne = tabeller[0].map((d) => d.navn);
  const fund = [];
  for (let i = 0; i < navne.length; i++) {
    for (let j = i + 1; j < navne.length; j++) {
      const par = tabeller
        .map((t) => [t[i].kommuneVaerdi, t[j].kommuneVaerdi])
        .filter(([x, y]) => x != null && y != null);
      const r = korrelation(par);
      const noegle = [navne[i], navne[j]].sort().join("|");
      if (Math.abs(r) > 0.9 && !UNDTAGET.has(noegle)) {
        fund.push(`${noegle}: r = ${r.toFixed(2)}`);
      }
    }
  }
  assert.deepEqual(fund, []);
});

test("datasættet indeholder ingen felter, siden ikke bruger", () => {
  // Et felt, ingen side læser, er en kilde at vedligeholde og en række i
  // kildetabellen uden et tal på siden. Tages et nøgletal af siden, skal dets
  // felter derfor også ud af pipelinen. Hvilke felter der bruges, måles ved at
  // lade motoren regne på et objekt, der husker hvert felt, den læser.
  const RESERVERET = {
    navn: "kommunens navn", kode: "kommunekode", region: "region",
    gini: "hentes til en vurdering af rimelig og retfærdig omstilling",
  };
  const laest = new Set();
  const spion = (k) => new Proxy(k, { get(t, p) { laest.add(p); return t[p]; } });
  for (const k of data.kommuner) driverTabel(spion(k), data.land);
  const ubrugte = Object.keys(data.kommuner[0])
    .filter((f) => !laest.has(f) && !(f in RESERVERET));
  assert.deepEqual(ubrugte.sort(), []);
});

// --- Husholdningernes energi og udledning (Klimaregnskabet.dk) ---

test("husholdningstallene findes for alle 98 kommuner", () => {
  const uden = data.kommuner.filter((k) => k.husholdning_co2_ton == null);
  assert.deepEqual(uden.map((k) => k.navn), []);
});

test("fritidshuse er hentet, så husholdningstallene kan fordeles retvisende", () => {
  const uden = data.kommuner.filter((k) => k.fritidshuse == null);
  assert.deepEqual(uden.map((k) => k.navn), []);
});

test("landets husholdningstal er summen af kommunernes", () => {
  // Ikke et selvstændigt opslag - så tæller og nævner dækker samme område.
  const sum = data.kommuner.reduce((s, k) => s + k.husholdning_co2_ton, 0);
  assert.ok(Math.abs(sum - data.land.husholdning_co2_ton) < 1,
    `${sum} mod ${data.land.husholdning_co2_ton}`);
});

test("husholdningernes energi pr. bolig følger IKKE fritidshustætheden", () => {
  // Kernen i hvorfor husholdningstallene fordeles på boliger og ikke på
  // indbyggere: et sommerhus bruger energi, men ejeren er registreret i en
  // anden kommune og tæller ikke med i folketallet. Fordeles der på
  // indbyggere, ser en sommerhuskommune ud, som om dens borgere bruger
  // urimeligt meget. Holder fordelingen ikke sommerhuseffekten nede, er
  // nævneren forkert igen.
  //
  // MÅLT PÅ ENERGI, IKKE PÅ CO2, OG DET ER ET BEVIDST VALG.
  //
  // Testen målte tidligere husholdning_co2_ton. Dér findes sammenhængen ikke
  // i nogen brugbar styrke: på 2023-tallene lå den 0,20 mod 0,21 og bestod
  // altså med en hundrededels margin, og på 2024-tallene vendte den om, 0,22
  // mod 0,14. Årsagen er, at udledningen er energiforbruget ganget med
  // fjernvarmenettets egen faktor, og den faktor svinger så voldsomt mellem
  // kommunerne - fra flis til gas - at den overdøver sommerhuseffekten. En
  // vagt, der bestod med 0,01, holdt ikke øje med noget.
  //
  // Energien bærer derimod signalet rent, og det er også energien,
  // fetch_klimaregnskabet._maalte_sammenhaenge dokumenterer beslutningen med:
  // pr. indbygger omkring +0,7, fordelt på samtlige boliger tæt på nul.
  // Nævneren bruges af BEGGE husholdningsnøgletal, så vagten dækker også
  // CO2-tallet - den står bare dér, hvor sammenhængen kan måles.
  const r = data.kommuner.map((k) => {
    const helaar = k.boliger_parcel + k.boliger_raekke + k.boliger_etage;
    return {
      fritidsandel: k.fritidshuse / helaar,
      prBolig: k.husholdning_energi_tj / (helaar + k.fritidshuse),
      prIndb: k.husholdning_energi_tj / k.folketal,
    };
  });
  const korr = (xs, ys) => {
    const n = xs.length, mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
    const t = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
    const n1 = Math.sqrt(xs.reduce((s, x) => s + (x - mx) ** 2, 0));
    const n2 = Math.sqrt(ys.reduce((s, y) => s + (y - my) ** 2, 0));
    return t / (n1 * n2);
  };
  const f = r.map((x) => x.fritidsandel);
  const prBolig = Math.abs(korr(f, r.map((x) => x.prBolig)));
  const prIndb = Math.abs(korr(f, r.map((x) => x.prIndb)));
  assert.ok(prBolig < prIndb,
    `fordeling på boliger skal svække sommerhus-sammenhængen (${prBolig.toFixed(2)} mod ${prIndb.toFixed(2)})`);
  assert.ok(prBolig < 0.4, `for stærk sammenhæng tilbage: ${prBolig.toFixed(2)}`);
});

test("fritidshuse: husholdningstallene pr. bolig vises ikke præcis hos kommuner med flere fritidshuse end helårsboliger", () => {
  // Samme binding som for affaldet: forbeholdet skal følge kommunens egne tal,
  // ikke en liste. Ellers kan et husholdningstal forsvinde fra siden, uden at
  // nogen opdager hvorfor - eller stå med en retning, fordelingen har skabt.
  const PR_BOLIG = ["Husholdningernes CO2 fra energi", "Husholdningernes energiforbrug"];
  let ramte = 0;
  for (const k of data.kommuner) {
    const flere = k.fritidshuse > k.boliger_parcel + k.boliger_raekke + k.boliger_etage;
    if (flere) ramte++;
    const udeladt = beregnKommune(k, data.land).udeladt.map((u) => u.navn);
    for (const navn of PR_BOLIG) {
      assert.equal(udeladt.includes(navn), flere, `${k.navn}/${navn}`);
    }
  }
  assert.ok(ramte > 0 && ramte < 10, `${ramte} kommuner ramt - er grænsen flyttet?`);
});

test("fossil andel af husholdningernes energi ligger mellem 0 og 1", () => {
  for (const k of data.kommuner) {
    if (k.husholdning_fossil_andel == null) continue;
    assert.ok(k.husholdning_fossil_andel >= 0 && k.husholdning_fossil_andel <= 1,
      `${k.navn}: ${k.husholdning_fossil_andel}`);
  }
});

test("landets el og fjernvarme er summen af kommunernes", () => {
  // Den fælles el-faktor og fjernvarmens landstal regnes af landets summer. Er
  // landet et selvstændigt opslag, dækker tæller og nævner ikke det samme.
  for (const felt of ["husholdning_el_tj", "husholdning_el_co2_ton",
                      "husholdning_fjernvarme_tj", "husholdning_fjernvarme_co2_ton"]) {
    const sum = data.kommuner.reduce((s, k) => s + k[felt], 0);
    assert.ok(Math.abs(sum - data.land[felt]) <= 1e-6 * Math.max(1, sum),
      `${felt}: ${sum} mod ${data.land[felt]}`);
  }
});

test("husholdningernes CO2 følger ikke kommunens egen el-faktor", () => {
  // Kernen i omregningen: kommunens lokale el-udledning må ikke slå igennem.
  // Fjernes den helt fra kommunens tal, skal nøgletallet stå præcis som før.
  const navn = "Husholdningernes CO2 fra energi";
  let maalt = 0;
  for (const k of data.kommuner) {
    if (!k.husholdning_el_tj) continue;
    const udenLokalEl = { ...k, husholdning_el_co2_ton: 0,
      husholdning_co2_ton: k.husholdning_co2_ton - k.husholdning_el_co2_ton };
    const med = driverTabel(k, data.land).find((d) => d.navn === navn).kommuneVaerdi;
    const uden = driverTabel(udenLokalEl, data.land).find((d) => d.navn === navn).kommuneVaerdi;
    assert.ok(Math.abs(med - uden) < 1e-9, `${k.navn}: den lokale el-faktor slår igennem`);
    maalt++;
  }
  assert.ok(maalt > 90, `kun ${maalt} kommuner målt`);
});

test("fjernvarmens CO2 pr. kWh findes præcis for kommuner med fjernvarme", () => {
  const navn = "Fjernvarmens CO2 pr. kWh";
  for (const k of data.kommuner) {
    const v = driverTabel(k, data.land).find((d) => d.navn === navn).kommuneVaerdi;
    assert.equal(v == null, !(k.husholdning_fjernvarme_tj > 0), k.navn);
  }
});

// --- Fordelingskonteksten må aldrig blive en rangordning ---

const fordeling = beregnFordeling(data.kommuner, data.land);

// Afløste en test, der bevidnede det samme indirekte: den slog fast, at
// spændet ("8 ud af 10 kommuner: X - Y") stod ordret ens på alle 98 sider og
// derfor beskrev nøgletallet, ikke kommunen. Spændet er fjernet fra
// kommunesiden, og med det forsvandt beviset. Denne test er den direkte udgave:
// den kigger efter selve de udsagn, en rangordning ville kræve - og kører på
// alle 98 kommuner, ikke kun én.
const RANGORDNINGS_MØNSTRE = [
  [/\bnr\.\s*\d+\s*af\b/i, "placering (nr. X af Y)"],
  [/percentil/i, "percentil"],
  [/(laveste|højeste|lavest|højest) i landet/i, "yderpunkt"],
  [/\d+\s*ud af\s*\d+\s*kommuner/i, "spænd-optælling"],
  // Bredt på stammen "spænd", ikke på en bestemt formulering. En tidligere udgave
  // ledte kun efter "over/under spændet" og lod derfor sætningen "Spændene beskriver
  // nøgletallet og er ens på alle 98 kommunesider" blive stående på hver eneste side,
  // længe efter at spændene var fjernet.
  [/spænd/i, "omtale af et spænd, der ikke findes på kommunesiden"],
];

test("ingen kommuneside indeholder et udsagn, der rangordner kommuner", () => {
  for (const k of data.kommuner) {
    const h = renderKommune(beregnKommune(k, data.land), concito, ens);
    for (const [møn, hvad] of RANGORDNINGS_MØNSTRE) {
      assert.ok(!møn.test(h), `${k.navn}: ${hvad} er en rangordning`);
    }
  }
});

test("ingen kommuneside navngiver en anden kommune", () => {
  // Regel 3 i beregnFordeling's kontrakt, som hidtil kun stod som en kommentar.
  // Uden den kan et nøgletal begynde at sige "højere end i Aarhus", hvilket er
  // en sammenligning, værktøjet ikke laver. HTML-tags fjernes først, så
  // kommunenavne i fx et data-attribut ikke tæller som synlig tekst.
  const navne = data.kommuner.map((k) => k.navn);
  for (const k of data.kommuner) {
    const tekst = renderKommune(beregnKommune(k, data.land), concito, ens)
      .replace(/<[^>]*>/g, " ");
    for (const andet of navne) {
      if (andet === k.navn) continue;
      // Kommunenavne, der indgår i et andet navn (Ærø i Ærøskøbing, Fanø i
      // Fanøvej), må ikke give falske træf - derfor ordgrænser på begge sider.
      const møn = new RegExp(`(^|[^\\p{L}])${andet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\p{L}]|$)`, "u");
      assert.ok(!møn.test(tekst), `${k.navn}s side navngiver ${andet}`);
    }
  }
});

test("fordeling: n afspejler faktisk dækning, ikke et hardkodet 98", () => {
  // Mangler et tal for én kommune, må optællingen ikke påstå "af 98".
  const medHul = data.kommuner.map((k, i) => (i === 0 ? { ...k, pendlingsafstand_km: null } : k));
  const f = beregnFordeling(medHul, data.land);
  assert.equal(f["Gennemsnitlig pendlingsafstand"].n, data.kommuner.length - 1);
  assert.equal(f["Biler pr. indbygger"].n, data.kommuner.length);
});

test("fordeling: den skævhed, konteksten findes for, er stadig til stede", () => {
  // Låser problemet fast: hvis de to nogensinde nærmer sig hinanden, er
  // tærsklerne blevet ændret, og konteksten skal genovervejes.
  assert.ok(fordeling["Fossil andel af husholdningernes energi"].markant > 70);
  assert.equal(fordeling["Gennemsnitligt boligareal"].markant, 0);
});

test("alle 98 kommuner renderes med fordeling uden undefined, NaN eller null", () => {
  for (const k of data.kommuner) {
    const h = renderKommune(beregnKommune(k, data.land), concito, ens);
    assert.ok(!h.includes("undefined"), `${k.navn}: undefined`);
    assert.ok(!h.includes("NaN"), `${k.navn}: NaN`);
    assert.ok(!/>\s*null\s*</.test(h), `${k.navn}: null`);
  }
});

const AFFALDSNOEGLETAL = ["Husholdningsaffald", "Genanvendelsesprocent"];

test("affald: nøgletallene vises ikke præcis hos dem, der deler indberetning", () => {
  // Reglen var før global: ingen af de 98 fik et retningsmærkat, fordi nogle af
  // dem havde fået hinandens tonnage bogført. Den er nu per kommune, så testen
  // skal binde de to lister sammen - ellers kan en kommune miste sine
  // affaldstal, uden at nogen opdager hvorfor.
  for (const k of data.kommuner) {
    const spaerret = k.affald_indberetning === "bekraeftet_fejl";
    const b = beregnKommune(k, data.land);
    for (const navn of AFFALDSNOEGLETAL) {
      assert.equal(b.udeladt.some((u) => u.navn === navn), spaerret,
        `${k.navn}/${navn}: ${spaerret ? "deler indberetning og skal tages af siden"
          : "intet forbehold, så nøgletallet skal stå"}`);
    }
  }
});

test("et hovednøgletal uden retning vises kun, når et forbehold bevidst beholder det", () => {
  // Reglen testes på mekanismen, ikke på en liste over ramte kommuner: hvilke
  // nøgletal der spærres, afgøres af årets tal.
  //
  // Der er to slags "uden retning", og de må ikke smelte sammen igen. Et
  // hovednøgletal, hvis retning værktøjet slet ikke kan begrunde, hører ikke
  // hjemme på en kommuneside. Et, hvor kommunens EGET forhold spærrer
  // sammenligningen - færgedriften - bliver stående med forbeholdet ved siden
  // af, fordi tallet er rigtigt. Blandes de to, forsvinder færgekommunernes
  // indkøb igen, sådan som de gjorde før.
  for (const k of data.kommuner) {
    const b = beregnKommune(k, data.land);
    const vist = b.drivere.filter((d) => d.signal === "uafklaret" && d.rolle !== "hjaelper");
    for (const d of vist) {
      assert.ok(d.spaerret && !d.skjult,
        `${k.navn}/${d.navn}: står uden retning uden et forbehold, der beholder det`);
      assert.ok(d.forbeholdNote, `${k.navn}/${d.navn}: står uden retning og uden forklaring`);
      assert.notEqual(d.kommuneVaerdi, null,
        `${k.navn}/${d.navn}: beholdt uden retning, men har intet tal at vise`);
    }
    // Intet må forsvinde tavst: hvert nøgletal står enten på siden eller som udeladt.
    assert.equal(b.drivere.length + b.udeladt.length, driverTabel(k, data.land).length,
      `${k.navn}: et nøgletal er hverken vist eller udeladt`);
  }
});

test("færgekommunerne beholder deres indkøbstal, men får ingen retning", () => {
  // Det var her den gamle sammenblanding gjorde skade: forbeholdet var ment som
  // "retningen kan ikke afgøres", men fjernede alle fire indkøbsnøgletal fra
  // Læsø, Samsø og Ærø. Kronerne er udløst, og brændstoffet er brændt - det er
  // sammenligningen pr. indbygger, færgen gør skæv, ikke bogføringen.
  const faerge = data.kommuner.filter((k) => k.indkoeb_forbehold === "faergedrift");
  assert.ok(faerge.length > 0, "datasættet har ingen færgekommuner at teste på");
  for (const k of faerge) {
    const b = beregnKommune(k, data.land);
    const indkoeb = b.drivere.filter((d) => d.navn.startsWith("Kommunens "));
    assert.equal(indkoeb.length, 4, `${k.navn}: alle fire indkøbsnøgletal skal stå på siden`);
    for (const d of indkoeb) {
      assert.equal(d.signal, "uafklaret", `${k.navn}/${d.navn}: må ikke have en retning`);
      assert.notEqual(d.kommuneVaerdi, null, `${k.navn}/${d.navn}: tallet skal stå`);
    }
    assert.deepEqual(b.udeladt.filter((u) => u.navn.startsWith("Kommunens ")), [],
      `${k.navn}: intet indkøbsnøgletal må være taget af siden`);
  }
});

test("et udeladt nøgletal nævnes på kommunesiden sammen med begrundelsen", () => {
  for (const k of data.kommuner) {
    const b = beregnKommune(k, data.land);
    if (b.udeladt.length === 0) continue;
    const h = renderKommune(b, concito, ens);
    for (const u of b.udeladt) {
      assert.ok(h.includes(u.navn), `${k.navn}: ${u.navn} er ikke nævnt`);
      assert.ok(h.includes(u.note), `${k.navn}: begrundelsen for ${u.navn} står ikke`);
    }
  }
});

test("affald: forbeholdet rammer et mindretal, ikke alle 98", () => {
  // Vagt mod at et fremtidigt datasæt stille sætter forbehold på alle igen -
  // så ville nøgletallene være tilbage ved den blanket-regel, der netop er
  // afskaffet, uden at nogen test sagde fra.
  const medForbehold = data.kommuner.filter((k) => k.affald_indberetning).length;
  assert.ok(medForbehold > 0, "de kendte fejlkommuner skal stadig fanges");
  assert.ok(medForbehold < data.kommuner.length / 2,
    `${medForbehold} af ${data.kommuner.length} har forbehold - er blanket-reglen tilbage?`);
});

test("affald: hver spærret kommune er navngivet i pipelinens kildeliste", () => {
  // Spærringen bygger på et eftervist bytte af tonnage mellem navngivne
  // ejerkommuner, ikke på at tallet ser mærkeligt ud. Falder en kommune uden
  // for listen, er den kommet ind ad en anden vej end beviset.
  const NORFORS_OG_RENO_DJURS = new Set([
    "Allerød", "Fredensborg", "Helsingør", "Hørsholm", "Rudersdal",
    "Norddjurs", "Syddjurs",
  ]);
  for (const k of data.kommuner) {
    if (k.affald_indberetning !== "bekraeftet_fejl") continue;
    assert.ok(NORFORS_OG_RENO_DJURS.has(k.navn),
      `${k.navn} er spærret uden at stå i den navngivne kildeliste`);
  }
});

test("indkomstens robusthed er vurderet for alle 98 kommuner", () => {
  // Feltet skal findes på hver kommune. null er normaltilstanden og betyder
  // "intet at bemærke" - mangler feltet helt, er vurderingen ikke kørt.
  const uden = data.kommuner.filter((k) => !("indkomst_robusthed" in k));
  assert.deepEqual(uden.map((k) => k.navn), []);
  const markeret = data.kommuner.filter((k) => k.indkomst_robusthed);
  // Markeringen skal være sjælden. Rammer den mange kommuner, er det reglen,
  // der er for løs, ikke datasættet, der er blevet dårligt.
  assert.ok(markeret.length <= 10,
    `for mange markerede: ${markeret.map((k) => k.navn).join(", ")}`);
  for (const k of markeret) {
    const d = driverTabel(k, data.land).find((x) => x.navn === "Disponibel indkomst");
    assert.match(d.begrundelse, /kapitalindkomst hos få personer/,
      `${k.navn}: markeringen når ikke frem til nøgletallet`);
  }
});
