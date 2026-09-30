"""Hentefunktionerne har to udgaver, nutidens og serien, og de må ikke kunne
afvige fra hinanden.

Serien kalder samme forespørgsel med flere perioder og kører nøgletallets egen
udregning på hver periodes rækker. Testene her holder fast, at den udregning er
den samme: giver serien for den nuværende periode ikke det samme som nutidens
hentning, kan pilen beskrive et andet tal end det, kommunesiden viser."""
import urllib.request
from unittest.mock import MagicMock, patch

import dst_client
import fetch_dst
import fetch_forbrug
import fetch_klimaregnskabet as kr
import fetch_pendling
import indkoeb
import osei_owusu
from constants import PERIODER


def _r(tid, **felter):
    return {"TID": tid, **felter}


def _kald_med(rows_pr_kald):
    """Et dst_client.fetch, der svarer med rækkerne for de perioder, der bedes om."""
    def fetch(base, tabel, params):
        bedt = set(str(params["Tid"]).split(","))
        return [r for r in rows_pr_kald if r["TID"] in bedt]
    return fetch


# ---------- dst_client ----------

def test_opdel_paa_tid():
    rows = [_r("2023", x=1), _r("2024", x=2), _r("2024", x=3)]
    ud = dst_client.opdel_paa_tid(rows)
    assert ud == {"2023": [rows[0]], "2024": [rows[1], rows[2]]}


def test_opdel_paa_tid_kan_samle_kvartaler_til_aar():
    rows = [_r("2024K1", x=1), _r("2024K4", x=2), _r("2025K1", x=3)]
    ud = dst_client.opdel_paa_tid(rows, lambda tid: tid[:4])
    assert sorted(ud) == ["2024", "2025"] and len(ud["2024"]) == 2


def test_fetch_i_bidder_henter_bid_for_bid_og_lægger_svarene_sammen():
    kald = []

    def fetch(base, tabel, params):
        kald.append(params["Tid"])
        return [_r(t) for t in params["Tid"].split(",")]

    with patch.object(dst_client, "fetch", fetch):
        rows = dst_client.fetch_i_bidder("b", "T", {"X": "*", "Tid": None},
                                         ["2020", "2021", "2022", "2023", "2024"], 2)
    assert kald == ["2020,2021", "2022,2023", "2024"]
    assert [r["TID"] for r in rows] == ["2020", "2021", "2022", "2023", "2024"]


def test_tabel_perioder_laeser_tidsvariablen_fra_tableinfo():
    info = b'{"variables": [{"id": "OMRADE", "values": [{"id": "000"}]}, ' \
           b'{"id": "Tid", "time": true, "values": [{"id": "2018M01"}, {"id": "2018M02"}]}]}'
    svar = MagicMock()
    svar.__enter__.return_value = svar
    svar.read.return_value = info
    with patch.object(urllib.request, "urlopen", return_value=svar):
        assert dst_client.tabel_perioder("https://x", "BIL54") == ["2018M01", "2018M02"]


# ---------- Serie og nutid er samme tal ----------

def test_indkomst():
    rows = [_r("2023", **{"OMRÅDE": "Thisted", "INDHOLD": "240000"}),
            _r("2024", **{"OMRÅDE": "Thisted", "INDHOLD": "252934"}),
            _r("2024", **{"OMRÅDE": "Hele landet", "INDHOLD": "287682"})]
    with patch.object(dst_client, "fetch", _kald_med(rows)):
        nu = fetch_dst.fetch_indkomst()
        serie = fetch_dst.fetch_indkomst_serie(["2023", "2024"])
    assert serie["2024"] == nu
    assert serie["2023"] == {"Thisted": 240000}


def test_folketal_seneste_kvartal_er_det_samme_som_nutidens():
    rows = [_r("2026K1", **{"OMRÅDE": "Thisted", "INDHOLD": "42572"}),
            _r("2025K1", **{"OMRÅDE": "Thisted", "INDHOLD": "42698"})]
    with patch.object(dst_client, "fetch", _kald_med(rows)):
        nu, forrige = fetch_dst.fetch_folketal()
        serie = fetch_dst.fetch_folketal_serie(["2025K1", "2026K1"])
    assert serie["2026K1"] == nu and serie["2025K1"] == forrige


def test_byggeri_er_summen_af_aarets_kvartaler_uden_kollegier():
    rows = [_r("2024K1", **{"OMRÅDE": "Thisted", "ANVEND": "Parcelhuse", "INDHOLD": "10"}),
            _r("2024K2", **{"OMRÅDE": "Thisted", "ANVEND": "Etageboliger", "INDHOLD": "5"}),
            _r("2024K2", **{"OMRÅDE": "Thisted", "ANVEND": "Kollegier", "INDHOLD": "50"}),
            _r("2023K1", **{"OMRÅDE": "Thisted", "ANVEND": "Parcelhuse", "INDHOLD": "7"}),
            _r("2023K4", **{"OMRÅDE": "Thisted", "ANVEND": "Parcelhuse", "INDHOLD": "8"})]

    def fetch(base, tabel, params):
        bedt = set(params["Tid"].split(","))
        return [r for r in rows if r["TID"] in bedt]

    with patch.object(dst_client, "fetch", fetch):
        nu = fetch_dst.fetch_byggeri()
        serie = fetch_dst.fetch_byggeri_serie(["2023", "2024"])
    assert serie["2024"] == nu == {"Thisted": 15}
    assert serie["2023"] == {"Thisted": 15}


def test_byggeriets_serie_beder_om_alle_fire_kvartaler_i_hvert_aar():
    kaldt = {}

    def fetch(base, tabel, params):
        kaldt["tid"] = params["Tid"]
        return []

    with patch.object(dst_client, "fetch", fetch):
        fetch_dst.fetch_byggeri_serie(["2023", "2024"])
    assert kaldt["tid"] == "2023K1,2023K2,2023K3,2023K4,2024K1,2024K2,2024K3,2024K4"


def test_biler_i_serien_er_husholdningernes_og_samme_udtraek_som_nutidens():
    def raekke(tid, driv, n):
        return _r(tid, **{"OMRÅDE": "Thisted", "DRIV": driv, "INDHOLD": str(n)})

    nu_tid = PERIODER["BILER_MAANED"]
    rows = [raekke(nu_tid, "Drivmidler i alt", 23656), raekke(nu_tid, "El", 3404),
            raekke(nu_tid, "Pluginhybrid", 946), raekke(nu_tid, "Diesel", 7114),
            raekke(nu_tid, "Benzin", 12180), raekke("2025M01", "Benzin", 12500)]
    kaldt = []

    def fetch(base, tabel, params):
        kaldt.append(params)
        bedt = set(params["Tid"].split(","))
        return [r for r in rows if r["TID"] in bedt]

    with patch.object(dst_client, "fetch", fetch):
        nu = fetch_dst.fetch_biler()
        serie = fetch_dst.fetch_biler_serie(["2025M01", nu_tid])
    assert serie[nu_tid] == nu
    assert serie["2025M01"][4] == {"Thisted": 12500}
    assert all(p["BRUG"] == "1100" for p in kaldt), "kun husholdningernes biler"


def test_boligareal_midtpunkter_i_serien():
    rows = [_r("2025", **{"AMT": "Thisted", "BOLIGSTØR": "100-124 kvm", "INDHOLD": "10"}),
            _r("2025", **{"AMT": "Thisted", "BOLIGSTØR": "150-174 kvm", "INDHOLD": "5"}),
            _r("2024", **{"AMT": "Thisted", "BOLIGSTØR": "100-124 kvm", "INDHOLD": "10"}),
            _r("2024", **{"AMT": "Greve", "BOLIGSTØR": "100-124 kvm", "INDHOLD": "-"})]
    with patch.object(dst_client, "fetch", _kald_med(rows)):
        nu = fetch_dst.fetch_boligareal()
        serie = fetch_dst.fetch_boligareal_serie(["2024", "2025"])
    assert serie["2025"] == nu
    assert serie["2024"] == {"Thisted": 112.0}, "et tal, der mangler, er ikke nul"


def test_boliger_type_opvarmning_og_affald_i_serien_er_som_nutidens():
    bol = [_r("2025", **{"OMRÅDE": "Thisted", "ANVENDELSE": "Parcel/Stuehuse", "INDHOLD": "100"}),
           _r("2025", **{"OMRÅDE": "Thisted", "ANVENDELSE": "Etageboliger", "INDHOLD": "40"})]
    opv = [_r("2026", **{"AMT": "Thisted", "OPVARMNING": "Centralvarme med olie", "INDHOLD": "20"}),
           _r("2026", **{"AMT": "Thisted", "OPVARMNING": "Fjernvarme", "INDHOLD": "100"})]
    aff = [_r("2023", **{"KOMGRP": "Thisted", "BNØGLE": "Husholdningsaffald (kg. pr. indbygger)",
                         "INDHOLD": "508"})]
    with patch.object(dst_client, "fetch", _kald_med(bol)):
        assert fetch_dst.fetch_boliger_type_serie(["2025"])["2025"] == fetch_dst.fetch_boliger_type()
    with patch.object(dst_client, "fetch", _kald_med(opv)):
        assert fetch_dst.fetch_opvarmning_serie(["2026"])["2026"] == fetch_dst.fetch_opvarmning()
    with patch.object(dst_client, "fetch", _kald_med(aff)):
        assert fetch_dst.fetch_affald_serie(["2023"])["2023"] == fetch_dst.fetch_affald()


def test_fritidshuse_hentes_ét_aar_ad_gangen():
    kaldt = []

    def fetch(base, tabel, params):
        kaldt.append(params["Tid"])
        return [_r(params["Tid"], **{"OMRÅDE": "Thisted", "INDHOLD": "3789"})]

    with patch.object(dst_client, "fetch", fetch):
        serie = fetch_dst.fetch_fritidshuse_serie(["2023", "2024", "2025"])
    assert kaldt == ["2023", "2024", "2025"], (
        "to år ad gangen gav HTTP 400 REQUEST-LIMIT mod den levende tabel")
    assert serie["2025"] == {"Thisted": 3789}


def test_pendling_i_serien_har_regionsnavne_som_nutidens():
    rows = [_r("2024", **{"BOPOMR": "Region Nordjylland", "INDHOLD": "26,8"}),
            _r("2024", **{"BOPOMR": "Thisted", "INDHOLD": "23,6"}),
            _r("2023", **{"BOPOMR": "Thisted", "INDHOLD": "23,1"})]
    with patch.object(dst_client, "fetch", _kald_med(rows)):
        nu = fetch_pendling.fetch_pendlingsafstand()
        serie = fetch_pendling.fetch_pendlingsafstand_serie(["2023", "2024"])
    assert serie["2024"] == nu and "Nordjylland" in nu
    assert serie["2023"] == {"Thisted": 23.1}


def test_indkomst_i_alt_og_priser():
    rows = [_r("2024", **{"OMRÅDE": "Thisted", "INDHOLD": "10748.4"}),
            _r("2023", **{"OMRÅDE": "Thisted", "INDHOLD": "10300"})]
    with patch.object(dst_client, "fetch", _kald_med(rows)):
        assert fetch_forbrug.fetch_indkomst_i_alt_serie(["2023", "2024"])["2024"] \
            == fetch_forbrug.fetch_indkomst_i_alt("2024")
    priser = [_r("2024", INDHOLD="8188"), _r("2025", INDHOLD=".."), _r("2023", INDHOLD="8077")]
    with patch.object(dst_client, "fetch", _kald_med(priser)):
        assert fetch_dst.fetch_priser(["2023", "2024", "2025"]) == {"2023": 8077.0, "2024": 8188.0}


# ---------- Sammensætninger, som nutid og historik deler ----------

def test_indkoeb_felter_gennemsnit_er_kun_over_vinduets_aar():
    ialt, fors = indkoeb.HOVEDKONTO_IALT, indkoeb.HOVEDKONTO_FORSYNING
    aktuelt = {"22": {ialt: 585.0, fors: 0.0}, "23": {ialt: 787.0}}
    anlaeg = {str(a): {"22": {ialt: 1000.0 * (a - 2010)}} for a in range(2011, 2026)}
    f = indkoeb.indkoeb_felter(aktuelt, anlaeg, indkoeb.anlaeg_vindue("2025"))
    assert f["drift_pr_indb"] == 585.0 + 787.0
    assert f["foedevarer_pr_indb"] == 585.0 and f["braendsel_pr_indb"] == 787.0
    assert f["anlaeg_pr_indb"] == sum(1000.0 * (a - 2010) for a in range(2021, 2026)) / 5


def test_indkoeb_felter_uden_anlaeg_er_none_og_ikke_nul():
    f = indkoeb.indkoeb_felter({"22": {indkoeb.HOVEDKONTO_IALT: 585.0}}, None, ["2025"])
    assert f["anlaeg_pr_indb"] is None


def test_forbrug_for_aar_er_den_gamle_sammensaetning():
    udjaevnet = {"Region Nordjylland": 0.95, "Region Hovedstaden": 1.05}
    regioner = {"Nordjylland": "Region Nordjylland", "Hovedstaden": "Region Hovedstaden"}
    indkomst = {"Thisted": 10_000_000.0, "København": 40_000_000.0}
    folketal = {"Thisted": 42000, "København": 640000}
    region = {"Thisted": "Nordjylland", "København": "Hovedstaden"}

    ny = osei_owusu.forbrug_for_aar(udjaevnet, 0.08, regioner, indkomst, folketal, region)

    skaleret = osei_owusu.skaler_kvotient(udjaevnet, 0.08)
    kvotient = {"Nordjylland": skaleret["Region Nordjylland"],
                "Hovedstaden": skaleret["Region Hovedstaden"]}
    gammel = osei_owusu.forbrug_pr_indbygger(kvotient, indkomst, folketal, region)
    gammel["Hele landet"] = osei_owusu.landets_forbrug_pr_indbygger(gammel, folketal)
    assert ny == gammel


# ---------- Klimaregnskabet ----------

def test_landets_husholdningstal_er_summer_og_fossil_andel_er_vaegtet():
    hush = {1: {"co2_ton": 100.0, "energi_tj": 10.0, "fossil_andel": 0.5,
                "el_tj": 4.0, "el_co2_ton": 40.0, "fjernvarme_tj": 3.0, "fjernvarme_co2_ton": 30.0},
            2: {"co2_ton": 50.0, "energi_tj": 30.0, "fossil_andel": 0.1,
                "el_tj": 6.0, "el_co2_ton": 60.0, "fjernvarme_tj": 0.0, "fjernvarme_co2_ton": 0.0}}
    land = kr.sammenlaeg_land_husholdning(hush)
    assert land["husholdning_co2_ton"] == 150.0
    assert land["husholdning_energi_tj"] == 40.0
    # Vægtet på energi, ikke gennemsnit af to andele: (10*0,5 + 30*0,1) / 40.
    assert abs(land["husholdning_fossil_andel"] - 0.2) < 1e-12
    assert land["husholdning_fjernvarme_tj"] == 3.0
    assert set(land) == set(kr.KR_FELTER.values())


def test_landets_husholdningstal_uden_data_er_none():
    land = kr.sammenlaeg_land_husholdning({})
    assert all(v is None for v in land.values())


def test_serie_tager_allerede_hentede_aar_med_uaendret_og_kalder_gem_for_de_nye():
    kaldt, gemt = [], []
    noegle = "x"

    def hent(kommuneliste, aar, noegle_, sov):
        kaldt.append(aar)
        return {1: {"co2_ton": float(aar)}}

    with patch.object(kr, "fetch_husholdninger", hent):
        ud = kr.fetch_husholdninger_serie(
            [(1, "A", "R")], ["2023", "2024"], noegle=noegle,
            allerede={"2024": {1: {"co2_ton": 1.0}}}, gem=lambda a, r: gemt.append(a))
    assert kaldt == ["2023"], "2024 var allerede hentet"
    assert ud["2024"] == {1: {"co2_ton": 1.0}}
    assert gemt == ["2023"]


def test_serie_uden_noegle_rejser_value_error(monkeypatch):
    monkeypatch.setattr(kr, "_api_noegle", lambda: None)
    try:
        kr.fetch_husholdninger_serie([(1, "A", "R")], ["2024"])
    except ValueError:
        return
    raise AssertionError("uden nøgle skal ValueError rejses, så build kan udgive uden felterne")
