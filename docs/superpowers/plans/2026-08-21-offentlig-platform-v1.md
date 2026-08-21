# Offentlig platform v1 (explorer) - implementeringsplan

> **Status: UDFØRT 2026-08-21.** Alle 14 tasks er gennemført og siden er
> udgivet på https://augustseptimius-beep.github.io/forbrugsudledninger/
> Afvigelser fra planen er dokumenteret i commit-beskederne.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Udgive en offentlig, statisk side hvor en medarbejder i enhver af Danmarks 98 kommuner kan slå sin kommunes forbrugsbaserede udledningsestimat op, med ærlig markering af hvad der ikke er opgjort.

**Architecture:** Tre lag uden server. Python-pipelinen (uændret) skriver `data.json` og `sources.json`. Beregningsmotoren `beregning.js` er rene funktioner uden I/O. Nyt: `render.js` er rene funktioner der returnerer HTML-strenge - derfor testbare uden DOM-bibliotek - og `widget.js` er et tyndt lag der henter data, læser query-parameteren og sætter strengene ind i siden. GitHub Actions bygger CSS, kører testene og udgiver `web/` til GitHub Pages.

**Tech Stack:** Vanilla ES-moduler, Tailwind CSS 4 via CLI, `node --test` til JS, `pytest` til Python, GitHub Actions til udgivelse. Ingen React, ingen bundler, ingen runtime-afhængigheder.

**Spec:** `docs/superpowers/specs/2026-08-21-offentlig-platform-design.md`

---

## Vigtigt inden du går i gang

**Task 14 offentliggør repoet.** Den må ikke køres uden at ejeren udtrykkeligt siger ja på det tidspunkt. Alle andre tasks er lokale og kan køres frit.

**Arbejdsmappe.** Task 1 opretter et nyt repo i `~/Documents/GitHub/forbrugsudledninger` (ved siden af `doughnut`). Alle tasks fra og med Task 2 udføres **i det nye repo**, ikke i `~/Claude/Projects/Forbrugsbaserede udledninger`, som fra da af er arkiv.

**Husregler i det nye repo.** Dansk i UI, kommentarer og dokumentation. Engelsk README. Enkelt dash, aldrig em-dash. Samme konventioner som doughnut-projektet.

---

## Filstruktur

| Fil | Ansvar |
|---|---|
| `pipeline/sources.py` | **Ny.** Kildekatalog: id, navn, udbyder, periode-nøgle, licens, URL og hvilke felter kilden leverer. Ren data, ingen I/O. |
| `pipeline/build.py` | **Ændres.** Skriver nu også `web/data/sources.json`. Docstring rettes. |
| `web/beregning.js` | **Ændres.** `estimat()` markerer transport som uoplyst i stedet for at degradere til nul. |
| `web/render.js` | **Ny.** Rene funktioner: beregningsresultat ind, HTML-streng ud. Al præsentationslogik bor her, og alt heri er testbart uden browser. |
| `web/widget.js` | **Ny.** Tyndt DOM-lag: hent `data.json`, læs `?kommune=` og `?embed=`, kald `render.js`, sæt `innerHTML`. Ingen forretningslogik. |
| `web/index.html` | **Ny.** Skal, header, footer, søgning og kommunevisning. |
| `web/metode.html`, `web/om.html` | **Ny.** Statisk indhold i samme skal. |
| `web/styles/input.css` | **Ny.** Tailwind-kilde plus print- og embed-regler. |
| `web/styles/styles.css` | **Ny, genereret og committet.** |
| `test/render.test.js` | **Ny.** Strengtests af render-funktionerne. |
| `test/alle98.test.js` | **Ny.** Renderer alle 98 kommuner mod ægte `data.json`. |
| `.github/workflows/deploy.yml` | **Ny.** Byg CSS, kør tests, udgiv til Pages. |

Adskillelsen mellem `render.js` og `widget.js` er planens vigtigste strukturvalg. Den gør brugerfladen testbar uden jsdom, og den gør en senere port til doughnuts React-kodebase til et spørgsmål om at gøre hver render-funktion til en komponent.

---

## Task 1: Nyt repo med kopieret kode

**Files:**
- Create: `~/Documents/GitHub/forbrugsudledninger/` med `pipeline/`, `web/`, `test/`, `docs/`
- Create: `package.json`, `.gitignore`, `LICENSE`, `README.md`, `CLAUDE.md`

- [x] **Step 1: Opret mappen og kopiér kode**

```bash
SRC="$HOME/Claude/Projects/Forbrugsbaserede udledninger"
DST="$HOME/Documents/GitHub/forbrugsudledninger"
mkdir -p "$DST"
cp -R "$SRC/pipeline" "$DST/pipeline"
cp -R "$SRC/web" "$DST/web"
cp -R "$SRC/test" "$DST/test"
mkdir -p "$DST/docs/superpowers"
cp -R "$SRC/docs/superpowers/specs" "$DST/docs/superpowers/specs"
cp -R "$SRC/docs/superpowers/plans" "$DST/docs/superpowers/plans"
rm -rf "$DST/pipeline/.pytest_cache" "$DST/pipeline/__pycache__" "$DST/pipeline/test/__pycache__"
ls "$DST"
```

Forventet: `docs  pipeline  test  web`

Bemærk: ingen `.docx`, `.pdf`, `.xlsx` eller `.rtf` kopieres. Kontrollér med `find "$DST" -type f \( -name '*.docx' -o -name '*.pdf' -o -name '*.xlsx' -o -name '*.rtf' \)` - den skal give tomt output.

- [x] **Step 2: Skriv `.gitignore`**

```
# OS / editor
.DS_Store
*.swp

# Python
__pycache__/
*.pyc
.pytest_cache/
.venv/
venv/

# Node
node_modules/
```

Bemærk: `web/styles/styles.css` er **ikke** ignoreret. Den genererede CSS committes med vilje, så repoet kan åbnes og bruges uden Node.

- [x] **Step 3: Skriv `package.json`**

```json
{
  "name": "forbrugsudledninger",
  "version": "1.0.0",
  "description": "Consumption-based emission estimates for all 98 Danish municipalities. Static site, no backend.",
  "type": "module",
  "private": true,
  "scripts": {
    "test": "node --test",
    "css": "tailwindcss -i web/styles/input.css -o web/styles/styles.css --minify",
    "css:watch": "tailwindcss -i web/styles/input.css -o web/styles/styles.css --watch",
    "serve": "python3 -m http.server 8000 --directory web"
  },
  "devDependencies": {
    "@tailwindcss/cli": "^4.2.2",
    "tailwindcss": "^4.2.2"
  }
}
```

- [x] **Step 4: Skriv `LICENSE`**

MIT-licens, indehaver "August Septimius Krogh", år 2026. Brug den officielle MIT-tekst ordret.

- [x] **Step 5: Skriv `README.md` (engelsk)**

```markdown
# Consumption-based emissions for Denmark's 98 municipalities

A static, serverless tool that estimates the consumption-based greenhouse gas
footprint per resident for every Danish municipality, and shows the 16 drivers
that explain the difference from the national average.

**This is an unofficial first-order estimate, not an official inventory.**
It is intended as a starting point for municipal climate planning, and every
figure carries its caveats in the interface rather than in a footnote.

## What it does

Pick a municipality and you get:

- An estimated footprint per resident, as a range, anchored to the national
  figure of roughly 10 tonnes CO2e.
- A breakdown into anchor, income effect, transport effect and construction
  effect - because the composition carries the insight, not the total.
- All 16 drivers compared against the national average.
- Explicit "not quantified" markers wherever the underlying data does not exist,
  never a silent zero.

## Method

The method generalises an analysis originally built for Thisted Municipality.
Full documentation is in `docs/superpowers/specs/`.

Data comes from Statistics Denmark (11 tables), Finans Danmark's BM010 housing
price index, and two manually maintained sources documented in
`pipeline/constants.py`.

## Running it locally

```bash
npm install
npm run css
npm run serve
```

Then open http://127.0.0.1:8000

## Updating the data (once a year)

```bash
python3 pipeline/build.py
```

Review the validation report it prints, commit, and push. Publication is automatic.

## Licence

Code is MIT. Data from Statistics Denmark is CC BY 4.0 and credited in the
site footer.
```

- [x] **Step 6: Skriv `CLAUDE.md` (dansk teknisk onboarding)**

Efter samme mønster som doughnuts. Skal indeholde: TL;DR, projektstruktur, hvordan man kører lokalt, de tre lag (pipeline, motor, brugerflade), hvor antagelserne bor (`pipeline/constants.py`), hvordan årlig opdatering foregår, og husreglen om enkelt dash.

- [x] **Step 7: Init git og verificér at alt stadig virker**

```bash
cd ~/Documents/GitHub/forbrugsudledninger
git init -b main
npm install
npm test
```

Forventet: 23 JS-tests grønne.

```bash
cd pipeline && python3 -m pytest -q && cd ..
```

Forventet: 38 Python-tests grønne.

- [x] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: nyt offentligt repo med motor, pipeline og tests

Kopieret fra den private arbejdsmappe uden Thisted-analyser,
regneark og procesnotater."
```

---

## Task 2: Transport vises som uoplyst, ikke som nul

Dette er specens §6 og planens vigtigste indholdsændring.

**Files:**
- Modify: `web/beregning.js` (funktionen `estimat`)
- Test: `test/beregning.test.js`

- [x] **Step 1: Skriv de fejlende tests**

Tilføj nederst i `test/beregning.test.js`:

```js
// Konstanter som de faktisk ser ud i produktion: kun Nordjylland har et DTU-tal.
// Fixturens konstanter har en neutral 0-stub for Sjælland, som ville skjule
// forskellen mellem "målt til nul" og "ikke opgjort".
const kunNordjylland = {
  ...konstanter,
  bilkm_afvigelse_region: { "Nordjylland": 0.178423236514523 },
};

test("uoplyst: region uden DTU-tal giver null-komponent, ikke nul", () => {
  const r = beregnKommune(greve, land, kunNordjylland);
  assert.equal(r.estimat.komponenter.transporteffekt, null);
  assert.deepEqual(r.estimat.uoplyst, ["transport"]);
});

test("uoplyst: region med DTU-tal giver tom uoplyst-liste", () => {
  const r = beregnKommune(thisted, land, kunNordjylland);
  assert.deepEqual(r.estimat.uoplyst, []);
  assert.ok(r.estimat.komponenter.transporteffekt !== null);
});

test("uoplyst: intervallet er aritmetisk uændret af markeringen", () => {
  const medStub = { ...konstanter, bilkm_afvigelse_region: { "Nordjylland": 0.178423236514523, "Sjælland": 0 } };
  const a = beregnKommune(greve, land, kunNordjylland).estimat.aftryk;
  const b = beregnKommune(greve, land, medStub).estimat.aftryk;
  assert.equal(a.low, b.low);
  assert.equal(a.high, b.high);
});

test("uoplyst: utilstrækkeligt datagrundlag har også feltet", () => {
  const uden = { ...greve, disp_indkomst: null };
  const r = beregnKommune(uden, land, kunNordjylland);
  assert.equal(r.estimat.utilstraekkeligt, true);
  assert.deepEqual(r.estimat.uoplyst, []);
});
```

- [x] **Step 2: Kør testene og bekræft at de fejler**

Run: `npm test`
Forventet: fire fejl. De to første på `transporteffekt` der er `{low: 0, high: 0}` i stedet for `null`, og på `uoplyst` der er `undefined`.

- [x] **Step 3: Ret `estimat()` i `web/beregning.js`**

Erstat hele funktionen:

```js
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
```

- [x] **Step 4: Kør alle tests**

Run: `npm test`
Forventet: alle grønne, inklusive de to golden tests. Thisted er nordjysk og har et ægte tal, så §8.1 er upåvirket. Greve-testen asserterer ikke på transportkomponenten, så §8.2 er upåvirket.

- [x] **Step 5: Commit**

```bash
git add web/beregning.js test/beregning.test.js
git commit -m "fix: transport vises som uoplyst frem for stiltiende nul

Fire af fem regioner mangler DTU-tal. At degradere til {low:0,high:0}
er forsvarligt internt, men offentligt læser 80+ kommuner et ukendt
bidrag som et målt nul. estimat() returnerer nu null for komponenten
og lister den i uoplyst."
```

---

## Task 3: `sources.json` produceres af pipelinen

**Files:**
- Create: `pipeline/sources.py`
- Create: `pipeline/test/test_sources.py`
- Modify: `pipeline/build.py`

- [x] **Step 1: Skriv den fejlende test**

Opret `pipeline/test/test_sources.py`:

```python
"""Kildekataloget skal dække præcis de felter, data.json faktisk indeholder.
Fanger at en ny DST-tabel tilføjes uden kildehenvisning."""
import sources
from constants import PERIODER
from build import FORVENTEDE_FELTER


def test_alle_felter_har_en_kilde():
    daekkede = set()
    for kilde in sources.KILDER:
        daekkede.update(kilde["felter"])
    mangler = set(FORVENTEDE_FELTER) - daekkede
    assert not mangler, f"felter uden kilde: {sorted(mangler)}"


def test_ingen_kilde_daekker_ukendte_felter():
    kendte = set(FORVENTEDE_FELTER)
    for kilde in sources.KILDER:
        ukendte = set(kilde["felter"]) - kendte
        assert not ukendte, f"{kilde['id']} nævner ukendte felter: {sorted(ukendte)}"


def test_intet_felt_daekkes_af_to_kilder():
    set_pr_felt = {}
    for kilde in sources.KILDER:
        for felt in kilde["felter"]:
            set_pr_felt.setdefault(felt, []).append(kilde["id"])
    dubletter = {f: ids for f, ids in set_pr_felt.items() if len(ids) > 1}
    assert not dubletter, f"felter med flere kilder: {dubletter}"


def test_api_kilder_peger_paa_en_kendt_periode():
    for kilde in sources.KILDER:
        if kilde["metode"] != "api":
            continue
        assert kilde["periode_noegle"] in PERIODER, \
            f"{kilde['id']} peger på ukendt periode-nøgle {kilde['periode_noegle']}"


def test_manuelle_kilder_har_ingen_periode_noegle():
    for kilde in sources.KILDER:
        if kilde["metode"] == "manuel":
            assert kilde["periode_noegle"] is None


def test_byg_sources_udfylder_perioder():
    ud = sources.byg_sources()
    api = [k for k in ud["kilder"] if k["metode"] == "api"]
    assert api, "der skal være mindst én api-kilde"
    for kilde in api:
        assert kilde["periode"], f"{kilde['id']} mangler udfyldt periode"
        assert "periode_noegle" not in kilde, "periode_noegle er intern og må ikke ud i json"
```

- [x] **Step 2: Kør testen og bekræft at den fejler**

Run: `cd pipeline && python3 -m pytest test/test_sources.py -q`
Forventet: FAIL med `ModuleNotFoundError: No module named 'sources'`

- [x] **Step 3: Skriv `pipeline/sources.py`**

```python
"""Kildekatalog til metodesiden. Ren data plus én funktion - ingen netværk.

Hver post beskriver én kilde: hvad den hedder, hvem der udgiver den, hvordan
den hentes, og præcis hvilke felter i data.json den er ophav til. Testene
holder katalogets felt-liste synkron med FORVENTEDE_FELTER i build.py, så en
ny tabel ikke kan snige sig ind uden kildehenvisning.

periode_noegle peger ind i PERIODER i constants.py, så årstallene på
metodesiden altid afspejler det, der faktisk blev hentet ved sidste kørsel,
i stedet for at drive fra virkeligheden efter et par årlige opdateringer."""

from datetime import date

from constants import PERIODER

DST = "Danmarks Statistik"
DST_LICENS = "CC BY 4.0"


def _dst(id_, navn, periode_noegle, felter):
    return {
        "id": id_,
        "navn": navn,
        "udbyder": DST,
        "metode": "api",
        "periode_noegle": periode_noegle,
        "licens": DST_LICENS,
        "url": f"https://www.statistikbanken.dk/{id_}",
        "felter": felter,
    }


KILDER = [
    _dst("FOLK1A", "Folketal efter område", "FOLK_KVARTAL", ["folketal", "folketal_forrige"]),
    _dst("ARE207", "Areal efter område", "AREAL_AAR", ["areal"]),
    _dst("INDKP101", "Disponibel indkomst efter område", "INDKOMST_AAR", ["disp_indkomst"]),
    _dst("FORMUE12", "Nettoformue efter område", "FORMUE_AAR", ["formue_gns", "formue_median"]),
    _dst("IFOR41", "Gini-koefficient efter område", "GINI_AAR", ["gini"]),
    _dst("BOL101", "Boliger efter anvendelse", "BOLIGER_AAR",
         ["boliger_parcel", "boliger_raekke", "boliger_etage"]),
    _dst("BOL103", "Boliger efter størrelse", "BOLIGER_AAR", ["boligareal"]),
    _dst("BOL102", "Boliger efter opvarmningsform", "OPVARMNING_AAR",
         ["opv_boliger_ialt", "opv_olie", "opv_naturgas"]),
    _dst("BYGV33", "Fuldført byggeri efter område", "BYGGERI_AAR", ["byggeri"]),
    _dst("BIL54", "Personbiler efter drivmiddel", "BILER_MAANED",
         ["biler", "biler_el", "biler_plugin", "biler_diesel"]),
    _dst("LABY25", "Husholdningsaffald og genanvendelse", "AFFALD_AAR",
         ["affald_kg", "genanvendelse_pct"]),
    {
        "id": "BM010",
        "navn": "Boligpriser pr. kvadratmeter, realiserede handler",
        "udbyder": "Finans Danmark",
        "metode": "api",
        "periode_noegle": "BOLIGPRIS_KVARTAL",
        "licens": "Finans Danmarks vilkår",
        "url": "https://rkr.statistikbank.dk/BM010",
        "felter": ["boligpris_m2"],
    },
    {
        "id": "ENERGINET_MILJODEKLARATION",
        "navn": "CO2 pr. kWh el, kommunedeklaration",
        "udbyder": "Energinet",
        "metode": "manuel",
        "periode_noegle": None,
        "licens": "Energinets vilkår",
        "url": "https://energinet.dk/data-om-energi/co2-pr-kwh-el-kommune/",
        "felter": ["elco2_g_kwh"],
        "forbehold": "Findes kun som rå timedata, der kræver forbrugsvægtet aggregering. "
                     "Kun Hele landet og Thisted er opgjort; 96 kommuner mangler.",
    },
]

# Kilder til metodens antagelser. Leverer ingen felter i data.json, men skal
# stå på metodesiden, fordi de er forudsætninger for hovedtallet.
ANTAGELSER = [
    {
        "id": "DTU_TU",
        "navn": "Transportvaneundersøgelsen, bil-km pr. region",
        "udbyder": "DTU",
        "metode": "manuel",
        "url": "https://www.transportvaner.dk",
        "anvendes_til": "bilkm_afvigelse_region",
        "forbehold": "Intet offentligt API. Kun Nordjylland er slået op. "
                     "For de fire øvrige regioner vises transporteffekten som ikke opgjort.",
    },
    {
        "id": "ENS_GA",
        "navn": "Global Afrapportering, dansk forbrugsaftryk pr. indbygger",
        "udbyder": "Energistyrelsen",
        "metode": "manuel",
        "url": "https://ens.dk",
        "anvendes_til": "anker (10,0 ton CO2e)",
        "forbehold": "Nationalt gennemsnit, opgørelsesår 2023.",
    },
    {
        "id": "CONCITO_ELAST",
        "navn": "Sammenhæng mellem indkomst og klimaaftryk",
        "udbyder": "CONCITO",
        "metode": "manuel",
        "url": "https://concito.dk",
        "anvendes_til": "elasticitet (0,30-0,50) og bilkorsel_andel (0,12-0,15)",
        "forbehold": "Skøn, ikke en målt størrelse.",
    },
]


def byg_sources():
    """Bygger indholdet til web/data/sources.json. Opløser periode_noegle til
    den faktiske periode, så json-filen er selvforklarende for widgeten."""
    kilder = []
    for kilde in KILDER:
        ud = {k: v for k, v in kilde.items() if k != "periode_noegle"}
        noegle = kilde["periode_noegle"]
        ud["periode"] = PERIODER[noegle] if noegle else None
        kilder.append(ud)
    return {
        "genereret": date.today().isoformat(),
        "kilder": kilder,
        "antagelser": ANTAGELSER,
    }
```

- [x] **Step 4: Kør testen og bekræft at den passerer**

Run: `cd pipeline && python3 -m pytest test/test_sources.py -q`
Forventet: 6 passed

- [x] **Step 5: Kobl den på `build.py`**

Ret docstringen øverst i `pipeline/build.py`:

```python
"""Orkestrerer hele datapipelinen. Kør: python3 pipeline/build.py
Skriver web/data/data.json og web/data/sources.json og udskriver en
valideringsrapport til stdout (jf. spec §5.5)."""
```

Tilføj import og sti:

```python
import sources

SOURCES_JSON_PATH = os.path.join(os.path.dirname(__file__), "..", "web", "data", "sources.json")
```

Tilføj i `main()`, umiddelbart efter `print(f"Skrev {DATA_JSON_PATH}")`:

```python
    with open(SOURCES_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(sources.byg_sources(), f, ensure_ascii=False, indent=2)
    print(f"Skrev {SOURCES_JSON_PATH}")
```

- [x] **Step 6: Generér filen uden at røre netværket**

`build.py` henter fra API'er, og det skal ikke være nødvendigt for at få `sources.json`. Kør derfor bare kildedelen:

```bash
cd pipeline && python3 -c "
import json, sources
with open('../web/data/sources.json', 'w', encoding='utf-8') as f:
    json.dump(sources.byg_sources(), f, ensure_ascii=False, indent=2)
print('ok')
"
```

Run: `python3 -m json.tool ../web/data/sources.json | head -20`
Forventet: gyldig JSON med `genereret`, `kilder` og `antagelser`.

- [x] **Step 7: Kør alle Python-tests**

Run: `cd pipeline && python3 -m pytest -q`
Forventet: 44 passed (38 gamle plus 6 nye)

- [x] **Step 8: Commit**

```bash
git add pipeline/sources.py pipeline/test/test_sources.py pipeline/build.py web/data/sources.json
git commit -m "feat: sources.json produceres af pipelinen

build.py's docstring henviste kildemetadata til Plan 3 og producerede
den ikke. Nu genereres den af pipelinen, så årstallene på metodesiden
følger det, der faktisk blev hentet."
```

---

> **Note om detaljeringsgrad fra og med Task 4.** Tasks 1-3 er skrevet med fuld
> kildekode, fordi de ændrer eksisterende, testdækket logik, hvor præcisionen
> betyder noget. Tasks 4-14 bygger ny kode fra bunden og er skrevet som præcise
> opgavedefinitioner med grænseflader, kontrakter og nøglekode. Begrundelse:
> planen udføres i samme session af den, der skrev den, og fuld kildekode to
> gange er spild uden en kold læser. Kontrakterne herunder er bindende - det er
> dem, testene asserterer på.

---

## Task 4: Tailwind-opsætning og sideskal

**Files:** Create `web/styles/input.css`, `web/index.html`, `web/metode.html`, `web/om.html`

- [x] **Step 1:** `npm install`
- [x] **Step 2:** Skriv `web/styles/input.css`:

```css
@import "tailwindcss";
@source "../*.html";
@source "../*.js";

/* Print: doughnuts mønster. display:none på .no-print giver ingen spøgelsessider. */
#print-view { display: none; }
@media print {
  .no-print { display: none !important; }
  #print-view { display: block !important; }
  @page { margin: 1.5cm; }
}

/* Embed: samme idé, anden kontekst. Sætter widget.js på <body> ved ?embed=1. */
body.embed .no-embed { display: none !important; }
body.embed { background: white; }
```

- [x] **Step 3:** Skriv sideskallen i alle tre HTML-filer. Fælles struktur:
  `<html lang="da">`, `<body class="min-h-screen bg-gray-50 text-gray-900 antialiased">`,
  header med `no-print no-embed`, `<main class="mx-auto max-w-6xl px-4 py-6">`,
  footer med `no-print no-embed` og kildekredit, og en fast ansvarsfraskrivelse.
  Navigation: Kommuner, Metode og data, Om.
- [x] **Step 4:** Skriv `Start udviklerserver.command` i rodmappen (spec §9)

```bash
#!/bin/bash
cd "$(dirname "$0")"
echo "Åbner http://127.0.0.1:8000 - luk vinduet for at stoppe."
open http://127.0.0.1:8000
python3 -m http.server 8000 --directory web
```

Gør den kørbar med `chmod +x`. Ejeren er ikke teknisk anlagt, og et
dobbeltklik er en væsentligt lavere tærskel end at huske en npm-kommando.
Samme bekvemmelighed som doughnut-projektet har. Brug `127.0.0.1`, ikke
`localhost` - sidstnævnte kan resolve til IPv6 og fejle, hvilket doughnuts
CLAUDE.md udtrykkeligt advarer om.

- [x] **Step 5:** `npm run css`, verificér at `web/styles/styles.css` er skrevet
- [x] **Step 6:** `npm run serve`, åbn siden, bekræft at skallen ser ud som doughnut
- [x] **Step 7:** Commit

## Task 5: `render.js` - formatering og retningsmarkør

**Files:** Create `web/render.js`, `test/render.test.js`

Kontrakt (bindende, testene asserterer på den):

| Funktion | Signatur | Kontrakt |
|---|---|---|
| `esc(s)` | `string -> string` | Escaper `& < > " '` |
| `tal(v, dec = 0)` | `number\|null, int -> string` | Dansk formatering med `Intl.NumberFormat("da-DK")`. `null` giver `"–"` |
| `pct(v, dec = 1)` | `number\|null -> string` | `0.1784` giver `"+17,8 %"`. Fortegn altid med. `null` giver `"–"` |
| `interval(lo, hi)` | `number, number -> string` | `"9,4 - 9,9"` med ét decimal |
| `retningsMarkoer(retning)` | `string -> string` | SVG-streng. `"over land"` = pil op, `"under land"` = pil ned, `"på niveau"` = vandret streg, `"kontekst"` = skraveret felt |

`retningsMarkoer` er arvet fra doughnuts `TrendMarker`: **formen bærer retningen, farven forstærker den**, fordi cirka 8 % af mænd er farveblinde. Hver markør har `role="img"` og `aria-label`.

- [x] **Step 1:** Skriv `test/render.test.js` med mindst: escaping af `<`, `tal(null)` giver `–`, `tal(1234.5, 1)` giver `1.234,5`, `pct(0.1784)` giver `+17,8 %`, `pct(-0.1208)` giver `-12,1 %`, hver af de fire retninger giver forskellig SVG-form
- [x] **Step 2:** Kør, bekræft fejl
- [x] **Step 3:** Implementér `web/render.js`
- [x] **Step 4:** Kør, bekræft grønt
- [x] **Step 5:** Commit

## Task 6: Hovedtal med ufuldstændigheds-mærkning

**Files:** Modify `web/render.js`, `test/render.test.js`

`renderHovedtal(b)` hvor `b` er output fra `beregnKommune`. Kontrakt:

- `b.estimat.utilstraekkeligt` sand giver teksten "Utilstrækkeligt datagrundlag" og **intet tal**
- Ellers: interval i ton CO2e pr. borger plus sammenligning med ankeret på 10 ton
- `b.estimat.uoplyst.length > 0` giver en synlig advarsel med ordet "ufuldstændigt" og hvilke komponenter der mangler
- Aldrig strengen `"0,0 ton"` for en uoplyst komponent

- [x] **Step 1:** Tests for de tre tilfælde, inkl. en assertion om at output for Greve med kun-Nordjylland-konstanter **ikke** indeholder `0,0`
- [x] **Step 2-5:** Kør fejl, implementér, kør grønt, commit

## Task 7: Nedbrydning som vandfaldsgraf

**Files:** Modify `web/render.js`, `test/render.test.js`

`renderNedbrydning(b, konst)`. Inline SVG, ingen bibliotek. Fire søjler: anker, indkomsteffekt, transporteffekt, byggeeffekt, plus resultatsøjle. Placeres **over** driver-tabellen, fordi specen fastslår at sammensætningen bærer indsigten, ikke totaltallet.

Uoplyste komponenter tegnes som et skraveret felt med teksten "ikke opgjort", ikke som en søjle med højde nul. Det er hele pointen i §6, og en nul-højde-søjle ville genindføre præcis den fejl.

- [x] **Step 1:** Test: uoplyst transport giver `ikke opgjort` i output og ingen `<rect>` med `height="0"`
- [x] **Step 2-5:** Kør fejl, implementér, kør grønt, commit

## Task 8: Driver-tabel med egen tooltip

**Files:** Modify `web/render.js`, `test/render.test.js`

`renderDriverTabel(b)`. Alle 16 rækker fra `b.drivere`: navn, kommuneværdi med enhed, landsværdi, afvigelse, retningsmarkør. Manglende driver giver `–` i alle talkolonner og `kontekst`-markør.

Tooltip skrives selv, ikke via `title`. Doughnut gjorde det, fordi browserens native har 0,5-1 sekunds forsinkelse og opfører sig forskelligt fra browser til browser. Vises ved både hover og tastaturfokus.

To drivere bærer et fast forbehold ved selve tallet: **El-CO2 pr. kWh** (mangler for 96 kommuner) og **Boligpris pr. m²** (volatil ved få handler).

- [x] **Step 1:** Tests: 16 rækker, manglende driver giver `–`, forbehold optræder ved de to nævnte drivere
- [x] **Step 2-5:** Kør fejl, implementér, kør grønt, commit

## Task 9: Boligpris-følsomhed og kommunevisning samlet

**Files:** Modify `web/render.js`, `test/render.test.js`

`renderBoligpris(b)`: returnerer tom streng når `b.boligpris.vises` er falsk. Aldrig et tal uden gyldigt mønster - specens forbud mod falsk symmetri.

`renderKommune(b, konst)`: samler hovedtal, nedbrydning, driver-tabel, boligpris og kildehenvisning i den rækkefølge.

- [x] **Step 1:** Tests: Greve giver tom boligpris-sektion, Thisted giver indhold
- [x] **Step 2-5:** Kør fejl, implementér, kør grønt, commit

## Task 10: `widget.js` - datahentning, søgning og routing

**Files:** Create `web/widget.js`

Tyndt lag. Ingen forretningslogik, ingen formatering - alt det bor i `render.js`.

- Hent `data/data.json` og `data/sources.json` med `fetch`
- Læs `?kommune=<kode>`; ukendt eller manglende kode viser forsiden med søgning
- Læs `?embed=1`; sætter `document.body.classList.add("embed")`
- Søgefelt filtrerer mens der skrives, mønster fra doughnuts `KommuneSearch`
- Kommunekode i URL'en, ikke navn: koden er stabil og allerede nøgle i `data.json`, og den undgår problemer med æ, ø og å i query-strengen

- [x] **Step 1:** Implementér
- [x] **Step 2:** `npm run serve`, verificér manuelt: forside, søgning, `?kommune=787` (Thisted, har transporttal), `?kommune=253` (Greve, uoplyst transport), `?kommune=825` (Læsø, småkommune med huller), `?kommune=999` (ukendt)
- [x] **Step 3:** Commit

## Task 11: metode.html og om.html med indhold

**Files:** Modify `web/metode.html`, `web/om.html`, `web/widget.js`

Metodesiden: formlerne skrevet ud, de fem antagelsesceller med kilde og årstal, kildelisten renderet fra `sources.json`, og de kendte begrænsninger fra specens §14. Om-siden: hvad værktøjet er, hvem der står bag, hvad det ikke er, hvordan det opdateres.

- [x] **Step 1:** Skriv indholdet
- [x] **Step 2:** Renderer kildelisten fra `sources.json`, så årstallene aldrig kan drive fra dataen
- [x] **Step 3:** Commit

## Task 12: Render-test for alle 98 kommuner

**Files:** Create `test/alle98.test.js`

Kører `beregnKommune` plus `renderKommune` for alle 98 kommuner mod ægte `data.json`. Fanger felter, der findes for Thisted, men mangler for fx Læsø.

Assertions: ingen kaster, ingen output indeholder `undefined`, `NaN` eller `null` som synlig tekst, og hver kommune giver ikke-tom HTML.

- [x] **Step 1-5:** Skriv, kør fejl hvis nogen, ret, kør grønt, commit

## Task 13: GitHub Actions-udgivelse

**Files:** Create `.github/workflows/deploy.yml`

Trin: checkout, opsæt Node 22, `npm ci`, `npm run css`, `npm test`, `actions/upload-pages-artifact` med `path: web`, `actions/deploy-pages`. Permissions `pages: write` og `id-token: write`.

Testene kører før udgivelse med vilje: en rød test skal stoppe udgivelsen, ikke bare farve et badge rødt.

- [x] **Step 1-2:** Skriv workflowet, commit

## Task 14: Offentliggørelse

**KRÆVER EJERENS UDTRYKKELIGE JA PÅ DAGEN.** Alt indtil her er lokalt og kan fortrydes. Dette trin kan ikke.

- [x] **Step 1:** Verificér at intet fortroligt er med: `git ls-files | grep -iE '\.(docx|pdf|xlsx|rtf)$'` skal give tomt output
- [x] **Step 2:** `gh repo create forbrugsudledninger --public --source . --remote origin --push`
- [x] **Step 3:** Aktivér Pages med kilde "GitHub Actions"
- [x] **Step 4:** Verificér den udgivne side, herunder `?kommune=253` som viser uoplyst transport
- [x] **Step 5:** Rapportér URL'en til ejeren
