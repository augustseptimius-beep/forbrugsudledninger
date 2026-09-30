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
- **Udgivelse:** GitHub Actions bygger CSS, kører testene, trykker
  metodesiden som PDF og udgiver `web/` til GitHub Pages. Push til `main`
  udgiver.
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
├── scripts/metode-pdf.mjs  <- trykker metodesiden til web/metode.pdf (npm run pdf)
├── pipeline/
│   ├── build.py            <- orkestrerer alt, skriver data.json + sources.json
│   ├── constants.py        <- ★ ANTAGELSER OG PERIODER. Årets ét sted at redigere.
│   ├── sources.py          <- kildekatalog til metodesiden
│   ├── ens.py              <- Energistyrelsens nationale tal. Ren afskrift.
│   ├── concito.py          <- CONCITO's nationale tal med sidehenvisning. Ren afskrift.
│   ├── fetch_dst.py        <- de 9 DST-tabeller
│   ├── fetch_pendling.py   <- DST AFSTB4, pendlingsafstand
│   ├── fetch_forbrug.py    <- DST FU17 og INDKF111 bag fødevareforbruget
│   ├── osei_owusu.py       <- fødevareforbruget efter Osei-Owusu m.fl. (2020)
│   ├── fetch_klimaregnskabet.py <- husholdningernes energi og CO2 (kræver API-nøgle)
│   ├── indkoeb.py          <- ★ KOMMUNENS EGET INDKØB: afgrænsning og forbehold
│   ├── fetch_regk.py       <- DST REGK11, kommunernes regnskaber
│   ├── historik.py         <- ★ ÅRSVÆRDIER BAG UDVIKLINGSPILENE. Skriver historik.json, kun tal.
│   ├── perioder.py         <- periodearitmetik: "2026K1" -> "2025K1"
│   ├── dst_client.py, kommuner.py
│   └── test/               <- pytest
├── web/
│   ├── index.html          <- forside + kommunevisning (?kommune=101)
│   ├── metode.html, om.html
│   ├── beregning.js        <- ★ REN BEREGNINGSMOTOR. Ingen I/O, ingen DOM.
│   ├── render.js           <- ★ RENE RENDER-FUNKTIONER. Data ind, HTML-streng ud.
│   ├── eksport.js          <- ★ REGNEARKSEKSPORT. Arkmodel ud, ingen DOM.
│   ├── tooltip.js          <- egen tooltip; bygger grafen ved udviklingspilen først ved hover
│   ├── xlsx.js             <- minimal xlsx-skriver. Ingen afhængigheder.
│   ├── widget.js           <- tyndt DOM-lag. Ingen forretningslogik.
│   ├── styles/input.css    <- Tailwind-kilde
│   ├── styles/styles.css   <- genereret, MEN COMMITTET (så repoet virker uden Node)
│   └── data/               <- data.json, historik.json, sources.json, ens.json, concito.json
└── test/                   <- node --test
    └── regneark.js         <- lille regnemotor, så testene kan regne arket efter
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

## Regnearkseksporten

Knappen **Hent som regneark** på en kommuneside bygger en xlsx-fil i browseren.
Arket har syv faneblade: Læs mig, Overblik, Nøgletal, Data, Grundlag, Kilder og
Nationalt.

Pointen er, at **regnestykket ligger i arket som formler, ikke som færdige
tal**. Fanebladet Data har rådata med kilde og periode, og hvert felt har tre
kolonner: kildens værdi, en tom gul celle til ens egen værdi, og en anvendt
værdi, der vælger den egne, når den findes. Retter man et rådatafelt, regner
afvigelsen, niveauet, retningen og kategoriens optælling sig om af sig selv.
Kildens tal bliver stående ved siden af, der er en kolonne til ens egen
kildeangivelse, og arket siger til, hvis den mangler - det er reglen om, at
intet tal står uden kilde, skrevet i regneark.

Arket viser det samme som kommunens side, med den undtagelse at **udviklingen over tid
ikke er med** (pilene og historikken, se næste afsnit). Et nøgletal, som et forbehold har
taget af siden, er heller ikke med her, og **dets rådatafelter er ikke med på
fanebladet Data**: ellers kunne enhver regne det skjulte tal ud af de felter,
der blev liggende. Den grænse holdes af en test.

`beregning.js` bærer regnestykket to gange: som `val()` og som `formel`, en
aritmetisk streng over feltnavnene, som eksporten oversætter til celleadresser.
To skrivemåder af samme regnestykke driver fra hinanden, så snart nogen retter
den ene, og `test/formel.test.js` kører derfor begge over alle 98 kommuner og
landet og fejler ved første tal, der ikke er ens. Ændrer du et regnestykke, skal
formlen følge med.

`test/eksport.test.js` regner hele arket igennem med `test/regneark.js` - en
lille regnemotor, der kan netop den delmængde af Excel, eksporten bruger - og
holder hver celle op mod motoren. En test, der kun kiggede på formelstrengene,
kunne se, at der stod noget, ikke at det regnede rigtigt.

`xlsx.js` skriver filen i hånden, fordi repoet ingen bundler har og ingen
runtime-afhængigheder vil have. Zip-arkivet er ukomprimeret: deflate ville kræve
enten `CompressionStream`, som er asynkron, eller en egen implementering, og et
ark på et par hundrede kilobyte er ikke værd at betale nogen af delene for.

## Udviklingen over tid

Hvert nøgletal har en pil, der viser, om kommunen de seneste op til ti år har bevæget sig mod
lavere udledning (rigtig retning), mod højere (forkert retning) eller ikke ret meget. Peger man
på pilen, tegnes en lille graf af kommunens og landets tal. Metoden er doughnut-platformens
retningspile (T1-T4 i dens `docs/arkitektur-og-beregningsregler.md`), med de tilpasninger dette
værktøjs egne regler kræver. Forklaringen til brugerne står på metodesiden, afsnit 4.5.

**`historik.json` rummer kun tal, og grafen tegnes først ved hover.** Filen har elleve tal pr.
felt for hver kommune og landet (feltets nuværende værdi og ti år bagud). Pipelinen gemmer aldrig
SVG. `tooltip.js` beder om grafen med nøglen fra pilens `data-graf`, når pilen får mus, fokus
eller et tryk, og `renderUdviklingTip()` i `render.js` bygger den af tallene. Kommunesiden rummer kun
pilen. Filen hentes først, når en kommuneside åbnes, og mangler den, står siden uden kolonnen
Udvikling frem for med en fejl. `test/render_udvikling.test.js` holder fast, at ingen graf ligger
i siden på forhånd. Der er derfor intet tegnet at holde ajour ved den årlige opdatering.

**Seneste punkt er tallet i tabellen (doughnuts T9).** `historik.py` kalder de samme
hentefunktioner som `data.json`, med en liste af perioder i stedet for én: hver `fetch_xxx` er delt
i et kald og en udregning, og `fetch_xxx_serie` kører den samme udregning på hver periodes rækker.
Sammensætningerne deles også (`indkoeb.indkoeb_felter`, `osei_owusu.forbrug_for_aar`,
`fetch_klimaregnskabet.sammenlaeg_land_husholdning`). `afstem_med_data()` stopper kørslen, hvis
seneste punkt afviger fra `data.json`, og `test/historik.test.js` kører samme kontrol mod de
committede filer. Motoren regner serien med nøgletallets eget `val()` (`driverSerie`), så tabel og
pil er ét tal, også bitvis.

**Hvert felt går bagud fra sin egen periode.** Bilerne er fra januar 2026, byggeriet fra 2024,
affaldet fra 2023 (`FELT_PERIODE` i `historik.py`). Byggeri i 2024 delt med folketallet i 2026 er
derfor byggeri i 2023 delt med folketallet i 2025 året før, og så videre: samme kombination i alle
år. Nøgletallets årstal er det ældste af dets felters perioder (`driverAar`).

**Fælder, der allerede er ramt.**

- **Null er nul i JavaScript.** `null / 42572` er 0, og et hul i historikken ville blive en måling.
  `postVedTrin()` udelader hullet, så regnestykket giver NaN og `sikker()` giver null. En test kører
  det.
- **DST's celletælling er højere end svarets rækker.** Fritidshuse (tre jokertegn) må kun hentes ét
  år ad gangen, byggeri højst tre (`fetch_i_bidder`). Elleve år ad gangen gav HTTP 400.
- **BOL101 mangler 2021 og 2022.** Boligtallene har derfor et hul, og nøgletal, der bruger dem, står
  uden punkt de to år. Det er korrekt, ikke en fejl.
- **Andre Python-versioner summerer floats anderledes.** Fødevareforbruget afviger en enhed i sidste
  decimal mellem 3.11 og 3.12. `afstem_med_data` sætter `data.json`'s værdi ind, når forskellen er
  float-støj, og stopper ved alt større.
- **Kilder, der er yngre end vinduet, giver en kortere række.** BIL54 begynder i 2018, FU17 i 2015.
  Rækken har stadig elleve led, med hullerne som null.

**Retningen er nøgletallets `paavirkning`, ikke en ny antagelse.** `lavere` betyder, at en stigning er
rigtig, `hoejere` at et fald er det, `uafklaret` at pilen står uden vurdering (grå). Et forbehold, der
spærrer retningen, spærrer også pilen; et forbehold, der skjuler nøgletallet, tager også pilen af
siden. Begge holdes ude af medianen, som "rigtig" og "langsomt" skilles ved. Klassifikationen er
doughnuts: `ingen`, `stagneret`, `kontekst`, `forkert`, `tempo`, `rigtig`, med endepunkter midlet over
tre år ved mindst seks punkter. Tærsklerne for "uændret" er tilpasset enhederne (procentpoint for
andele, 0,1 for vækstrater) og står som konstanter i `beregning.js`.

**Kronebeløb sættes i samme prisniveau.** Nøgletal med `faste: true` (enhed kr.) regnes op til det
seneste års priser med forbrugerprisindekset (DST PRIS8, årsgennemsnit), som ligger i `historik.json`.
Ellers ville en stigning, der blot følger priserne, få alle kommuner til at pege samme vej. En test
holder flaget på præcis de nøgletal, hvis enhed er kroner. Anlægsindkøbet er et femårsgennemsnit og
sættes i priserne fra vinduets midte (`prisForskydning: 2`, som skal følge `ANLAEG_VINDUE_AAR`).
Værdierne i `historik.json` er kildens egne, ikke justerede.

**Klimaregnskabets fire nøgletal kræver API-nøglen.** Uden den står de syv `husholdning_*`-felter
uden historik (`mangler` i filen), og nøgletallene vises med "ingen tidsserie". Workflowet **Årlig
dataopdatering** bygger historikken med nøglen og fejler, hvis `mangler` ikke er tom. Hver
Klimaregnskab-årgang er 196 kald, og historikken henter op til seks årgange ud over det nyeste år,
så kørslen tager markant længere tid end før.
Årgangene er ikke prøvet mod den levende kilde uden nøgle; om metoden er ens i alle år, kan værktøjet
ikke selv afgøre, og det står ved nøgletallene.

**Tilføjer du et nøgletal**, skal alle dets felter stå i `FELT_PERIODE` i `historik.py` og i `felter`
i `beregning.js`, ellers står det uden tidsserie, og `test/historik.test.js` melder det. Et nøgletal
i kroner skal have `faste: true`.

## To UI-mønstre der er arvet af faglige grunde

1. **Retning bæres af formen, ikke kun farven.** Signalerne bruger fyldte og
   åbne trekanter op og ned og en vandret streg, og teksten står altid ved
   siden af, fordi cirka 8 % af mænd er farveblinde. Farven forstærker, den
   bærer ikke.
2. **Egen tooltip frem for `title`.** Browserens native tooltip har 0,5-1
   sekunds forsinkelse og opfører sig forskelligt fra browser til browser.
   Forbeholdene skal vises straks, både ved hover og ved tastaturfokus.
   Berøringsskærme har ingen hover: et tryk på triggeren viser boksen, og et tryk et andet sted
   skjuler den. `tooltip.js` lytter derfor på pointer-hændelser (`pointerover`, `pointerout`,
   `pointerup`) og ikke på mus-hændelser, fordi en berøringsskærm sender et `mouseout` lige efter
   et tryk, som ellers skjuler boksen igen i samme øjeblik, den blev vist.

Begge er overtaget fra doughnut-projektet, hvor de blev fundet nødvendige.

## De to vigtigste regler i koden

**1. Ingen ukildebelagte tal.** Dukker der en koefficient op, som ikke kan
føres tilbage til en navngiven side i en navngiven rapport, hører den ikke
hjemme i modellen. `pipeline/ens.py` og `pipeline/concito.py` indeholder de
nationale tal som ren afskrift med kildehenvisning; `pipeline/constants.py`
forklarer, hvilke koefficienter der er fjernet og hvorfor.

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

Metodesiden kan hentes som PDF til en sag. Filen trykkes af
`scripts/metode-pdf.mjs` med headless Chrome ved udgivelse og committes ikke,
fordi den rummer tabeller regnet af årets datasæt. Printlayoutet står i
`web/styles/input.css` under `@page metode`. Afsnitsnumrene sættes af CSS ud
fra rækkefølgen, og `test/metodeside.test.js` holder indholdsfortegnelsen i
takt med de nummererede overskrifter (`class="nr"`). Flytter du et afsnit, så
flyt linjen i fortegnelsen med.

**2. Manglende data må aldrig vises som nul.**

Et felt, der mangler i `data.json`, er `null` hele vejen igennem og bliver
aldrig til 0. I `beregning.js` giver `sikker()` `null`, når et regnestykke
ender i NaN eller Infinity, og `afvigelse()` giver `null`, når kommunens eller
landets værdi mangler. Nøgletallet får så signalet `"ukendt"`, som
kommunesiden viser som mærkatet "ingen data", og `beregnKommune()` lister de
manglende felter i `manglende`. `render.js` viser `null` som tankestreg
(`MANGLER`). I regnearket er feltet en tom celle, og formlerne giver også en
tom celle tilbage (`IF(OR(...=""),"",IFERROR(...,""))`), så en tom celle ikke
bliver regnet som 0.

Baggrunden er, at et nul ligner en måling. En kommune, der ser 0 kg affald
eller 0 biler, læser det som et faktum om sig selv, mens en tankestreg siger,
at tallet ikke findes.

Hvis du ændrer i `beregning.js`, `render.js` eller `eksport.js`, så tjek at
denne skelnen overlever. Golden-testen "manglende data giver streg, ikke nul"
og eksporttesten "manglende rådata giver en tom celle, aldrig et nul" fanger
de fleste brud.

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

Udgivelses-workflowet bruger ikke nøglen: det kører tests, CSS og
PDF-trykningen af metodesiden, ikke `build.py`.

Den årlige opdatering kan derimod køres i CI. Nøglen ligger som GitHub
Actions-secret under navnet `KLIMAREGNSKABET_API_KEY`, og
`.github/workflows/opdater-data.yml` læser den derfra. En secret er
skrive-kun: værdien kan ikke læses tilbage af nogen, heller ikke af repoets
ejer. Skal den skiftes, overskrives den med `gh secret set`.

Det betyder, at opdateringen ikke længere hænger på én bestemt maskine. Vil
du alligevel køre lokalt, virker `pipeline/.env` som før.

## Cachefiler under udvikling

`pipeline/.kr_cache.json` gemmer Klimaregnskabet.dk, der kræver ét kald pr.
kommune, så en genkørsel tager sekunder. `pipeline/.kr_historik_cache.json` gør det samme for de
foregående årgange bag historikken. Begge er gitignoreret. Omgå dem med `--frisk-kr`.

## Årlig opdatering

Kør workflowet **Årlig dataopdatering** fra Actions-fanen. Det henter alle
kilder med nøglen, kontrollerer at ingen kilde faldt tavst ud, kører CSS og
begge testsuiter, og åbner en draft-PR med det nye datasæt. Trinene nedenfor
gælder både den vej og en lokal kørsel.

1. `python3 pipeline/build.py` - genhenter alle API-kilder, skriver
   `data.json`, `historik.json` og `sources.json`, og udskriver en valideringsrapport.
   Historikken bygges sidst og følger `PERIODER` bagud af sig selv. I CI står rapporten i
   kørslens log. Vil du kun genskabe historikken ud fra den committede `data.json`, så kør
   `python3 pipeline/historik.py`.
2. Læs rapporten. Den bekræfter, at Thisted stadig rammer golden-tallene, og
   tæller kommuner med manglende drivere. Det trin kan ikke automatiseres:
   testene fanger brudte regnestykker, ikke tal der er rigtige men urimelige.
3. Opdatér `PERIODER` i `constants.py`, hvis nyere perioder er tilgængelige.
   `REGNSKAB_AAR` styrer både driftsindkøbets år og slutåret i anlæggets
   femårsvindue. `PRIS_AAR` skal være mindst lige så ny som `INDKOMST_AAR`, `FORBRUG_AAR`
   og `REGNSKAB_AAR`, og en test melder det, hvis den ikke er.
4. Commit og push. Udgivelsen sker automatisk.

`KONSTANTER` i `constants.py` er metodiske antagelser, ikke datapunkter. Ændr
dem kun hvis metoden selv ændres, og kør golden-testene bagefter.

## Tests

```bash
npm test                              # 350+ JS-tests: motor, rendering, metodeside, eksport, udvikling
cd pipeline && python3 -m pytest -q   # 200+ Python-tests: pipeline
```

Golden-testene i `test/golden.test.js` holder motoren fast på fastfrosne
rådata for Thisted (fidelitet) og Greve (fortegn) i `test/fixtures.js`. De må
kun ændres bevidst.

## Lokal preview

Dobbeltklik `Start udviklerserver.command`, eller kør `npm run serve`.
Brug `http://127.0.0.1:8000`, ikke `localhost` - sidstnævnte kan resolve til
IPv6 og fejle. `data.json` hentes med `fetch()`, som ikke virker over `file://`,
så siden skal serveres, ikke bare åbnes.
