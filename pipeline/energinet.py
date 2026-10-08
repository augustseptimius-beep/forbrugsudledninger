"""Energinets miljødeklaration pr. kommune: CO2e pr. kWh el, årsgennemsnit.

Kilde: Energinet, "Lokationsbaseret deklaration (Miljødeklaration)", regnearket
"Miljødeklaration (årsgennemsnit)", arket "Miljødeklaration per kommune".
  https://www.energinet.dk/data-om-energi/data-til-dit-klimaregnskab/lokationsbaseret-deklaration-miljodeklaration/

Energinet beregner deklarationen pr. kommune og time ud fra åbne data på Energi
Data Service (datasættene ReCoverageMunicipality og DeclarationTransmissionEmission):
strøm, der produceres af vedvarende energi i kommunen, forbruges først i kommunen,
og resten af forbruget dækkes af transmissionsnettets blanding, herunder import.
Årsgennemsnittene er Energinets egne, reviderede tal. Værktøjet regner ikke selv på
timedata: et kommunalt tal, som Energinet ikke har udgivet, ville være en
koefficient uden kilde.

HVORFOR EN FÆLLES FIL OG IKKE ET API-KALD. Regnearket er den udgave, Energinet
selv udgiver og reviderer (endelige tal i juni året efter, foreløbige i januar).
Timedata er under omlægning til DataHub 3.0 med en anden metode, og tal fra før og
efter skiftet er ikke sammenlignelige.

TO VALG, DER ER VÆRKTØJETS EGNE og står som konstanter nedenfor:

  KOLONNE   Regnearket har både 125 %- og 200 %-metoden (fordelingen af
            brændslet i kraftvarmeværker) og en udgave med biogen CO2. Værktøjet
            bruger CO2e efter 125 %-metoden, som er første kolonne og den
            gængse. Skiftes metode, skal metodesiden skiftes med.
  ENHED     g CO2e pr. kWh forbrugt el, inklusive tab i transmission og
            distribution.

Modulet har to ansvar. Kørt som script henter det regnearket og skriver den lille
fil web/data/energinet.json med kun de tal, værktøjet bruger. Importeret giver det
build.py og historik.py faktorerne og landsgennemsnittet.

    python3 pipeline/energinet.py                  # find regnearket på Energinets side
    python3 pipeline/energinet.py <url eller sti>  # brug en bestemt fil

Regnearket udskiftes af Energinet hvert år med et nyt filnavn, så adressen findes
på siden og er ikke skrevet ind her.
"""

import datetime
import io
import json
import os
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

from kommuner import KOMMUNER

SIDE = ("https://www.energinet.dk/data-om-energi/data-til-dit-klimaregnskab/"
        "lokationsbaseret-deklaration-miljodeklaration/")
ARK = "Miljødeklaration per kommune"
KOLONNE = "CO2e125% g/kWh"
ENHED = "g CO2e/kWh"
METODE = "125 %-metoden"

ENERGINET_JSON_PATH = os.path.join(os.path.dirname(__file__), "..", "web", "data", "energinet.json")
TIMEOUT_SEKUNDER = 120
USER_AGENT = "forbrugsudledninger-pipeline (offentligt kommuneværktøj; kontakt via GitHub-repoet)"

# Rimelighedsgrænser. Energinets tal ligger mellem 0 og cirka 500 g/kWh; alt
# udenfor er en fejl i filen eller i udtrækket og skal stoppe kørslen.
MAKS_G_PR_KWH = 1000.0

_NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
_REL_NS = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}"


# ---------- Find og hent regnearket ----------

def find_xlsx_url(side_html):
    """Adressen på årsgennemsnittene, som den står på Energinets side."""
    sider = re.findall(r'/media/[a-z0-9]+/miljoedeklaration-aarsgennemsnit[^"\'\s<>\\]*\.xlsx',
                       side_html)
    if not sider:
        raise ValueError("fandt ikke regnearket med årsgennemsnit på Energinets side. "
                         "Giv adressen eller filen som argument.")
    return "https://www.energinet.dk" + sider[0]


def _hent_bytes(url):
    # Energinet afviser Pythons standard-User-Agent med 403. Et navngivet program er
    # også den ærlige afsender.
    anmodning = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(anmodning, timeout=TIMEOUT_SEKUNDER) as resp:
        return resp.read()


# ---------- Læs regnearket uden afhængigheder ----------

def _kolonne_nr(reference):
    """'AB12' -> 27 (A=1)."""
    bogstaver = re.match(r"[A-Z]+", reference).group(0)
    n = 0
    for b in bogstaver:
        n = n * 26 + (ord(b) - 64)
    return n


def _ark_sti(zf, arknavn):
    mappe = ET.fromstring(zf.read("xl/workbook.xml"))
    rid = next((a.get(f"{_REL_NS}id") for a in mappe.iter(f"{_NS}sheet")
                if a.get("name") == arknavn), None)
    if rid is None:
        raise ValueError(f"regnearket har intet ark der hedder {arknavn!r}")
    relationer = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
    maal = next(r.get("Target") for r in relationer if r.get("Id") == rid)
    return "xl/" + maal.lstrip("/").removeprefix("xl/")


def _faelles_tekster(zf):
    if "xl/sharedStrings.xml" not in zf.namelist():
        return []
    rod = ET.fromstring(zf.read("xl/sharedStrings.xml"))
    return ["".join(t.text or "" for t in si.iter(f"{_NS}t")) for si in rod.iter(f"{_NS}si")]


def laes_ark(xlsx, arknavn=ARK):
    """Arkets rækker som liste af dicts med overskrifterne som nøgler.

    xlsx: bytes eller sti. Kun standardbiblioteket: regnearket er 17 MB, men det
    ene ark er lille, og kun det læses."""
    kilde = xlsx if isinstance(xlsx, (str, os.PathLike)) else io.BytesIO(xlsx)
    with zipfile.ZipFile(kilde) as zf:
        tekster = _faelles_tekster(zf)
        raekker = []
        with zf.open(_ark_sti(zf, arknavn)) as f:
            for _, elem in ET.iterparse(f):
                if elem.tag != f"{_NS}row":
                    continue
                celler = {}
                for c in elem.iter(f"{_NS}c"):
                    v = c.find(f"{_NS}v")
                    if v is None or v.text is None:
                        continue
                    celler[_kolonne_nr(c.get("r"))] = (
                        tekster[int(v.text)] if c.get("t") == "s" else
                        v.text if c.get("t") in ("str", "inlineStr", "e") else float(v.text))
                raekker.append(celler)
                elem.clear()
    if not raekker:
        raise ValueError(f"arket {arknavn!r} er tomt")
    overskrifter = {n: t for n, t in raekker[0].items() if isinstance(t, str)}
    return [{overskrifter[n]: v for n, v in r.items() if n in overskrifter}
            for r in raekker[1:] if r]


# ---------- Udtræk og validering ----------

def udtraek(raekker):
    """{aar: {kommunekode: g CO2e/kWh}} efter KOLONNE.

    Stopper ved alt, der ikke ligner Energinets egen tabel: manglende kolonner,
    en kommune der ikke findes, et år uden alle 98 kommuner eller en værdi uden
    for rimelighedsgrænsen. Hellere en stoppet kørsel end et stille hul."""
    koder = {kode for kode, _, _ in KOMMUNER}
    for kolonne in ("År", "Nr", KOLONNE):
        if raekker and kolonne not in raekker[0]:
            raise ValueError(f"kolonnen {kolonne!r} findes ikke i arket. Har Energinet "
                             "omdøbt den, skal KOLONNE rettes, og metodesiden med.")
    ud = {}
    for r in raekker:
        aar, kode, v = r.get("År"), r.get("Nr"), r.get(KOLONNE)
        if aar is None or kode is None:
            continue
        kode = int(kode)
        if kode not in koder:
            raise ValueError(f"kommunekode {kode} i arket findes ikke blandt de 98 kommuner")
        if not isinstance(v, float) or not 0 <= v <= MAKS_G_PR_KWH:
            raise ValueError(f"{int(aar)}/{kode}: uventet værdi {v!r} i {KOLONNE}")
        ud.setdefault(str(int(aar)), {})[str(kode)] = v
    for aar, pr_kode in ud.items():
        mangler = sorted(koder - {int(k) for k in pr_kode})
        if mangler:
            raise ValueError(f"{aar}: arket mangler kommunerne {mangler}")
    if not ud:
        raise ValueError("arket indeholder ingen årgange")
    return ud


def byg_energinet(raekker, fil, hentet=None):
    """Filens indhold: kilde, metode og faktorerne pr. år og kommunekode."""
    aar = udtraek(raekker)
    return {
        "kilde": "Energinet, Miljødeklaration (årsgennemsnit)",
        "side": SIDE,
        "fil": fil,
        "ark": ARK,
        "kolonne": KOLONNE,
        "metode": METODE,
        "enhed": ENHED,
        "hentet": (hentet or datetime.date.today()).isoformat(),
        "aar": {a: aar[a] for a in sorted(aar)},
    }


def til_json(energinet):
    """Filens tekst: ét år pr. linje, så den årlige ændring er læsbar i en diff."""
    top = {k: v for k, v in energinet.items() if k != "aar"}
    linjer = [f"  {json.dumps(k)}: {json.dumps(v, ensure_ascii=False)}" for k, v in top.items()]
    aar = ",\n".join(
        f'    "{a}": {json.dumps(pr_kode, ensure_ascii=False)}'
        for a, pr_kode in energinet["aar"].items())
    linjer.append('  "aar": {\n' + aar + "\n  }")
    return "{\n" + ",\n".join(linjer) + "\n}\n"


def skriv(energinet, sti=ENERGINET_JSON_PATH):
    with open(sti, "w", encoding="utf-8") as f:
        f.write(til_json(energinet))
    return sti


# ---------- Brug i resten af pipelinen ----------

def laes(sti=ENERGINET_JSON_PATH):
    with open(sti, encoding="utf-8") as f:
        return json.load(f)


def faktorer_for_aar(energinet, aar):
    """{kommunekode (int): g CO2e/kWh} for ét år, eller {} hvis året ikke findes."""
    return {int(k): v for k, v in energinet["aar"].get(str(aar), {}).items()}


def beriger_husholdning(husholdning, energinet, aar):
    """Lægger kommunens el-faktor ind i hver kommunes husholdningspost som `el_faktor`.

    husholdning: {kommunekode: {...}} for ét år, som Klimaregnskabet leverer det.
    Returnerer en ny dict; kommuner uden faktor for året får None, så hullet ender
    som null i data.json og aldrig som nul.

    Samme funktion bruger build.py til det nyeste år og historik.py til hvert af de
    foregående, så faktoren i tabellen og i pilens serie er ét tal."""
    faktorer = faktorer_for_aar(energinet, aar)
    return {kode: {**h, "el_faktor": faktorer.get(int(kode))} for kode, h in husholdning.items()}


# ---------- Kørsel som script ----------

def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    kilde = argv[0] if argv else None
    if kilde is None:
        print("Finder regnearket på Energinets side...")
        kilde = find_xlsx_url(_hent_bytes(SIDE).decode("utf-8", errors="replace"))
    if re.match(r"https?://", kilde):
        print(f"Henter {kilde} ...")
        indhold = _hent_bytes(kilde)
        fil = kilde
    else:
        with open(kilde, "rb") as f:
            indhold = f.read()
        fil = os.path.basename(kilde)
    energinet = byg_energinet(laes_ark(indhold), fil)
    sti = skriv(energinet)
    aar = list(energinet["aar"])
    print(f"Skrev {os.path.normpath(sti)}: {aar[0]}-{aar[-1]}, "
          f"{len(next(iter(energinet['aar'].values())))} kommuner pr. år.")
    print("Det seneste år er foreløbigt, indtil Energinet udgiver de endelige tal i juni.")


if __name__ == "__main__":
    main()
