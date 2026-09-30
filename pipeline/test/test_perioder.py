"""Periodearitmetikken bag historikken. Kvartaler og måneder skal flytte sig ét
år ad gangen og beholde deres kvartal eller måned - ellers sammenlignes januar
med december, og en sæsonforskel ligner en udvikling."""
import perioder


def test_aar_af():
    assert perioder.aar_af("2024") == 2024
    assert perioder.aar_af("2026K1") == 2026
    assert perioder.aar_af("2026M01") == 2026


def test_kvartal_og_maaned_beholdes_naar_der_gaas_et_aar_tilbage():
    assert perioder.trin_tilbage("2026K1") == "2025K1"
    assert perioder.trin_tilbage("2026M01") == "2025M01"
    assert perioder.trin_tilbage("2024") == "2023"


def test_flere_aar_tilbage():
    assert perioder.trin_tilbage("2026K1", 10) == "2016K1"
    assert perioder.trin_tilbage("2024", 0) == "2024"


def test_kaeden_er_aeldst_foerst_og_slutter_paa_den_nuvaerende_periode():
    kaede = perioder.periodekaede("2026M01", 10)
    assert kaede[0] == "2016M01" and kaede[-1] == "2026M01"
    assert len(kaede) == 11, "ti år tilbage giver elleve punkter, det nuværende med"


def test_kaeden_har_ingen_huller_og_ingen_dubletter():
    kaede = perioder.periodekaede("2024", 10)
    assert kaede == [str(a) for a in range(2014, 2025)]


def test_kvartaler_i_et_aar():
    assert perioder.kvartaler("2024") == ["2024K1", "2024K2", "2024K3", "2024K4"]
    assert perioder.kvartaler(2024) == ["2024K1", "2024K2", "2024K3", "2024K4"]
