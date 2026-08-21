# Beregningsmotor — Implementeringsplan (Plan 1 af 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Byg den rene JavaScript-beregningsmotor, der reproducerer v5-regnearkets forbrugsaftryk-estimat og driver-tabel for enhver kommune, fortegnskorrekt, verificeret med golden tests mod Thisted (fidelitet) og Greve (fortegn).

**Architecture:** Rene funktioner uden I/O i `web/beregning.js`. Alle konstanter/antagelser sendes ind som argument (defineres i data senere, Plan 2). Motoren tager `(kommune, land, konstanter)` og returnerer estimat, komponenter, driver-tabel og manglende-data-liste. Ingen afhængigheder ud over Node.js' indbyggede testrunner.

**Tech Stack:** JavaScript (ES-moduler), Node.js v24 med `node:test` + `node:assert`. Ingen npm-pakker.

Referencespec: [2026-07-06-forbrugsbaserede-udledninger-platform-design.md](../specs/2026-07-06-forbrugsbaserede-udledninger-platform-design.md)

---

## Filstruktur

| Fil | Ansvar |
|-----|--------|
| `package.json` | Marker projektet som ES-modul + test-script |
| `web/beregning.js` | Hele den rene beregnings-/driver-motor (eksporterer funktioner) |
| `test/fixtures.js` | Golden rådata (land, Thisted, Greve) + konstanter, hentet 1:1 fra regneark v5 |
| `test/beregning.test.js` | Golden tests + enhedstests |

## Datakontrakt (kommune-objekt)

Hvert kommune-/land-objekt bruger disse nøgler (samme kontrakt, som pipelinen i Plan 2 skal producere):

```
navn, kode, region,
disp_indkomst, folketal, folketal_forrige, areal,
formue_gns, formue_median, gini,
boliger_parcel, boliger_raekke, boliger_etage, boligareal,
byggeri,
biler, biler_el, biler_plugin, biler_diesel,
opv_boliger_ialt, opv_olie, opv_naturgas,
affald_kg, genanvendelse_pct,
elco2_g_kwh, boligpris_m2
```

En manglende værdi er `null`. Land-objektet har ikke `region`.

## Motor-API (defineres gennem tasks — her som overblik)

```
afvigelse(kommuneVal, landVal)          → number | null
byggeriPr1000(m)                        → number | null
indkomsteffekt(incDev, konst)           → {low, high}
byggeeffekt(byggeDev, konst)            → {low, high}
transporteffekt(region, konst)          → {low, high} | null
estimat(kommune, land, konst)           → { utilstraekkeligt, komponenter, aftryk }
boligprisFolsomhed(kommune, land, konst)→ { justeret, vises } | null
driverTabel(kommune, land)              → [ {navn, enhed, kommuneVaerdi, landVaerdi, afvigelse, retning}, … ]
beregnKommune(kommune, land, konst)     → { navn, estimat, boligpris, drivere, manglende }
```

---

### Task 1: Projektopsætning

**Files:**
- Create: `package.json`
- Create: `test/smoke.test.js`

- [ ] **Step 1: Skriv package.json**

```json
{
  "name": "forbrugsudledninger",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: Skriv en smoke-test**

Create `test/smoke.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";

test("testrunneren kører", () => {
  assert.equal(1 + 1, 2);
});
```

- [ ] **Step 3: Kør testen og bekræft den består**

Run: `npm test`
Expected: PASS — "tests 1", "pass 1".

- [ ] **Step 4: Commit**

```bash
git add package.json test/smoke.test.js
git commit -m "chore: projektopsætning med node:test"
```

---

### Task 2: Golden fixture fra regneark v5

**Files:**
- Create: `test/fixtures.js`
- Test: `test/fixtures.test.js`

- [ ] **Step 1: Skriv en test, der bekræfter fixturen loader med kendte rå værdier**

Create `test/fixtures.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { land, thisted, greve, konstanter } from "./fixtures.js";

test("fixture: kendte rå værdier fra regneark v5", () => {
  assert.equal(land.folketal, 6025603);
  assert.equal(land.disp_indkomst, 287682);
  assert.equal(thisted.folketal, 42572);
  assert.equal(thisted.disp_indkomst, 252934);
  assert.equal(greve.folketal, 54120);
  assert.equal(greve.disp_indkomst, 306548);
  assert.equal(greve.affald_kg, null); // Greve mangler affald i regnearket
  assert.equal(konstanter.anker, 10.0);
  assert.equal(thisted.region, "Nordjylland");
});
```

- [ ] **Step 2: Kør testen og bekræft den fejler**

Run: `node --test test/fixtures.test.js`
Expected: FAIL — "Cannot find module './fixtures.js'".

- [ ] **Step 3: Skriv fixturen med golden rådata**

Create `test/fixtures.js` (alle tal 1:1 fra Rådata-fanen i Beregninger v5):

```javascript
// Golden rådata fra Beregninger_Forbrugsbaserede_udledninger_Thisted_v5.xlsx, fanen "Rådata".
// Disse værdier er facit for golden-testene og må kun ændres, hvis regnearket ændres.

export const land = {
  navn: "Hele landet",
  disp_indkomst: 287682, folketal: 6025603, folketal_forrige: 5992734, areal: 42955.6,
  formue_gns: 2177950, formue_median: 800815, gini: 30.43,
  boliger_parcel: 1177875, boliger_raekke: 440156, boliger_etage: 1148673, boligareal: 111,
  byggeri: 25966,
  biler: 2918153, biler_el: 556394, biler_plugin: 127933, biler_diesel: 575355,
  opv_boliger_ialt: 2872738, opv_olie: 92448, opv_naturgas: 334724,
  affald_kg: 543, genanvendelse_pct: 58,
  elco2_g_kwh: 51.8, boligpris_m2: 18439,
};

export const thisted = {
  navn: "Thisted", kode: 787, region: "Nordjylland",
  disp_indkomst: 252934, folketal: 42572, folketal_forrige: 42698, areal: 1072.2,
  formue_gns: 1838139, formue_median: 813928, gini: 26.42,
  boliger_parcel: 14246, boliger_raekke: 2677, boliger_etage: 3295, boligareal: 133,
  byggeri: 103,
  biler: 23656, biler_el: 3404, biler_plugin: 946, biler_diesel: 7114,
  opv_boliger_ialt: 20515, opv_olie: 1582, opv_naturgas: 958,
  affald_kg: 508, genanvendelse_pct: 45,
  elco2_g_kwh: 26.7, boligpris_m2: 7430,
};

export const greve = {
  navn: "Greve", kode: 253, region: "Sjælland",
  disp_indkomst: 306548, folketal: 54120, folketal_forrige: 53536, areal: 60.4,
  formue_gns: 2419897, formue_median: 1222322, gini: 26.35,
  boliger_parcel: 10368, boliger_raekke: 5625, boliger_etage: 6549, boligareal: 119,
  byggeri: 495,
  biler: 27441, biler_el: 6557, biler_plugin: 1654, biler_diesel: 3705,
  opv_boliger_ialt: 22856, opv_olie: 319, opv_naturgas: 9040,
  affald_kg: null, genanvendelse_pct: null, // "-" i regnearket
  elco2_g_kwh: null, boligpris_m2: 30347,
};

export const konstanter = {
  anker: 10.0,
  elasticitet: { low: 0.30, high: 0.50 },
  bilkorsel_andel: { low: 0.12, high: 0.15 },
  byggeandel: { low: 0.0, high: 0.0456045 }, // kalibreret så Thisted rammer v5's 0–0,2 ton
  boligudgift_modregning: 0.45,
  bilkm_afvigelse_region: {
    "Nordjylland": 0.178423236514523,
    "Sjælland": 0, // NEUTRAL TESTSTUB — reel DTU-værdi hentes i Plan 2's pipeline
  },
};
```

- [ ] **Step 4: Kør testen og bekræft den består**

Run: `node --test test/fixtures.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add test/fixtures.js test/fixtures.test.js
git commit -m "test: golden fixture fra regneark v5 (land, Thisted, Greve)"
```

---

### Task 3: `afvigelse()` — relativ afvigelse

**Files:**
- Create: `web/beregning.js`
- Test: `test/beregning.test.js`

- [ ] **Step 1: Skriv den fejlende test**

Create `test/beregning.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { afvigelse } from "../web/beregning.js";
import { land, thisted } from "./fixtures.js";

const naer = (a, b, tol = 1e-4) => assert.ok(Math.abs(a - b) < tol, `${a} ≈ ${b}`);

test("afvigelse: Thisteds indkomst ligger 12,08 % under land", () => {
  naer(afvigelse(thisted.disp_indkomst, land.disp_indkomst), -0.120786);
});

test("afvigelse: manglende værdi giver null", () => {
  assert.equal(afvigelse(null, 100), null);
  assert.equal(afvigelse(100, null), null);
});
```

- [ ] **Step 2: Kør testen og bekræft den fejler**

Run: `node --test test/beregning.test.js`
Expected: FAIL — "Cannot find module '../web/beregning.js'".

- [ ] **Step 3: Skriv minimal implementation**

Create `web/beregning.js`:

```javascript
// Ren beregningsmotor for forbrugsbaserede udledninger. Ingen I/O.
// Alle konstanter sendes ind via `konst`-argumentet.

/** Relativ afvigelse (kommune − land) / land. Returnerer null hvis input mangler. */
export function afvigelse(kommuneVal, landVal) {
  if (kommuneVal == null || landVal == null || landVal === 0) return null;
  return (kommuneVal - landVal) / landVal;
}
```

- [ ] **Step 4: Kør testen og bekræft den består**

Run: `node --test test/beregning.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add web/beregning.js test/beregning.test.js
git commit -m "feat: afvigelse() med null-håndtering"
```

---

### Task 4: Indkomsteffekt (fortegnskorrekt)

**Files:**
- Modify: `web/beregning.js`
- Modify: `test/beregning.test.js`

- [ ] **Step 1: Skriv den fejlende test (Thisted OG Greve — fortegnet er hele pointen)**

Append to `test/beregning.test.js`:

```javascript
import { indkomsteffekt } from "../web/beregning.js";
import { greve, konstanter } from "./fixtures.js";

test("indkomsteffekt: Thisted (under land) er negativ, matcher v5", () => {
  const dev = afvigelse(thisted.disp_indkomst, land.disp_indkomst);
  const e = indkomsteffekt(dev, konstanter);
  naer(e.low, -0.3624);   // anker × dev × 0,30
  naer(e.high, -0.6039);  // anker × dev × 0,50
});

test("indkomsteffekt: Greve (over land) er POSITIV — fanger fortegnsfejl", () => {
  const dev = afvigelse(greve.disp_indkomst, land.disp_indkomst);
  const e = indkomsteffekt(dev, konstanter);
  assert.ok(e.low > 0, "en naiv -ABS()-port ville give negativ her");
  naer(e.low, 0.1967);
  naer(e.high, 0.3279);
});
```

- [ ] **Step 2: Kør testen og bekræft den fejler**

Run: `node --test test/beregning.test.js`
Expected: FAIL — "indkomsteffekt is not a function".

- [ ] **Step 3: Skriv minimal implementation**

Append to `web/beregning.js`:

```javascript
/** Indkomsteffekt i ton. Fortegn følger afvigelsen: negativ når fattigere, positiv når rigere.
 *  Erstatter v5's =-anker*ABS(dev)*elasticitet, som var hardcodet til en kommune under land. */
export function indkomsteffekt(incDev, konst) {
  return {
    low: konst.anker * incDev * konst.elasticitet.low,
    high: konst.anker * incDev * konst.elasticitet.high,
  };
}
```

- [ ] **Step 4: Kør testen og bekræft den består**

Run: `node --test test/beregning.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add web/beregning.js test/beregning.test.js
git commit -m "feat: fortegnskorrekt indkomsteffekt (Thisted neg, Greve pos)"
```

---

### Task 5: Byggeaktivitet + byggeeffekt (fortegnskorrekt, kalibreret)

**Files:**
- Modify: `web/beregning.js`
- Modify: `test/beregning.test.js`

- [ ] **Step 1: Skriv den fejlende test**

Append to `test/beregning.test.js`:

```javascript
import { byggeriPr1000, byggeeffekt } from "../web/beregning.js";

test("byggeriPr1000: Thisted og land", () => {
  naer(byggeriPr1000(land), 4.30928, 1e-3);
  naer(byggeriPr1000(thisted), 2.41943, 1e-3);
});

test("byggeeffekt: Thisted (lav aktivitet) giver reduktion 0 til -0,2 ton (v5)", () => {
  const dev = afvigelse(byggeriPr1000(thisted), byggeriPr1000(land));
  const e = byggeeffekt(dev, konstanter);
  naer(e.low, 0.0);     // byggeandel.low = 0
  naer(e.high, -0.2);   // kalibreret til v5's høje ende
});

test("byggeeffekt: Greve (høj aktivitet) giver TILLÆG — fortegn vender korrekt", () => {
  const dev = afvigelse(byggeriPr1000(greve), byggeriPr1000(land));
  const e = byggeeffekt(dev, konstanter);
  assert.ok(e.high > 0, "byggetung kommune skal give positivt bidrag");
  naer(e.high, 0.5119);
});
```

- [ ] **Step 2: Kør testen og bekræft den fejler**

Run: `node --test test/beregning.test.js`
Expected: FAIL — "byggeriPr1000 is not a function".

- [ ] **Step 3: Skriv minimal implementation**

Append to `web/beregning.js`:

```javascript
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
```

- [ ] **Step 4: Kør testen og bekræft den består**

Run: `node --test test/beregning.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add web/beregning.js test/beregning.test.js
git commit -m "feat: fortegnskorrekt, kalibreret byggeeffekt"
```

---

### Task 6: Transporteffekt (regional proxy)

**Files:**
- Modify: `web/beregning.js`
- Modify: `test/beregning.test.js`

- [ ] **Step 1: Skriv den fejlende test**

Append to `test/beregning.test.js`:

```javascript
import { transporteffekt } from "../web/beregning.js";

test("transporteffekt: Thisted (Nordjylland +17,84 %) matcher v5", () => {
  const e = transporteffekt("Nordjylland", konstanter);
  naer(e.low, 0.2141);
  naer(e.high, 0.2676);
});

test("transporteffekt: ukendt region giver null", () => {
  assert.equal(transporteffekt("Atlantis", konstanter), null);
});
```

- [ ] **Step 2: Kør testen og bekræft den fejler**

Run: `node --test test/beregning.test.js`
Expected: FAIL — "transporteffekt is not a function".

- [ ] **Step 3: Skriv minimal implementation**

Append to `web/beregning.js`:

```javascript
/** Transporteffekt i ton via regional bil-km-proxy. Null hvis regionen er ukendt. */
export function transporteffekt(region, konst) {
  const dev = konst.bilkm_afvigelse_region[region];
  if (dev == null) return null;
  return {
    low: konst.anker * konst.bilkorsel_andel.low * dev,
    high: konst.anker * konst.bilkorsel_andel.high * dev,
  };
}
```

- [ ] **Step 4: Kør testen og bekræft den består**

Run: `node --test test/beregning.test.js`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add web/beregning.js test/beregning.test.js
git commit -m "feat: transporteffekt via regional proxy"
```

---

### Task 7: `estimat()` — samlet aftryk (min/max-interval)

**Files:**
- Modify: `web/beregning.js`
- Modify: `test/beregning.test.js`

- [ ] **Step 1: Skriv den fejlende test — Thisted golden + Greve over anker**

Append to `test/beregning.test.js`:

```javascript
import { estimat } from "../web/beregning.js";

test("estimat: Thisted reproducerer v5 EKSAKT (9,4102–9,9053 ton)", () => {
  const r = estimat(thisted, land, konstanter);
  assert.equal(r.utilstraekkeligt, false);
  naer(r.aftryk.low, 9.4102, 1e-3);
  naer(r.aftryk.high, 9.9053, 1e-3);
});

test("estimat: Greve ligger over ankeret (rigere + bygger mere)", () => {
  const r = estimat(greve, land, konstanter);
  assert.ok(r.aftryk.low > 10, `Greve low ${r.aftryk.low} skal være > 10`);
  assert.ok(r.aftryk.high > 10);
});
```

- [ ] **Step 2: Kør testen og bekræft den fejler**

Run: `node --test test/beregning.test.js`
Expected: FAIL — "estimat is not a function".

- [ ] **Step 3: Skriv minimal implementation**

Append to `web/beregning.js`:

```javascript
/** Samlet førsteordens-estimat pr. borger med interval.
 *  Kerneinput (indkomst, biler, byggeri) skal være til stede; ellers utilstrækkeligt. */
export function estimat(kommune, land, konst) {
  const kerneMangler =
    kommune.disp_indkomst == null || kommune.biler == null || kommune.byggeri == null;
  if (kerneMangler) {
    return { utilstraekkeligt: true, komponenter: null, aftryk: null };
  }

  const incDev = afvigelse(kommune.disp_indkomst, land.disp_indkomst);
  const byggeDev = afvigelse(byggeriPr1000(kommune), byggeriPr1000(land));

  const ie = indkomsteffekt(incDev, konst);
  const be = byggeeffekt(byggeDev, konst);
  const te = transporteffekt(kommune.region, konst) ?? { low: 0, high: 0 };

  const lav = konst.anker + Math.min(ie.low, ie.high) + Math.min(te.low, te.high) + Math.min(be.low, be.high);
  const hoj = konst.anker + Math.max(ie.low, ie.high) + Math.max(te.low, te.high) + Math.max(be.low, be.high);

  return {
    utilstraekkeligt: false,
    komponenter: { indkomsteffekt: ie, transporteffekt: te, byggeeffekt: be },
    aftryk: { low: lav, high: hoj },
  };
}
```

- [ ] **Step 4: Kør testen og bekræft den består**

Run: `node --test test/beregning.test.js`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add web/beregning.js test/beregning.test.js
git commit -m "feat: estimat() med fortegnssikkert min/max-interval"
```

---

### Task 8: Boligpris-følsomhed (betinget synlighed)

**Files:**
- Modify: `web/beregning.js`
- Modify: `test/beregning.test.js`

- [ ] **Step 1: Skriv den fejlende test**

Append to `test/beregning.test.js`:

```javascript
import { boligprisFolsomhed } from "../web/beregning.js";

test("boligpris: Thisted (billig bolig + lav indkomst) vises, halverer effekten", () => {
  const f = boligprisFolsomhed(thisted, land, konstanter);
  assert.equal(f.vises, true);
  naer(f.justeret.low, -0.1993);
  naer(f.justeret.high, -0.3322);
});

test("boligpris: Greve (dyr bolig + høj indkomst) undertrykkes — ingen falsk symmetri", () => {
  const f = boligprisFolsomhed(greve, land, konstanter);
  assert.equal(f.vises, false);
});
```

- [ ] **Step 2: Kør testen og bekræft den fejler**

Run: `node --test test/beregning.test.js`
Expected: FAIL — "boligprisFolsomhed is not a function".

- [ ] **Step 3: Skriv minimal implementation**

Append to `web/beregning.js`:

```javascript
/** Illustrativ købekrafts-følsomhed (ikke i hovedtallet). Vises KUN når mønstret er gyldigt:
 *  billigere bolig OG lavere indkomst end land (begge afvigelser negative). Aldrig falsk symmetrisk. */
export function boligprisFolsomhed(kommune, land, konst) {
  const incDev = afvigelse(kommune.disp_indkomst, land.disp_indkomst);
  const boligDev = afvigelse(kommune.boligpris_m2, land.boligpris_m2);
  if (incDev == null || boligDev == null) return null;

  const vises = incDev < 0 && boligDev < 0;
  const reeltGab = incDev * (1 - konst.boligudgift_modregning);
  return {
    vises,
    reeltGab,
    justeret: {
      low: konst.anker * reeltGab * konst.elasticitet.low,
      high: konst.anker * reeltGab * konst.elasticitet.high,
    },
  };
}
```

- [ ] **Step 4: Kør testen og bekræft den består**

Run: `node --test test/beregning.test.js`
Expected: PASS (13 tests).

- [ ] **Step 5: Commit**

```bash
git add web/beregning.js test/beregning.test.js
git commit -m "feat: betinget boligpris-følsomhed (ingen falsk symmetri)"
```

---

### Task 9: Driver-tabellen

**Files:**
- Modify: `web/beregning.js`
- Modify: `test/beregning.test.js`

- [ ] **Step 1: Skriv den fejlende test (repræsentativt udsnit + særtilfælde + manglende data)**

Append to `test/beregning.test.js`:

```javascript
import { driverTabel } from "../web/beregning.js";

const findDriver = (tabel, navn) => tabel.find((d) => d.navn === navn);

test("driverTabel: parcelhus-andel og diesel-andel matcher v5", () => {
  const t = driverTabel(thisted, land);
  naer(findDriver(t, "Parcelhus-andel").afvigelse, 0.65508, 1e-4);
  naer(findDriver(t, "Diesel-andel").afvigelse, 0.52526, 1e-4);
});

test("driverTabel: befolkningsudvikling bruger DIFFERENCE, ikke relativ", () => {
  const t = driverTabel(thisted, land);
  naer(findDriver(t, "Befolkningsudvikling").afvigelse, -0.0084358, 1e-5);
});

test("driverTabel: manglende driver (Greve affald) giver afvigelse null", () => {
  const t = driverTabel(greve, land);
  assert.equal(findDriver(t, "Husholdningsaffald").afvigelse, null);
});
```

- [ ] **Step 2: Kør testen og bekræft den fejler**

Run: `node --test test/beregning.test.js`
Expected: FAIL — "driverTabel is not a function".

- [ ] **Step 3: Skriv minimal implementation**

Append to `web/beregning.js`:

```javascript
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
];

/** Sikker beregning: returnerer null hvis et input undervejs er null/0-division. */
function sikker(fn, m) {
  try {
    const v = fn(m);
    return Number.isFinite(v) ? v : null;
  } catch {
    return null;
  }
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
      navn: d.navn, enhed: d.enhed,
      kommuneVaerdi: kv, landVaerdi: lv, afvigelse: afv,
      retning: afv == null ? "kontekst" : afv > 0 ? "over land" : afv < 0 ? "under land" : "på niveau",
    };
  });
}
```

- [ ] **Step 4: Kør testen og bekræft den består**

Run: `node --test test/beregning.test.js`
Expected: PASS (16 tests).

- [ ] **Step 5: Commit**

```bash
git add web/beregning.js test/beregning.test.js
git commit -m "feat: driver-tabel med difference-/relativ-/kontekst-typer"
```

---

### Task 10: `beregnKommune()` + manglende-data-politik

**Files:**
- Modify: `web/beregning.js`
- Modify: `test/beregning.test.js`

- [ ] **Step 1: Skriv den fejlende test**

Append to `test/beregning.test.js`:

```javascript
import { beregnKommune } from "../web/beregning.js";

test("beregnKommune: manglende kerneinput (indkomst) → utilstrækkeligt, intet aftryk", () => {
  const udenIndkomst = { ...thisted, disp_indkomst: null };
  const r = beregnKommune(udenIndkomst, land, konstanter);
  assert.equal(r.estimat.utilstraekkeligt, true);
  assert.equal(r.estimat.aftryk, null);
  assert.ok(r.manglende.includes("disp_indkomst"));
});

test("beregnKommune: manglende enkeltdriver (Greve affald) → estimat beregnes stadig", () => {
  const r = beregnKommune(greve, land, konstanter);
  assert.equal(r.estimat.utilstraekkeligt, false);
  assert.ok(r.manglende.includes("affald_kg"));
});
```

- [ ] **Step 2: Kør testen og bekræft den fejler**

Run: `node --test test/beregning.test.js`
Expected: FAIL — "beregnKommune is not a function".

- [ ] **Step 3: Skriv minimal implementation**

Append to `web/beregning.js`:

```javascript
// Felter, der efterspørges; bruges til at rapportere manglende data pr. kommune.
const FORVENTEDE_FELTER = [
  "disp_indkomst", "folketal", "folketal_forrige", "areal", "formue_gns", "formue_median",
  "gini", "boliger_parcel", "boliger_raekke", "boliger_etage", "boligareal", "byggeri",
  "biler", "biler_el", "biler_plugin", "biler_diesel", "opv_boliger_ialt", "opv_olie",
  "opv_naturgas", "affald_kg", "genanvendelse_pct", "elco2_g_kwh", "boligpris_m2",
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
```

- [ ] **Step 4: Kør testen og bekræft den består**

Run: `node --test test/beregning.test.js`
Expected: PASS (18 tests).

- [ ] **Step 5: Commit**

```bash
git add web/beregning.js test/beregning.test.js
git commit -m "feat: beregnKommune() med manglende-data-politik"
```

---

### Task 11: Golden-integrationstest (accept)

**Files:**
- Create: `test/golden.test.js`

- [ ] **Step 1: Skriv accepttesten mod spec §8**

Create `test/golden.test.js`:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { beregnKommune } from "../web/beregning.js";
import { land, thisted, greve, konstanter } from "./fixtures.js";

const naer = (a, b, tol = 1e-3) => assert.ok(Math.abs(a - b) < tol, `${a} ≈ ${b}`);

test("GOLDEN §8.1 — Thisted reproducerer v5", () => {
  const r = beregnKommune(thisted, land, konstanter);
  const k = r.estimat.komponenter;
  naer(k.indkomsteffekt.low, -0.3624);
  naer(k.indkomsteffekt.high, -0.6039);
  naer(k.transporteffekt.low, 0.2141);
  naer(k.transporteffekt.high, 0.2676);
  naer(k.byggeeffekt.high, -0.2);
  naer(r.estimat.aftryk.low, 9.4102);
  naer(r.estimat.aftryk.high, 9.9053);
});

test("GOLDEN §8.2 — Greve fortegn (fanger -ABS()-fejlen)", () => {
  const r = beregnKommune(greve, land, konstanter);
  const k = r.estimat.komponenter;
  assert.ok(k.indkomsteffekt.low > 0, "indkomsteffekt skal være positiv for Greve");
  assert.ok(k.indkomsteffekt.high > 0);
  assert.ok(k.byggeeffekt.high > 0, "byggeeffekt skal være positiv for Greve");
  assert.ok(r.estimat.aftryk.low > 10, "Greve skal ligge over ankeret");
});
```

- [ ] **Step 2: Kør hele testsuiten**

Run: `npm test`
Expected: PASS — alle tests (20 total).

- [ ] **Step 3: Commit**

```bash
git add test/golden.test.js
git commit -m "test: golden-accepttest mod spec §8 (Thisted + Greve)"
```

---

## Self-Review (udført ved planskrivning)

**Spec-dækning (Plan 1's del af spec'en):**
- §7.1 indkomsteffekt fortegnskorrekt → Task 4 ✓
- §7.2 transporteffekt regional proxy → Task 6 ✓
- §7.3 byggeeffekt data-drevet, kalibreret → Task 5 ✓
- §7.4 samlet aftryk min/max → Task 7 ✓
- §7.5 boligpris-følsomhed betinget → Task 8 ✓
- §7.6 driver-tabel (16 drivere) → Task 9 ✓
- §5.4 manglende-data-politik → Task 10 ✓
- §8.1 Thisted golden → Task 7 + 11 ✓
- §8.2 Greve fortegn → Task 4, 5, 11 ✓

Uden for Plan 1 (senere planer): datapipeline (§5, Plan 2), widget/UI (§10, Plan 3), rapport-generator (§9, Plan 3). Bevidst afgrænset.

**Placeholder-scan:** Ingen TBD/TODO. Al kode er fuld og kørbar. Sjælland=0 er en dokumenteret neutral teststub (erstattes i Plan 2), ikke en placeholder.

**Type-konsistens:** `konstanter`-formen er ens i fixture og alle funktioner. `afvigelse/indkomsteffekt/byggeeffekt/transporteffekt/estimat/boligprisFolsomhed/driverTabel/beregnKommune` har samme signaturer i definition og brug. `estimat().komponenter` matcher nøglerne, golden-testen læser. Datakontraktens feltnavne er ens i fixture, driver-funktioner og `FORVENTEDE_FELTER`.

---

## Efter Plan 1

Plan 2 (datapipeline) henter de rå felter for alle 98 kommuner fra API'erne og skriver dem i datakontraktens form til `web/data/data.json`, plus `konstanter`-blokken. Plan 3 (widget) bygger explorer + rapport-generator oven på `beregning.js` og `data.json`.
