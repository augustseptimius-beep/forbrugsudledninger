"""Historikken bag udviklingspilene. Intet netværk.

Det, der skal holdes fast, er tre ting. At historikkens seneste punkt er det tal,
nøgletallet viser i dag - ellers kan pilen beskrive et andet tal end siden. At et
tal, der mangler, står som None og aldrig bliver til nul. Og at kilder, der er
yngre end vinduet, giver en kortere række og ikke en fejl."""
import json

import pytest

import build
import constants
import fetch_dst
import fetch_forbrug
import fetch_klimaregnskabet as kr
import fetch_pendling
import fetch_regk
import historik
import indkoeb
import osei_owusu
import sources
from constants import PERIODER
from kommuner import KOMMUNER
from perioder import trin_tilbage

THISTED = 787


# ---------- Felter og perioder hænger sammen med resten af pipelinen ----------

def test_historikkens_felter_er_felter_i_data_json():
    assert set(historik.HISTORIK_FELTER) <= set(build.FORVENTEDE_FELTER)


def test_hvert_felts_periode_er_en_kendt_noegle():
    for felt, noegle in historik.FELT_PERIODE.items():
        assert noegle in PERIODER, f"{felt} peger på ukendt periode {noegle}"


def test_feltets_periode_er_den_kilden_oplyser_paa_metodesiden():
    """Metodesiden viser kildens periode. Har historikken en anden periode for det
    samme felt, siger siden én årgang og grafen en anden."""
    ejer = {}
    for kilde in sources.KILDER:
        for felt in kilde["felter"]:
            ejer[felt] = kilde
    for felt, noegle in historik.FELT_PERIODE.items():
        if felt == "folketal_forrige":
            # FOLK1A fører nuværende kvartal; forrige år er en anden periode af
            # samme tabel og har sin egen nøgle.
            assert ejer[felt]["id"] == "FOLK1A"
            assert noegle == "FOLK_KVARTAL_FORRIGE"
            continue
        assert ejer[felt]["periode_noegle"] == noegle, felt


def test_priserne_daekker_det_nyeste_kronenoegletal():
    nyeste = max(int(PERIODER[n]) for n in ("INDKOMST_AAR", "FORBRUG_AAR", "REGNSKAB_AAR"))
    assert int(PERIODER["PRIS_AAR"]) >= nyeste, (
        "PRIS_AAR skal være mindst lige så ny som de kronenøgletal, der prisjusteres")


def test_kr_felterne_er_dem_saml_kommune_post_skriver():
    """Historikken oversætter Klimaregnskabets felter med KR_FELTER, data.json med
    saml_kommune_post. Skrev de to forskelligt, ville historikken stå med et andet
    felt end det, siden læser."""
    h = {kilde: float(i + 1) for i, kilde in enumerate(kr.KR_FELTER)}
    post = build.saml_kommune_post("Thisted", {}, kode=THISTED, region="Nordjylland",
                                   husholdning={THISTED: h})
    for kilde, felt in kr.KR_FELTER.items():
        assert post[felt] == h[kilde], felt
    assert list(kr.KR_FELTER.values()) == [f for f in post if f.startswith("husholdning_")]


def test_kaeden_ender_paa_feltets_nuvaerende_periode():
    for felt in historik.HISTORIK_FELTER:
        kaede = historik.felt_kaede(felt)
        assert kaede[-1] == PERIODER[historik.FELT_PERIODE[felt]]
        assert len(kaede) == historik.HISTORIK_AAR + 1


def test_biler_er_januar_mod_januar_og_folketal_er_1_januar_mod_1_januar():
    assert historik.felt_kaede("biler")[:2] == ["2016M01", "2017M01"]
    assert all(p.endswith("K1") for p in historik.felt_kaede("folketal"))


# ---------- saml ----------

def _serie(felt, omraade, tal):
    """{felt: {omraade: {periode: v}}} med tallene lagt på kædens sidste led."""
    kaede = historik.felt_kaede(felt)
    return {felt: {omraade: {kaede[len(kaede) - len(tal) + i]: v for i, v in enumerate(tal)}}}


def test_saml_giver_elleve_led_pr_felt_og_omraade():
    h = historik.saml(_serie("biler", THISTED, [90, 95, 100]), {"2024": 8188.0})
    assert len(h["kommuner"]["787"]["biler"]) == 11
    assert len(h["land"]["biler"]) == 11
    assert h["vindue"] == 10


def test_et_tal_der_mangler_staar_som_none_og_er_aldrig_nul():
    h = historik.saml(_serie("biler", THISTED, [90, 95, 100]), {})
    raekke = h["kommuner"]["787"]["biler"]
    assert raekke[-3:] == [90, 95, 100]
    assert raekke[:8] == [None] * 8, "kilden er kortere end vinduet - hullet er ikke nul"
    assert 0 not in raekke


def test_alle_98_kommuner_og_landet_er_med_for_alle_felter():
    h = historik.saml({}, {})
    assert len(h["kommuner"]) == 98
    for raekker in h["kommuner"].values():
        assert set(raekker) == set(historik.HISTORIK_FELTER)
    assert set(h["land"]) == set(historik.HISTORIK_FELTER)


def test_et_felt_uden_serie_staar_i_mangler():
    h = historik.saml(_serie("biler", THISTED, [90, 95, 100]), {})
    assert "biler" not in h["mangler"]
    assert "byggeri" in h["mangler"]


def test_et_felt_med_kun_ét_punkt_har_ingen_serie():
    h = historik.saml(_serie("biler", THISTED, [100]), {})
    assert "biler" in h["mangler"], "ét punkt er ikke en udvikling"


def test_priserne_ligger_ved_siden_af_i_stigende_orden():
    h = historik.saml({}, {"2025": 8343.0, "2024": 8188.0})
    assert list(h["priser"]["aar"]) == ["2024", "2025"]
    assert h["priser"]["kilde"] == "PRIS8"


def test_feltets_periode_og_aar_staar_i_filen():
    h = historik.saml({}, {})
    assert h["felter"]["folketal"] == {"periode": PERIODER["FOLK_KVARTAL"],
                                        "aar": int(PERIODER["FOLK_KVARTAL"][:4])}
    assert h["felter"]["byggeri"]["aar"] == int(PERIODER["BYGGERI_AAR"])


# ---------- afstem_med_data ----------

def _data(**felter):
    """data.json med samme felter og værdier i alle områder."""
    post = {"navn": "x", **felter}
    return {"land": dict(post), "kommuner": [{**post, "kode": kode} for kode, _, _ in KOMMUNER]}


def _historik_med(felt, nu, tidligere=None):
    tidligere = tidligere if tidligere is not None else 90
    serier = {felt: {"land": {}, **{kode: {} for kode, _, _ in KOMMUNER}}}
    kaede = historik.felt_kaede(felt)
    for omraade in serier[felt]:
        serier[felt][omraade] = {kaede[-2]: tidligere, kaede[-1]: nu}
    return historik.saml(serier, {})


def test_seneste_punkt_lig_data_json_giver_ingen_fejl():
    h = _historik_med("biler", 100)
    historik.afstem_med_data(h, _data(biler=100), {"biler"})


def test_float_stoej_erstattes_af_data_jsons_egen_vaerdi():
    """En anden Python-version summerer flydende tal på en anden måde. Forskellen
    er én enhed i sidste decimal, og så skal data.json's tal stå, så de to er
    bitvis ens og en test kan sammenligne med ==."""
    facit = 20512.17931627623
    stoej = 20512.179316276233
    assert stoej != facit
    h = _historik_med("biler", stoej)
    historik.afstem_med_data(h, _data(biler=facit), {"biler"})
    assert h["kommuner"]["787"]["biler"][-1] == facit
    assert h["land"]["biler"][-1] == facit


def test_en_reel_forskel_stopper_koerslen():
    h = _historik_med("biler", 101)
    with pytest.raises(historik.HistorikFejl) as fejl:
        historik.afstem_med_data(h, _data(biler=100), {"biler"})
    assert "biler" in str(fejl.value)


def test_et_tal_der_kun_findes_ét_sted_stopper_koerslen():
    h = historik.saml({}, {})
    with pytest.raises(historik.HistorikFejl):
        historik.afstem_med_data(h, _data(biler=100), {"biler"})


def test_et_felt_der_ikke_er_hentet_faar_sit_seneste_punkt_fra_data_json():
    """Klimaregnskabet uden nøgle: data.json har tallet, historikken har ingen
    tidligere år. Filen står stadig som ét billede, og feltet står i mangler."""
    h = historik.saml({}, {})
    historik.afstem_med_data(h, _data(husholdning_co2_ton=5.5), set())
    assert h["kommuner"]["787"]["husholdning_co2_ton"][-1] == 5.5
    assert h["kommuner"]["787"]["husholdning_co2_ton"][:-1] == [None] * 10
    assert "husholdning_co2_ton" in h["mangler"]


def test_manglende_tal_i_data_json_forbliver_tomme():
    h = historik.saml({}, {})
    historik.afstem_med_data(h, _data(affald_kg=None), {"affald_kg"})
    assert h["kommuner"]["787"]["affald_kg"][-1] is None


# ---------- Skrivning ----------

def test_filen_kan_laeses_som_json_og_giver_de_samme_tal():
    h = _historik_med("biler", 100.5)
    tekst = historik.til_json(h)
    ind = json.loads(tekst)
    assert ind["kommuner"]["787"]["biler"] == h["kommuner"]["787"]["biler"]
    assert ind["land"]["biler"][-1] == 100.5
    assert ind["felter"]["biler"]["periode"] == PERIODER["BILER_MAANED"]


def test_hver_raekke_staar_paa_én_linje_saa_en_diff_kan_laeses():
    tekst = historik.til_json(_historik_med("biler", 100))
    linjer = [l for l in tekst.splitlines() if l.strip().startswith('"biler"')]
    assert len(linjer) == 99 + 1, "98 kommuner og landet, hver ét felt på én linje"


def test_heltal_skrives_uden_decimaler_og_hul_som_null():
    assert historik._tal(6860.0) == "6860"
    assert historik._tal(6860) == "6860"
    assert historik._tal(0.5) == "0.5"
    assert historik._tal(None) == "null"


def test_et_ugyldigt_tal_kommer_aldrig_ind_i_filen():
    for v in (float("nan"), float("inf"), True):
        with pytest.raises(ValueError):
            historik._tal(v)


def test_floats_gaar_uden_tab_gennem_filen():
    for v in (0.1 + 0.2, 26425.385297888, 131.2950835888812, 1 / 3):
        assert json.loads(historik._tal(v)) == v


# ---------- Ét år ad gangen: kilder, der er yngre end vinduet ----------

def test_perioder_skaeres_til_det_tabellen_har():
    kaede = historik.felt_kaede("biler")
    tilgaengelig = [f"{a}M{m:02d}" for a in range(2018, 2027) for m in (1, 2)]
    valgt = historik._skaer(kaede, tilgaengelig)
    assert valgt[0] == "2018M01" and valgt[-1] == "2026M01" and len(valgt) == 9


def _stille_hentninger(monkeypatch, tabel_perioder):
    """Erstatter alle DST-hentninger med optagere, der svarer med tomme serier."""
    kald = {}

    def optag(navn):
        def f(perioder):
            kald[navn] = list(perioder)
            return {}
        return f

    for navn in ("folketal", "indkomst", "boliger_type", "fritidshuse", "boligareal",
                 "opvarmning", "byggeri", "biler", "affald"):
        monkeypatch.setattr(fetch_dst, f"fetch_{navn}_serie", optag(navn))
    monkeypatch.setattr(fetch_pendling, "fetch_pendlingsafstand_serie", optag("pendling"))
    monkeypatch.setattr(historik.dst_client, "tabel_perioder",
                        lambda base, tabel: tabel_perioder(tabel))
    return kald


def test_hentningen_beder_kun_om_perioder_tabellen_har(monkeypatch):
    def perioder(tabel):
        if tabel == "BIL54":
            return [f"{a}M01" for a in range(2018, 2027)]
        if tabel == "BYGV33":
            return [q for a in range(2006, 2025) for q in (f"{a}K1", f"{a}K2", f"{a}K3", f"{a}K4")]
        return [str(a) for a in range(2007, 2027)] + [f"{a}K1" for a in range(2008, 2027)]

    kald = _stille_hentninger(monkeypatch, perioder)
    historik.hent_dst()
    assert kald["biler"][0] == "2018M01" and kald["biler"][-1] == "2026M01"
    assert kald["indkomst"] == [str(a) for a in range(2014, 2025)]
    assert kald["folketal"][0] == "2015K1" and kald["folketal"][-1] == "2026K1"


def test_byggeri_udelader_et_aar_uden_alle_fire_kvartaler(monkeypatch):
    def perioder(tabel):
        if tabel == "BYGV33":
            # 2014 mangler K4: en halv sum ville ligne et fald.
            return ([f"2014K{k}" for k in (1, 2, 3)]
                    + [f"{a}K{k}" for a in range(2015, 2025) for k in (1, 2, 3, 4)])
        return [str(a) for a in range(2007, 2027)] + [f"{a}K1" for a in range(2008, 2027)] \
            + [f"{a}M01" for a in range(2018, 2027)]

    kald = _stille_hentninger(monkeypatch, perioder)
    historik.hent_dst()
    assert kald["byggeri"] == [str(a) for a in range(2015, 2025)]


# ---------- Kommunens indkøb: samme funktion som det nyeste år ----------

def _art(ialt, forsyning=0.0):
    return {indkoeb.HOVEDKONTO_IALT: ialt, indkoeb.HOVEDKONTO_FORSYNING: forsyning}


def _indkoeb_svar(monkeypatch, drift, anlaeg):
    monkeypatch.setattr(historik.dst_client, "tabel_perioder",
                        lambda base, tabel: [str(a) for a in range(2007, 2026)])
    kald = []

    def hent(dranst, aarene):
        kald.append((dranst, list(aarene)))
        return drift if dranst == fetch_regk.DRANST_DRIFT else anlaeg

    monkeypatch.setattr(fetch_regk, "fetch_indkoeb", hent)
    return kald


def test_indkoebets_historik_bruger_indkoeb_felter_paa_hvert_aar(monkeypatch):
    drift = {"Thisted": {str(a): {"22": _art(500.0 + a - 2015), "23": _art(700.0)}
                         for a in range(2015, 2026)}}
    anlaeg = {"Thisted": {str(a): {"22": _art(1000.0 * (a - 2010))}
                          for a in range(2011, 2026)}}
    kald = _indkoeb_svar(monkeypatch, drift, anlaeg)
    ud = historik.hent_indkoeb()

    for aar in ("2025", "2024", "2015"):
        forventet = indkoeb.indkoeb_felter(
            drift["Thisted"][aar], anlaeg["Thisted"], indkoeb.anlaeg_vindue(aar))
        assert ud["indkoeb_drift_pr_indb"][THISTED][aar] == forventet["drift_pr_indb"]
        assert ud["indkoeb_anlaeg_pr_indb"][THISTED][aar] == forventet["anlaeg_pr_indb"]
        assert ud["indkoeb_foedevarer_pr_indb"][THISTED][aar] == forventet["foedevarer_pr_indb"]
        assert ud["indkoeb_braendsel_pr_indb"][THISTED][aar] == forventet["braendsel_pr_indb"]

    # Anlægget for 2025 er gennemsnittet af 2021-2025, ikke af hele rækken.
    assert ud["indkoeb_anlaeg_pr_indb"][THISTED]["2025"] == pytest.approx(
        sum(1000.0 * (a - 2010) for a in range(2021, 2026)) / 5)
    # Det ældste anlægsvindue rækker fire år længere tilbage end kæden.
    assert kald[1][1][0] == "2011" and kald[0][1][0] == "2015"


def test_indkoebets_aar_uden_tal_faar_ingen_vaerdi_og_ikke_nul(monkeypatch):
    drift = {"Thisted": {"2025": {"22": _art(500.0)}}}
    _indkoeb_svar(monkeypatch, drift, {"Thisted": {}})
    ud = historik.hent_indkoeb()
    assert "2024" not in ud["indkoeb_drift_pr_indb"][THISTED]
    # Anlæg uden et eneste år er None og udelades - ikke 0.
    assert THISTED not in ud.get("indkoeb_anlaeg_pr_indb", {})


# ---------- Fødevareforbruget ----------

FORBRUG_REGIONER = fetch_forbrug.REGION_DST


def _foedevare_grundlag(monkeypatch, aar_fra=2015):
    aarene = [str(a) for a in range(aar_fra, 2025)]
    raa = {a: ({"Gennemsnitshusstand": 40000.0 - 100 * (int(a) - 2015),
                "Region Nordjylland": 36000.0, "Region Hovedstaden": 44000.0,
                "Region Sjælland": 40000.0, "Region Syddanmark": 39000.0,
                "Region Midtjylland": 38000.0},
               {"Hele landet": 500000.0 + 10000 * (int(a) - 2015),
                "Region Nordjylland": 450000.0, "Region Hovedstaden": 550000.0,
                "Region Sjælland": 480000.0, "Region Syddanmark": 470000.0,
                "Region Midtjylland": 490000.0}) for a in aarene}
    monkeypatch.setattr(fetch_forbrug, "fetch_kvotient_vindue", lambda vindue: raa)
    monkeypatch.setattr(historik.dst_client, "tabel_perioder",
                        lambda base, tabel: [str(a) for a in range(1991, 2025)])
    indkomst = {str(a): {"Thisted": 10_000_000.0 + 100_000 * (a - 2014), "Hele landet": 9.0e8}
                for a in range(2014, 2025)}
    monkeypatch.setattr(fetch_forbrug, "fetch_indkomst_i_alt_serie",
                        lambda aarene: {a: indkomst[a] for a in aarene if a in indkomst})
    folketal = {trin_tilbage("2026K1", k): {"Thisted": 42000 + 100 * k, "Hele landet": 6_000_000}
                for k in range(0, 11)}
    return raa, indkomst, folketal


def test_foedevareforbruget_for_det_nyeste_aar_er_forbrug_for_aar(monkeypatch):
    raa, indkomst, folketal = _foedevare_grundlag(monkeypatch)
    ud = historik.hent_foedevare(folketal)

    udjaevnet = osei_owusu.udjaevn_kvotient({
        a: osei_owusu.relativ_kvotient(f, i, a) for a, (f, i) in raa.items()})
    forventet = osei_owusu.forbrug_for_aar(
        udjaevnet, osei_owusu.landets_kvotient(*raa["2024"]), FORBRUG_REGIONER,
        indkomst["2024"], folketal["2026K1"],
        {navn: region for _, navn, region in KOMMUNER})
    assert ud["foedevare_forbrug_pr_indb"][THISTED]["2024"] == forventet["Thisted"]


def test_foedevareforbruget_deles_med_folketallet_flyttet_lige_langt_tilbage(monkeypatch):
    """Indkomsten er fra 2024 og folketallet fra 2026K1. To år tidligere er det
    2022 og 2024K1 - ikke 2022 og 2026K1."""
    raa, indkomst, folketal = _foedevare_grundlag(monkeypatch)
    ud = historik.hent_foedevare(folketal)
    v24 = ud["foedevare_forbrug_pr_indb"][THISTED]["2024"]
    v22 = ud["foedevare_forbrug_pr_indb"][THISTED]["2022"]
    k24, k22 = osei_owusu.landets_kvotient(*raa["2024"]), osei_owusu.landets_kvotient(*raa["2022"])
    forventet_forhold = (k22 * indkomst["2022"]["Thisted"] / folketal["2024K1"]["Thisted"]) / \
                        (k24 * indkomst["2024"]["Thisted"] / folketal["2026K1"]["Thisted"])
    assert v22 / v24 == pytest.approx(forventet_forhold)


def test_regionens_udjaevnede_placering_er_den_samme_i_alle_aar(monkeypatch):
    """Ellers ville ældre år stå på et kortere og mere ustabilt gennemsnit."""
    raa, indkomst, folketal = _foedevare_grundlag(monkeypatch)
    ud = historik.hent_foedevare(folketal)
    pr_aar = ud["foedevare_forbrug_pr_indb"][THISTED]
    for aar, v in pr_aar.items():
        k = osei_owusu.landets_kvotient(*raa[aar])
        i = indkomst[aar]["Thisted"]
        f = folketal[trin_tilbage("2026K1", 2024 - int(aar))]["Thisted"]
        udjaevnet = osei_owusu.udjaevn_kvotient({
            a: osei_owusu.relativ_kvotient(fo, ik, a) for a, (fo, ik) in raa.items()})
        assert v == pytest.approx(k * udjaevnet["Region Nordjylland"] * i * 1000 / f)


def test_forbrugsundersoegelsen_har_kun_ti_aar_saa_ellevte_punkt_mangler(monkeypatch):
    _, _, folketal = _foedevare_grundlag(monkeypatch)
    ud = historik.hent_foedevare(folketal)
    assert "2014" not in ud["foedevare_forbrug_pr_indb"][THISTED]
    assert "2015" in ud["foedevare_forbrug_pr_indb"][THISTED]


def test_foedevareforbruget_uden_en_eneste_aargang_rejser_frem_for_at_opfinde(monkeypatch):
    monkeypatch.setattr(fetch_forbrug, "fetch_kvotient_vindue", lambda vindue: {})
    with pytest.raises(RuntimeError):
        historik.hent_foedevare({})


# ---------- Klimaregnskabet ----------

def _kr_raekker(faktor):
    return [
        {"kategori": "Husholdninger", "undertype_3": "Fjernvarme", "værdi": 100.0 * faktor},
        {"kategori": "Husholdninger", "undertype_3": "Naturgas", "værdi": 20.0 * faktor},
        {"kategori": "Husholdninger", "undertype_3": "El til andet", "værdi": 50.0 * faktor},
        {"kategori": "Erhverv ekskl. fremstillingsvirksomhed", "undertype_3": "Kul",
         "værdi": 9999.0},
    ]


def _kr_api(monkeypatch, tomme_aar=(), faldende_aar=()):
    kald = []
    monkeypatch.setattr(kr, "_api_noegle", lambda: "testnoegle")

    def hent(kode, aar, datatype, noegle, sov=None):
        kald.append((kode, str(aar), datatype))
        if str(aar) in faldende_aar:
            raise TimeoutError("nede")
        if str(aar) in tomme_aar:
            return []
        return _kr_raekker(int(aar) - 2017)

    monkeypatch.setattr(kr, "_hent", hent)
    return kald


def _hent_kr(**kw):
    return historik.hent_kr(cache=False, sov=lambda s: None, **kw)


def test_klimaregnskabet_hentes_fra_foerste_aargang_og_op_til_det_nyeste(monkeypatch):
    kald = _kr_api(monkeypatch)
    ud = _hent_kr()
    aar = sorted({a for a in ud["husholdning_co2_ton"][THISTED]})
    assert aar[0] == str(max(historik.KR_FRA_AAR, int(PERIODER["KLIMAREGNSKAB_AAR"]) - 10))
    assert aar[-1] == PERIODER["KLIMAREGNSKAB_AAR"]
    assert len(kald) == 98 * 2 * len(aar)


def test_det_nyeste_aar_hentes_ikke_to_gange(monkeypatch):
    kald = _kr_api(monkeypatch)
    nu = {kode: {"co2_ton": 1.0, "energi_tj": 2.0, "fossil_andel": 0.5, "el_tj": 1.0,
                 "el_co2_ton": 1.0, "fjernvarme_tj": 1.0, "fjernvarme_co2_ton": 1.0}
          for kode, _, _ in KOMMUNER}
    ud = _hent_kr(nuvaerende=nu)
    assert all(a != PERIODER["KLIMAREGNSKAB_AAR"] for _, a, _ in kald)
    assert ud["husholdning_co2_ton"][THISTED][PERIODER["KLIMAREGNSKAB_AAR"]] == 1.0


def test_hver_kommunes_felter_folger_kr_felter(monkeypatch):
    _kr_api(monkeypatch)
    ud = _hent_kr()
    aar = PERIODER["KLIMAREGNSKAB_AAR"]
    faktor = int(aar) - 2017
    assert ud["husholdning_energi_tj"][THISTED][aar] == pytest.approx(170.0 * faktor)
    assert ud["husholdning_el_tj"][THISTED][aar] == pytest.approx(50.0 * faktor)
    assert ud["husholdning_fjernvarme_tj"][THISTED][aar] == pytest.approx(100.0 * faktor)
    assert ud["husholdning_fossil_andel"][THISTED][aar] == pytest.approx(20.0 / 170.0)


def test_landet_er_summen_af_kommunerne_hvert_aar(monkeypatch):
    _kr_api(monkeypatch)
    ud = _hent_kr()
    aar = PERIODER["KLIMAREGNSKAB_AAR"]
    assert ud["husholdning_energi_tj"]["land"][aar] == pytest.approx(
        98 * 170.0 * (int(aar) - 2017))


def test_et_aar_uden_tal_bliver_ikke_til_nuller(monkeypatch):
    """Et tomt svar giver el og fjernvarme som 0,0 i kildens egen opsummering.
    Det er ikke en måling, og må ikke ende i filen."""
    _kr_api(monkeypatch, tomme_aar={"2019"})
    ud = _hent_kr()
    for felt in historik.KR_POSTFELTER:
        assert "2019" not in ud[felt][THISTED], felt
        assert "2019" not in ud[felt].get("land", {}), felt


def test_et_aar_der_ikke_kan_hentes_springes_over_og_resten_overlever(monkeypatch, capsys):
    _kr_api(monkeypatch, faldende_aar={"2020"})
    ud = _hent_kr()
    assert "2020" not in ud["husholdning_co2_ton"][THISTED]
    assert "2021" in ud["husholdning_co2_ton"][THISTED]
    assert "2020" in capsys.readouterr().out


def test_uden_api_noegle_rejses_der_saa_build_kan_udgive_uden_husholdningsfelterne(monkeypatch):
    monkeypatch.setattr(kr, "_api_noegle", lambda: None)
    with pytest.raises(ValueError):
        _hent_kr()


def test_cachen_gemmer_hvert_hentet_aar_og_bruges_ved_naeste_koersel(monkeypatch, tmp_path):
    monkeypatch.setattr(historik, "KR_HISTORIK_CACHE_PATH", str(tmp_path / "cache.json"))
    kald = _kr_api(monkeypatch)
    historik.hent_kr(cache=True, sov=lambda s: None)
    foerste = len(kald)
    assert foerste > 0 and (tmp_path / "cache.json").exists()
    historik.hent_kr(cache=True, sov=lambda s: None)
    assert len(kald) == foerste, "anden kørsel skal læse cachen og ikke kalde API'et"
    historik.hent_kr(cache=True, frisk=True, sov=lambda s: None)
    assert len(kald) == 2 * foerste, "--frisk-kr springer cachen over"


# ---------- Priser ----------

def test_priserne_hentes_for_alle_aar_prisjusteringen_kan_komme_til_at_bruge(monkeypatch):
    kaldt = {}
    monkeypatch.setattr(fetch_dst, "fetch_priser",
                        lambda aarene: kaldt.setdefault("aar", list(aarene)) and {})
    historik.hent_priser()
    aar = kaldt["aar"]
    ældste_nøgletal = min(int(PERIODER[n]) for n in ("INDKOMST_AAR", "FORBRUG_AAR", "REGNSKAB_AAR"))
    assert int(aar[0]) == ældste_nøgletal - historik.HISTORIK_AAR - historik.PRIS_FORSKYDNING_AAR
    assert aar[-1] == PERIODER["PRIS_AAR"]


def test_anlaegsindkoebets_prisforskydning_er_halvdelen_af_vinduet():
    """Femårsgennemsnittet hører til vinduets midte: to år før slutåret. Tallet står også i
    web/beregning.js (prisForskydning), som ikke kan læse Python - ændres vinduet her, skal
    det følge dér."""
    assert indkoeb.ANLAEG_VINDUE_AAR == 5
    assert historik.PRIS_FORSKYDNING_AAR == 2
