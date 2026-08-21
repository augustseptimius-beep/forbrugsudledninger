# Consumption-based emissions for Denmark's 98 municipalities

**Live site: https://augustseptimius-beep.github.io/forbrugsudledninger/**

A static, serverless reference tool. For every Danish municipality it shows the
publicly available key figures alongside the national average, and sets them
next to CONCITO's national account of Danish consumption-based emissions.

**Every number is either read from a public register or transcribed from a named
report with a page reference.** The tool performs no modelling of its own.

## What it does

Pick a municipality and you get:

- **Denmark's national consumption footprint** as published by CONCITO: 11 tonnes
  CO2e per person, broken down across 15 categories. Transcribed from the report
  with page references and links, not calculated here.
- **The municipality's own key figures** compared against the national average,
  grouped by the consumption category they relate to. Every figure comes straight
  from a named public register.
- **Explicit "not quantified" markers** wherever the underlying data does not
  exist. Never a silent zero.

## What it deliberately does not do

**It does not calculate a climate footprint for the municipality.** An earlier
version did, resting on five coefficients - a national anchor, an income
elasticity, a car-travel share, a construction share and a housing-cost offset.
None of them could be traced to a source: the anchor contradicted CONCITO
(2023) p. 8, the car-travel share contradicted CONCITO (2023) p. 17 fig. 8, the
elasticity appears in neither CONCITO (2023) nor NIRAS (2024), and the
construction share was fitted to reproduce one municipality's earlier result.
They have been removed, and the estimate with them.

NIRAS's 2024 recommendation to CONCITO and C40 Cities for a municipal model
rests on DTU's travel survey (p. 20), the Danish Energy Agency's address-level
energy accounts (p. 18) and a commercial consumer segmentation model (p. 26).
None of those are openly available. Until they are, a municipal footprint cannot
be computed without inventing coefficients, and this tool does not.

## Method

The method generalises an analysis originally built for Thisted Municipality.
Full documentation is in `docs/superpowers/specs/`.

Data comes from Statistics Denmark (11 tables), Finans Danmark's BM010 housing
price index, and two manually maintained sources documented in
`pipeline/constants.py`.

## Running it locally

On macOS, double-click `Start udviklerserver.command`. Otherwise:

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

Review the validation report it prints, commit, and push. Publication is
automatic via GitHub Actions.

## Tests

```bash
npm test                      # JavaScript: engine and rendering
cd pipeline && python3 -m pytest -q   # Python: data pipeline
```

The deploy workflow runs the JavaScript tests before publishing. A red test
stops the release.

## Licence

Code is MIT. Data from Statistics Denmark is CC BY 4.0 and credited in the site
footer.
