"""Henter de 11 DST-tabeller, motorens datakontrakt kræver. Hver funktion
returnerer et dict {kommunenavn: værdi} (eller et par af dicts, hvis tabellen
dækker to felter). DST's tal bruger komma som decimalseparator i nogle CSV-felter
(fx areal), så numeriske felter uden for INDHOLD-kolonnen parses med _to_float()."""

import dst_client
from constants import PERIODER

BASE = dst_client.DST_BASE_URL


def _to_float(s):
    return float(s.replace(",", "."))


def fetch_folketal():
    """Returnerer (folketal_nu, folketal_forrige), begge {navn: int}."""
    rows_nu = dst_client.fetch(BASE, "FOLK1A", {
        "OMRÅDE": "*", "KØN": "TOT", "ALDER": "IALT", "CIVILSTAND": "TOT",
        "Tid": PERIODER["FOLK_KVARTAL"],
    })
    rows_forrige = dst_client.fetch(BASE, "FOLK1A", {
        "OMRÅDE": "*", "KØN": "TOT", "ALDER": "IALT", "CIVILSTAND": "TOT",
        "Tid": PERIODER["FOLK_KVARTAL_FORRIGE"],
    })
    return dst_client.sum_by(rows_nu, ["OMRÅDE"]), dst_client.sum_by(rows_forrige, ["OMRÅDE"])


def fetch_areal():
    """Returnerer {navn: areal_km2 (float)}."""
    rows = dst_client.fetch(BASE, "ARE207", {"OMRÅDE": "*", "Tid": PERIODER["AREAL_AAR"]})
    return {r["OMRÅDE"]: _to_float(r["INDHOLD"]) for r in rows
            if r["INDHOLD"] not in dst_client.INGEN_DATA_MARKORER}


def fetch_indkomst():
    """Returnerer {navn: disponibel_indkomst (int, kr.)}."""
    rows = dst_client.fetch(BASE, "INDKP101", {
        "OMRÅDE": "*", "ENHED": "116", "KOEN": "MOK", "INDKOMSTTYPE": "100",
        "Tid": PERIODER["INDKOMST_AAR"],
    })
    return dst_client.sum_by(rows, ["OMRÅDE"])


def fetch_formue():
    """Returnerer (gennemsnit, median), begge {navn: kr. (int)}."""
    rows = dst_client.fetch(BASE, "FORMUE12", {
        "FORM1": "FGNF2020", "ENHED": "200,215", "OMRÅDE": "*",
        "ALDER": "1802", "POPU": "5005", "Tid": PERIODER["FORMUE_AAR"],
    })
    ok = lambda r: r["INDHOLD"] not in dst_client.INGEN_DATA_MARKORER
    gns = {r["OMRÅDE"]: int(r["INDHOLD"]) for r in rows if "Gennemsnit" in r["ENHED"] and ok(r)}
    median = {r["OMRÅDE"]: int(r["INDHOLD"]) for r in rows if "Median" in r["ENHED"] and ok(r)}
    return gns, median


def fetch_gini():
    """Returnerer {navn: gini (float)}. Bemærk: tabellens områdevariabel hedder
    KOMMUNEDK, ikke OMRÅDE."""
    rows = dst_client.fetch(BASE, "IFOR41", {
        "ULLIG": "70", "KOMMUNEDK": "*", "Tid": PERIODER["GINI_AAR"],
    })
    return {r["KOMMUNEDK"]: _to_float(r["INDHOLD"]) for r in rows
            if r["INDHOLD"] not in dst_client.INGEN_DATA_MARKORER}


# Midpoint-antagelse for BOL103's størrelsesintervaller. Egen beregning (som i v5-
# regnearket), dokumenteret som antagelse. Giver ca. 1-2 m² afvigelse fra v5's manuelle
# tal for de yderste, åbne intervaller ("- 50 kvm", "175 kvm og derover") - forventet.
_BOLIGSTOR_MIDPUNKT = {
    "- 50 kvm": 40, "50-74 kvm": 62, "75-99 kvm": 87, "100-124 kvm": 112,
    "125-149 kvm": 137, "150-174 kvm": 162, "175 kvm og derover": 195,
}


def fetch_boliger_type():
    """Returnerer (parcel, raekke, etage), hver {navn: antal boliger (int)}.
    UDLFORH/EJER/OPFØRELSESÅR har ingen total-VÆRDIKODE, men har elimination=True i
    BOL101's metadata - de UDELADES derfor helt fra forespørgslen (ligesom ANTVÆR/
    HUSSTØR i fetch_boligareal()), så DST's API selv summerer over dem. Wildcarding
    alle tre samtidig (i stedet for at udelade dem) overskrider DST's 1-mio.-
    cellegrænse ved OMRÅDE=* (verificeret: gav HTTP 400 REQUEST-LIMIT live)."""
    rows = dst_client.fetch(BASE, "BOL101", {
        "OMRÅDE": "*", "BEBO": "1000", "ANVENDELSE": "125,130,140",
        "Tid": PERIODER["BOLIGER_AAR"],
    })
    sums = dst_client.sum_by(rows, ["OMRÅDE", "ANVENDELSE"])
    parcel = {navn: v for (navn, anv), v in sums.items() if anv == "Parcel/Stuehuse"}
    raekke = {navn: v for (navn, anv), v in sums.items() if anv == "Række-, kæde- og dobbelthuse"}
    etage = {navn: v for (navn, anv), v in sums.items() if anv == "Etageboliger"}
    return parcel, raekke, etage


def fetch_boligareal():
    """Returnerer {navn: gennemsnitligt boligareal i m² (float)} via midpoint-metoden.
    IKKE wildcard ANTVÆR/HUSSTØR - de er irrelevante her og blæser cellegrænsen op."""
    rows = dst_client.fetch(BASE, "BOL103", {
        "AMT": "*", "BEBO": "1000", "ANVENDELSE": "125,130,140",
        "BOLIGSTØR": "*", "Tid": PERIODER["BOLIGER_AAR"],
    })
    sum_areal, sum_antal = {}, {}
    for r in rows:
        midt = _BOLIGSTOR_MIDPUNKT.get(r["BOLIGSTØR"])
        if midt is None:
            continue  # "Uoplyst" har ingen kendt størrelse - udelades
        if r["INDHOLD"] in dst_client.INGEN_DATA_MARKORER:
            continue  # ingen data for denne kommune/interval - ikke nul
        n = int(r["INDHOLD"])  # uventet talformat skal fejle højlydt, ikke forsvinde
        navn = r["AMT"]
        sum_areal[navn] = sum_areal.get(navn, 0) + n * midt
        sum_antal[navn] = sum_antal.get(navn, 0) + n
    return {navn: sum_areal[navn] / sum_antal[navn] for navn in sum_antal if sum_antal[navn] > 0}


# ANVEND-koder der IKKE er almindelige boliger - udelades fra byggeaktivitet, jf. v5's
# facit-tal (verificeret: inkl. Kollegier gav 153 for Thisted 2024 i stedet for korrekt 103).
_BYGGERI_IKKE_BOLIG = {"Kollegier", "Døgninstitutioner", "IKKE-FORDELT, UOPLYST"}


def fetch_opvarmning():
    """Returnerer (ialt, olie, naturgas), hver {navn: antal boliger (int)}.
    Wildcarder ANVENDELSE, fordi opv_boliger_ialt skal dække ALLE boligtyper."""
    rows = dst_client.fetch(BASE, "BOL102", {
        "AMT": "*", "BEBO": "1000", "ANVENDELSE": "*", "OPVARMNING": "*",
        "Tid": PERIODER["OPVARMNING_AAR"],
    })
    ialt = dst_client.sum_by(rows, ["AMT"])
    per_type = dst_client.sum_by(rows, ["AMT", "OPVARMNING"])
    olie = {navn: v for (navn, opv), v in per_type.items() if opv == "Centralvarme med olie"}
    naturgas = {navn: v for (navn, opv), v in per_type.items() if opv == "Centralvarme m naturgas"}
    return ialt, olie, naturgas


def fetch_byggeri():
    """Returnerer {navn: fuldførte boliger seneste år (int)}. Udelader kollegier/
    døgninstitutioner - se _BYGGERI_IKKE_BOLIG."""
    aar = PERIODER["BYGGERI_AAR"]
    kvartaler = ",".join(f"{aar}K{k}" for k in range(1, 5))
    rows = dst_client.fetch(BASE, "BYGV33", {
        "OMRÅDE": "*", "BYGFASE": "3", "ANVEND": "*", "BYGHERRE": "*",
        "Tid": kvartaler,
    })
    relevante = [r for r in rows if r["ANVEND"] not in _BYGGERI_IKKE_BOLIG]
    return dst_client.sum_by(relevante, ["OMRÅDE"])


def fetch_biler():
    """Returnerer (biler_ialt, el, plugin, diesel), hver {navn: antal (int)}."""
    rows = dst_client.fetch(BASE, "BIL54", {
        "OMRÅDE": "*", "BILTYPE": "4000101002", "BRUG": "1000",
        "DRIV": "20200,20225,20232,20210", "Tid": PERIODER["BILER_MAANED"],
    })
    per_type = dst_client.sum_by(rows, ["OMRÅDE", "DRIV"])
    def _uddrag(driv_navn):
        return {navn: v for (navn, driv), v in per_type.items() if driv == driv_navn}
    return (_uddrag("Drivmidler i alt"), _uddrag("El"), _uddrag("Pluginhybrid"), _uddrag("Diesel"))


def fetch_affald():
    """Returnerer (kg_pr_indbygger, genanvendelse_pct), begge {navn: tal (int)}.
    LABY25's KOMGRP-variabel bruger kommunenavne direkte (samme som OMRÅDE i andre
    tabeller), plus nogle kommunegruppe-aggregater vi ikke bruger."""
    rows = dst_client.fetch(BASE, "LABY25", {
        "KOMGRP": "*", "BNØGLE": "*", "Tid": PERIODER["AFFALD_AAR"],
    })
    per_type = dst_client.sum_by(rows, ["KOMGRP", "BNØGLE"])
    kg = {navn: v for (navn, n), v in per_type.items() if n == "Husholdningsaffald (kg. pr. indbygger)"}
    pct = {navn: v for (navn, n), v in per_type.items() if n == "Husholdningsaffald indsamlet til genanvendelse (pct.)"}
    return kg, pct


def fetch_all_dst():
    """Kører alle 11 DST-hentninger og samler dem i et {navn: {felt: værdi}}-dict,
    med feltnavne der matcher motorens datakontrakt 1:1. Kommuner uden data for et
    givent felt får det simpelthen ikke sat her - build.py fylder None ind for
    manglende felter, jf. spec §5.4."""
    folketal, folketal_forrige = fetch_folketal()
    areal = fetch_areal()
    indkomst = fetch_indkomst()
    formue_gns, formue_median = fetch_formue()
    gini = fetch_gini()
    parcel, raekke, etage = fetch_boliger_type()
    boligareal = fetch_boligareal()
    opv_ialt, opv_olie, opv_naturgas = fetch_opvarmning()
    byggeri = fetch_byggeri()
    biler, biler_el, biler_plugin, biler_diesel = fetch_biler()
    affald_kg, genanvendelse_pct = fetch_affald()

    # Kommune-universet defineres ud fra tre kernetabeller, IKKE en union af alle 11 -
    # LABY25's KOMGRP indeholder også kommunegruppe-aggregater (fx "Hovedstadskommuner"),
    # som ellers ville lække ind som falske "kommuner" i outputtet.
    alle_navne = set(folketal) | set(indkomst) | set(areal)
    resultat = {}
    for navn in alle_navne:
        resultat[navn] = {
            "folketal": folketal.get(navn), "folketal_forrige": folketal_forrige.get(navn),
            "areal": areal.get(navn), "disp_indkomst": indkomst.get(navn),
            "formue_gns": formue_gns.get(navn), "formue_median": formue_median.get(navn),
            "gini": gini.get(navn),
            "boliger_parcel": parcel.get(navn), "boliger_raekke": raekke.get(navn),
            "boliger_etage": etage.get(navn), "boligareal": boligareal.get(navn),
            "byggeri": byggeri.get(navn),
            "biler": biler.get(navn), "biler_el": biler_el.get(navn),
            "biler_plugin": biler_plugin.get(navn), "biler_diesel": biler_diesel.get(navn),
            "opv_boliger_ialt": opv_ialt.get(navn), "opv_olie": opv_olie.get(navn),
            "opv_naturgas": opv_naturgas.get(navn),
            "affald_kg": affald_kg.get(navn), "genanvendelse_pct": genanvendelse_pct.get(navn),
        }
    return resultat
