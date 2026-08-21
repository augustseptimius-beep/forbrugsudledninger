# CLAUDE.md - teknisk onboarding

> **Formål:** Hurtigt overblik over projektet uden at grave i koden. Læses i
> starten af en ny arbejdssession, af mennesker og af AI-assistenter.
>
> **Se også:** `README.md` for formål og opsætning (engelsk), og
> `docs/superpowers/specs/` for de normative beregningsregler og designvalg.
> Denne fil er den praktiske driftsvejledning; specen er den faglige kontrakt.

## TL;DR (30 sekunder)

- **Projekt:** Forbrugsbaserede udledninger for alle 98 danske kommuner.
  Offentlig, statisk side uden server eller database.
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
│   ├── fetch_dst.py        <- de 11 DST-tabeller
│   ├── fetch_boligpriser.py<- Finans Danmark BM010
│   ├── dst_client.py, kommuner.py
│   └── test/               <- pytest
├── web/
│   ├── index.html          <- forside + kommunevisning (?kommune=787)
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

`render.js` indeholder rene funktioner: beregningsresultat ind, HTML-streng ud.
Det gør hele brugerfladen testbar uden jsdom eller browser - testene asserterer
bare på strenge. `widget.js` er et tyndt lag, der henter data, læser
query-parameteren og sætter strengene ind i siden.

Det er også broen til søsterprojekterne: hver render-funktion kan blive til en
React-komponent, hvis platformen senere flettes ind i doughnut-projektet.

## To UI-mønstre der er arvet af faglige grunde

1. **Retning bæres af formen, ikke kun farven.** Driver-tabellens retningsmarkør
   bruger pil op, pil ned og vandret streg, fordi cirka 8 % af mænd er
   farveblinde. Farven forstærker, den bærer ikke.
2. **Egen tooltip frem for `title`.** Browserens native tooltip har 0,5-1
   sekunds forsinkelse og opfører sig forskelligt fra browser til browser.
   Forbeholdene skal vises straks, både ved hover og ved tastaturfokus.

Begge er overtaget fra doughnut-projektet, hvor de blev fundet nødvendige.

## Den vigtigste regel i koden

**Manglende data må aldrig vises som nul.**

`estimat()` returnerer `null` for komponenter, der ikke kan opgøres, og lister
dem i `uoplyst`. Brugerfladen viser dem som "ikke opgjort".

Baggrunden: transporteffekten hviler på en proxy, og hvis den degraderer
stiltiende til nul, læser en kommune et ukendt bidrag som en måling. Motoren
foretrækker kommunens eget `bilkm_afvigelse`, falder tilbage til regionens
værdi i konstanterne, og viser først "ikke opgjort", når ingen af delene
findes.

Hvis du ændrer i `beregning.js`, så tjek at denne skelnen overlever.

## Årlig opdatering

1. `python3 pipeline/build.py` - genhenter alle API-kilder, skriver
   `data.json` og `sources.json`, og udskriver en valideringsrapport.
2. Læs rapporten. Den bekræfter, at Thisted stadig rammer golden-tallene, og
   tæller kommuner med manglende drivere.
3. Opdatér `PERIODER` i `constants.py`, hvis nyere perioder er tilgængelige.
4. Commit og push. Udgivelsen sker automatisk.

`KONSTANTER` i `constants.py` er metodiske antagelser, ikke datapunkter. Ændr
dem kun hvis metoden selv ændres, og kør golden-testene bagefter.

## Tests

```bash
npm test                              # 30+ JS-tests: motor og rendering
cd pipeline && python3 -m pytest -q   # 44 Python-tests: pipeline
```

Golden-testene i `test/golden.test.js` er facit mod det oprindelige regneark
for Thisted (fidelitet) og Greve (fortegn). De må ikke ændres uden at
regnearket ændres.

## Lokal preview

Dobbeltklik `Start udviklerserver.command`, eller kør `npm run serve`.
Brug `http://127.0.0.1:8000`, ikke `localhost` - sidstnævnte kan resolve til
IPv6 og fejle. `data.json` hentes med `fetch()`, som ikke virker over `file://`,
så siden skal serveres, ikke bare åbnes.
