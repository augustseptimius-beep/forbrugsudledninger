# Platform for 98 kommuners forbrugsbaserede udledninger — designspecifikation

**Dato:** 2026-07-06
**Status:** Godkendt design, klar til implementeringsplan
**Baggrund:** Generaliserer metoden bag *Analyse v6* og *Beregninger v5* (Thisted Kommune) til alle 98 danske kommuner.

---

## 1. Formål

Give enhver af Danmarks 98 kommuner et objektivt, data-drevet vidensgrundlag for deres forbrugsbaserede udledninger — samme type grundlag, som Thisted, Greve, Frederiksberg og Allerød selv har bygget, men genereret automatisk fra offentlige kilder. Platformen skal kunne indlejres som en selvstændig funktion på en anden hjemmeside, og datagrundlaget skal kunne opdateres én gang om året.

Platformen leverer to ting:
1. En **interaktiv explorer**: vælg kommune → estimeret forbrugsaftryk pr. borger (interval) + de 16 drivere sammenlignet med landsgennemsnittet.
2. En **rapport-generator**: brugeren vælger 2–4 af de fire kanoniske forbrugskategorier → et struktureret, deterministisk udkast til et vidensgrundlag for de valgte kategorier.

## 2. Brugere og brugsscenarie

Primær bruger: en kommunal klima-/planmedarbejder, der skal udarbejde vidensgrundlag og en anbefalet prioritering af forbrugskategorier til kommunens klimahandlingsplan (Kriterie 11, CCTF-recertificering). Værktøjets værdi er størst for de ~94 kommuner, der endnu ikke har lavet analysen.

Kernearbejdsdeling: **platformen laver det tunge, ensartede dataarbejde; mennesket beholder dømmekraften.** Platformen rangordner ikke kategorier og træffer ikke beslutningen — den samler evidensen.

## 3. Omfang

**I scope (v1):**
- Beregningsmotor, der reproducerer v5-logikken for alle 98 kommuner (fortegnskorrekt, se §7).
- Årlig datapipeline fra offentlige API'er → statisk `data.json`.
- Interaktiv explorer-widget (kommunevalg → tal + drivere).
- Deterministisk rapport-generator for valgte kategorier (print-venlig HTML).
- Golden tests mod Thisted (fidelitet) og Greve (fortegn).

**Uden for scope (v1):**
- Auto-prioritering/rangordning af kategorier (bevidst fravalgt — er et menneskeligt skøn i metoden).
- AI-genereret prosa ved kørsel (kræver backend; giver falsk-præcisionsrisiko).
- Kommune-specifikt indkøbsaftryk (findes ikke åbent for alle 98).
- Live-backend, brugerkonti, gemte scenarier.
- SMART-mål, indikatorer, aktøransvar (hører til *efter* den politiske beslutning).
- Word/PDF-eksport (kan komme senere; v1 er print-venlig HTML).

## 4. Arkitektur — tre adskilte lag, server-løs

```
[ Datapipeline (Python) ]  →  [ data.json + sources.json ]  →  [ Widget (JavaScript) ]
   henter fra API'er 1×/år      statiske filer, alle 98 kommuner    explorer + rapport
```

Ingen server, ingen database ved kørsel. Widgeten er framework-uafhængig og indlejres via `<script>`-tag eller `<iframe>`. Beregningslogikken lever i en ren JS-modul (`beregning.js`), som både widgeten og testene bruger.

## 5. Datalag

### 5.1 Kildeoversigt

| # | Variabel | Kilde / tabel | Hentemetode | Niveau |
|---|----------|---------------|-------------|--------|
| 1 | Folketal (2 år) | DST FOLK1A | API | kommune |
| 2 | Areal | DST ARE207 | API | kommune |
| 3 | Disponibel + brutto indkomst | DST INDKP101 | API | kommune |
| 4 | Nettoformue (gns./median) | DST FORMUE12 | API | kommune |
| 5 | Gini | DST IFOR41 | API | kommune |
| 6 | Boliger efter type | DST BOL101 | API | kommune |
| 7 | Boligstørrelse | DST BOL103 | API | kommune |
| 8 | Fuldført byggeri (2 år) | DST BYGV33 | API | kommune |
| 9 | Personbiler efter drivmiddel | DST BIL54 | API | kommune |
| 10 | Pendling | DST PEND101 | API | kommune |
| 11 | Erhvervsstruktur | DST ERHV2 | API | kommune |
| 12 | Herkomst | DST FOLK1C | API | kommune |
| 13 | Opvarmningsform | DST BOL102 | API | kommune |
| 14 | Alder i ejer-parcelhuse | DST BOL201 | API | kommune |
| 15 | Husholdningsaffald + genanvendelse | DST LABY25 | API | kommune |
| 16 | Fossil varmeafhængighed | DST BOL202 | API | kommune |
| 17 | VE-kapacitet pr. indbygger | Energi Data Service, CapacityPerMunicipality | API | kommune |
| 18 | El-CO2 pr. kWh | Energinet Miljødeklaration | datafil/API | kommune |
| 19 | Boligpriser kr/m² | Finans Danmark BM010 (rkr.statistikbank.dk) | API (PX-Web) | kommune |
| 20 | Bil-km-afvigelse | DTU Transportvaneundersøgelsen | **manuel/config** | **region (proxy)** |
| 21 | Nationalt anker (~10 ton) | Energistyrelsen Global Afrapportering | **manuel/config** | national |
| 22 | Elasticitet, kategorivægte m.m. | CONCITO, Klimarådet/DTU | **manuel/config** | national |

DST-API'et er verificeret: `GET https://api.statbank.dk/v1/data/{TABEL}/CSV?OMRÅDE=*&...&Tid=...` returnerer alle 98 kommuner + regioner + land i ét kald. Valideret mod regnearket (FOLK1A 2026K1: land 6.025.603, Thisted 42.572 — eksakt match).

### 5.2 Konstanter og antagelser (config)

Disse er de "gule celler" fra regnearket — samlet i én `constants.py`, tydeligt markeret som antagelser, med kildehenvisning og årstal:

- `nationalt_anker = 10.0` ton CO2e (Energistyrelsen GA 2025, opgørelsesår 2023)
- `elasticitet = {low: 0.30, high: 0.50}` (CONCITO: 3–5 % pr. 10 % indkomst)
- `bilkorsel_andel = {low: 0.12, high: 0.15}` (transport ~24 % af aftryk, personbil ~halvdelen)
- `byggeandel = {low: 0.0, high: 0.0456045}` (kalibreret så Thisted reproducerer v5's 0–0,2 ton, se §7.4)
- `boligudgift_modregning = 0.45` (andel af indkomstgab modsvaret af lavere boligudgift; < 1 fordi disp. indkomst allerede modregner renter)
- `bilkm_afvigelse_region = {Nordjylland: 0.17842, Midtjylland: ?, Syddanmark: ?, Sjælland: ?, Hovedstaden: ?}` — kun Nordjylland kendt fra v5; de øvrige fire skal udtrækkes fra transportvaner.dk som del af pipelinen.
- `kategorivaegt_national = {mobilitet: 3.1, fodevarer: 2.5, bolig: 2.5, forbrug: ~4.5}` ton (CONCITO-profil; til rapportens omstillingsbehov-kontekst, ikke til hovedtallet)

### 5.3 Kommunekode-mapping

DST bruger officielle kommunekoder (fx 787 = Thisted, 253 = Greve). `kommuner.py` holder mapping mellem kode, navn og region. Regionen bruges til at slå den regionale bil-km-proxy op. Alle 98 koder + de 5 regioner defineres eksplicit (ingen afhængighed af rækkefølge i API-svar).

### 5.4 Manglende-data-politik (Fable-rettelse c)

Manglende data er en **garanti**, ikke en kant — særligt småkommuner (Læsø, Fanø, Samsø, Ærø) og Finans Danmarks kvartalspriser med få handler. Politik pr. driver, fastlagt her og ikke improviseret i pipeline-koden:

| Situation | Håndtering |
|-----------|-----------|
| Driver-værdi mangler | Vis `–` i driver-tabellen; udelad driveren af enhver afledt beregning og af rapporten. |
| **Kerneinput** mangler (indkomst, biler eller byggeri) | Hovedestimatet kan ikke beregnes → vis "utilstrækkeligt datagrundlag" i stedet for et forkert tal. |
| Volatil værdi (fx boligpris, få handler) | Vis med eksplicit volatilitetsforbehold. Boligpris er kun kontekst (indgår ikke i hovedtallet, kun i følsomheden), så en manglende/volatil værdi undertrykker blot følsomhedsnoten. |

Pipelinen skal for hver kommune registrere hvilke drivere der mangler, og lægge det i `data.json` (fx `"missing": ["affald", "boligpris"]`), så widgeten kan degradere pænt.

### 5.5 Årlig opdatering

1. Kør `python pipeline/build.py` → genhenter alle API-kilder, regenererer `data.json` + `sources.json`.
2. Opdatér de få config-værdier i `constants.py`, hvis de har ændret sig (nationalt anker, DTU-regionstal, antagelser). Tydeligt dokumenteret hvilke.
3. Redeploy de statiske filer.

`build.py` udskriver en valideringsrapport: bekræfter at Thisted stadig rammer golden-test-tallene, tæller kommuner med manglende drivere, og flager store spring fra sidste år.

## 6. Beregningsmotor — oversigt

Motoren (`beregning.js`, rene funktioner) beregner pr. kommune ud fra `data.json`. Alle formler er **fortegnskorrekte og symmetriske** — de virker for kommuner både over og under landsgennemsnittet (Fable-rettelse a). v5's formler var retnings-hardcodede til Thisted (under gennemsnittet) via `-ABS(...)`; ca. halvdelen af de 98 kommuner ligger over, så det er halvdelen af outputtet, der ellers ville få forkert fortegn.

Grundmodel:
```
aftryk_pr_borger = anker + indkomsteffekt + transporteffekt + byggeeffekt
```

## 7. Beregningsmotor — formler

Notation: `dev(x) = (kommune_x − land_x) / land_x` (fortegn bevaret).

### 7.1 Indkomsteffekt (fortegnskorrekt)

```
indkomstafvigelse = dev(disponibel_indkomst)
indkomsteffekt_low  = anker × indkomstafvigelse × elasticitet.low
indkomsteffekt_high = anker × indkomstafvigelse × elasticitet.high
```

Fortegn følger afvigelsen: negativ for fattigere kommuner (reduktion), positiv for rigere (tillæg). Erstatter v5's `=-anker*ABS(afvigelse)*elasticitet`. Giver identisk resultat for Thisted, korrekt fortegn for alle andre.

- Thisted: afvigelse −12,079 % → −0,3624 .. −0,6039 ton ✓ (matcher v5)
- Greve: afvigelse +6,558 % → **+0,1967 .. +0,3279 ton** (positiv — kritisk fortegnstjek)

### 7.2 Transporteffekt (regional proxy)

```
transporteffekt_low  = anker × bilkorsel_andel.low  × bilkm_afvigelse_region[kommunens region]
transporteffekt_high = anker × bilkorsel_andel.high × bilkm_afvigelse_region[kommunens region]
```

Alle kommuner i en region arver regionens bil-km-afvigelse (Fable-rettelse d: proxy-forbeholdet skal stå **ved tallet** i widgeten, ikke kun i metodeafsnittet — det bliver mere synligt skævt i skala, når fx alle 34 hovedstadskommuner får samme værdi).

- Thisted (Nordjylland, +17,84 %): +0,2141 .. +0,2676 ton ✓ (matcher v5)

### 7.3 Byggeeffekt (data-drevet, fortegnskorrekt) (Fable-rettelse a + tidligere punkt 8.2)

```
byggeafvigelse = dev(fuldfort_byggeri_pr_1000_indb)     // seneste år
byggeeffekt_low  = anker × byggeandel.low  × byggeafvigelse   // low = 0
byggeeffekt_high = anker × byggeandel.high × byggeafvigelse
```

Erstatter v5's faste 0–0,2 ton (som var hardcoded som en *reduktion*). `byggeandel.high` er kalibreret til 0,0456045, så Thisteds interval bliver præcis [−0,2; 0] ton — dvs. eksakt reproduktion af v5. For byggetunge kommuner vender fortegnet korrekt til et tillæg.

- Thisted (byggeafvigelse −43,86 %): −0,2000 .. 0 ton ✓ (matcher v5)
- Greve (byggeafvigelse +112,25 %): **0 .. +0,5119 ton** (tillæg — korrekt, Greve bygger meget)

### 7.4 Samlet aftryk (interval)

```
aftryk_low  = anker + min(indkomsteffekt) + min(transporteffekt) + min(byggeeffekt)
aftryk_high = anker + max(indkomsteffekt) + max(transporteffekt) + max(byggeeffekt)
```

(min/max over hvert komponentinterval, så "mest under ankeret" og "mest over" samles korrekt uanset fortegn.)

- **Thisted: 9,4102 .. 9,9053 ton** ✓ (eksakt v5-reproduktion; rapporteres som "ca. 9–10 ton")

### 7.5 Boligpris-følsomhed (symmetri-forbehold) (Fable-rettelse a)

En sekundær, illustrativ følsomhed (ikke i hovedtallet), der viser hvordan lavere boligudgifter mindsker det reelle indkomstgab:

```
reelt_gab = indkomstafvigelse × (1 − boligudgift_modregning)
justeret_indkomsteffekt = anker × reelt_gab × elasticitet
```

**Vigtigt symmetri-forbehold:** 0,45-modregningen er ræsonneret specifikt til Thisteds mønster (billig bolig + lav indkomst). For kommuner med *dyre* boliger og *høj* indkomst vender logikken. Reglen: følsomhedsnoten vises **kun**, når fortegnet på boligprisafvigelsen og indkomstafvigelsen matcher det mønster, modregningen er gyldig for (begge negative → billigere bolig opvejer lavere indkomst). Ellers udelades noten. Aldrig vist som falsk symmetrisk korrektion.

### 7.6 Driver-tabellen (16 drivere)

Alle 16 forhold beregnes vs. landsgennemsnit (formler 1:1 fra Drivere-fanen), hver med retning udledt af afvigelsens fortegn: disponibel indkomst, nettoformue (gns./median), Gini, befolkningsudvikling, befolkningstæthed, boligareal, parcelhus-andel, byggeaktivitet, biler/indb., el-/plugin-andel, diesel-andel, udpendling, fossil opvarmning, husholdningsaffald, el-CO2/kWh, boligpris/m². Ren visning + kontekst; kun indkomst, transport og byggeri fødes ind i hovedtallet.

## 8. Golden tests

### 8.1 Test 1 — Thisted (fidelitet)

Motoren skal reproducere v5 eksakt (tolerance 0,001 ton):
- indkomstafvigelse = −0,120786
- indkomsteffekt = −0,3624 .. −0,6039 ton
- transporteffekt = +0,2141 .. +0,2676 ton
- byggeeffekt = −0,2000 .. 0 ton
- **samlet aftryk = 9,4102 .. 9,9053 ton**
- udvalgte drivere (fx parcelhus-andel 0,7046, diesel-andel 0,3007, biler/indb. 0,5557)

### 8.2 Test 2 — Greve (fortegn) (Fable-rettelse b)

Greve har modsat profil på de kritiske drivere (indkomst +6,6 %, byggeri +112 %, diesel *under* land) og fanger fortegnsfejl, som Thisted-testen aldrig kan se. Krav:
- indkomstafvigelse = +0,06558 (positiv)
- **indkomsteffekt > 0** (+0,1967 .. +0,3279 ton) — en naiv `-ABS()`-port ville give negativ; det er dette, testen fanger
- byggeafvigelse = +1,1225 (positiv)
- **byggeeffekt ≥ 0** (0 .. +0,5119 ton)
- samlet aftryk klart **over** ankeret (Greve er rigere og bygger mere)

Greve-rådata ligger allerede i regnearkets Rådata-fane og bruges som facitkilde.

## 9. Rapport-generator

### 9.1 De fire kanoniske kategorier

Mobilitet · Fødevarer · Bolig og byggeri · Forbrugsprodukter og services. Kriterie 11 kræver mindst 2. Brugeren vælger 2–4 (checkbokse). **Ingen rangordning** — kategorierne vises i brugerens egen rækkefølge.

### 9.2 Rapportstruktur (afgrænset til kommune + valgte kategorier)

1. **Nøgletal** — estimeret aftryk pr. borger (interval) + de 1–2 definerende træk *(auto fra data)*
2. **Kommunens forbrugsprofil** — driver-tabellen vs. land, med retning pr. driver *(auto)*
3. **Pr. valgt kategori:**
   - Omstillingsbehov (national kategorivægt + kommunens afvigelse på kategoriens drivere) *(data + skabelon)*
   - Kommunal indflydelse (de fire roller: virksomhed/myndighed/selskabsejer/facilitator) *(skabelonkatalog)*
   - Mulige indsatser i de fire roller *(skabelonkatalog, redigerbart)*
   - Forbehold/datakvalitet *(auto — fx "transport hviler på regional proxy")*
4. **Rimelighed og retfærdighed** — indkomst, bilafhængighed *(data-informeret)*
5. **Metode, kilder og forbehold** — kildeliste med tabel-id og årstal *(auto)*

Bevidst **ude:** SMART-mål, indikatorer, aktøransvar, færdig prioritering.

### 9.3 Beregnede lokale fakta (mindre generisk end frygtet)

Flere "lokale fakta" fra v6-teksten kan faktisk beregnes for alle 98 og skal injiceres i skabelonerne, så udkastene ikke bliver rene skabeloner:
- Antal boliger med olie-/gasfyr = BOL102 (olie + naturgas). Thisted: 1582 + 958 = 2540 ≈ v6's "cirka 2.500" ✓
- Biler/indb., diesel-andel, el-andel; antal boliger, parcelhus-andel, gns. boligareal; genanvendelsesprocent, affald/indb.; befolkning, tæthed; byggeri pr. 1.000.

Hvor skabelonen kræver ægte lokal viden (stednavne, konkrete lokale indsatser), står en **tydelig pladsholder** `[udfyldes lokalt: …]`, ikke gættet tekst.

### 9.4 Indbyggede forbehold

Alle metodens forbehold bæres automatisk med i udkastet: regional transport-proxy, boligpris-volatilitet, "niveauforskel ikke eksakte tal", "estimatet er retningsgivende, ikke en måling", dobbeltregningsadvarsel for indkøb. Tonen matcher v6: forsigtig, transparent, hedged.

### 9.5 Forventningsafstemning

98 auto-genererede udkast **vil** ligne hinanden i prosa; differentieringen ligger i tallene og i hvilke drivere der stikker ud. Det er acceptabelt for en kladde, og det siges eksplicit i outputtet ("dette er et databaseret udkast til videre lokal bearbejdning").

### 9.6 Output-format

Ren, print-venlig HTML, der kan læses, kopieres og printes fra browseren. Word/PDF-eksport er en mulig senere tilføjelse.

## 10. Widget (UI, v1)

Fokus: funktionaliteten virker. Framework-uafhængig JS.
- **Explorer:** kommunevælger (dropdown/søg) → aftryk pr. borger med interval, driver-tabellen vs. land, kildehenvisninger.
- **Inline forbehold (Fable-rettelse d):** proxy- og volatilitetsforbehold vises ved selve tallet (fx en markør/fodnote ved transport og boligpris), ikke kun i et metodeafsnit.
- **Rapport:** kategori-checkbokse → generér udkast → vis print-venlig HTML.
- **Degradering:** kommuner med manglende kerneinput viser "utilstrækkeligt datagrundlag"; manglende enkeltdrivere vises som `–`.

## 11. Projektstruktur

```
pipeline/
  fetch_dst.py        # de 16 DST-tabeller, alle 98 kommuner
  fetch_energi.py     # Energinet el-CO2 + Energi Data Service VE-kapacitet
  fetch_boligpriser.py# Finans Danmark BM010
  constants.py        # anker, elasticitet, kategorivægte, DTU-regionstal, antagelser
  kommuner.py         # kommunekode ↔ navn ↔ region
  build.py            # orkestrerer → web/data/{data.json, sources.json} + valideringsrapport
web/
  index.html          # selvstændig demo-side (den fungerende widget)
  widget.js           # UI: explorer + rapport
  beregning.js        # ren beregnings-/rapportmotor (kernelogikken)
  data/
    data.json         # genereret datasæt, alle 98
    sources.json      # kildemetadata (til visning + proveniens)
test/
  beregning.test.js   # golden tests (Thisted fidelitet + Greve fortegn)
docs/superpowers/specs/
  2026-07-06-...-design.md
```

## 12. Kendte begrænsninger

- **Transport = regional proxy** for alle 98 (5 regionsværdier). Trofast mod v5, men mere synligt skævt i skala; markeres inline.
- **Kommunalt indkøbsaftryk** findes ikke åbent → "Forbrugsprodukter" bruger affald/genanvendelse (LABY25) som indikator, ikke indkøb.
- **Estimatet er et førsteordens-skøn**, ikke en måling. Sammensætningen bærer indsigten, ikke totaltallet.
- **Byggeeffekten er kalibreret til Thisted** som referencepunkt; koefficienten kan justeres, hvis en bedre national kilde til byggeriets aftryksandel fremkommer.
- **Antagelsescellerne** (elasticitet, bilkørselsandel, modregning, byggeandel) er skøn, ikke målte størrelser; de er samlet ét sted og kan justeres.

## 13. Åbne punkter til implementering

- Udtræk DTU bil-km-afvigelse for de øvrige fire regioner (kun Nordjylland kendt).
- Afklar Energinet el-CO2 og Finans Danmark BM010 præcis hentemetode (API vs. datafil).
- Fastlæg vægtningen i omstillingsbehov-skabelonen pr. kategori (hvilke drivere, hvor meget).
- Skabelonkatalog for de fire rollers indsatser pr. kategori (generaliseret fra v6).
