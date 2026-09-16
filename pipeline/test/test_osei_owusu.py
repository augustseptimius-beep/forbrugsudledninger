"""Afskriften fra Osei-Owusu et al. (2020) skal dække præcis de 98 kommuner,
summere til hele fordelingen, og komme ind i kommuneposterne som andel plus
folketal - aldrig som et ton-tal."""
import build
import osei_owusu
from kommuner import KOMMUNER


def test_alle_98_kommuner_har_en_andel():
    navne = {navn for _, navn, _ in KOMMUNER}
    afskrift = set(osei_owusu.FOEDEVARE_FORBRUGSANDEL)
    assert afskrift == navne, (
        f"kun i afskriften: {sorted(afskrift - navne)}; "
        f"kun i kommunelisten: {sorted(navne - afskrift)}")


def test_andelene_summerer_til_hele_fordelingen():
    # Kommunernes andele er en fordeling af landets fødevareforbrug og skal
    # derfor summere til 1. Tolerancen er afrundingen i kildens regneark.
    assert abs(sum(osei_owusu.FOEDEVARE_FORBRUGSANDEL.values()) - 1.0) < 1e-9


def test_ingen_andel_er_nul_eller_negativ():
    for navn, andel in osei_owusu.FOEDEVARE_FORBRUGSANDEL.items():
        assert andel > 0, f"{navn} har andelen {andel}"


def test_folketallet_hentes_for_kildens_eget_aar():
    # Deles 2011-forbrug med nutidens indbyggertal, sammenlignes to forskellige
    # år. Kvartalet skal ligge i kildens opgørelsesår.
    assert osei_owusu.FOLK_KVARTAL.startswith(str(osei_owusu.OPGOERELSESAAR))


def test_landet_faar_hele_fordelingen():
    post = build.saml_kommune_post("Hele landet", {}, foedevare_folketal={"Hele landet": 5560628})
    assert post["foedevare_forbrugsandel"] == 1.0
    assert post["foedevare_folketal"] == 5560628


def test_kommunen_faar_sin_egen_andel():
    post = build.saml_kommune_post("Thisted", {}, kode=787, region="Nordjylland",
                                   foedevare_folketal={"Thisted": 44751})
    assert post["foedevare_forbrugsandel"] == osei_owusu.FOEDEVARE_FORBRUGSANDEL["Thisted"]
    assert post["foedevare_folketal"] == 44751


def test_manglende_folketal_giver_none_ikke_nul():
    # Samme regel som resten af pipelinen: et hul skal stå som hul, ikke som
    # et nul, der ville læses som "ingen fødevareudledning".
    post = build.saml_kommune_post("Thisted", {}, kode=787, region="Nordjylland")
    assert post["foedevare_folketal"] is None


def test_afskriften_indeholder_intet_ton_tal():
    # Værktøjet beregner intet kommunalt aftryk. Dukker der et ton-tal op i
    # modulet, er den grænse overskredet - se osei_owusu.py.
    for navn in dir(osei_owusu):
        assert "TON" not in navn.upper(), f"{navn} ligner et ton-tal"
