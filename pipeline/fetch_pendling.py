"""Regional bil-km-afvigelse, udledt af DST's pendlingsafstande (AFSTB4).

BAGGRUND. Metoden hviler på DTU's transportvaneundersøgelse, som opgør bil-km
pr. person pr. region. transportvaner.dk har intet offentligt API, og kun
Nordjylland blev slået op manuelt (+17,8424 %). De fire øvrige regioner stod
derfor uden tal, og transporteffekten kunne ikke opgøres for 87 af 98 kommuner.

AFSTB4 opgør gennemsnitlig pendlingsafstand i km efter bopælsområde, hentes
via API og dækker alle regioner. Den måler ikke det samme som DTU - pendling
er kun arbejdsturen, ikke al bilkørsel - men på REGIONALT niveau følger de to
mål hinanden tæt. På det ene punkt, hvor de kan sammenlignes, giver AFSTB4
Nordjylland +18,58 % mod DTU's +17,84 %, altså 0,74 procentpoint fra hinanden.

KALIBRERING. De fire manglende regioner udledes som AFSTB4-afvigelsen ganget
med en faktor, der er sat, så Nordjylland rammer DTU's værdi præcist. Det
holder alle fem regioner på DTU's målegrundlag frem for at blande to
måleenheder, og Nordjyllands golden-testværdi er uændret pr. konstruktion.

HVORFOR IKKE KOMMUNENIVEAU. AFSTB4 findes for alle 98 kommuner, og det er
fristende at droppe den regionale proxy helt. Det ville være en forringelse
forklædt som en forbedring: Thisted har kun +4,4 % pendlingsafstand mod
regionens +18,6 %, fordi folk i en stor landkommune arbejder lokalt, men
kører langt til indkøb, service og fritid. Pendling fanger arbejdsturen og
misser resten, og netop resten er det, der adskiller land fra by. Sammenhængen
er kun valideret på regionalt niveau, og opløsningen holdes derfor der."""

import dst_client
from constants import PERIODER
from fetch_dst import _to_float

BASE = dst_client.DST_BASE_URL

# DTU Transportvaneundersøgelsen, udtræk juli 2026. Det eneste direkte
# målte punkt, og dermed kalibreringens anker.
DTU_NORDJYLLAND = 0.178423236514523
DTU_ANKERREGION = "Nordjylland"

REGIONSNAVNE = {
    "Region Hovedstaden": "Hovedstaden",
    "Region Sjælland": "Sjælland",
    "Region Syddanmark": "Syddanmark",
    "Region Midtjylland": "Midtjylland",
    "Region Nordjylland": "Nordjylland",
}


def fetch_pendlingsafstand():
    """Gennemsnitlig pendlingsafstand i km for land og de fem regioner."""
    rows = dst_client.fetch(BASE, "AFSTB4", {
        "BOPOMR": "*",
        "SOCIO": "02",          # beskæftigede i alt
        "KØN": "TOT",
        "Tid": PERIODER["PENDLING_AAR"],
    })
    ud = {}
    for r in rows:
        omraade = r["BOPOMR"]
        if omraade != "Hele landet" and omraade not in REGIONSNAVNE:
            continue
        if r["INDHOLD"] in dst_client.INGEN_DATA_MARKORER:
            continue
        ud[REGIONSNAVNE.get(omraade, omraade)] = _to_float(r["INDHOLD"])
    return ud


def beregn_bilkm_afvigelse(afstande):
    """Regional bil-km-afvigelse på DTU's målegrundlag.

    Rejser en fejl frem for at gætte, hvis ankerregionen mangler: uden den
    kan kalibreringen ikke sættes, og fire regioner ville få tal på et andet
    grundlag end det femte."""
    land = afstande.get("Hele landet")
    if not land:
        raise ValueError("AFSTB4 gav ingen landsværdi - kan ikke beregne afvigelser")

    raa = {
        region: (km - land) / land
        for region, km in afstande.items()
        if region != "Hele landet"
    }
    anker = raa.get(DTU_ANKERREGION)
    if not anker:
        raise ValueError(f"AFSTB4 gav ingen værdi for {DTU_ANKERREGION} - kalibreringen kan ikke sættes")

    faktor = DTU_NORDJYLLAND / anker
    ud = {region: dev * faktor for region, dev in raa.items()}
    ud[DTU_ANKERREGION] = DTU_NORDJYLLAND  # præcis DTU-værdi, ikke afrundet gennem faktoren
    return ud, faktor
