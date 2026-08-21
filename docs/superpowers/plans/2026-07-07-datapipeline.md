# Datapipeline — Implementeringsplan (Plan 2 af 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Byg en Python-pipeline, der henter rådata for alle 98 kommuner + landet fra offentlige API'er, samler dem i den datakontrakt beregningsmotoren (Plan 1, `web/beregning.js`) allerede forventer, og skriver `web/data/data.json` + `web/data/sources.json`. Pipelinen skal kunne genkøres én gang om året.

**Architecture:** Et sæt små, uafhængige fetch-moduler (ét pr. datatema) bygget på en fælles, generisk PX-Web-klient. `build.py` orkestrerer dem, samler resultatet i motorens kontrakt, og skriver de to statiske filer + en valideringsrapport. Ingen database, ingen server ved kørsel — kun ved årlig opdatering.

**Tech Stack:** Python 3 (stdlib only: `urllib.request`, `csv`, `json`, `unittest`). Ingen pip-installationer.

Referencer:
- Spec: [2026-07-06-forbrugsbaserede-udledninger-platform-design.md](../specs/2026-07-06-forbrugsbaserede-udledninger-platform-design.md) — §5 (datalag), §5.4 (manglende-data-politik), §5.5 (årlig opdatering)
- Plan 1 (færdig, flettet til `main`): [2026-07-06-beregningsmotor.md](2026-07-06-beregningsmotor.md) — definerer datakontrakten, denne plan skal producere

---

## Vigtig scope-afklaring (læs før du starter)

Under research til denne plan blev **alle 20 kilder fra spec §5.1 verificeret direkte mod de faktiske API'er** (ægte HTTP-kald, ikke gættede variabelkoder). Undervejs blev det klart, at Plan 1's faktiske, låste datakontrakt (`FORVENTEDE_FELTER` og `DRIVERE` i `web/beregning.js`) er **smallere** end spec'ens oprindelige 16-tabel-ambition:

**I scope for Plan 2** (fødes direkte ind i motorens kontrakt):
- 11 DST-tabeller: FOLK1A, ARE207, INDKP101, FORMUE12, IFOR41, BOL101, BOL103, BYGV33, BIL54, BOL102, LABY25
- 1 øvrig API: Finans Danmark BM010 (boligpriser) — kører på **samme PX-Web-infrastruktur som DST**, blot under `/v1/s20/` i stedet for `/v1/`
- 2 manuelle/config-kilder: DTU regional transportdata (kun Nordjylland kendt), Energinet el-CO2 pr. kommune (kun land + Thisted kendt)

**Uden for scope for Plan 2** (verificeret tilgængelige, men fødes ikke ind i noget felt motoren bruger — kan tilføjes senere til rapport-lagets kontekstfakta, jf. spec §9.3, men er ikke en del af denne plan):
- DST PEND101 (pendling), ERHV2 (erhvervsstruktur), FOLK1C (herkomst), BOL201 (alder i ejer-parcelhuse)
- Energi Data Service CapacityPerMunicipality (VE-kapacitet) — findes ikke i `FORVENTEDE_FELTER`

Denne afgrænsning holder Plan 2 fokuseret på præcis det, der gør widget'en (Plan 3) funktionel, uden at bygge fetch-kode for data, intet i dag forbruger.

### Hvorfor to kilder forbliver manuelle (ikke en genvej — en verificeret kendsgerning)

- **DTU Transportvaneundersøgelsen:** `transportvaner.dk` er et interaktivt selvbetjeningsværktøj uden offentligt API eller downloadbar tabel. DTU's egen "Benchmarks"-side bekræfter: regionale opdelinger kræver "Adgang til Data"-værktøjet, som er til manuel brug i browseren. Der er ingen scriptbar vej til de fire manglende regioner (Hovedstaden, Sjælland, Syddanmark, Midtjylland).
- **Energinet miljødeklaration (el-CO2 pr. kommune):** Findes kun som rå timedata (to datasæt: `ReCoverageMunicipality` + `DeclarationTransmissionEmission`, 8.760 timer × 98 kommuner om året), der skal vægtes sammen med forbrug for at give ét årstal. Metoden er ikke verificeret præcist nok til at stole på (uklart om `CO2PerkWh`/`CH4PerkWh`/`N2OPerkWh` skal summeres direkte eller vægtes forskelligt), og en tung, uverificeret beregning er værre end en ærligt markeret manuel værdi.

Begge er dokumenteret i `constants.py` med præcis vejledning til, hvad der skal opslås manuelt én gang om året, og begge har allerede en fungerende degraderingssti i motoren (Plan 1's `transporteffekt()` returnerer `null` for ukendt region; `elco2_g_kwh` er allerede en ren kontekst-driver, der viser `–` når data mangler).

---

## Filstruktur

| Fil | Ansvar |
|-----|--------|
| `pipeline/kommuner.py` | Statisk tabel: alle 98 kommuner → kode, navn, region. Opslagsfunktioner. |
| `pipeline/dst_client.py` | Generisk PX-Web-klient: byg URL, hent CSV, summér grupperet. Bruges af både DST og Finans Danmark. |
| `pipeline/constants.py` | Periodekonstanter (årstal/kvartaler for hver kilde) + `konstanter`-blokken (anker, elasticitet osv., portet fra Plan 1's fixture) + de to manuelle tabeller (DTU, el-CO2). |
| `pipeline/fetch_dst.py` | De 11 DST-tabel-hentninger, grupperet i fire logiske dele + en samlende `fetch_all_dst()`. |
| `pipeline/fetch_boligpriser.py` | Finans Danmark BM010. |
| `pipeline/build.py` | Orkestrerer alt, samler pr.-kommune-poster i motorens kontrakt, skriver `web/data/data.json` + `web/data/sources.json`, udskriver valideringsrapport. |
| `pipeline/test/test_kommuner.py` | Tests for kommune-tabellen. |
| `pipeline/test/test_dst_client.py` | Tests for CSV-parsing/summering (ingen netværkskald — brug canned CSV-tekst). |
| `pipeline/test/test_fetch_dst.py` | Tests for hver hente-funktions URL-opbygning og resultat-parsing (canned CSV, ingen netværk). |
| `pipeline/test/test_build_golden.py` | Golden test: samlet output for Thisted/Greve/land matcher Plan 1's fixture-værdier eksakt. |

## Datakontrakt (facit — defineret af Plan 1, denne plan skal producere den)

Hvert kommune-objekt i `data.json` skal have nøjagtigt disse felter (fra `test/fixtures.js` i Plan 1):

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

Land-objektet (`"Hele landet"`) har samme felter MINUS `kode` og `region`. Manglende værdi = `None` (bliver `null` i JSON).

---

### Task 1: `kommuner.py` — den statiske kommune-tabel

**Files:**
- Create: `pipeline/kommuner.py`
- Test: `pipeline/test/test_kommuner.py`

Denne tabel er verificeret direkte mod DST's officielle OMRÅDE-hierarki (FOLK1A tableinfo, juli 2026): 105 rækker i alt = 1 "Hele landet" + 5 regionsoverskrifter + 98 kommuner + Christiansø (som IKKE er en af de 98 kommuner — det er et særligt forsvarsområde under Bornholms regionsråd). 29+17+22+19+11 = 98 ✓.

- [ ] **Step 1: Skriv den fejlende test**

Create `pipeline/test/test_kommuner.py`:

```python
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import unittest
from kommuner import KOMMUNER, by_navn, REGIONER

class TestKommuner(unittest.TestCase):
    def test_alle_98_kommuner(self):
        self.assertEqual(len(KOMMUNER), 98)

    def test_ingen_dubletter(self):
        koder = [k[0] for k in KOMMUNER]
        self.assertEqual(len(koder), len(set(koder)))

    def test_thisted_og_greve(self):
        m = by_navn()
        self.assertEqual(m["Thisted"], (787, "Nordjylland"))
        self.assertEqual(m["Greve"], (253, "Sjælland"))

    def test_fem_regioner_med_korrekt_antal(self):
        fordeling = {}
        for _, _, region in KOMMUNER:
            fordeling[region] = fordeling.get(region, 0) + 1
        self.assertEqual(fordeling, {
            "Hovedstaden": 29, "Sjælland": 17, "Syddanmark": 22,
            "Midtjylland": 19, "Nordjylland": 11,
        })

    def test_alle_fem_regionnavne_i_konstant(self):
        self.assertEqual(set(REGIONER), {
            "Hovedstaden", "Sjælland", "Syddanmark", "Midtjylland", "Nordjylland",
        })

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Kør testen og bekræft den fejler**

Run: `python3 -m unittest pipeline.test.test_kommuner -v` (fra projektroden)
Expected: FAIL — `ModuleNotFoundError: No module named 'kommuner'`.

- [ ] **Step 3: Skriv kommune-tabellen**

Create `pipeline/kommuner.py`:

```python
"""Statisk kommune->region-tabel. Verificeret mod DST FOLK1A's OMRÅDE-hierarki (juli 2026).
Danmarks 98 kommuner ændrer sig praktisk taget aldrig; denne tabel opdateres ikke årligt."""

REGIONER = ["Hovedstaden", "Sjælland", "Syddanmark", "Midtjylland", "Nordjylland"]

# (kode, navn, region) - kode er DST's officielle 3-cifrede kommunekode.
KOMMUNER = [
    (101, "København", "Hovedstaden"), (147, "Frederiksberg", "Hovedstaden"),
    (155, "Dragør", "Hovedstaden"), (185, "Tårnby", "Hovedstaden"),
    (165, "Albertslund", "Hovedstaden"), (151, "Ballerup", "Hovedstaden"),
    (153, "Brøndby", "Hovedstaden"), (157, "Gentofte", "Hovedstaden"),
    (159, "Gladsaxe", "Hovedstaden"), (161, "Glostrup", "Hovedstaden"),
    (163, "Herlev", "Hovedstaden"), (167, "Hvidovre", "Hovedstaden"),
    (169, "Høje-Taastrup", "Hovedstaden"), (183, "Ishøj", "Hovedstaden"),
    (173, "Lyngby-Taarbæk", "Hovedstaden"), (175, "Rødovre", "Hovedstaden"),
    (187, "Vallensbæk", "Hovedstaden"), (201, "Allerød", "Hovedstaden"),
    (240, "Egedal", "Hovedstaden"), (210, "Fredensborg", "Hovedstaden"),
    (250, "Frederikssund", "Hovedstaden"), (190, "Furesø", "Hovedstaden"),
    (270, "Gribskov", "Hovedstaden"), (260, "Halsnæs", "Hovedstaden"),
    (217, "Helsingør", "Hovedstaden"), (219, "Hillerød", "Hovedstaden"),
    (223, "Hørsholm", "Hovedstaden"), (230, "Rudersdal", "Hovedstaden"),
    (400, "Bornholm", "Hovedstaden"),
    (253, "Greve", "Sjælland"), (259, "Køge", "Sjælland"),
    (350, "Lejre", "Sjælland"), (265, "Roskilde", "Sjælland"),
    (269, "Solrød", "Sjælland"), (320, "Faxe", "Sjælland"),
    (376, "Guldborgsund", "Sjælland"), (316, "Holbæk", "Sjælland"),
    (326, "Kalundborg", "Sjælland"), (360, "Lolland", "Sjælland"),
    (370, "Næstved", "Sjælland"), (306, "Odsherred", "Sjælland"),
    (329, "Ringsted", "Sjælland"), (330, "Slagelse", "Sjælland"),
    (340, "Sorø", "Sjælland"), (336, "Stevns", "Sjælland"),
    (390, "Vordingborg", "Sjælland"),
    (420, "Assens", "Syddanmark"), (430, "Faaborg-Midtfyn", "Syddanmark"),
    (440, "Kerteminde", "Syddanmark"), (482, "Langeland", "Syddanmark"),
    (410, "Middelfart", "Syddanmark"), (480, "Nordfyns", "Syddanmark"),
    (450, "Nyborg", "Syddanmark"), (461, "Odense", "Syddanmark"),
    (479, "Svendborg", "Syddanmark"), (492, "Ærø", "Syddanmark"),
    (530, "Billund", "Syddanmark"), (561, "Esbjerg", "Syddanmark"),
    (563, "Fanø", "Syddanmark"), (607, "Fredericia", "Syddanmark"),
    (510, "Haderslev", "Syddanmark"), (621, "Kolding", "Syddanmark"),
    (540, "Sønderborg", "Syddanmark"), (550, "Tønder", "Syddanmark"),
    (573, "Varde", "Syddanmark"), (575, "Vejen", "Syddanmark"),
    (630, "Vejle", "Syddanmark"), (580, "Aabenraa", "Syddanmark"),
    (710, "Favrskov", "Midtjylland"), (766, "Hedensted", "Midtjylland"),
    (615, "Horsens", "Midtjylland"), (707, "Norddjurs", "Midtjylland"),
    (727, "Odder", "Midtjylland"), (730, "Randers", "Midtjylland"),
    (741, "Samsø", "Midtjylland"), (740, "Silkeborg", "Midtjylland"),
    (746, "Skanderborg", "Midtjylland"), (706, "Syddjurs", "Midtjylland"),
    (751, "Aarhus", "Midtjylland"), (657, "Herning", "Midtjylland"),
    (661, "Holstebro", "Midtjylland"), (756, "Ikast-Brande", "Midtjylland"),
    (665, "Lemvig", "Midtjylland"), (760, "Ringkøbing-Skjern", "Midtjylland"),
    (779, "Skive", "Midtjylland"), (671, "Struer", "Midtjylland"),
    (791, "Viborg", "Midtjylland"),
    (810, "Brønderslev", "Nordjylland"), (813, "Frederikshavn", "Nordjylland"),
    (860, "Hjørring", "Nordjylland"), (849, "Jammerbugt", "Nordjylland"),
    (825, "Læsø", "Nordjylland"), (846, "Mariagerfjord", "Nordjylland"),
    (773, "Morsø", "Nordjylland"), (840, "Rebild", "Nordjylland"),
    (787, "Thisted", "Nordjylland"), (820, "Vesthimmerlands", "Nordjylland"),
    (851, "Aalborg", "Nordjylland"),
]


def by_navn():
    """Returnerer {navn: (kode, region)} til opslag fra DST's CSV-svar (som bruger navn, ikke kode)."""
    return {navn: (kode, region) for kode, navn, region in KOMMUNER}
```

- [ ] **Step 4: Kør testen og bekræft den består**

Run: `python3 -m unittest pipeline.test.test_kommuner -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add pipeline/kommuner.py pipeline/test/test_kommuner.py
git commit -m "feat: statisk kommune->region-tabel (98 kommuner, verificeret mod DST)"
```

---

### Task 2: `dst_client.py` — generisk PX-Web-klient

**Files:**
- Create: `pipeline/dst_client.py`
- Test: `pipeline/test/test_dst_client.py`

Denne klient er den fælles kerne, alle DST- og Finans Danmark-hentninger bygger på. Testes udelukkende med canned CSV-tekst — ingen netværkskald i denne test, så testsuiten er hurtig og deterministisk.

**Vigtige gotchas, verificeret under research:**
- DST's CSV-svar starter med en UTF-8 BOM (`﻿`) — skal håbdteres, ellers hedder første kolonne `﻿OMRÅDE` i stedet for `OMRÅDE`.
- Nogle tabeller kræver at man summerer over flere wildcard-dimensioner (fx `UDLFORH=*&EJER=*&OPFØRELSESÅR=*`), fordi der ikke findes en indbygget "total"-kode.
- Der er en grænse på 1.000.000 celler pr. CSV-forespørgsel. Wildcard kun de dimensioner, du faktisk skal bruge — ikke alle tabellens dimensioner.

- [ ] **Step 1: Skriv den fejlende test**

Create `pipeline/test/test_dst_client.py`:

```python
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import unittest
from dst_client import parse_csv, sum_by, build_url

CANNED_CSV = (
    "﻿OMRÅDE;ALDER;TID;INDHOLD\n"
    "Hele landet;Alder i alt;2026K1;6025603\n"
    "Thisted;Alder i alt;2026K1;42572\n"
)

CANNED_CSV_MULTI_DIM = (
    "﻿OMRÅDE;OPVARMNING;TID;INDHOLD\n"
    "Thisted;Fjernvarme;2026;13236\n"
    "Thisted;Centralvarme med olie;2026;1452\n"
    "Thisted;Centralvarme med olie;2026;130\n"  # to rækker samme kommune+type - skal summeres
)

class TestParseCsv(unittest.TestCase):
    def test_parser_bom_og_raekker(self):
        rows = parse_csv(CANNED_CSV)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["OMRÅDE"], "Hele landet")
        self.assertEqual(rows[1]["INDHOLD"], "42572")

class TestSumBy(unittest.TestCase):
    def test_sum_by_enkelt_kolonne(self):
        rows = parse_csv(CANNED_CSV)
        sums = sum_by(rows, ["OMRÅDE"])
        self.assertEqual(sums["Hele landet"], 6025603)
        self.assertEqual(sums["Thisted"], 42572)

    def test_sum_by_summerer_flere_raekker_samme_gruppe(self):
        rows = parse_csv(CANNED_CSV_MULTI_DIM)
        sums = sum_by(rows, ["OMRÅDE", "OPVARMNING"])
        self.assertEqual(sums[("Thisted", "Centralvarme med olie")], 1582)  # 1452+130

    def test_sum_by_ignorerer_ikke_numerisk(self):
        rows = [{"OMRÅDE": "Greve", "INDHOLD": "-"}, {"OMRÅDE": "Greve", "INDHOLD": "10"}]
        sums = sum_by(rows, ["OMRÅDE"])
        self.assertEqual(sums["Greve"], 10)

class TestBuildUrl(unittest.TestCase):
    def test_build_url_encoder_danske_bogstaver(self):
        url = build_url("https://api.statbank.dk/v1", "FOLK1A", {"OMRÅDE": "*", "Tid": "2026K1"})
        self.assertTrue(url.startswith("https://api.statbank.dk/v1/data/FOLK1A/CSV?"))
        self.assertIn("Tid=2026K1", url)

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Kør testen og bekræft den fejler**

Run: `python3 -m unittest pipeline.test.test_dst_client -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'dst_client'`.

- [ ] **Step 3: Skriv minimal implementation**

Create `pipeline/dst_client.py`:

```python
"""Generisk klient til DST's og Finans Danmarks PX-Web-baserede statbank-API.
Begge kilder deler samme API-form (api.statbank.dk), blot under forskellige
base_url-underspor: DST er "/v1", Finans Danmark BM010 er "/v1/s20"."""

import csv
import io
import urllib.parse
import urllib.request

DST_BASE_URL = "https://api.statbank.dk/v1"
FINANS_DANMARK_BASE_URL = "https://api.statbank.dk/v1/s20"

TIMEOUT_SEKUNDER = 30


def build_url(base_url, table, params):
    """Bygger data-URL'en. params er en dict af {variabel: værdi}; værdier med
    komma (fx "1,2,3") og "*" sendes igennem uændret - urlencode håndterer selv
    danske bogstaver i værdier korrekt."""
    query = urllib.parse.urlencode(params, safe="*,")
    return f"{base_url}/data/{table}/CSV?{query}"


def parse_csv(text):
    """Parser DST's semikolon-separerede CSV-tekst til en liste af dicts.
    Fjerner UTF-8 BOM'en, som DST altid sætter forrest."""
    if text.startswith("﻿"):
        text = text[1:]
    return list(csv.DictReader(io.StringIO(text), delimiter=";"))


def sum_by(rows, group_cols, value_col="INDHOLD"):
    """Summerer value_col grupperet efter group_cols (liste af kolonnenavne).
    Ikke-numeriske værdier ('-', '..', tomme celler) ignoreres stille, da de
    betyder 'ingen data' i DST's konvention, ikke nul.
    Returnerer {enkelt_vaerdi: sum} hvis group_cols har 1 element,
    ellers {(vaerdi1, vaerdi2, ...): sum}."""
    sums = {}
    for row in rows:
        try:
            v = int(row[value_col])
        except (ValueError, KeyError):
            continue
        key = row[group_cols[0]] if len(group_cols) == 1 else tuple(row[c] for c in group_cols)
        sums[key] = sums.get(key, 0) + v
    return sums


def fetch(base_url, table, params):
    """Henter og parser en tabel. Kaster urllib.error.HTTPError/URLError ved netværksfejl -
    build.py fanger disse pr. kilde, så én fejlende tabel ikke stopper hele pipelinen."""
    url = build_url(base_url, table, params)
    with urllib.request.urlopen(url, timeout=TIMEOUT_SEKUNDER) as resp:
        text = resp.read().decode("utf-8-sig")
    return parse_csv(text)
```

- [ ] **Step 4: Kør testen og bekræft den består**

Run: `python3 -m unittest pipeline.test.test_dst_client -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add pipeline/dst_client.py pipeline/test/test_dst_client.py
git commit -m "feat: generisk PX-Web-klient (DST + Finans Danmark deler samme API-form)"
```

---

### Task 3: `constants.py` — periodekonstanter, konstanter-blok og manuelle tabeller

**Files:**
- Create: `pipeline/constants.py`
- Test: `pipeline/test/test_constants.py`

`konstanter`-blokken er porteret 1:1 fra Plan 1's `test/fixtures.js` (samme tal), fordi det er den blok, motoren allerede er testet mod. De to manuelle tabeller (`BILKM_AFVIGELSE_REGION`, `EL_CO2_MANUAL`) er ufuldstændige med vilje — det er den ærlige tilstand efter research, ikke en fejl. Periodekonstanterne er ÅRETS ét sted at redigere ved den årlige opdatering (spec §5.5).

- [ ] **Step 1: Skriv den fejlende test**

Create `pipeline/test/test_constants.py`:

```python
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import unittest
from constants import KONSTANTER, BILKM_AFVIGELSE_REGION, EL_CO2_MANUAL, PERIODER

class TestConstants(unittest.TestCase):
    def test_konstanter_matcher_plan1_fixture(self):
        self.assertEqual(KONSTANTER["anker"], 10.0)
        self.assertEqual(KONSTANTER["elasticitet"], {"low": 0.30, "high": 0.50})
        self.assertEqual(KONSTANTER["byggeandel"]["high"], 0.0456045)
        self.assertEqual(KONSTANTER["boligudgift_modregning"], 0.45)

    def test_dtu_har_kun_nordjylland_kendt(self):
        self.assertAlmostEqual(BILKM_AFVIGELSE_REGION["Nordjylland"], 0.178423236514523)
        for region in ("Hovedstaden", "Sjælland", "Syddanmark", "Midtjylland"):
            self.assertNotIn(region, BILKM_AFVIGELSE_REGION)

    def test_el_co2_har_kun_land_og_thisted_kendt(self):
        self.assertEqual(EL_CO2_MANUAL["Hele landet"], 51.8)
        self.assertEqual(EL_CO2_MANUAL["Thisted"], 26.7)
        self.assertNotIn("Greve", EL_CO2_MANUAL)

    def test_perioder_indeholder_alle_forventede_noegler(self):
        forventede = {
            "FOLK_KVARTAL", "FOLK_KVARTAL_FORRIGE", "AREAL_AAR", "INDKOMST_AAR",
            "FORMUE_AAR", "GINI_AAR", "BOLIGER_AAR", "OPVARMNING_AAR",
            "BYGGERI_AAR", "BILER_MAANED", "AFFALD_AAR", "BOLIGPRIS_KVARTAL",
        }
        self.assertEqual(set(PERIODER.keys()), forventede)

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Kør testen og bekræft den fejler**

Run: `python3 -m unittest pipeline.test.test_constants -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'constants'`.

- [ ] **Step 3: Skriv minimal implementation**

Create `pipeline/constants.py`:

```python
"""Periodekonstanter og antagelser. ÅRLIG OPDATERING: se spec §5.5.

Ved den årlige genkøring:
1. Opdatér PERIODER til de nyeste tilgængelige perioder for hver kilde
   (kør build.py - valideringsrapporten viser, om en tabel har nyere data).
2. Tjek om BILKM_AFVIGELSE_REGION eller EL_CO2_MANUAL kan udfyldes mere -
   se vejledningen ved hver tabel nedenfor.
3. Konstanterne i KONSTANTER (anker, elasticitet mv.) er metodiske antagelser,
   ikke datapunkter - opdatér kun hvis metoden selv ændres."""

# --- Periodekonstanter: ÅRETS ét sted at redigere ved opdatering ---
PERIODER = {
    "FOLK_KVARTAL": "2026K1",
    "FOLK_KVARTAL_FORRIGE": "2025K1",
    "AREAL_AAR": "2025",
    "INDKOMST_AAR": "2024",
    "FORMUE_AAR": "2024",
    "GINI_AAR": "2024",
    "BOLIGER_AAR": "2025",
    "OPVARMNING_AAR": "2026",
    "BYGGERI_AAR": "2024",
    "BILER_MAANED": "2026M01",
    "AFFALD_AAR": "2023",
    "BOLIGPRIS_KVARTAL": "2025K4",
}

# --- Konstanter til beregningsmotoren. Porteret 1:1 fra Plan 1's test/fixtures.js -
#     ÆNDR IKKE disse uden at køre Plan 1's golden tests igen (test/golden.test.js). ---
KONSTANTER = {
    "anker": 10.0,
    "elasticitet": {"low": 0.30, "high": 0.50},
    "bilkorsel_andel": {"low": 0.12, "high": 0.15},
    "byggeandel": {"low": 0.0, "high": 0.0456045},
    "boligudgift_modregning": 0.45,
}

# --- MANUEL KILDE 1: DTU Transportvaneundersøgelsen (bil-km-afvigelse pr. region) ---
# Kun Nordjylland er kendt (fra v5-regnearket, udtræk juli 2026). transportvaner.dk
# har intet offentligt API - de fire øvrige regioner skal slås op manuelt:
#   1. Gå til transportvaner.dk (selvbetjening).
#   2. Vælg mål: trafikarbejde, transportmiddel: bil, periode: seneste 10 år (gns.).
#   3. Slå op for hver af: Hovedstaden, Sjælland, Syddanmark, Midtjylland.
#   4. Afvigelse = (region_km - land_km) / land_km. Tilføj som ny nøgle nedenfor.
BILKM_AFVIGELSE_REGION = {
    "Nordjylland": 0.178423236514523,
}

# --- MANUEL KILDE 2: Energinet miljødeklaration (el-CO2 pr. kommune, g/kWh) ---
# Kun land og Thisted er kendt (fra v5-regnearket). Findes ikke som færdig årstabel
# via API'et - kun som rå timedata, der kræver forbrugsvægtet aggregering.
# Årlig opdatering: besøg https://energinet.dk/data-om-energi/co2-pr-kwh-el-kommune/
# og aflæs den offentliggjorte kommunedeklaration for det seneste år.
EL_CO2_MANUAL = {
    "Hele landet": 51.8,
    "Thisted": 26.7,
}
```

- [ ] **Step 4: Kør testen og bekræft den består**

Run: `python3 -m unittest pipeline.test.test_constants -v`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add pipeline/constants.py pipeline/test/test_constants.py
git commit -m "feat: periodekonstanter + konstanter-blok (portet fra Plan 1) + manuelle kilder"
```

---

### Task 4: `fetch_dst.py` Del A — befolkning, areal, økonomi

**Files:**
- Create: `pipeline/fetch_dst.py`
- Test: `pipeline/test/test_fetch_dst.py`

Fem tabeller: FOLK1A (x2 år), ARE207, INDKP101, FORMUE12, IFOR41. Bemærk at IFOR41 bruger variabelnavnet `KOMMUNEDK`, ikke `OMRÅDE` som de øvrige.

- [ ] **Step 1: Skriv den fejlende test**

Create `pipeline/test/test_fetch_dst.py`:

```python
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import unittest
from unittest.mock import patch
import fetch_dst

FOLK1A_CSV = (
    "﻿OMRÅDE;KØN;ALDER;CIVILSTAND;TID;INDHOLD\n"
    "Hele landet;I alt;Alder i alt;I alt;2026K1;6025603\n"
    "Thisted;I alt;Alder i alt;I alt;2026K1;42572\n"
)
ARE207_CSV = (
    "﻿OMRÅDE;TID;INDHOLD\n"
    "Hele landet;2025;42955,60\n"
    "Thisted;2025;1072,20\n"
)
INDKP101_CSV = (
    "﻿OMRÅDE;ENHED;KOEN;INDKOMSTTYPE;TID;INDHOLD\n"
    "Hele landet;Gennemsnit for alle personer (kr.);Mænd og kvinder i alt;1 Disponibel indkomst (2+30-31-32-35);2024;287682\n"
    "Thisted;Gennemsnit for alle personer (kr.);Mænd og kvinder i alt;1 Disponibel indkomst (2+30-31-32-35);2024;252934\n"
)
FORMUE12_CSV = (
    "﻿FORM1;ENHED;OMRÅDE;ALDER;POPU;TID;INDHOLD\n"
    "Nettoformue I alt (2020-definition A+B+CX-D-E-F);Gennemsnit, faste priser (seneste dataårs prisniveau);Hele landet;18 år og derover;Alle uanset om de har formuetypen;2024;2177950\n"
    "Nettoformue I alt (2020-definition A+B+CX-D-E-F);Median, faste priser (seneste dataårs prisniveau);Hele landet;18 år og derover;Alle uanset om de har formuetypen;2024;800815\n"
)
IFOR41_CSV = (
    "﻿ULLIG;KOMMUNEDK;TID;INDHOLD\n"
    "Gini-koefficient;Hele landet;2024;30,43\n"
    "Gini-koefficient;Thisted;2024;26,42\n"
)


class TestFetchDelA(unittest.TestCase):
    @patch("fetch_dst.dst_client.fetch")
    def test_folketal(self, mock_fetch):
        mock_fetch.side_effect = [
            fetch_dst.dst_client.parse_csv(FOLK1A_CSV),
            fetch_dst.dst_client.parse_csv(FOLK1A_CSV),
        ]
        nu, forrige = fetch_dst.fetch_folketal()
        self.assertEqual(nu["Thisted"], 42572)
        self.assertEqual(forrige["Hele landet"], 6025603)

    @patch("fetch_dst.dst_client.fetch")
    def test_areal(self, mock_fetch):
        mock_fetch.return_value = fetch_dst.dst_client.parse_csv(ARE207_CSV)
        result = fetch_dst.fetch_areal()
        self.assertAlmostEqual(result["Thisted"], 1072.20)

    @patch("fetch_dst.dst_client.fetch")
    def test_indkomst(self, mock_fetch):
        mock_fetch.return_value = fetch_dst.dst_client.parse_csv(INDKP101_CSV)
        result = fetch_dst.fetch_indkomst()
        self.assertEqual(result["Thisted"], 252934)

    @patch("fetch_dst.dst_client.fetch")
    def test_formue(self, mock_fetch):
        mock_fetch.return_value = fetch_dst.dst_client.parse_csv(FORMUE12_CSV)
        gns, median = fetch_dst.fetch_formue()
        self.assertEqual(gns["Hele landet"], 2177950)
        self.assertEqual(median["Hele landet"], 800815)

    @patch("fetch_dst.dst_client.fetch")
    def test_gini(self, mock_fetch):
        mock_fetch.return_value = fetch_dst.dst_client.parse_csv(IFOR41_CSV)
        result = fetch_dst.fetch_gini()
        self.assertAlmostEqual(result["Thisted"], 26.42)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Kør testen og bekræft den fejler**

Run: `python3 -m unittest pipeline.test.test_fetch_dst -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'fetch_dst'`.

- [ ] **Step 3: Skriv minimal implementation**

Create `pipeline/fetch_dst.py`:

```python
"""Henter de 11 DST-tabeller, motorens datakontrakt kræver. Hver funktion
returnerer et dict {kommunenavn: værdi} (eller et par af dicts, hvis tabellen
dækker to felter). DST's tal bruger komma som decimalseparator i nogle CSV-felter
(fx areal), så numeriske felter uden for INDHOLD-kolonnen parses med _to_float()."""

import dst_client
from constants import PERIODER

BASE = dst_client.DST_BASE_URL


def _to_float(s):
    return float(s.replace(",", "."))


def fetch_folketal():
    """Returnerer (folketal_nu, folketal_forrige), begge {navn: int}."""
    rows_nu = dst_client.fetch(BASE, "FOLK1A", {
        "OMRÅDE": "*", "KØN": "TOT", "ALDER": "IALT", "CIVILSTAND": "TOT",
        "Tid": PERIODER["FOLK_KVARTAL"],
    })
    rows_forrige = dst_client.fetch(BASE, "FOLK1A", {
        "OMRÅDE": "*", "KØN": "TOT", "ALDER": "IALT", "CIVILSTAND": "TOT",
        "Tid": PERIODER["FOLK_KVARTAL_FORRIGE"],
    })
    return dst_client.sum_by(rows_nu, ["OMRÅDE"]), dst_client.sum_by(rows_forrige, ["OMRÅDE"])


def fetch_areal():
    """Returnerer {navn: areal_km2 (float)}."""
    rows = dst_client.fetch(BASE, "ARE207", {"OMRÅDE": "*", "Tid": PERIODER["AREAL_AAR"]})
    return {r["OMRÅDE"]: _to_float(r["INDHOLD"]) for r in rows if r["INDHOLD"] not in ("-", "..", "")}


def fetch_indkomst():
    """Returnerer {navn: disponibel_indkomst (int, kr.)}."""
    rows = dst_client.fetch(BASE, "INDKP101", {
        "OMRÅDE": "*", "ENHED": "116", "KOEN": "MOK", "INDKOMSTTYPE": "100",
        "Tid": PERIODER["INDKOMST_AAR"],
    })
    return dst_client.sum_by(rows, ["OMRÅDE"])


def fetch_formue():
    """Returnerer (gennemsnit, median), begge {navn: kr. (int)}."""
    rows = dst_client.fetch(BASE, "FORMUE12", {
        "FORM1": "FGNF2020", "ENHED": "200,215", "OMRÅDE": "*",
        "ALDER": "1802", "POPU": "5005", "Tid": PERIODER["FORMUE_AAR"],
    })
    gns = {r["OMRÅDE"]: int(r["INDHOLD"]) for r in rows if "Gennemsnit" in r["ENHED"]}
    median = {r["OMRÅDE"]: int(r["INDHOLD"]) for r in rows if "Median" in r["ENHED"]}
    return gns, median


def fetch_gini():
    """Returnerer {navn: gini (float)}. Bemærk: tabellens områdevariabel hedder
    KOMMUNEDK, ikke OMRÅDE."""
    rows = dst_client.fetch(BASE, "IFOR41", {
        "ULLIG": "70", "KOMMUNEDK": "*", "Tid": PERIODER["GINI_AAR"],
    })
    return {r["KOMMUNEDK"]: _to_float(r["INDHOLD"]) for r in rows if r["INDHOLD"] not in ("-", "..", "")}
```

- [ ] **Step 4: Kør testen og bekræft den består**

Run: `python3 -m unittest pipeline.test.test_fetch_dst -v`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add pipeline/fetch_dst.py pipeline/test/test_fetch_dst.py
git commit -m "feat: fetch_dst Del A - befolkning, areal, indkomst, formue, gini"
```

---

### Task 5: `fetch_dst.py` Del B — boliger (type-fordeling + gennemsnitsareal)

**Files:**
- Modify: `pipeline/fetch_dst.py`
- Modify: `pipeline/test/test_fetch_dst.py`

BOL101 har ingen "total"-kode for `UDLFORH`/`EJER`/`OPFØRELSESÅR` — disse skal wildcardes og summeres. BOL103's gennemsnitsareal er en **antagelse** (midpoint-metode på størrelsesintervaller) — verificeret til at ligge tæt på (men ikke identisk med) v5-regnearkets manuelt beregnede tal (afvigelse ca. 1-2 m², forventet og dokumenteret).

- [ ] **Step 1: Skriv den fejlende test**

Append to `pipeline/test/test_fetch_dst.py` (inside a new test class, before `if __name__`):

```python
BOL101_CSV = (
    "﻿OMRÅDE;BEBO;ANVENDELSE;UDLFORH;EJER;OPFØRELSESÅR;TID;INDHOLD\n"
    "Thisted;Boliger med CPR tilmeldte personer (beboede boliger);Parcel/Stuehuse;Beboet af ejer;Privatpersoner inkl I/S;2010;2025;100\n"
    "Thisted;Boliger med CPR tilmeldte personer (beboede boliger);Parcel/Stuehuse;Beboet af lejer;Privatpersoner inkl I/S;2011;2025;46\n"
    "Thisted;Boliger med CPR tilmeldte personer (beboede boliger);Række-, kæde- og dobbelthuse;Beboet af ejer;Privatpersoner inkl I/S;2010;2025;50\n"
)
BOL103_CSV = (
    "﻿AMT;BEBO;ANVENDELSE;BOLIGSTØR;TID;INDHOLD\n"
    "Thisted;Boliger med CPR tilmeldte personer (beboede boliger);Parcel/Stuehuse;100-124 kvm;2025;10\n"
    "Thisted;Boliger med CPR tilmeldte personer (beboede boliger);Parcel/Stuehuse;150-174 kvm;2025;5\n"
)


class TestFetchDelB(unittest.TestCase):
    @patch("fetch_dst.dst_client.fetch")
    def test_boliger_type(self, mock_fetch):
        mock_fetch.return_value = fetch_dst.dst_client.parse_csv(BOL101_CSV)
        parcel, raekke, etage = fetch_dst.fetch_boliger_type()
        self.assertEqual(parcel["Thisted"], 146)  # 100+46
        self.assertEqual(raekke["Thisted"], 50)

    @patch("fetch_dst.dst_client.fetch")
    def test_boligareal_midpoint(self, mock_fetch):
        mock_fetch.return_value = fetch_dst.dst_client.parse_csv(BOL103_CSV)
        result = fetch_dst.fetch_boligareal()
        # (10*112 + 5*162) / 15 = 128.67
        self.assertAlmostEqual(result["Thisted"], 128.67, places=1)
```

- [ ] **Step 2: Kør testen og bekræft den fejler**

Run: `python3 -m unittest pipeline.test.test_fetch_dst -v`
Expected: FAIL — `AttributeError: module 'fetch_dst' has no attribute 'fetch_boliger_type'`.

- [ ] **Step 3: Skriv minimal implementation**

Append to `pipeline/fetch_dst.py`:

```python
# Midpoint-antagelse for BOL103's størrelsesintervaller. Egen beregning (som i v5-
# regnearket), dokumenteret som antagelse. Giver ca. 1-2 m² afvigelse fra v5's manuelle
# tal for de yderste, åbne intervaller ("- 50 kvm", "175 kvm og derover") - forventet.
_BOLIGSTOR_MIDPUNKT = {
    "- 50 kvm": 40, "50-74 kvm": 62, "75-99 kvm": 87, "100-124 kvm": 112,
    "125-149 kvm": 137, "150-174 kvm": 162, "175 kvm og derover": 195,
}


def fetch_boliger_type():
    """Returnerer (parcel, raekke, etage), hver {navn: antal boliger (int)}.
    Wildcarder UDLFORH/EJER/OPFØRELSESÅR, fordi ingen af dem har en total-kode."""
    rows = dst_client.fetch(BASE, "BOL101", {
        "OMRÅDE": "*", "BEBO": "1000", "ANVENDELSE": "125,130,140",
        "UDLFORH": "*", "EJER": "*", "OPFØRELSESÅR": "*",
        "Tid": PERIODER["BOLIGER_AAR"],
    })
    sums = dst_client.sum_by(rows, ["OMRÅDE", "ANVENDELSE"])
    parcel, raekke, etage = {}, {}, {}
    for (navn, anv), v in sums.items():
        if anv == "Parcel/Stuehuse":
            parcel[navn] = parcel.get(navn, 0) + v
        elif anv == "Række-, kæde- og dobbelthuse":
            raekke[navn] = raekke.get(navn, 0) + v
        elif anv == "Etageboliger":
            etage[navn] = etage.get(navn, 0) + v
    return parcel, raekke, etage


def fetch_boligareal():
    """Returnerer {navn: gennemsnitligt boligareal i m² (float)} via midpoint-metoden.
    IKKE wildcard ANTVÆR/HUSSTØR - de er irrelevante her og blæser cellegrænsen op."""
    rows = dst_client.fetch(BASE, "BOL103", {
        "AMT": "*", "BEBO": "1000", "ANVENDELSE": "125,130,140",
        "BOLIGSTØR": "*", "Tid": PERIODER["BOLIGER_AAR"],
    })
    sum_areal, sum_antal = {}, {}
    for r in rows:
        midt = _BOLIGSTOR_MIDPUNKT.get(r["BOLIGSTØR"])
        if midt is None:
            continue  # "Uoplyst" har ingen kendt størrelse - udelades
        try:
            n = int(r["INDHOLD"])
        except ValueError:
            continue
        navn = r["AMT"]
        sum_areal[navn] = sum_areal.get(navn, 0) + n * midt
        sum_antal[navn] = sum_antal.get(navn, 0) + n
    return {navn: sum_areal[navn] / sum_antal[navn] for navn in sum_antal if sum_antal[navn] > 0}
```

- [ ] **Step 4: Kør testen og bekræft den består**

Run: `python3 -m unittest pipeline.test.test_fetch_dst -v`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add pipeline/fetch_dst.py pipeline/test/test_fetch_dst.py
git commit -m "feat: fetch_dst Del B - boligtype-fordeling + boligareal (midpoint-antagelse)"
```

---

### Task 6: `fetch_dst.py` Del C — opvarmning og byggeaktivitet

**Files:**
- Modify: `pipeline/fetch_dst.py`
- Modify: `pipeline/test/test_fetch_dst.py`

BOL102 skal wildcarde `ANVENDELSE` (alle boligtyper, ikke kun parcel/række/etage) for at give det korrekte total-tal. BYGV33 skal **udelukke** `Kollegier` og `Døgninstitutioner` fra `ANVEND` — ellers tælles studenterboliger/institutioner med som almindeligt boligbyggeri (verificeret: dette var netop forskellen mellem et forkert og et korrekt facit-match).

- [ ] **Step 1: Skriv den fejlende test**

Append to `pipeline/test/test_fetch_dst.py`:

```python
BOL102_CSV = (
    "﻿AMT;BEBO;ANVENDELSE;OPVARMNING;TID;INDHOLD\n"
    "Thisted;Boliger med CPR tilmeldte personer (beboede boliger);Parcel/Stuehuse;Fjernvarme;2026;100\n"
    "Thisted;Boliger med CPR tilmeldte personer (beboede boliger);Parcel/Stuehuse;Centralvarme med olie;2026;20\n"
    "Thisted;Boliger med CPR tilmeldte personer (beboede boliger);Parcel/Stuehuse;Centralvarme m naturgas;2026;5\n"
    "Thisted;Boliger med CPR tilmeldte personer (beboede boliger);Etageboliger;Fjernvarme;2026;50\n"
)
BYGV33_CSV = (
    "﻿OMRÅDE;BYGFASE;ANVEND;BYGHERRE;TID;INDHOLD\n"
    "Thisted;Fuldført byggeri;Parcelhuse;Private, I/S, A/S, ApS og lign.;2024K1;10\n"
    "Thisted;Fuldført byggeri;Kollegier;Private, I/S, A/S, ApS og lign.;2024K1;50\n"
    "Thisted;Fuldført byggeri;Etageboliger;Private, I/S, A/S, ApS og lign.;2024K2;5\n"
)


class TestFetchDelC(unittest.TestCase):
    @patch("fetch_dst.dst_client.fetch")
    def test_opvarmning(self, mock_fetch):
        mock_fetch.return_value = fetch_dst.dst_client.parse_csv(BOL102_CSV)
        ialt, olie, naturgas = fetch_dst.fetch_opvarmning()
        self.assertEqual(ialt["Thisted"], 175)  # 100+20+5+50
        self.assertEqual(olie["Thisted"], 20)
        self.assertEqual(naturgas["Thisted"], 5)

    @patch("fetch_dst.dst_client.fetch")
    def test_byggeri_udelader_kollegier(self, mock_fetch):
        mock_fetch.return_value = fetch_dst.dst_client.parse_csv(BYGV33_CSV)
        result = fetch_dst.fetch_byggeri()
        self.assertEqual(result["Thisted"], 15)  # 10+5, IKKE +50 (kollegier)
```

- [ ] **Step 2: Kør testen og bekræft den fejler**

Run: `python3 -m unittest pipeline.test.test_fetch_dst -v`
Expected: FAIL — `AttributeError: module 'fetch_dst' has no attribute 'fetch_opvarmning'`.

- [ ] **Step 3: Skriv minimal implementation**

Append to `pipeline/fetch_dst.py`:

```python
# ANVEND-koder der IKKE er almindelige boliger - udelades fra byggeaktivitet, jf. v5's
# facit-tal (verificeret: inkl. Kollegier gav 153 for Thisted 2024 i stedet for korrekt 103).
_BYGGERI_IKKE_BOLIG = {"Kollegier", "Døgninstitutioner", "IKKE-FORDELT, UOPLYST"}


def fetch_opvarmning():
    """Returnerer (ialt, olie, naturgas), hver {navn: antal boliger (int)}.
    Wildcarder ANVENDELSE, fordi opv_boliger_ialt skal dække ALLE boligtyper."""
    rows = dst_client.fetch(BASE, "BOL102", {
        "AMT": "*", "BEBO": "1000", "ANVENDELSE": "*", "OPVARMNING": "*",
        "Tid": PERIODER["OPVARMNING_AAR"],
    })
    ialt = dst_client.sum_by(rows, ["AMT"])
    per_type = dst_client.sum_by(rows, ["AMT", "OPVARMNING"])
    olie = {navn: v for (navn, opv), v in per_type.items() if opv == "Centralvarme med olie"}
    naturgas = {navn: v for (navn, opv), v in per_type.items() if opv == "Centralvarme m naturgas"}
    return ialt, olie, naturgas


def fetch_byggeri():
    """Returnerer {navn: fuldførte boliger seneste år (int)}. Udelader kollegier/
    døgninstitutioner - se _BYGGERI_IKKE_BOLIG."""
    aar = PERIODER["BYGGERI_AAR"]
    kvartaler = ",".join(f"{aar}K{k}" for k in range(1, 5))
    rows = dst_client.fetch(BASE, "BYGV33", {
        "OMRÅDE": "*", "BYGFASE": "3", "ANVEND": "*", "BYGHERRE": "*",
        "Tid": kvartaler,
    })
    relevante = [r for r in rows if r["ANVEND"] not in _BYGGERI_IKKE_BOLIG]
    return dst_client.sum_by(relevante, ["OMRÅDE"])
```

- [ ] **Step 4: Kør testen og bekræft den består**

Run: `python3 -m unittest pipeline.test.test_fetch_dst -v`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add pipeline/fetch_dst.py pipeline/test/test_fetch_dst.py
git commit -m "feat: fetch_dst Del C - opvarmning + byggeaktivitet (udelader kollegier)"
```

---

### Task 7: `fetch_dst.py` Del D — biler, affald + samlende `fetch_all_dst()`

**Files:**
- Modify: `pipeline/fetch_dst.py`
- Modify: `pipeline/test/test_fetch_dst.py`

Sidste to tabeller, plus funktionen der samler alle 11 DST-hentninger til én pr.-kommune-struktur.

- [ ] **Step 1: Skriv den fejlende test**

Append to `pipeline/test/test_fetch_dst.py`:

```python
BIL54_CSV = (
    "﻿OMRÅDE;BILTYPE;BRUG;DRIV;TID;INDHOLD\n"
    "Thisted;Personbiler i alt;I alt;Drivmidler i alt;2026M01;23656\n"
    "Thisted;Personbiler i alt;I alt;El;2026M01;3404\n"
    "Thisted;Personbiler i alt;I alt;Pluginhybrid;2026M01;946\n"
    "Thisted;Personbiler i alt;I alt;Diesel;2026M01;7114\n"
)
LABY25_CSV = (
    "﻿KOMGRP;BNØGLE;TID;INDHOLD\n"
    "Thisted;Husholdningsaffald (kg. pr. indbygger);2023;508\n"
    "Thisted;Husholdningsaffald indsamlet til genanvendelse (pct.);2023;45\n"
)


class TestFetchDelD(unittest.TestCase):
    @patch("fetch_dst.dst_client.fetch")
    def test_biler(self, mock_fetch):
        mock_fetch.return_value = fetch_dst.dst_client.parse_csv(BIL54_CSV)
        biler, el, plugin, diesel = fetch_dst.fetch_biler()
        self.assertEqual(biler["Thisted"], 23656)
        self.assertEqual(el["Thisted"], 3404)
        self.assertEqual(plugin["Thisted"], 946)
        self.assertEqual(diesel["Thisted"], 7114)

    @patch("fetch_dst.dst_client.fetch")
    def test_affald(self, mock_fetch):
        mock_fetch.return_value = fetch_dst.dst_client.parse_csv(LABY25_CSV)
        kg, pct = fetch_dst.fetch_affald()
        self.assertEqual(kg["Thisted"], 508)
        self.assertEqual(pct["Thisted"], 45)

    def test_fetch_all_dst_samler_alle_felter(self):
        with patch.object(fetch_dst, "fetch_folketal", return_value=({"Thisted": 42572}, {"Thisted": 42698})), \
             patch.object(fetch_dst, "fetch_areal", return_value={"Thisted": 1072.2}), \
             patch.object(fetch_dst, "fetch_indkomst", return_value={"Thisted": 252934}), \
             patch.object(fetch_dst, "fetch_formue", return_value=({"Thisted": 1838139}, {"Thisted": 813928})), \
             patch.object(fetch_dst, "fetch_gini", return_value={"Thisted": 26.42}), \
             patch.object(fetch_dst, "fetch_boliger_type", return_value=({"Thisted": 14246}, {"Thisted": 2677}, {"Thisted": 3295})), \
             patch.object(fetch_dst, "fetch_boligareal", return_value={"Thisted": 133.0}), \
             patch.object(fetch_dst, "fetch_opvarmning", return_value=({"Thisted": 20515}, {"Thisted": 1582}, {"Thisted": 958})), \
             patch.object(fetch_dst, "fetch_byggeri", return_value={"Thisted": 103}), \
             patch.object(fetch_dst, "fetch_biler", return_value=({"Thisted": 23656}, {"Thisted": 3404}, {"Thisted": 946}, {"Thisted": 7114})), \
             patch.object(fetch_dst, "fetch_affald", return_value=({"Thisted": 508}, {"Thisted": 45})):
            result = fetch_dst.fetch_all_dst()
            self.assertEqual(result["Thisted"]["disp_indkomst"], 252934)
            self.assertEqual(result["Thisted"]["biler_diesel"], 7114)
            self.assertEqual(result["Thisted"]["opv_olie"], 1582)
            self.assertEqual(result["Thisted"]["genanvendelse_pct"], 45)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Kør testen og bekræft den fejler**

Run: `python3 -m unittest pipeline.test.test_fetch_dst -v`
Expected: FAIL — `AttributeError: module 'fetch_dst' has no attribute 'fetch_biler'`.

- [ ] **Step 3: Skriv minimal implementation**

Append to `pipeline/fetch_dst.py`:

```python
def fetch_biler():
    """Returnerer (biler_ialt, el, plugin, diesel), hver {navn: antal (int)}."""
    rows = dst_client.fetch(BASE, "BIL54", {
        "OMRÅDE": "*", "BILTYPE": "4000101002", "BRUG": "1000",
        "DRIV": "20200,20225,20232,20210", "Tid": PERIODER["BILER_MAANED"],
    })
    per_type = dst_client.sum_by(rows, ["OMRÅDE", "DRIV"])
    def _uddrag(driv_navn):
        return {navn: v for (navn, driv), v in per_type.items() if driv == driv_navn}
    return (_uddrag("Drivmidler i alt"), _uddrag("El"), _uddrag("Pluginhybrid"), _uddrag("Diesel"))


def fetch_affald():
    """Returnerer (kg_pr_indbygger, genanvendelse_pct), begge {navn: tal (int)}.
    LABY25's KOMGRP-variabel bruger kommunenavne direkte (samme som OMRÅDE i andre
    tabeller), plus nogle kommunegruppe-aggregater vi ikke bruger."""
    rows = dst_client.fetch(BASE, "LABY25", {
        "KOMGRP": "*", "BNØGLE": "*", "Tid": PERIODER["AFFALD_AAR"],
    })
    per_type = dst_client.sum_by(rows, ["KOMGRP", "BNØGLE"])
    kg = {navn: v for (navn, n), v in per_type.items() if n == "Husholdningsaffald (kg. pr. indbygger)"}
    pct = {navn: v for (navn, n), v in per_type.items() if n == "Husholdningsaffald indsamlet til genanvendelse (pct.)"}
    return kg, pct


def fetch_all_dst():
    """Kører alle 11 DST-hentninger og samler dem i et {navn: {felt: værdi}}-dict,
    med feltnavne der matcher motorens datakontrakt 1:1. Kommuner uden data for et
    givent felt får det simpelthen ikke sat her - build.py fylder None ind for
    manglende felter, jf. spec §5.4."""
    folketal, folketal_forrige = fetch_folketal()
    areal = fetch_areal()
    indkomst = fetch_indkomst()
    formue_gns, formue_median = fetch_formue()
    gini = fetch_gini()
    parcel, raekke, etage = fetch_boliger_type()
    boligareal = fetch_boligareal()
    opv_ialt, opv_olie, opv_naturgas = fetch_opvarmning()
    byggeri = fetch_byggeri()
    biler, biler_el, biler_plugin, biler_diesel = fetch_biler()
    affald_kg, genanvendelse_pct = fetch_affald()

    alle_navne = set(folketal) | set(indkomst) | set(areal)
    resultat = {}
    for navn in alle_navne:
        resultat[navn] = {
            "folketal": folketal.get(navn), "folketal_forrige": folketal_forrige.get(navn),
            "areal": areal.get(navn), "disp_indkomst": indkomst.get(navn),
            "formue_gns": formue_gns.get(navn), "formue_median": formue_median.get(navn),
            "gini": gini.get(navn),
            "boliger_parcel": parcel.get(navn), "boliger_raekke": raekke.get(navn),
            "boliger_etage": etage.get(navn), "boligareal": boligareal.get(navn),
            "byggeri": byggeri.get(navn),
            "biler": biler.get(navn), "biler_el": biler_el.get(navn),
            "biler_plugin": biler_plugin.get(navn), "biler_diesel": biler_diesel.get(navn),
            "opv_boliger_ialt": opv_ialt.get(navn), "opv_olie": opv_olie.get(navn),
            "opv_naturgas": opv_naturgas.get(navn),
            "affald_kg": affald_kg.get(navn), "genanvendelse_pct": genanvendelse_pct.get(navn),
        }
    return resultat
```

- [ ] **Step 4: Kør testen og bekræft den består**

Run: `python3 -m unittest pipeline.test.test_fetch_dst -v`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add pipeline/fetch_dst.py pipeline/test/test_fetch_dst.py
git commit -m "feat: fetch_dst Del D - biler, affald + fetch_all_dst() samler alle 11 tabeller"
```

---

### Task 8: `fetch_boligpriser.py` — Finans Danmark BM010

**Files:**
- Create: `pipeline/fetch_boligpriser.py`
- Test: `pipeline/test/test_fetch_boligpriser.py`

BM010 kører på samme PX-Web-API som DST, blot under `/v1/s20/`. Samme kommunekoder som DST (verificeret: `OMR20=787` giver Thisted, ikke en separat kodeliste).

- [ ] **Step 1: Skriv den fejlende test**

Create `pipeline/test/test_fetch_boligpriser.py`:

```python
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import unittest
from unittest.mock import patch
import fetch_boligpriser

BM010_CSV = (
    "﻿OMR20;EJKAT20;PRIS20;TID;INDHOLD\n"
    "Hele landet;Parcel-/rækkehus;Realiseret handelspris;2025K4;18429\n"
    "Thisted;Parcel-/rækkehus;Realiseret handelspris;2025K4;7430\n"
    "Greve;Parcel-/rækkehus;Realiseret handelspris;2025K4;30347\n"
)


class TestFetchBoligpriser(unittest.TestCase):
    @patch("fetch_boligpriser.dst_client.fetch")
    def test_boligpris_bruger_s20_base_url(self, mock_fetch):
        mock_fetch.return_value = fetch_boligpriser.dst_client.parse_csv(BM010_CSV)
        result = fetch_boligpriser.fetch_boligpris()
        self.assertEqual(result["Thisted"], 7430)
        self.assertEqual(result["Greve"], 30347)
        # Bekræft at kaldet gik til Finans Danmarks base_url, ikke DST's
        args, kwargs = mock_fetch.call_args
        self.assertEqual(args[0], fetch_boligpriser.dst_client.FINANS_DANMARK_BASE_URL)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Kør testen og bekræft den fejler**

Run: `python3 -m unittest pipeline.test.test_fetch_boligpriser -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'fetch_boligpriser'`.

- [ ] **Step 3: Skriv minimal implementation**

Create `pipeline/fetch_boligpriser.py`:

```python
"""Finans Danmarks BM010 (boligmarkedsstatistik). Kører på samme PX-Web-infrastruktur
som DST, under /v1/s20/ i stedet for /v1/. Kommunekoderne (OMR20) er de samme
3-cifrede DST-koder som i alle andre tabeller - verificeret, ikke en separat kodeliste."""

import dst_client
from constants import PERIODER


def fetch_boligpris():
    """Returnerer {navn: kr. pr. m² (int)} for parcel-/rækkehus, realiserede handler."""
    rows = dst_client.fetch(dst_client.FINANS_DANMARK_BASE_URL, "BM010", {
        "OMR20": "*", "EJKAT20": "1", "PRIS20": "REAL",
        "Tid": PERIODER["BOLIGPRIS_KVARTAL"],
    })
    return dst_client.sum_by(rows, ["OMR20"])
```

- [ ] **Step 4: Kør testen og bekræft den består**

Run: `python3 -m unittest pipeline.test.test_fetch_boligpriser -v`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add pipeline/fetch_boligpriser.py pipeline/test/test_fetch_boligpriser.py
git commit -m "feat: fetch_boligpriser - Finans Danmark BM010 via delt PX-Web-infrastruktur"
```

---

### Task 9: `build.py` — orkestrering, samling i motorens kontrakt, output

**Files:**
- Create: `pipeline/build.py`

Samler DST-, boligpris- og de manuelle kilder til poster, der matcher motorens datakontrakt eksakt. Skriver `web/data/data.json` og `web/data/sources.json`. Udskriver en valideringsrapport (manglende felter pr. kommune, sanity-check af Thisted mod kendte v5-værdier), jf. spec §5.5.

- [ ] **Step 1: Skriv build.py**

Ingen test i dette step — `build.py` er et orkestrerings-script, der rammer levende API'er; det testes i Task 10 via en golden-samling-test på den rene sammensætningslogik (`saml_kommune_post()`), ikke via netværkskald.

Create `pipeline/build.py`:

```python
"""Orkestrerer hele datapipelinen. Kør: python3 pipeline/build.py
Skriver web/data/data.json og web/data/sources.json. Udskriver en
valideringsrapport til stdout (jf. spec §5.5)."""

import json
import os
import sys

import fetch_dst
import fetch_boligpriser
from constants import KONSTANTER, BILKM_AFVIGELSE_REGION, EL_CO2_MANUAL
from kommuner import KOMMUNER, by_navn

DATA_JSON_PATH = os.path.join(os.path.dirname(__file__), "..", "web", "data", "data.json")
SOURCES_JSON_PATH = os.path.join(os.path.dirname(__file__), "..", "web", "data", "sources.json")

FORVENTEDE_FELTER = [
    "disp_indkomst", "folketal", "folketal_forrige", "areal", "formue_gns", "formue_median",
    "gini", "boliger_parcel", "boliger_raekke", "boliger_etage", "boligareal", "byggeri",
    "biler", "biler_el", "biler_plugin", "biler_diesel", "opv_boliger_ialt", "opv_olie",
    "opv_naturgas", "affald_kg", "genanvendelse_pct", "elco2_g_kwh", "boligpris_m2",
]


def saml_kommune_post(navn, dst_data, boligpriser, kode=None, region=None):
    """Samler ét kommune- (eller land-) objekt i motorens datakontrakt.
    Ren funktion - ingen I/O - så den kan testes uden netværk (Task 10)."""
    post = dict(dst_data.get(navn, {}))
    post["navn"] = navn
    if kode is not None:
        post["kode"] = kode
    if region is not None:
        post["region"] = region
    post["boligpris_m2"] = boligpriser.get(navn)
    post["elco2_g_kwh"] = EL_CO2_MANUAL.get(navn)
    for felt in FORVENTEDE_FELTER:
        post.setdefault(felt, None)
    return post


def find_manglende(post):
    return [felt for felt in FORVENTEDE_FELTER if post.get(felt) is None]


def main():
    print("Henter DST-tabeller (11 tabeller, alle 98 kommuner + land)...")
    dst_data = fetch_dst.fetch_all_dst()
    print(f"  {len(dst_data)} områder hentet.")

    print("Henter Finans Danmark BM010 (boligpriser)...")
    boligpriser = fetch_boligpriser.fetch_boligpris()
    print(f"  {len(boligpriser)} områder hentet.")

    land_post = saml_kommune_post("Hele landet", dst_data, boligpriser)
    kommune_poster = []
    for kode, navn, region in KOMMUNER:
        kommune_poster.append(saml_kommune_post(navn, dst_data, boligpriser, kode=kode, region=region))

    output = {"land": land_post, "kommuner": kommune_poster}
    konstanter_output = dict(KONSTANTER)
    konstanter_output["bilkm_afvigelse_region"] = dict(BILKM_AFVIGELSE_REGION)
    output["konstanter"] = konstanter_output

    os.makedirs(os.path.dirname(DATA_JSON_PATH), exist_ok=True)
    with open(DATA_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print(f"Skrev {DATA_JSON_PATH}")

    # --- Valideringsrapport ---
    print("\n--- Valideringsrapport ---")
    manglende_kerne = 0
    manglende_felter_total = {}
    for post in [land_post] + kommune_poster:
        manglende = find_manglende(post)
        for felt in manglende:
            manglende_felter_total[felt] = manglende_felter_total.get(felt, 0) + 1
        if any(f in ("disp_indkomst", "biler", "byggeri") for f in manglende):
            manglende_kerne += 1
    print(f"Kommuner med manglende kerne-input (utilstrækkeligt datagrundlag): {manglende_kerne}")
    for felt, antal in sorted(manglende_felter_total.items(), key=lambda x: -x[1]):
        print(f"  {felt}: mangler for {antal} områder")

    thisted = next(p for p in kommune_poster if p["navn"] == "Thisted")
    print("\nSanity-check Thisted mod v5-regneark (facit i parentes):")
    print(f"  disp_indkomst = {thisted['disp_indkomst']} (252934)")
    print(f"  folketal = {thisted['folketal']} (42572)")
    print(f"  biler_diesel = {thisted['biler_diesel']} (7114)")
    print(f"  boligpris_m2 = {thisted['boligpris_m2']} (7430)")

    if manglende_kerne > 0:
        print(f"\nADVARSEL: {manglende_kerne} områder mangler kerne-input og vil vise "
              "'utilstrækkeligt datagrundlag' i widget'en.")
        sys.exit(1)


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Kør build.py mod de levende API'er**

Run: `cd "pipeline" && python3 build.py` (fra projektroden, eller juster path)
Expected: Udskriver fremskridt for hver kilde, skriver `web/data/data.json`, og sanity-check-linjerne for Thisted skal matche facit-tallene i parentes eksakt.

- [ ] **Step 3: Verificér output manuelt**

Run: `python3 -c "import json; d = json.load(open('web/data/data.json')); print(len(d['kommuner']), 'kommuner'); t = [k for k in d['kommuner'] if k['navn']=='Thisted'][0]; print(t)"`
Expected: `98 kommuner`, og Thisted-objektet viser `disp_indkomst: 252934`, `boligpris_m2: 7430` osv.

- [ ] **Step 4: Commit**

```bash
git add pipeline/build.py web/data/data.json
git commit -m "feat: build.py - orkestrering, samling i motorens kontrakt, valideringsrapport"
```

---

### Task 10: Golden-samlingstest — bekræft kompatibilitet med Plan 1's motor

**Files:**
- Create: `pipeline/test/test_build_golden.py`

Denne test bruger `saml_kommune_post()` (den rene, netværksfrie del af `build.py`) med de samme rå fixture-værdier som Plan 1's `test/fixtures.js`, og bekræfter at outputtet matcher **eksakt**. Det beviser, at pipeline-outputtet er kompatibelt med den allerede testede og godkendte motor.

- [ ] **Step 1: Skriv testen**

Create `pipeline/test/test_build_golden.py`:

```python
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import unittest
import build

# Samme rå værdier som Plan 1's test/fixtures.js (land + Thisted).
DST_DATA = {
    "Hele landet": {
        "disp_indkomst": 287682, "folketal": 6025603, "folketal_forrige": 5992734,
        "areal": 42955.6, "formue_gns": 2177950, "formue_median": 800815, "gini": 30.43,
        "boliger_parcel": 1177875, "boliger_raekke": 440156, "boliger_etage": 1148673,
        "boligareal": 111, "byggeri": 25966,
        "biler": 2918153, "biler_el": 556394, "biler_plugin": 127933, "biler_diesel": 575355,
        "opv_boliger_ialt": 2872738, "opv_olie": 92448, "opv_naturgas": 334724,
        "affald_kg": 543, "genanvendelse_pct": 58,
    },
    "Thisted": {
        "disp_indkomst": 252934, "folketal": 42572, "folketal_forrige": 42698,
        "areal": 1072.2, "formue_gns": 1838139, "formue_median": 813928, "gini": 26.42,
        "boliger_parcel": 14246, "boliger_raekke": 2677, "boliger_etage": 3295,
        "boligareal": 133, "byggeri": 103,
        "biler": 23656, "biler_el": 3404, "biler_plugin": 946, "biler_diesel": 7114,
        "opv_boliger_ialt": 20515, "opv_olie": 1582, "opv_naturgas": 958,
        "affald_kg": 508, "genanvendelse_pct": 45,
    },
}
BOLIGPRISER = {"Hele landet": 18439, "Thisted": 7430}


class TestBuildGolden(unittest.TestCase):
    def test_thisted_matcher_plan1_fixture_eksakt(self):
        post = build.saml_kommune_post("Thisted", DST_DATA, BOLIGPRISER, kode=787, region="Nordjylland")
        self.assertEqual(post["navn"], "Thisted")
        self.assertEqual(post["kode"], 787)
        self.assertEqual(post["region"], "Nordjylland")
        self.assertEqual(post["disp_indkomst"], 252934)
        self.assertEqual(post["biler_diesel"], 7114)
        self.assertEqual(post["boligpris_m2"], 7430)
        self.assertEqual(post["elco2_g_kwh"], 26.7)  # fra EL_CO2_MANUAL

    def test_land_har_ikke_kode_eller_region(self):
        post = build.saml_kommune_post("Hele landet", DST_DATA, BOLIGPRISER)
        self.assertNotIn("kode", post)
        self.assertNotIn("region", post)
        self.assertEqual(post["disp_indkomst"], 287682)
        self.assertEqual(post["elco2_g_kwh"], 51.8)

    def test_alle_forventede_felter_er_til_stede(self):
        post = build.saml_kommune_post("Thisted", DST_DATA, BOLIGPRISER, kode=787, region="Nordjylland")
        for felt in build.FORVENTEDE_FELTER:
            self.assertIn(felt, post)

    def test_manglende_kommune_faar_none_ikke_krak(self):
        post = build.saml_kommune_post("Ukendt Ø", DST_DATA, BOLIGPRISER, kode=999, region="Nordjylland")
        self.assertIsNone(post["disp_indkomst"])
        self.assertEqual(build.find_manglende(post), build.FORVENTEDE_FELTER)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Kør testen og bekræft den består**

Run: `python3 -m unittest pipeline.test.test_build_golden -v`
Expected: PASS (4 tests). (Denne test kræver ingen forudgående fejlende kørsel — `saml_kommune_post()` og `find_manglende()` findes allerede fra Task 9; dette er en ren verifikationstest af eksisterende kode.)

- [ ] **Step 3: Kør HELE Python-testsuiten samlet**

Run: `python3 -m unittest discover -s pipeline/test -p "test_*.py" -v` (fra projektroden)
Expected: PASS — alle tests fra Task 1-10 grønne (kommuner, dst_client, constants, fetch_dst, fetch_boligpriser, build_golden).

- [ ] **Step 4: Commit**

```bash
git add pipeline/test/test_build_golden.py
git commit -m "test: golden-samlingstest - pipeline-output matcher Plan 1's fixture eksakt"
```

---

## Self-Review (udført ved planskrivning)

**Spec-dækning (Plan 2's del af spec'en, jf. den afklarede scope ovenfor):**
- §5.1 kildeoversigt → Tasks 4-8 (11 DST-tabeller + Finans Danmark, alle verificeret mod levende API) ✓
- §5.2 konstanter/antagelser → Task 3 ✓
- §5.3 kommunekode-mapping → Task 1 ✓
- §5.4 manglende-data-politik → `build.py`'s `find_manglende()` + valideringsrapport (Task 9) ✓
- §5.5 årlig opdatering → `PERIODER`-blokken i `constants.py` er det ene sted at redigere; `build.py` udskriver valideringsrapport ✓

Uden for scope (dokumenteret i "Vigtig scope-afklaring"): PEND101, ERHV2, FOLK1C, BOL201, EDS CapacityPerMunicipality (verificeret tilgængelige, men fødes ikke ind i Plan 1's låste kontrakt). DTU-regionsdata og Energinet el-CO2 er bevidst manuelle kilder, ikke automatiseret i denne plan — begge har en fungerende degraderingssti i den allerede-testede motor.

**Placeholder-scan:** Ingen TBD/TODO. Al kode er fuld og kørbar, hver forespørgsel er verificeret mod den levende API med et eksakt eller (for `boligareal`, dokumenteret) tilnærmet facit-match.

**Type-konsistens:** Feltnavne i `fetch_all_dst()`'s output matcher `FORVENTEDE_FELTER` i `build.py`, som matcher Plan 1's `test/fixtures.js` og `beregning.js`'s `FORVENTEDE_FELTER` 1:1. `saml_kommune_post()`'s signatur (`navn, dst_data, boligpriser, kode, region`) er ens i definition (Task 9) og test (Task 10).

---

## Efter Plan 2

`web/data/data.json` indeholder nu alle 98 kommuner + land i motorens kontrakt, klar til Plan 3 (widget: explorer + rapport-generator). To felter (`elco2_g_kwh` for 96 kommuner, `bilkm_afvigelse_region` for 4 regioner) er bevidst `null`/manglende — Plan 3's widget skal vise dette som `–`/kontekst-forbehold, ikke som en fejl, jf. Plan 1's allerede-testede degraderingslogik.
