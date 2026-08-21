# Offentlig platform: forbrugsbaserede udledninger for alle 98 kommuner - designspecifikation

**Dato:** 2026-08-21
**Status:** Godkendt design, klar til implementeringsplan
**Bygger på:** `2026-07-06-forbrugsbaserede-udledninger-platform-design.md` (den oprindelige platformspec). Denne spec afløser ikke den; den konkretiserer Plan 3 (widgeten) og tilføjer alt vedrørende offentliggørelse.

---

## 1. Formål

Gøre platformen offentligt tilgængelig, så en klima- eller planmedarbejder i en hvilken som helst af Danmarks 98 kommuner selv kan slå sin kommunes forbrugsbaserede udledningsestimat op uden at kontakte nogen.

Motoren (Plan 1) og datapipelinen (Plan 2) er færdige og flettet til `main`. Det, der mangler, er brugerfladen og udgivelsen. Denne spec dækker begge.

## 2. Beslutninger truffet i brainstormen

| Spørgsmål | Valg | Begrundelse |
|---|---|---|
| Repo | Nyt, rent offentligt repo `forbrugsudledninger` | Det nuværende repo er en Thisted-arbejdsmappe med seks analyseversioner, fem regneark og interne procesnotater. Et nyt repo giver ren historik og signalerer "værktøj", ikke "Thisteds arbejdsmappe". |
| Afsender | Personlig konto `augustseptimius-beep` | Prototype. Kræver til gengæld en tydelig ansvarsfraskrivelse, se §10. |
| V1-omfang | Kun explorer. Rapport-generator udskudt til v2 | Explorer genbruger motoren 1:1 og kræver næsten intet nyt indhold. Tallene for de 97 øvrige kommuner bør trykprøves, før der skrives skabelonprosa oven på dem. |
| Stak | Statisk HTML med Tailwind-klasser, ingen React | Se §3. |

## 3. Valg af stak

**Statisk HTML, vanilla JS og Tailwind-klasser bygget til én CSS-fil med Tailwind CLI.**

Valget er styret af tre samtidige mål:

1. **Offentlig side uden drift.** Ingen server, ingen database, ingen udgift. GitHub Pages serverer filerne direkte.
2. **Skal kunne flettes ind i doughnut-platformen senere.** Doughnut er Next.js 16 + Tailwind 4. Når markup'et bruger de samme Tailwind-klassenavne, bliver en side til en React-komponent ved at kopiere HTML'en og skifte `class` til `className`.
3. **Skal kunne indlejres som widget i Klimastatus.dk senere.** Klimastatus er en kommerciel Next.js 15-platform på Hetzner. Uden React-runtime kan siden indlejres som `<iframe>` i en hvilken som helst vært uden at koble kodebaserne sammen. Se §8.

Fravalgt: Next.js (build-trin, `node_modules`, `basePath`-konfiguration for Pages, og widgeten kan ikke længere indlejres løst). Fravalgt: håndskrevet CSS uden Tailwind (mister klassenavns-broen til begge integrationsmål).

Tailwind CLI kører i udgivelsesarbejdsgangen, ikke på ejerens maskine. Den byggede CSS committes også, så repoet kan åbnes og bruges uden Node.

## 4. Filstruktur i det nye repo

```
forbrugsudledninger/
├── README.md                 engelsk, for eksterne læsere
├── CLAUDE.md                 teknisk onboarding, dansk (samme rolle som i doughnut)
├── LICENSE                   MIT
├── package.json              kun tailwindcss som devDependency + test-script
├── .github/workflows/
│   └── deploy.yml            bygger CSS og udgiver web/ til GitHub Pages
├── pipeline/                 uændret fra nuværende repo
│   ├── build.py, fetch_dst.py, fetch_boligpriser.py
│   ├── constants.py, dst_client.py, kommuner.py
│   └── test/                 38 Python-tests
├── web/
│   ├── index.html            forside + kommunevisning
│   ├── metode.html
│   ├── om.html
│   ├── beregning.js          motoren, uændret bortset fra §6
│   ├── widget.js             UI-laget (ny)
│   ├── styles/
│   │   ├── input.css         Tailwind-kilde
│   │   └── styles.css        bygget output, committes
│   └── data/
│       ├── data.json         98 kommuner + land + konstanter
│       └── sources.json      kildemetadata (ny, se §11.1)
└── test/                     23 JS-tests + ny render-test
```

Thisted-analyserne, regnearkene, procesnotaterne og de indlejrede rapport-PDF'er flytter **ikke** med. De bliver i den nuværende private mappe.

## 5. Visuelt sprog

Arvet fra doughnut-projektet, så de to platforme ligner søskende og senere kan flettes.

### 5.1 Design-tokens

| Element | Klasser |
|---|---|
| Sidebaggrund | `bg-gray-50 text-gray-900 antialiased` |
| Kort | `bg-white border border-gray-200 rounded-lg` |
| Container | `mx-auto max-w-6xl px-4 py-6` |
| Header | `border-b border-gray-200 bg-white`, logomærke + nav i `text-gray-500 hover:text-gray-900 transition-colors` |
| Footer | `border-t border-gray-200 bg-white`, `text-xs text-gray-500`, kildekredit |
| Interaktive kort | `hover:border-green-600 hover:shadow-md hover:bg-green-50 transition-all` |
| Fokus på input | `focus:ring-2 focus:ring-green-600 focus:border-transparent` |
| Vurderingsskala | `emerald-600` under land · `amber-500` på niveau · `red-500` over land |

Logomærket er vores eget, ikke doughnut-ringen: en simpel cirkel-i-cirkel i `emerald-600` er doughnuts identitet og skal ikke kopieres. Vi bruger et neutralt mærke.

### 5.2 To mønstre der arves af faglige grunde, ikke kosmetiske

**Retning bæres af formen, ikke kun farven.** Doughnuts `TrendMarker` bruger pil op, pil ned og vandret streg, fordi cirka 8 % af mænd er farveblinde. Driver-tabellen har 16 rækker med retningsangivelse, så samme regel gælder: formen bærer retningen, farven forstærker den.

**Egen tooltip frem for browserens `title`.** Doughnut skrev sin egen, fordi den native har 0,5-1 sekunds forsinkelse og opfører sig forskelligt fra browser til browser. Vores inline-forbehold hænger på præcis den mekanik og skal vises straks, både ved hover og ved tastaturfokus.

### 5.3 Husregler

Dansk i UI og dokumentation, engelsk README. Enkelt dash, ikke em-dash. Samme konventioner som doughnut.

## 6. Ændring i beregningsmotoren: "ikke opgjort" frem for nul

Dette er specens vigtigste indholdsmæssige ændring.

`estimat()` gør i dag følgende:

```js
const te = transporteffekt(kommune.region, konst) ?? { low: 0, high: 0 };
```

`bilkm_afvigelse_region` indeholder kun `Nordjylland`. For de fire øvrige regioner - altså for langt de fleste af de 98 kommuner - bliver transporteffekten stiltiende nul.

Internt er det en forsvarlig degradering. Offentligt er det misvisende: en læser i Greve ser "transport bidrager hverken op eller ned hos os", mens det sande udsagn er "det ved vi ikke".

**Ændring:**

- `estimat()` returnerer `komponenter.transporteffekt = null`, når regionen ikke har et DTU-tal.
- Returværdien får feltet `uoplyst: string[]`, der lister komponenter, som ikke kunne opgøres (`["transport"]`).
- Intervallet beregnes fortsat uden transportbidraget - aritmetisk det samme som før - men mærkes i brugerfladen som ufuldstændigt.
- Brugerfladen viser komponenten som **"ikke opgjort"** med synlig markør og tooltip, aldrig som `0,00 ton`.

Samme princip for drivere: `elco2_g_kwh` mangler for 96 kommuner og vises som `–`, ikke som nul. Det følger allerede den eksisterende `manglende`-liste fra `beregnKommune()`.

**Konsekvens for tests:** Thisted er nordjysk og har et ægte tal, så golden-testen for fidelitet er upåvirket. Greve-testen asserterer ikke på transportkomponenten. Der tilføjes en ny test, der fastholder, at en kommune i en region uden DTU-tal får `transporteffekt === null` og `uoplyst` indeholdende `"transport"`.

## 7. Sider og indhold

### 7.1 `index.html` - forside

Hero med titel og en kort forklaring af, hvad et forbrugsbaseret aftryk er, efterfulgt af kommunesøgning: søgefelt med inline SVG-lup og et kort-grid, der filtreres mens der skrives. Før der søges, vises seks kommuner alfabetisk som eksempler. Mønstret er doughnuts `KommuneSearch`.

### 7.2 Kommunevisning

Samme dokument, aktiveret af query-parameteren `?kommune=787`. Kommunekoden bruges, ikke navnet, fordi den er stabil og allerede er nøglen i `data.json`. En kommune kan dele et direkte link til sin egen visning.

Indhold i rækkefølge:

1. **Hovedtal.** Estimeret aftryk pr. borger som interval, fx "ca. 9,4 - 9,9 ton CO2e", holdt op mod det nationale anker på 10 ton. Hvis `uoplyst` ikke er tom, står der tydeligt, at intervallet er ufuldstændigt, og hvad der mangler.
2. **Nedbrydning.** Anker plus indkomsteffekt plus transporteffekt plus byggeeffekt, vist som en vandfaldsgraf i SVG. Dette er bevidst placeret over driver-tabellen: den oprindelige spec fastslår, at sammensætningen bærer indsigten, ikke totaltallet. Komponenter uden data vises som "ikke opgjort".
3. **Driver-tabel.** Alle 16 drivere med kommuneværdi, landsværdi, afvigelse og retningsmarkør. Manglende drivere vises som `–`.
4. **Boligpris-følsomhed.** Vises kun, når `boligprisFolsomhed()` returnerer `vises: true`, altså kun ved gyldigt mønster. Aldrig som falsk symmetrisk korrektion.
5. **Forbehold og kilder** med link til metodesiden.

### 7.3 `metode.html`

Formlerne skrevet ud, de fem antagelsesceller lagt åbent frem med kilde og årstal, kildeliste med DST-tabel-id og år, genereret fra `sources.json` (§11.1), og de kendte begrænsninger. Teksten genbruges fra den oprindelige spec §5-§7 og §12.

### 7.4 `om.html`

Hvad værktøjet er, hvem der står bag, hvad det ikke er, og hvordan det opdateres.

### 7.5 Degradering

| Situation | Visning |
|---|---|
| Kerneinput mangler (indkomst, biler eller byggeri) | "Utilstrækkeligt datagrundlag" i stedet for et tal |
| Komponent kan ikke opgøres (transport uden DTU-tal) | "Ikke opgjort" med markør og tooltip |
| Enkelt driver mangler | `–` i tabellen |
| Volatil værdi (boligpris ved få handler) | Vises med eksplicit volatilitetsforbehold |

## 8. Embed-tilstand

`?kommune=787&embed=1` skjuler header, footer og forsidenavigation og efterlader kun kommunevisningen. Det er dét, der senere gør siden indlejrbar i Klimastatus.dk eller på en kommunes eget site via `<iframe>`.

Implementeres som en `embed`-klasse på `<body>`, der skjuler `.no-embed`-elementer. Samme mønster som doughnuts `.no-print`, blot for en anden kontekst.

## 9. Udgivelse

**GitHub Pages, udgivet via GitHub Actions**, ikke fra en mappe eller en `gh-pages`-branch. Arbejdsgangen i `.github/workflows/deploy.yml`:

1. Tjek koden ud
2. Installér Node, kør Tailwind CLI mod `web/styles/input.css`
3. Kør JS-testene; fejler de, udgives der ikke
4. Upload `web/` som Pages-artefakt og udgiv

Fordelen frem for mappe-udgivelse er, at repoet beholder sin struktur (`web/` som undermappe), og at en fejlende test stopper udgivelsen.

**Ejerens arbejdsgang:** rediger, commit, push. Intet andet.

**Lokal forhåndsvisning:** en `Start udviklerserver.command`-fil i rodmappen, der starter en simpel statisk server - samme bekvemmelighed som doughnut har. Nødvendig, fordi `data.json` hentes med `fetch()`, som ikke virker over `file://`.

## 10. Licens, kreditering og ansvarsfraskrivelse

- **Kode:** MIT.
- **Data:** Danmarks Statistik under CC BY 4.0. Krediteres i footeren, som doughnut gør. Finans Danmarks BM010 og Energinet krediteres samme sted.
- **Ansvarsfraskrivelse:** en fast, synlig note på alle sider: værktøjet er et uofficielt førsteordens-skøn, ikke en myndighedsopgørelse, og estimatet er retningsgivende, ikke en måling. Dette er ikke valgfrit, når afsenderen er en personlig konto og modtagerne er kommuner, der kan finde på at lægge tallet i en klimahandlingsplan.

## 11. Årlig opdatering

1. `python pipeline/build.py` genhenter alle API-kilder og regenererer `web/data/data.json` og `sources.json`
2. Opdatér de få værdier i `constants.py`, hvis de har ændret sig
3. Commit og push. Udgivelsen sker automatisk

`build.py` udskriver fortsat sin valideringsrapport, herunder at Thisted stadig rammer golden-tallene.

### 11.1 `sources.json` skal produceres

`sources.json` findes ikke i dag. `build.py`'s egen docstring fastslår, at
kildemetadata-filen hører til Plan 3's arbejde og bevidst ikke produceres af
pipelinen endnu. Den er derfor en leverance i denne omgang.

Den genereres af `build.py`, ikke håndskrives, så årstallene altid afspejler
det, der faktisk blev hentet ved sidste kørsel. Pr. kilde: id (fx `FOLK1A`),
navn, udbyder, hentedato, dataår, licens og URL. Manuelle kilder
(DTU-transportvaner, det nationale anker, antagelsescellerne) står med
`"metode": "manuel"` og den kildehenvisning, der allerede ligger i
`constants.py`.

Docstringen i `build.py` rettes samtidig, så den ikke længere lyver om, at
filen ikke produceres.

## 12. Test

- De 23 eksisterende JS-tests og 38 Python-tests flytter med og skal fortsat være grønne.
- **Ny test:** motoren markerer transport som uoplyst for en region uden DTU-tal (§6).
- **Ny test:** `sources.json` dækker hver kilde, `data.json` faktisk bruger. Fanger, at en ny DST-tabel tilføjes uden kildehenvisning.
- **Ny test:** brugerfladen renderer alle 98 kommuner uden at kaste. Kører mod den rene JS-motor plus en minimal DOM, så den fanger felter, der findes for Thisted, men mangler for fx Læsø.

## 13. Uden for v1

- Rapport-generatoren med skabelonkatalog for de fire kommunale roller. Bliver v2.
- 98 præ-genererede HTML-sider. Query-parameteren er tilstrækkelig for en prototype; præ-generering kan tilføjes, hvis søgemaskineindeksering bliver et krav.
- Word- og PDF-eksport. Print-visning dækker behovet i v1.
- Egen adresse. `augustseptimius-beep.github.io/forbrugsudledninger` er udgangspunktet.

## 14. Kendte begrænsninger, der følger med til udgivelsen

- **Transport er kun opgjort for Nordjylland.** Fire regioner mangler DTU-tal. Efter §6 vises dette som uoplyst frem for nul, men det er stadig et reelt hul i grundlaget for cirka fire femtedele af kommunerne.
- **El-CO2 mangler for 96 kommuner.** Kræver forbrugsvægtet aggregering af Energinets rå timedata.
- **Byggeeffekten er kalibreret til Thisted** som referencepunkt.
- **Antagelsescellerne er skøn**, ikke målte størrelser. De ligger samlet i `constants.py` og gengives åbent på metodesiden.
- **Estimatet er et førsteordens-skøn.** Sammensætningen bærer indsigten, ikke totaltallet.
