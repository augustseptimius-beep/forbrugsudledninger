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

test("el-CO2 og VE-dækning følges ad", () => {
  for (const k of data.kommuner) {
    const harEl = k.elco2_g_kwh != null;
    const harVe = k.ve_daekning_pct != null;
    assert.equal(harEl, harVe, `${k.navn}: kun det ene felt er udfyldt`);
  }
});

test("høj lokal VE-dækning giver lav el-CO2", () => {
  // Kernemekanismen i Energinets lokationsbaserede metode.
  const k = data.kommuner.filter((x) => x.elco2_g_kwh != null && x.ve_daekning_pct != null);
  if (k.length < 10) return;
  const halv = Math.floor(k.length / 2);
  const efterVE = [...k].sort((a, b) => b.ve_daekning_pct - a.ve_daekning_pct);
  const gns = (l) => l.reduce((s, x) => s + x.elco2_g_kwh, 0) / l.length;
  assert.ok(gns(efterVE.slice(0, halv)) < gns(efterVE.slice(-halv)));
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
  const UNDTAGET = new Set(["El- og plugin-hybridandel|Fossil-andel"]);
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

test("husholdningernes CO2 pr. bolig følger IKKE fritidshustætheden", () => {
  // Kernen i hvorfor tallet fordeles på boliger og ikke på indbyggere. Gør
  // det det alligevel, er nævneren forkert igen.
  const r = data.kommuner.map((k) => {
    const helaar = k.boliger_parcel + k.boliger_raekke + k.boliger_etage;
    return {
      fritidsandel: k.fritidshuse / helaar,
      prBolig: k.husholdning_co2_ton / (helaar + k.fritidshuse),
      prIndb: k.husholdning_co2_ton / k.folketal,
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

test("fritidshuse: retningen holdes tilbage præcis hos kommuner med flere fritidshuse end helårsboliger", () => {
  // Samme binding som for affaldet: forbeholdet skal følge kommunens egne tal,
  // ikke en liste. Ellers kan et husholdningstal miste sin retning, uden at
  // nogen opdager hvorfor - eller beholde en retning, fordelingen har skabt.
  const PR_BOLIG = ["Husholdningernes CO2 fra energi", "Husholdningernes energiforbrug"];
  let ramte = 0;
  for (const k of data.kommuner) {
    const flere = k.fritidshuse > k.boliger_parcel + k.boliger_raekke + k.boliger_etage;
    if (flere) ramte++;
    for (const r of driverTabel(k, data.land)) {
      if (!PR_BOLIG.includes(r.navn)) continue;
      assert.equal(r.signal === "uafklaret", flere, `${k.navn}/${r.navn}`);
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

test("landsværdierne er de beregnede, ikke et tal fra en anden opgørelse", () => {
  // Historisk vagt. Sikkerhedsnettet EL_CO2_MANUAL er fjernet, men fejlen det
  // forårsagede må ikke kunne komme tilbage: faldt landet tilbage til den
  // håndaflæste 51,8, mens de 98 kommuner brugte de beregnede tal, blev hver
  // eneste afvigelse regnet mod et forkert landsgennemsnit.
  assert.notEqual(data.land.elco2_g_kwh, 51.8,
    "landet bruger et håndaflæst tal fra en anden opgørelse");
  assert.ok(data.land.ve_daekning_pct != null, "landets VE-dækning mangler");
  const vaerdier = data.kommuner.map((k) => k.elco2_g_kwh).filter((v) => v != null);
  assert.ok(data.land.elco2_g_kwh > Math.min(...vaerdier));
  assert.ok(data.land.elco2_g_kwh < Math.max(...vaerdier));
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

test("affald: retningen holdes tilbage præcis hos dem, der deler indberetning", () => {
  // Reglen var før global: ingen af de 98 fik et retningsmærkat, fordi nogle af
  // dem havde fået hinandens tonnage bogført. Den er nu per kommune, så testen
  // skal binde de to lister sammen - ellers kan en kommune miste sit mærkat,
  // uden at nogen opdager hvorfor.
  for (const k of data.kommuner) {
    const spaerret = k.affald_indberetning === "bekraeftet_fejl";
    for (const r of driverTabel(k, data.land)) {
      if (!AFFALDSNOEGLETAL.includes(r.navn)) continue;
      if (spaerret) {
        assert.equal(r.signal, "uafklaret",
          `${k.navn}/${r.navn}: deler indberetning, retningen kan ikke bæres`);
      } else {
        assert.notEqual(r.signal, "uafklaret",
          `${k.navn}/${r.navn}: intet forbehold, så retningen skal stå`);
      }
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
