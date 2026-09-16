"""Fordelingsnøglen fra Osei-Owusu et al. (2020), ligning S9-S11.

Testene dækker regnestykket, ikke tallene: tallene kommer fra DST ved kørsel.
Det, der skal holdes fast, er at kvotienten regnes relativt til landet, at
udjævningen tåler et hul, at et manglende input giver None og ikke nul, og at
modulet ikke begynder at regne udledning."""
import build
import osei_owusu as oo


FORBRUG = {"Gennemsnitshusstand": 37786.0, "Region Hovedstaden": 39689.0,
           "Region Nordjylland": 34294.0}
INDKOMST = {"Hele landet": 457099.0, "Region Hovedstaden": 495634.0,
            "Region Nordjylland": 419614.0}


def test_vinduet_slutter_paa_seneste_aar_og_er_ti_langt():
    v = oo.kvotient_vindue("2024")
    assert v[-1] == "2024" and v[0] == "2015" and len(v) == oo.KVOTIENT_VINDUE_AAR


def test_kvotienten_maales_mod_landet_samme_aar():
    # Kvotienten falder for alle regioner over tid. Måles den ikke mod landets
    # eget år, indgår den fælles trend i nøgletallet, og udjævningen over ti år
    # ville blande to forskellige niveauer.
    k = oo.relativ_kvotient(FORBRUG, INDKOMST, "2024")
    land = FORBRUG["Gennemsnitshusstand"] / INDKOMST["Hele landet"]
    assert abs(k["Region Hovedstaden"]
               - (FORBRUG["Region Hovedstaden"] / INDKOMST["Region Hovedstaden"]) / land) < 1e-12
    assert set(k) == {"Region Hovedstaden", "Region Nordjylland"}


def test_landets_egen_kvotient_er_praecis_en():
    k = oo.relativ_kvotient({"Gennemsnitshusstand": 100.0, "R": 100.0},
                            {"Hele landet": 1000.0, "R": 1000.0}, "2024")
    assert abs(k["R"] - 1.0) < 1e-12


def test_udjaevning_er_gennemsnittet_over_vinduet():
    u = oo.udjaevn_kvotient({"2023": {"R": 1.0}, "2024": {"R": 1.2}})
    assert abs(u["R"] - 1.1) < 1e-12


def test_udjaevning_taaler_at_en_region_mangler_et_aar():
    # Et hul må ikke tælle som nul - så ville en manglende årgang trække
    # regionen kunstigt ned.
    u = oo.udjaevn_kvotient({"2023": {"R": 1.0, "S": 2.0}, "2024": {"R": 1.2}})
    assert abs(u["R"] - 1.1) < 1e-12 and abs(u["S"] - 2.0) < 1e-12


def test_forbrug_skalerer_med_indkomst_og_kvotient():
    # 1.000 kr.-enheden i INDKF111 ganges op, så resultatet er kroner pr. person.
    ud = oo.forbrug_pr_indbygger({"Nordjylland": 0.5}, {"Thisted": 9_098_580},
                                 {"Thisted": 42_572}, {"Thisted": "Nordjylland"})
    assert abs(ud["Thisted"] - (0.5 * 9_098_580 * 1000) / 42_572) < 1e-6


def test_manglende_input_giver_none_ikke_nul():
    r = {"A": "Nordjylland", "B": "Nordjylland", "C": "Ukendt"}
    ud = oo.forbrug_pr_indbygger({"Nordjylland": 1.0}, {"A": 100, "B": None},
                                 {"A": 10, "B": 10, "C": 10}, r)
    assert ud["A"] is not None
    assert ud["B"] is None, "manglende indkomst skal give None"
    assert ud["C"] is None, "ukendt region skal give None"


def test_landet_vejes_med_folketal_ikke_som_kommunegennemsnit():
    # Ellers ville Læsø veje som København. Samme regel som husholdningernes
    # fossile andel i build.py.
    land = oo.landets_forbrug_pr_indbygger({"Stor": 100.0, "Lille": 200.0},
                                           {"Stor": 99, "Lille": 1})
    assert abs(land - (100.0 * 99 + 200.0 * 1) / 100) < 1e-9


def test_landet_ser_bort_fra_kommuner_uden_tal():
    land = oo.landets_forbrug_pr_indbygger({"A": 100.0, "B": None}, {"A": 10, "B": 90})
    assert abs(land - 100.0) < 1e-9


def test_landet_er_none_naar_intet_kan_beregnes():
    assert oo.landets_forbrug_pr_indbygger({"A": None}, {"A": 10}) is None


def test_feltet_naar_kommuneposten():
    post = build.saml_kommune_post("Thisted", {}, kode=787, region="Nordjylland",
                                   foedevareforbrug={"Thisted": 38_400.0})
    assert post["foedevare_forbrug_pr_indb"] == 38_400.0


def test_manglende_kilde_giver_none_ikke_nul():
    post = build.saml_kommune_post("Thisted", {}, kode=787, region="Nordjylland")
    assert post["foedevare_forbrug_pr_indb"] is None


def test_modulet_regner_ikke_udledning():
    # Værktøjet beregner intet kommunalt aftryk. Artiklens ton-tal er bevidst
    # ikke afskrevet - se modulets docstring.
    for navn in dir(oo):
        assert "TON" not in navn.upper() and "CO2" not in navn.upper(), navn
