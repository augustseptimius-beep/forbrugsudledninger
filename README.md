# Consumption-based emissions for Denmark's 98 municipalities

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
- All 16 drivers compared against the national average, with direction shown
  by shape as well as colour.
- Explicit "not quantified" markers wherever the underlying data does not
  exist. Never a silent zero.

## Known gaps, stated up front

- **Transport is only quantified for North Jutland.** The regional car-kilometre
  deviation comes from DTU's national travel survey, which has no public API.
  Only one of five regions has been looked up, so the transport component is
  shown as not quantified for the rest.
- **Grid CO2 per kWh is missing for 96 municipalities.** Energinet publishes it
  as raw hourly data that needs consumption-weighted aggregation.
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
