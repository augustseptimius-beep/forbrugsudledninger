// Regnearkseksporten.
//
// HVAD DER HOLDES FAST HER. Arket bærer de samme tal, de samme kilder og de
// samme forbehold som kommunens side, og det regner dem som FORMLER, så den,
// der henter det, kan sætte egne tal ind. To ting kan derfor gå galt, og de
// er hver sin slags:
//
//   1. Formlen kan komme til at regne noget andet end motoren. Testene
//      nedenfor regner arket igennem med test/regneark.js og holder hver
//      celle op mod beregnKommune() - for alle 98 kommuner, ikke kun for
//      Thisted, fordi forbeholdene først slår ud i nogle få af dem.
//   2. Arket kan komme til at vise noget, kommunens side holder tilbage.
//      Et nøgletal, hvis eget tal er ramt af et forbehold, er taget af siden,
//      og så må dets rådata heller ikke ligge i arket - ellers kan enhver
//      regne det skjulte tal ud af de felter, der blev liggende.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beregnKommune, samletRetning, DRIVERE } from "../web/beregning.js";
import {
  byggProjektmappe, eksportFilnavn, eksportFelter, formelFelter,
  tilRegnearksformel, FELTTEKST, NOEGLE_FOERSTE, DATA_FOERSTE,
} from "../web/eksport.js";
import { beregnArk, lavArkbog, vaerdi } from "./regneark.js";

const hent = (fil) => JSON.parse(readFileSync(new URL(`../web/data/${fil}`, import.meta.url)));
const data = hent("data.json");
const sources = hent("sources.json");
const ens = hent("ens.json");

// En række i arkmodellen er enten en ren liste celler eller et objekt med en
// rækkehøjde. Testene er ligeglade med højden.
const raekkeCeller = (r) => (Array.isArray(r) ? r : r.celler);

function mappe(navn, aendring = null) {
  const kommune = data.kommuner.find((k) => k.navn === navn);
  const brugt = aendring ? { ...kommune, ...aendring } : kommune;
  const b = beregnKommune(brugt, data.land);
  return {
    b,
    kommune: brugt,
    ark: byggProjektmappe({
      b, kommune: brugt, land: data.land, sources, ens, genereret: "2026-09-22",
      url: `https://eksempel.dk/?kommune=${brugt.kode}`,
    }),
  };
}

const thisted = mappe("Thisted");

// ---------- Arkene ----------

test("eksport: projektmappen har de ark, den lover på forsiden", () => {
  assert.deepEqual(thisted.ark.map((a) => a.navn),
    ["Læs mig", "Overblik", "Nøgletal", "Data", "Grundlag", "Kilder", "Nationalt"]);
});

test("eksport: hvert ark har frosne ruder eller er kort nok til at undvære", () => {
  // En tabel uden frossen overskrift er ulæselig, så snart man ruller.
  for (const navn of ["Nøgletal", "Data", "Grundlag", "Kilder", "Overblik"]) {
    const ark = thisted.ark.find((a) => a.navn === navn);
    assert.ok(ark.frys?.raekke > 0, `${navn} mangler frossen overskrift`);
  }
});

// ---------- Feltkataloget ----------

test("eksport: feltkataloget dækker præcis de felter, nøgletallene læser", () => {
  // Drift-vagten. Et nyt nøgletal med et nyt felt ville ellers stå i arket med
  // feltets tekniske navn og ingen enhed - og et felt, der ikke længere læses,
  // ville blive stående som en kolonne, intet regner på.
  const læst = new Set();
  for (const d of DRIVERE) {
    const { kommune, land } = formelFelter(d.formel);
    for (const f of [...kommune, ...land]) læst.add(f);
  }
  assert.deepEqual([...læst].sort(), Object.keys(FELTTEKST).sort());
});

test("eksport: hvert rådatafelt i arket har en kilde", () => {
  const dataArk = thisted.ark.find((a) => a.navn === "Data");
  for (let i = DATA_FOERSTE - 1; i < dataArk.raekker.length; i++) {
    const r = raekkeCeller(dataArk.raekker[i]);
    assert.ok(r[9].v, `${r[0].v} står i arket uden kilde`);
    assert.ok(r[10].v, `${r[0].v} står i arket uden periode`);
  }
});

// ---------- Tallene ----------

/** Regn arket Nøgletal igennem og hold hver celle op mod motoren. */
function sammenlignMedMotoren(navn, aendring = null) {
  const { b, ark } = mappe(navn, aendring);
  const celler = beregnArk(ark, "Nøgletal");
  b.drivere.forEach((d, i) => {
    const nr = NOEGLE_FOERSTE + i;
    const hvor = `${navn}, ${d.navn}`;
    assert.equal(celler.get(`B${nr}`), d.navn, `${hvor}: rækken står forkert`);
    for (const [kol, vent, hvad] of [
      ["E", d.kommuneVaerdi, "kommunens værdi"],
      ["F", d.landVaerdi, "landsværdien"],
      ["G", d.afvigelse, "afvigelsen"],
      ["H", d.procentpoint, "procentpoint"],
      ["I", d.baand, "niveauet"],
      ["K", d.signal, "retningen"],
    ]) {
      const faktisk = celler.get(`${kol}${nr}`);
      if (vent == null) {
        assert.ok(faktisk === "" || faktisk === undefined,
          `${hvor}: ${hvad} skulle være tom, men arket siger ${JSON.stringify(faktisk)}`);
      } else if (typeof vent === "number") {
        assert.ok(Math.abs(faktisk - vent) <= Math.abs(vent) * 1e-12 + 1e-12,
          `${hvor}: ${hvad} er ${faktisk}, motoren siger ${vent}`);
      } else {
        assert.equal(faktisk, vent, `${hvor}: ${hvad}`);
      }
    }
  });
  return { b, ark, celler };
}

test("eksport: arket regner det samme som motoren i alle 98 kommuner", () => {
  for (const k of data.kommuner) sammenlignMedMotoren(k.navn);
});

test("eksport: overblikkets optælling er den samme som motorens", () => {
  const MAERKAT = {
    "højere": "højere", "lavere": "lavere",
    delt: "trækker i hver sin retning", "på niveau": "på landsgennemsnittet",
    "ingen retning": "retningen kan ikke afgøres", "ingen data": "ingen nøgletal",
  };
  // Læsø og Ærø har spærrede nøgletal, Samsø også - de er de eneste kommuner,
  // hvor "retningen kan ikke afgøres" overhovedet kan opstå, og optællingen
  // skal skelne dem fra "ingen data".
  for (const navn of ["Thisted", "Greve", "Læsø", "Samsø", "Ærø", "København"]) {
    const { b, ark } = mappe(navn);
    const celler = beregnArk(ark, "Overblik");
    for (let nr = 6; nr <= 12; nr++) {
      const kategori = celler.get(`A${nr}`);
      const gruppe = b.grupper.find((g) => g.kategori === kategori);
      const s = gruppe ? samletRetning(gruppe.drivere)
        : { talte: 0, op: 0, ned: 0, paaNiveau: 0, udenRetning: 0, udenData: 0,
            retning: "ingen data" };
      const hvor = `${navn}, ${kategori}`;
      assert.equal(celler.get(`D${nr}`), s.talte, `${hvor}: antal nøgletal med retning`);
      assert.equal(celler.get(`E${nr}`), s.op, `${hvor}: peger højere`);
      assert.equal(celler.get(`F${nr}`), s.ned, `${hvor}: peger lavere`);
      assert.equal(celler.get(`G${nr}`), s.paaNiveau, `${hvor}: på niveau`);
      assert.equal(celler.get(`H${nr}`), s.udenRetning, `${hvor}: uden retning`);
      assert.equal(celler.get(`I${nr}`), s.udenData, `${hvor}: uden data`);
      assert.equal(celler.get(`J${nr}`), MAERKAT[s.retning], `${hvor}: samlet retning`);
    }
  }
});

// ---------- Egne datapunkter ----------

/** Skriv en egen værdi ind i arket Data, som brugeren ville gøre det. */
function saetEgenVaerdi(ark, felt, vaerdi_, kilde = null) {
  const dataArk = ark.find((a) => a.navn === "Data");
  const nr = dataArk.raekker.findIndex((r) => raekkeCeller(r)[0]?.v === felt);
  assert.notEqual(nr, -1, `feltet ${felt} står ikke i arket`);
  raekkeCeller(dataArk.raekker[nr])[4] = { v: vaerdi_, stil: "indtast" };
  if (kilde) raekkeCeller(dataArk.raekker[nr])[11] = { v: kilde, stil: "indtastTekst" };
  return nr + 1;
}

test("eksport: en egen værdi slår igennem hele vejen til retningen", () => {
  // Selve løftet i arket. Tredobles elbilerne, stiger el-andelen, afvigelsen
  // vender, og retningen skifter fra højere til lavere udledning - uden at
  // nogen har rørt en formel.
  const { b, ark, kommune } = mappe("Thisted");
  const foer = beregnArk(ark, "Nøgletal");
  const nr = NOEGLE_FOERSTE + b.drivere.findIndex((d) => d.navn === "El- og plugin-hybridandel");
  // Thisted ligger under landet på el-andel, og lav el-andel peger mod HØJERE
  // udledning. Afvigelsen er under 33 procent, så mærkatet er "højere".
  assert.equal(foer.get(`K${nr}`), "højere");

  saetEgenVaerdi(ark, "biler_el", kommune.biler_el * 3, "Egen optælling");
  const efter = beregnArk(ark, "Nøgletal");
  const vent = beregnKommune({ ...kommune, biler_el: kommune.biler_el * 3 }, data.land)
    .drivere.find((d) => d.navn === "El- og plugin-hybridandel");
  assert.equal(efter.get(`E${nr}`), vent.kommuneVaerdi);
  assert.equal(efter.get(`G${nr}`), vent.afvigelse);
  assert.equal(efter.get(`K${nr}`), "markant lavere");
});

test("eksport: kildens eget tal bliver stående ved siden af den egne værdi", () => {
  // Reglen om, at intet tal står uden kilde, båret over i et regneark. Havde
  // den egne værdi overskrevet kildens celle, kunne ingen bagefter se, hvad
  // der var hentet og hvad der var sat ind i hånden.
  const { ark, kommune } = mappe("Thisted");
  const nr = saetEgenVaerdi(ark, "biler_el", 1, "Egen optælling");
  const bog = lavArkbog(ark);
  assert.equal(vaerdi(bog, "Data", `D${nr}`), kommune.biler_el, "kildens tal er væk");
  assert.equal(vaerdi(bog, "Data", `E${nr}`), 1, "den egne værdi står ikke");
  assert.equal(vaerdi(bog, "Data", `F${nr}`), 1, "arket regner ikke på den egne værdi");
});

test("eksport: sletter man sin egen værdi, falder arket tilbage på kilden", () => {
  const { ark, kommune } = mappe("Thisted");
  const nr = saetEgenVaerdi(ark, "biler_el", 1);
  const dataArk = ark.find((a) => a.navn === "Data");
  raekkeCeller(dataArk.raekker[nr - 1])[4] = { v: "", stil: "indtast" };
  const bog = lavArkbog(ark);
  assert.equal(vaerdi(bog, "Data", `F${nr}`), kommune.biler_el);
});

test("eksport: en egen værdi uden kildeangivelse bliver sagt højt", () => {
  const { ark } = mappe("Thisted");
  const medKilde = saetEgenVaerdi(ark, "biler_el", 1, "Egen optælling");
  const uden = saetEgenVaerdi(ark, "byggeri", 1);
  const bog = lavArkbog(ark);
  assert.equal(vaerdi(bog, "Data", `M${medKilde}`), "");
  assert.match(vaerdi(bog, "Data", `M${uden}`), /mangler en kildeangivelse/);
  // Forsiden tæller dem op, så man ikke skal lede.
  const forside = beregnArk(ark, "Læs mig");
  const status = [...forside].filter(([, v]) => typeof v === "number");
  assert.ok(status.some(([, v]) => v === 2), "forsiden tæller ikke de to egne værdier");
  assert.ok(status.some(([, v]) => v === 1), "forsiden tæller ikke den manglende kilde");
});

test("eksport: tærsklerne står i celler og styrer faktisk mærkaterne", () => {
  // Tærsklerne er en visningsbeslutning uden kilde. Står de som tal inde i
  // formlerne, kan ingen prøve en anden grænse - og så ligner de en måling.
  const { b, ark } = mappe("Thisted");
  const noegletal = ark.find((a) => a.navn === "Nøgletal");
  const nr = NOEGLE_FOERSTE + b.drivere.findIndex((d) => d.baand === "markant over");
  assert.ok(nr >= NOEGLE_FOERSTE, "fixturen har intet markant nøgletal at prøve med");
  assert.equal(beregnArk(ark, "Nøgletal").get(`I${nr}`), "markant over");
  // Skru "markant" helt op, og det samme tal er ikke markant længere.
  raekkeCeller(noegletal.raekker[5])[1] = { v: 50, stil: "vaerdiPct" };
  assert.equal(beregnArk(ark, "Nøgletal").get(`I${nr}`), "over");
});

test("eksport: antagelsen om retning står i en celle og kan vendes", () => {
  const { b, ark } = mappe("Thisted");
  const noegletal = ark.find((a) => a.navn === "Nøgletal");
  const i = b.drivere.findIndex((d) => d.signal === "markant højere");
  const nr = NOEGLE_FOERSTE + i;
  raekkeCeller(noegletal.raekker[nr - 1])[9] = { v: "lavere", stil: "tekst" };
  assert.equal(beregnArk(ark, "Nøgletal").get(`K${nr}`), "markant lavere");
});

// ---------- Forbehold ----------

test("eksport: et skjult nøgletals rådata står ikke i arket", () => {
  // Læsø, Samsø og Ærø har SPÆRREDE indkøbstal - de står, men uden retning.
  // En kommune med bekræftet fejl i affaldsindberetningen har derimod fået
  // TALLET taget af siden, og så må arket ikke kunne regne det ud af de
  // felter, der blev liggende.
  const { b, ark } = mappe("Thisted", { affald_indberetning: "bekraeftet_fejl" });
  const skjulte = b.udeladt.map((u) => u.navn);
  assert.ok(skjulte.includes("Husholdningsaffald"), "fixturen skjuler ikke affaldstallet");
  const felter = new Set(eksportFelter(b.drivere));
  assert.ok(!felter.has("affald_kg"), "det skjulte nøgletals felt ligger stadig i arket");
  const dataArk = ark.find((a) => a.navn === "Data");
  assert.ok(!dataArk.raekker.some((r) => raekkeCeller(r)[0]?.v === "affald_kg"));
  const noegletal = ark.find((a) => a.navn === "Nøgletal");
  assert.ok(!noegletal.raekker.some((r) => raekkeCeller(r)[1]?.v === "Husholdningsaffald"));
});

test("eksport: et skjult nøgletal forklares, det forsvinder ikke bare", () => {
  const { b, ark } = mappe("Thisted", { affald_indberetning: "bekraeftet_fejl" });
  const grundlag = ark.find((a) => a.navn === "Grundlag");
  const tekst = JSON.stringify(grundlag.raekker);
  for (const u of b.udeladt) {
    assert.ok(tekst.includes(u.navn), `${u.navn} er væk uden forklaring`);
    assert.ok(tekst.includes(u.note.slice(0, 40)), `${u.navn} står uden begrundelse`);
  }
});

test("eksport: et spærret nøgletal beholder sit tal og mister kun retningen", () => {
  // Færgekommunernes indkøb. Tallet er rigtigt - kronerne er brugt - men
  // sammenligningen pr. indbygger er skæv, og retningen holdes tilbage.
  const { b, ark } = mappe("Læsø");
  const i = b.drivere.findIndex((d) => d.navn === "Kommunens driftsindkøb");
  assert.notEqual(i, -1, "det spærrede nøgletal er faldet helt ud af arket");
  const celler = beregnArk(ark, "Nøgletal");
  const nr = NOEGLE_FOERSTE + i;
  assert.equal(typeof celler.get(`E${nr}`), "number", "tallet skulle blive stående");
  assert.equal(celler.get(`J${nr}`), "uafklaret");
  assert.equal(celler.get(`K${nr}`), "uafklaret");
  assert.equal(celler.get(`L${nr}`), "forbehold: ingen retning");
});

test("eksport: manglende rådata giver en tom celle, aldrig et nul", () => {
  // Den anden af repoets to hovedregler. Et manglende felt må ikke blive til
  // et nul, der ser ud som en måling - hverken på siden eller i arket.
  const { b, ark } = mappe("Thisted");
  const nr = saetEgenVaerdi(ark, "biler", 0);
  const dataArk = ark.find((a) => a.navn === "Data");
  // Tøm både kildens og den egne celle, så feltet slet ikke findes.
  raekkeCeller(dataArk.raekker[nr - 1])[3] = { v: "", stil: "raa" };
  raekkeCeller(dataArk.raekker[nr - 1])[4] = { v: "", stil: "indtast" };
  const celler = beregnArk(ark, "Nøgletal");
  for (const navn of ["Biler pr. indbygger", "El- og plugin-hybridandel", "Fossil-andel"]) {
    const r = NOEGLE_FOERSTE + b.drivere.findIndex((d) => d.navn === navn);
    assert.equal(celler.get(`E${r}`), "", `${navn} blev til noget, uden at feltet fandtes`);
    assert.equal(celler.get(`G${r}`), "", `${navn}: afvigelsen skulle være tom`);
    assert.equal(celler.get(`K${r}`), "ukendt", `${navn}: retningen skulle være ukendt`);
  }
});

test("eksport: en division med nul giver tom celle, ikke en fejlkode", () => {
  const { b, ark } = mappe("Thisted");
  saetEgenVaerdi(ark, "biler", 0);
  const celler = beregnArk(ark, "Nøgletal");
  const nr = NOEGLE_FOERSTE + b.drivere.findIndex((d) => d.navn === "El- og plugin-hybridandel");
  assert.equal(celler.get(`E${nr}`), "");
});

// ---------- Kilder og konklusioner ----------

test("eksport: hvert nøgletal i arket bærer sin kilde", () => {
  const { b } = thisted;
  const celler = beregnArk(thisted.ark, "Nøgletal");
  b.drivere.forEach((d, i) => {
    const kilde = celler.get(`M${NOEGLE_FOERSTE + i}`);
    assert.ok(kilde && kilde.length > 0, `${d.navn} står i arket uden kilde`);
  });
});

test("eksport: kildekataloget kommer med, og arket siger hvad der er i brug", () => {
  const kilder = thisted.ark.find((a) => a.navn === "Kilder");
  const tekst = JSON.stringify(kilder.raekker);
  for (const k of sources.kilder) assert.ok(tekst.includes(k.id), `${k.id} mangler`);
  for (const ref of sources.referencer) assert.ok(tekst.includes(ref.id), `${ref.id} mangler`);
  // IFOR41 leverer Gini-koefficienten, som ingen nøgletal bruger. Den skal stå
  // i kataloget og være mærket som ikke i brug, ikke udelades i tavshed.
  const gini = kilder.raekker.find((r) => raekkeCeller(r)[0]?.v === "IFOR41");
  assert.equal(raekkeCeller(gini)[7].v, "nej");
});

test("eksport: arket siger selv, at det ikke beregner et klimaaftryk", () => {
  const forside = thisted.ark.find((a) => a.navn === "Læs mig");
  const tekst = JSON.stringify(forside.raekker);
  assert.match(tekst, /Uofficielt værktøj/);
  assert.match(tekst, /ikke .{0,40}klimaaftryk/);
  assert.match(tekst, /intet tal uden kilde/);
});

// ---------- Oversættelsen ----------

test("eksport: oversættelsen peger på arket Data og værner mod tomme celler", () => {
  const raekkeFor = { biler: 10, folketal: 11 };
  const f = tilRegnearksformel("biler / folketal", raekkeFor, "kommune");
  assert.equal(f, 'IF(OR(Data!$F$10="",Data!$F$11=""),"",'
    + 'IFERROR(Data!$F$10 / Data!$F$11,""))');
  const l = tilRegnearksformel("biler / folketal", raekkeFor, "land");
  assert.ok(l.includes("Data!$I$10"), "landssiden skal læse landets kolonne");
});

test("eksport: et felt uden plads i arket giver en fejl, ikke en tom celle", () => {
  assert.throws(() => tilRegnearksformel("biler / folketal", { biler: 10 }, "kommune"),
    /folketal/);
});

// ---------- Filnavnet ----------

test("eksport: filnavnet overlever æ, ø og å", () => {
  assert.equal(eksportFilnavn("Ærø", "2026-09-22"), "forbrugsudledninger-aeroe-2026-09-22.xlsx");
  assert.equal(eksportFilnavn("Høje-Taastrup", "2026-09-22"),
    "forbrugsudledninger-hoeje-taastrup-2026-09-22.xlsx");
  assert.equal(eksportFilnavn("Thisted", "2026-09-22"),
    "forbrugsudledninger-thisted-2026-09-22.xlsx");
});
