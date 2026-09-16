"""Markeringen af kommuner, hvis gennemsnitsindkomst er trukket af få personer.

Reglen er ensidig og bygger på median og MAD, ikke middelværdi og spredning.
Testene holder fast i begge dele: netop den kommune, der skal findes, ville
ellers trække både middelværdi og spredning op og dermed skjule sig selv."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import fetch_dst


def _sag(afvigere):
    """90 almindelige kommuner plus de angivne. afvigere: {navn: (disp_vaekst,
    loen_vaekst)} som faktorer, fx (1.45, 1.11) for +45 % mod +11 %."""
    disp_foer = {f"K{i}": 200_000 for i in range(90)}
    loen_foer = {f"K{i}": 180_000 for i in range(90)}
    # Almindelige kommuner: begge vokser cirka lige meget, med lidt spredning.
    disp_nu = {n: v * (1.11 + 0.0004 * i) for i, (n, v) in enumerate(disp_foer.items())}
    loen_nu = {n: v * 1.11 for n, v in loen_foer.items()}
    for navn, (dv, lv) in afvigere.items():
        disp_foer[navn], loen_foer[navn] = 200_000, 180_000
        disp_nu[navn], loen_nu[navn] = 200_000 * dv, 180_000 * lv
    return disp_nu, disp_foer, loen_nu, loen_foer


def _markeret(ud):
    return sorted(n for n, v in ud.items() if v)


def test_markerer_kommune_hvor_indkomsten_loeber_fra_loennen():
    ud = fetch_dst.klassificer_indkomst(*_sag({"Spring": (1.45, 1.11)}))
    assert _markeret(ud) == ["Spring"]
    assert ud["Spring"] == fetch_dst.INDKOMST_TRUKKET_AF_FAA


def test_almindelige_kommuner_markeres_ikke():
    ud = fetch_dst.klassificer_indkomst(*_sag({}))
    assert _markeret(ud) == []


def test_reglen_er_ensidig():
    # Løn, der vokser hurtigere end den disponible indkomst, betyder blot at
    # kapitalindkomsten har ligget stille. Det er ikke et forbehold værd.
    ud = fetch_dst.klassificer_indkomst(*_sag({"Modsat": (1.11, 1.45)}))
    assert _markeret(ud) == []


def test_en_stor_afviger_skjuler_ikke_sig_selv():
    # Med middelværdi og spredning ville en afviger på +45 % trække spredningen
    # så meget op, at den selv faldt under grænsen. Median og MAD gør ikke.
    ud = fetch_dst.klassificer_indkomst(*_sag({"Kaempe": (2.50, 1.11)}))
    assert _markeret(ud) == ["Kaempe"]


def test_to_afvigere_findes_begge():
    ud = fetch_dst.klassificer_indkomst(*_sag({"A": (1.45, 1.11), "B": (1.60, 1.11)}))
    assert _markeret(ud) == ["A", "B"]


def test_kommuner_uden_tal_springes_over_og_markeres_ikke():
    disp_nu, disp_foer, loen_nu, loen_foer = _sag({"Spring": (1.45, 1.11)})
    del loen_nu["K5"]
    disp_foer["K6"] = 0
    ud = fetch_dst.klassificer_indkomst(disp_nu, disp_foer, loen_nu, loen_foer)
    assert "K5" not in ud and "K6" not in ud
    assert _markeret(ud) == ["Spring"]


def test_for_faa_kommuner_giver_ingen_markering():
    # Under otte værdier er en robust z-score ikke meningsfuld. Samme grænse
    # som _nedre_tukey_graense bruger for affaldet.
    lille = ({"A": 145.0, "B": 111.0}, {"A": 100.0, "B": 100.0},
             {"A": 111.0, "B": 111.0}, {"A": 100.0, "B": 100.0})
    assert _markeret(fetch_dst.klassificer_indkomst(*lille)) == []


def test_vinduet_er_flere_aar():
    # Et engangsbeløb falder tilbage inden for et par år; et vedvarende niveau
    # gør ikke. Ét års vindue ville derfor markere begge slags.
    assert fetch_dst.INDKOMST_VINDUE_AAR >= 3


def test_feltet_naar_kommuneposten_og_er_none_som_normaltilstand():
    import build
    med = build.saml_kommune_post("Vejen", {}, kode=575, region="Syddanmark",
                                  indkomst_robusthed={"Vejen": fetch_dst.INDKOMST_TRUKKET_AF_FAA})
    assert med["indkomst_robusthed"] == fetch_dst.INDKOMST_TRUKKET_AF_FAA
    uden = build.saml_kommune_post("Thisted", {}, kode=787, region="Nordjylland")
    assert uden["indkomst_robusthed"] is None
    # Må ikke tælle som manglende data for de 97 kommuner, hvor alt er normalt.
    assert "indkomst_robusthed" not in build.FORVENTEDE_FELTER
