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

KOMMUNENIVEAU. Afvigelsen beregnes for hver enkelt kommune, ikke kun pr.
region. Det giver reel differentiering - en regional værdi ville give alle 34
hovedstadskommuner samme transporttal og dermed ingen information overhovedet.
Spændet er stort: Vordingborg +58 %, Frederiksberg -43 %.

DEN KENDTE SKÆVHED, DER FØLGER MED. Pendling er kun arbejdsturen, og
sammenhængen med samlet bilkørsel er kun valideret regionalt. På kommuneniveau
er den ikke monoton i landlighed: landets 25 % tættest befolkede kommuner
pendler 16,8 km i snit, den midterste halvdel 26,9 km, og de 25 % tyndest
befolkede 26,1 km. Det er altså PENDLERBÆLTET, der pendler længst, ikke den
ægte udkant, hvor der ikke er noget at pendle til.

Samlet bilkørsel stiger formentlig monotont med landlighed, fordi alt bliver
længere væk - ikke kun arbejdet. Derfor undervurderer denne proxy sandsynligvis
perifere kommuner. Thisted er det tydeligste eksempel: +4,2 % kommunalt mod
+17,8 % for regionen. Skævheden er kendt, dokumenteret og skal stå ved tallet."""

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
    """Gennemsnitlig pendlingsafstand i km for land, regioner og kommuner.

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


def _afvigelse(km, land):
    return (km - land) / land


def beregn_bilkm_afvigelse(afstande):
    """Regional bil-km-afvigelse på DTU's målegrundlag.

    Rejser en fejl frem for at gætte, hvis ankerregionen mangler: uden den
    kan kalibreringen ikke sættes, og fire regioner ville få tal på et andet
    grundlag end det femte."""
    land = afstande.get("Hele landet")
    if not land:
        raise ValueError("AFSTB4 gav ingen landsværdi - kan ikke beregne afvigelser")

    raa = {
        region: _afvigelse(km, land)
        for region, km in afstande.items()
        if region in REGIONSNAVNE.values()
    }
    anker = raa.get(DTU_ANKERREGION)
    if not anker:
        raise ValueError(f"AFSTB4 gav ingen værdi for {DTU_ANKERREGION} - kalibreringen kan ikke sættes")

    faktor = DTU_NORDJYLLAND / anker
    ud = {region: dev * faktor for region, dev in raa.items()}
    ud[DTU_ANKERREGION] = DTU_NORDJYLLAND  # præcis DTU-værdi, ikke afrundet gennem faktoren
    return ud, faktor


def beregn_bilkm_afvigelse_kommune(afstande, faktor, kommuneliste):
    """{kommunekode: bil-km-afvigelse} på DTU's målegrundlag.

    Bruger samme kalibreringsfaktor som regionerne. Faktoren er udledt
    regionalt og anvendes her som en national skalering - den retter niveauet,
    ikke den kommunale spredning.

    Kommuner, AFSTB4 ikke har en værdi for, udelades, så motoren kan vise
    transporten som uoplyst frem for at gætte."""
    land = afstande.get("Hele landet")
    if not land:
        raise ValueError("AFSTB4 gav ingen landsværdi - kan ikke beregne afvigelser")
    ud = {}
    for kode, navn, _region in kommuneliste:
        km = afstande.get(navn)
        if km is None:
            continue
        ud[kode] = _afvigelse(km, land) * faktor
    return ud
