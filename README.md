# Consumption-based emissions for Denmark's 98 municipalities

**Live site: https://augustseptimius-beep.github.io/forbrugsudledninger/**

A static, serverless tool that estimates the consumption-based greenhouse gas
footprint per resident for every Danish municipality, and shows the 16 drivers
that explain the difference from the national average.

**This is an unofficial first-order estimate, not an official inventory.**
It is a starting point for municipal climate planning. Every figure carries its
caveats in the interface rather than in a footnote.

## What it does

Pick a municipality and you get:

- An estimated footprint per resident, as a range, anchored to the national
  figure of roughly 10 tonnes CO2e.
- A breakdown into anchor, income effect, transport effect and construction
  effect. The composition carries the insight, not the total.
- All 17 drivers compared against the national average, with direction shown
  by shape as well as colour.
- Explicit "not quantified" markers wherever the underlying data does not
  exist. Never a silent zero.

## Known gaps, stated up front

- **Transport rests on a regional proxy.** Every municipality in a region
  inherits the same car-kilometre deviation. Only North Jutland's is measured
  directly by DTU's travel survey, which has no public API. The other four are
  derived from Statistics Denmark's commuting-distance table AFSTB4 and
  calibrated so North Jutland reproduces the DTU figure exactly. Where the two
  measures can be compared they agree to within 0.74 percentage points.
- **Grid CO2 per kWh credits local generation.** The figure follows Energinet's
  location-based municipal declaration: locally produced renewable energy
  consumed in the same municipality within the same hour counts as zero
  emission and displaces grid electricity. It describes a municipality's
  electricity profile well, and it is not suitable for adding up across
  municipalities. Local renewable coverage is shown alongside it as a separate
  driver so the reader can see what drives the number.
- **The construction coefficient is calibrated against one municipality**
  (Thisted) as a reference point.
- **The assumption cells are estimates, not measurements.** They live in one
  place, `pipeline/constants.py`, and are reproduced openly on the method page.

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
