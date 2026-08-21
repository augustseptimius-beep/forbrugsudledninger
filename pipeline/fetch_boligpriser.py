"""Finans Danmarks BM010 (boligmarkedsstatistik). Kører på samme PX-Web-infrastruktur
som DST, under /v1/s20/ i stedet for /v1/. Kommunekoderne (OMR20) er de samme
3-cifrede DST-koder som i alle andre tabeller - verificeret, ikke en separat kodeliste."""

import dst_client
from constants import PERIODER

# BM010's OMR20-variabel bruger stadig fortidens retskrivning "Århus" - DST (og dermed
# kommuner.py og resten af pipelinen) bruger den officielle stavemåde "Aarhus" siden
# retskrivningsændringen i 2011. Verificeret direkte mod den levende API: det er den
# ENESTE afvigelse blandt alle 98 kommunenavne mellem BM010 og DST/kommuner.py. Uden
# denne normalisering ville Danmarks næststørste kommune få boligpris_m2=None.
_NAVN_NORMALISERING = {"Århus": "Aarhus"}


def fetch_boligpris():
    """Returnerer {navn: kr. pr. m² (int)} for parcel-/rækkehus, realiserede handler."""
    rows = dst_client.fetch(dst_client.FINANS_DANMARK_BASE_URL, "BM010", {
        "OMR20": "*", "EJKAT20": "1", "PRIS20": "REAL",
        "Tid": PERIODER["BOLIGPRIS_KVARTAL"],
    })
    resultat = dst_client.sum_by(rows, ["OMR20"])
    # Værdien er en PRIS, ikke en tælling - sum_by er kun korrekt, fordi forespørgslen
    # (ét kvartal, én ejendomskategori, én pristype) giver præcis én række pr. område.
    # Fejl højlydt, hvis det invariant nogensinde brydes (fx to kvartaler i Tid), i
    # stedet for stille at summere priser.
    raekker_med_data = [r for r in rows if r["INDHOLD"] not in dst_client.INGEN_DATA_MARKORER]
    if len(raekker_med_data) != len(resultat):
        raise ValueError(
            "BM010 gav flere rækker pr. område - kvadratmeterpriser må ikke summeres. "
            "Tjek at Tid/EJKAT20/PRIS20 hver peger på præcis én værdi.")
    for gammelt_navn, nyt_navn in _NAVN_NORMALISERING.items():
        if gammelt_navn in resultat:
            resultat[nyt_navn] = resultat.pop(gammelt_navn)
    return resultat
