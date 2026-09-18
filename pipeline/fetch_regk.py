"""DST REGK11: kommunernes regnskaber på hovedkonti, pr. indbygger.

Ligger for sig selv og ikke i fetch_dst.py, fordi tabellen hentes i én
flerdimensionel forespørgsel pr. dranst - art, hovedkonto og år på én gang -
og fordi anlægsdelen hentes for fem år ad gangen. Se indkoeb.py for
afgrænsningen og for hvorfor der ikke beregnes ton."""

import dst_client
import indkoeb

BASE = dst_client.DST_BASE_URL

TABEL = "REGK11"

# Driftskonti og anlægskonti. Statsrefusion, renter, afdrag og finansiering er
# ikke indkøb og hentes ikke.
DRANST_DRIFT = "1"
DRANST_ANLAEG = "3"

# Kun de tre hovedkontoniveauer, modulet bruger: totalen, forsyningen der
# trækkes fra, og transporten der afgør færgeforbeholdet. At hente alle ti
# ville firedoble svaret uden at tilføje noget.
HOVEDKONTI = [indkoeb.HOVEDKONTO_IALT, indkoeb.HOVEDKONTO_FORSYNING,
              indkoeb.HOVEDKONTO_TRANSPORT]

# DST's id'er for de hovedkonti, HOVEDKONTI navngiver. Rækkefølgen følger
# HOVEDKONTI, så de to lister kan læses ved siden af hinanden.
HOVEDKONTO_ID = ["X", "1", "2"]

PRISENHED_PR_INDBYGGER = "INDL"


def fetch_indkoeb(dranst, aarene):
    """Henter indkøbsarterne fordelt på hovedkonto og år.

    Returnerer {områdenavn: {år: {art: {hovedkonto: kr. pr. indbygger}}}}.

    Beløb, DST markerer som manglende, udelades - de må ikke blive til nul.
    Negative beløb tages med, som de står: et negativt varekøb er en
    korrektion i regnskabet, ikke en manglende værdi."""
    raekker = dst_client.fetch(BASE, TABEL, {
        "OMRÅDE": "*",
        "FUNK1": ",".join(HOVEDKONTO_ID),
        "DRANST": dranst,
        "ART": ",".join(indkoeb.ARTER_INDKOEB),
        "PRISENHED": PRISENHED_PR_INDBYGGER,
        "Tid": ",".join(aarene),
    })
    ud = {}
    for r in raekker:
        if r["INDHOLD"] in dst_client.INGEN_DATA_MARKORER:
            continue
        art = _art_id(r["ART"])
        if art is None:
            continue
        (ud.setdefault(r["OMRÅDE"], {})
           .setdefault(r["TID"], {})
           .setdefault(art, {})[r["FUNK1"]]) = float(r["INDHOLD"].replace(",", "."))
    return ud


def _art_id(tekst):
    """DST's artstekst tilbage til artskoden: "2.2 Fødevarer" -> "22".

    Tabellen svarer med den lange tekst, mens indkoeb.py arbejder med koderne.
    En art, teksten ikke kan opløses til, springes over frem for at blive
    talt med under et forkert navn."""
    nummer = tekst.split(" ", 1)[0].replace(".", "")
    return nummer if nummer in indkoeb.ARTER_INDKOEB else None
