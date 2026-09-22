# CLAUDE.md - teknisk onboarding

> **Formål:** Hurtigt overblik over projektet uden at grave i koden. Læses i
> starten af en ny arbejdssession, af mennesker og af AI-assistenter.
>
> **Se også:** `README.md` for formål og opsætning (engelsk), og
> `web/metode.html` for metode, kilder og designvalg. Denne fil er den
> praktiske driftsvejledning; metodesiden er den faglige kontrakt.

## TL;DR (30 sekunder)

- **Projekt:** Forbrugsbaserede udledninger for alle 98 danske kommuner.
  Offentlig, statisk side uden server eller database.
- **Grundprincip:** værktøjet træffer ingen metodiske beslutninger. Hvert tal er
  enten hentet fra et offentligt register eller afskrevet fra en navngiven
  rapport med sidehenvisning. Der beregnes intet kommunalt klimaaftryk - se
  forklaringen i `pipeline/constants.py`.
- **Stak:** Vanilla ES-moduler, Tailwind CSS 4 via CLI, Python til pipelinen.
  Ingen React, ingen bundler, ingen runtime-afhængigheder.
- **Udgivelse:** GitHub Actions bygger CSS, kører testene og udgiver `web/`
  til GitHub Pages. Push til `main` udgiver.
- **Sprog i repoet:** dansk i UI, kommentarer og dokumentation. README er på
  engelsk af hensyn til eksterne læsere. **Undgå em-dash, brug enkelt dash.**

## De tre lag

```
[ pipeline/ (Python) ]  ->  [ web/data/*.json ]  ->  [ web/ (JavaScript) ]
  henter fra API'er          statiske filer          explorer
  én gang om året            98 kommuner + land
```

Ingen server, ingen database ved kørsel.

## Projektstruktur

```
forbrugsudledninger/
├── Start udviklerserver.command   <- dobbeltklik på macOS for lokal preview
├── pipeline/
│   ├── build.py            <- orkestrerer alt, skriver data.json + sources.json
│   ├── constants.py        <- ★ ANTAGELSER OG PERIODER. Årets ét sted at redigere.
│   ├── sources.py          <- kildekatalog til metodesiden
│   ├── fetch_dst.py        <- de 9 DST-tabeller
│   ├── indkoeb.py          <- ★ KOMMUNENS EGET INDKØB: afgrænsning og forbehold
│   ├── fetch_regk.py       <- DST REGK11, kommunernes regnskaber
│   ├── dst_client.py, kommuner.py
│   └── test/               <- pytest
├── web/
│   ├── index.html          <- forside + kommunevisning (?kommune=101)
│   ├── metode.html, om.html
│   ├── beregning.js        <- ★ REN BEREGNINGSMOTOR. Ingen I/O, ingen DOM.
│   ├── render.js           <- ★ RENE RENDER-FUNKTIONER. Data ind, HTML-streng ud.
│   ├── widget.js           <- tyndt DOM-lag. Ingen forretningslogik.
│   ├── styles/input.css    <- Tailwind-kilde
│   ├── styles/styles.css   <- genereret, MEN COMMITTET (så repoet virker uden Node)
│   └── data/               <- data.json, sources.json
└── test/                   <- node --test
```

## Hvorfor render.js og widget.js er adskilt

Kommunesiden har ét nøgletalsafsnit, `renderIndikatorer`. Det havde tidligere
et kategorioverblik oven over sig, som sagde med mærkater, hvad tabellen sagde
igen med tal; vægt, beskrivelse, samlet retning og tal står nu samlet pr.
kategori. Kategoriernes vægte og beskrivelser kommer fra `ens.json` og er ens
på alle 98 sider - kun tallene i tabellerne er kommunens.

`render.js` indeholder rene funktioner: beregningsresultat ind, HTML-streng ud.
Det gør hele brugerfladen testbar uden jsdom eller browser - testene asserterer
bare på strenge. `widget.js` er et tyndt lag, der henter data, læser
query-parameteren og sætter strengene ind i siden.

Det er også broen til søsterprojekterne: hver render-funktion kan blive til en
React-komponent, hvis platformen senere flettes ind i doughnut-projektet.

## To UI-mønstre der er arvet af faglige grunde

1. **Retning bæres af formen, ikke kun farven.** Signalerne bruger fyldte og
   åbne trekanter op og ned og en vandret streg, og teksten står altid ved
   siden af, fordi cirka 8 % af mænd er farveblinde. Farven forstærker, den
   bærer ikke.
2. **Egen tooltip frem for `title`.** Browserens native tooltip har 0,5-1
   sekunds forsinkelse og opfører sig forskelligt fra browser til browser.
   Forbeholdene skal vises straks, både ved hover og ved tastaturfokus.

Begge er overtaget fra doughnut-projektet, hvor de blev fundet nødvendige.

## De to vigtigste regler i koden

**1. Ingen ukildebelagte tal.** Dukker der en koefficient op, som ikke kan
føres tilbage til en navngiven side i en navngiven rapport, hører den ikke
hjemme i modellen. `pipeline/concito.py` indeholder de nationale tal som ren
afskrift med sidehenvisning; `pipeline/constants.py` forklarer, hvilke
koefficienter der er fjernet og hvorfor.

Kilden står også ved hvert nøgletal på kommunesiden, og den skrives ikke i
hånden: hver driver i `beregning.js` oplyser i `felter`, hvilke felter i
`data.json` den læser, og `sources.json` siger, hvem der ejer hvert felt.
Tilføjer du et nøgletal, skal `felter` med - `test/kildeangivelse.test.js`
kører hvert regnestykke gennem en proxy og slår fejl, hvis de oplyste felter
ikke er præcis dem, der faktisk læses.

Det gælder også metodesidens egen brødtekst, og dér er rangordenen **render
før test, test før prosa**:

1. **Kan oplysningen regnes af siden selv, så lad den det.** Kildetabellen,
   tærskelfordelingen og forbeholdstabellen (`renderForbehold`) læser data ved
   hver sidevisning og kan derfor ikke komme bagud. De ramte kommuner bag hvert
   forbehold stod længe navngivet i prosaen - "de syv ejerkommuner bag Norfors
   og Reno Djurs (Allerød, ...)" - og hørte hjemme i en tabel, fordi listen
   afgøres af årets egne tal.
2. **Kan den ikke, så sæt en test på tallet.** `test/metodeside.test.js`
   genberegner hvert afledt tal fra `data.json`, `ens.json` og `concito.json` og
   fejler, hvis siden siger noget andet. Den har også strukturelle vagter, der
   fanger en oplysning, som aldrig kom med: at hvert hjælpetal er nævnt ved
   navn, og at en datadrevet kommuneliste ikke er sneget tilbage i prosaen.
3. **Kun det, der hverken kan regnes eller testes, står frit.** Citater med
   sidehenvisning og historiske begrundelser skal ikke følge data - fulgte de
   med, var de ikke længere citater. Tal, der kræver felter uden for
   datafilerne (alderssammensætning, hovedkonto-opdeling, færgeandel), er
   markeret med deres opgørelsesår i teksten.

Baggrunden er, at prosaen rådner stille: ved opdateringen til Klimaregnskabet
2024 løb fem tal fra data, og ved et senere eftersyn viste tre tal i
regionsafsnittet sig regnet mod et andet landsgennemsnit end det, siden selv
viser. Tilføjer du et afledt tal til metodesiden, så find det rigtige trin på
listen ovenfor.

Det gælder også afgrænsninger. `pipeline/indkoeb.py` dokumenterer, hvilke
artskonti der tælles som kommunens indkøb og hvilke der ikke gør, med
Energistyrelsens egen formulering som grundlag - og hvorfor hovedkonto 1,
Forsyningsvirksomheder, udelades for alle 98 kommuner frem for at blive skjult
for de 17, der står med nul.

**2. Manglende data må aldrig vises som nul.**

`estimat()` returnerer `null` for komponenter, der ikke kan opgøres, og lister
dem i `uoplyst`. Brugerfladen viser dem som "ikke opgjort".

Baggrunden: transporteffekten hviler på en proxy, og hvis den degraderer
stiltiende til nul, læser en kommune et ukendt bidrag som en måling. Motoren
foretrækker kommunens eget `bilkm_afvigelse`, falder tilbage til regionens
værdi i konstanterne, og viser først "ikke opgjort", når ingen af delene
findes.

Hvis du ændrer i `beregning.js`, så tjek at denne skelnen overlever.

**Og der er en skelnen mere: `spaerrer` er ikke `skjuler`.** Et forbehold i
`beregning.js` kan gøre to forskellige ting, og de må ikke smelte sammen.
`spaerrer` siger, at retningen ikke kan afgøres, men tallet er rigtigt og bliver
stående uden mærkat - færgekommunernes indkøb. `skjuler` siger, at tallet selv
er ramt, og tager det af kommunens side med begrundelsen under tabellen -
affaldstonnagen bogført på nabokommunen. De var længe det samme flag, og det
kostede: færgeforbeholdet var ment som det første, men fjernede i praksis alle
fire indkøbsnøgletal fra Læsø, Samsø og Ærø, mens metodesiden lovede det
modsatte. `samletRetning` tæller dem tilsvarende hver for sig, så en kategori
med spærrede nøgletal siger "retningen kan ikke afgøres" og ikke "ingen data".

## API-nøgler

Klimaregnskabet.dk kræver en personlig API-nøgle. Den læses fra miljøvariablen
`KLIMAREGNSKABET_API_KEY` eller fra `pipeline/.env`, som er **gitignoreret og
må aldrig committes**. Mangler nøglen, springes kilden over, og
husholdningsfelterne står tomme - resten af datasættet er upåvirket.

Nøgle hentes gratis på https://klimaregnskabet.dk/klimaregnskabet-api mod navn,
email og formål. Filformat:

```
KLIMAREGNSKABET_API_KEY=...
```

Udgivelses-workflowet bruger ikke nøglen: det kører kun tests og CSS, ikke
`build.py`.

Den årlige opdatering kan derimod køres i CI. Nøglen ligger som GitHub
Actions-secret under navnet `KLIMAREGNSKABET_API_KEY`, og
`.github/workflows/opdater-data.yml` læser den derfra. En secret er
skrive-kun: værdien kan ikke læses tilbage af nogen, heller ikke af repoets
ejer. Skal den skiftes, overskrives den med `gh secret set`.

Det betyder, at opdateringen ikke længere hænger på én bestemt maskine. Vil
du alligevel køre lokalt, virker `pipeline/.env` som før.

## Cachefiler under udvikling

`pipeline/.kr_cache.json` gemmer Klimaregnskabet.dk, der kræver ét kald pr.
kommune, så en genkørsel tager sekunder. Den er gitignoreret. Omgå den med
`--frisk-kr`.

## Årlig opdatering

Kør workflowet **Årlig dataopdatering** fra Actions-fanen. Det henter alle
kilder med nøglen, kontrollerer at ingen kilde faldt tavst ud, kører CSS og
begge testsuiter, og åbner en draft-PR med det nye datasæt. Trinene nedenfor
gælder både den vej og en lokal kørsel.

1. `python3 pipeline/build.py` - genhenter alle API-kilder, skriver
   `data.json` og `sources.json`, og udskriver en valideringsrapport.
   I CI står rapporten i kørslens log.
2. Læs rapporten. Den bekræfter, at Thisted stadig rammer golden-tallene, og
   tæller kommuner med manglende drivere. Det trin kan ikke automatiseres:
   testene fanger brudte regnestykker, ikke tal der er rigtige men urimelige.
3. Opdatér `PERIODER` i `constants.py`, hvis nyere perioder er tilgængelige.
   `REGNSKAB_AAR` styrer både driftsindkøbets år og slutåret i anlæggets
   femårsvindue.
4. Commit og push. Udgivelsen sker automatisk.

`KONSTANTER` i `constants.py` er metodiske antagelser, ikke datapunkter. Ændr
dem kun hvis metoden selv ændres, og kør golden-testene bagefter.

## Tests

```bash
npm test                              # 200+ JS-tests: motor, rendering, metodeside
cd pipeline && python3 -m pytest -q   # 100+ Python-tests: pipeline
```

Golden-testene i `test/golden.test.js` holder motoren fast på fastfrosne
rådata for Thisted (fidelitet) og Greve (fortegn) i `test/fixtures.js`. De må
kun ændres bevidst.

## Lokal preview

Dobbeltklik `Start udviklerserver.command`, eller kør `npm run serve`.
Brug `http://127.0.0.1:8000`, ikke `localhost` - sidstnævnte kan resolve til
IPv6 og fejle. `data.json` hentes med `fetch()`, som ikke virker over `file://`,
så siden skal serveres, ikke bare åbnes.
