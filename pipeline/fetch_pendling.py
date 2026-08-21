"""Gennemsnitlig pendlingsafstand pr. kommune. Faktuelt tal, ingen omregning.

Kilde: Danmarks Statistik, tabel AFSTB4, "Gennemsnitlig pendlingsafstand
(ultimo november)" efter bopælsområde, socioøkonomisk status og køn.
https://www.statistikbanken.dk/AFSTB4

Modulet leverer km som DST opgør dem. Det omregner IKKE til bil-kilometer og
kalibrerer ikke mod noget. En tidligere version gjorde begge dele; det var en
metodisk beslutning uden kilde, og den er fjernet.

Hvis nogen senere vil opgøre kommunalt transportarbejde rigtigt, anbefaler
NIRAS (2024) s. 20, afsnit 4.2.6, DTU's Transportvaneundersøgelse, som kan
estimere privat transportarbejde på kommuneniveau fordelt på transportform.
Den kræver aftale om kommercielle vilkår og er ikke offentligt tilgængelig.
"""

import dst_client
from constants import PERIODER
from fetch_dst import _to_float

BASE = dst_client.DST_BASE_URL

REGIONSNAVNE = {
    "Region Hovedstaden": "Hovedstaden",
    "Region Sjælland": "Sjælland",
    "Region Syddanmark": "Syddanmark",
    "Region Midtjylland": "Midtjylland",
    "Region Nordjylland": "Nordjylland",
}


def fetch_pendlingsafstand():
    """{områdenavn: km} for land, regioner og kommuner.

    Regionsnavne normaliseres ("Region Sjælland" -> "Sjælland"), så de matcher
    kommuner.py. Kommunenavne står som DST skriver dem."""
    rows = dst_client.fetch(BASE, "AFSTB4", {
        "BOPOMR": "*",
        "SOCIO": "02",          # beskæftigede i alt
        "KØN": "TOT",
        "Tid": PERIODER["PENDLING_AAR"],
    })
    ud = {}
    for r in rows:
        if r["INDHOLD"] in dst_client.INGEN_DATA_MARKORER:
            continue
        omraade = r["BOPOMR"]
        ud[REGIONSNAVNE.get(omraade, omraade)] = _to_float(r["INDHOLD"])
    return ud
