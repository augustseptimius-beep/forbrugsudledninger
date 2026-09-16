"""De to DST-tabeller bag fødevareforbruget: forbrugsundersøgelsen (FU17) og
familiernes indkomster (INDKF111).

De ligger for sig selv og ikke i fetch_dst.py, fordi de ikke hører til motorens
oprindelige ni tabeller, og fordi FU17 hentes for ti år ad gangen - se
osei_owusu.py for hvorfor kvotienten skal udjævnes."""

import dst_client
from constants import PERIODER

BASE = dst_client.DST_BASE_URL

# 01.1 Fødevarer i DST's forbrugsgruppe-hierarki. Ikke 01, som også rummer
# ikke-alkoholiske drikkevarer, og ikke 00, som er hele forbruget.
KONSUMGRUPPE_FOEDEVARER = "01.1"


def _tal(raekker, navnekolonne):
    return {r[navnekolonne]: float(r["INDHOLD"].replace(",", "."))
            for r in raekker if r["INDHOLD"] not in dst_client.INGEN_DATA_MARKORER}


def fetch_foedevareforbrug(aar):
    """FU17: forbrug på fødevarer, kr. pr. husstand, efter region.

    Returnerer {områdenavn: kr.}. Området "Gennemsnitshusstand" er landet."""
    return _tal(dst_client.fetch(BASE, "FU17", {
        "KONSUMGRP": KONSUMGRUPPE_FOEDEVARER, "REGION": "*",
        "PRISENHED": "AARPRIS", "Tid": aar,
    }), "REGION")


def fetch_indkomst_pr_familie(aar):
    """INDKF111: gennemsnitlig disponibel indkomst pr. familie, kr.

    Nævneren i regionens forbrugskvotient. Samme enhed som FU17's tæller er
    husstand, ikke familie - DST's to enheder er ikke identiske, men det er
    den sammenstilling artiklen selv bruger, og kvotienten regnes relativt til
    landet, så en systematisk forskel mellem de to enheder går ud."""
    return _tal(dst_client.fetch(BASE, "INDKF111", {
        "OMRÅDE": "*", "ENHED": "115", "FAMTYP": "FAIA",
        "INDKOMSTTYPE": "100", "Tid": aar,
    }), "OMRÅDE")


def fetch_indkomst_i_alt(aar):
    """INDKF111: samlet disponibel indkomst, 1.000 kr., pr. område.

    Beløbet og ikke gennemsnittet, fordi kommunens samlede forbrug skal skaleres
    med kommunens samlede indkomst (ligning S10)."""
    return _tal(dst_client.fetch(BASE, "INDKF111", {
        "OMRÅDE": "*", "ENHED": "110", "FAMTYP": "FAIA",
        "INDKOMSTTYPE": "100", "Tid": aar,
    }), "OMRÅDE")


def fetch_kvotient_vindue(aarene):
    """Henter tæller og nævner for hvert år i vinduet.

    Returnerer {år: (forbrug, indkomst)}. Et år, der ikke kan hentes, springes
    over - udjævningen tåler et hul, og en enkelt manglende årgang må ikke
    vælte hele nøgletallet."""
    ud = {}
    for aar in aarene:
        try:
            ud[aar] = (fetch_foedevareforbrug(aar), fetch_indkomst_pr_familie(aar))
        except Exception as fejl:
            print(f"  ADVARSEL: kunne ikke hente forbrugskvotient for {aar} ({fejl}).")
    return ud


# KOMMUNER bruger de korte regionsnavne; DST's to tabeller bruger de lange.
REGION_DST = {
    "Hovedstaden": "Region Hovedstaden",
    "Sjælland": "Region Sjælland",
    "Syddanmark": "Region Syddanmark",
    "Midtjylland": "Region Midtjylland",
    "Nordjylland": "Region Nordjylland",
}
