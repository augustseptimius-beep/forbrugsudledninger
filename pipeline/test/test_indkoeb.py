"""Kommunens eget indkøb: afgrænsning, udjævning og færgeforbehold.

Testene holder fast i de valg, indkoeb.py's docstring begrunder. Ændres et af
dem, skal begrundelsen ændres først - ikke omvendt."""
import indkoeb


def _hk(i_alt, forsyning=0.0, transport=0.0):
    return {indkoeb.HOVEDKONTO_IALT: i_alt,
            indkoeb.HOVEDKONTO_FORSYNING: forsyning,
            indkoeb.HOVEDKONTO_TRANSPORT: transport}


class TestAfgraensning:
    def test_forsyningen_traekkes_fra(self):
        # Hele pointen: to kommuner med samme totale indkøb, men hvor den ene
        # har forsyningen i regnskabet, skal ende med samme tal.
        med = {"22": _hk(1000, forsyning=300)}
        uden = {"22": _hk(700, forsyning=0)}
        assert indkoeb.indkoeb_uden_forsyning(med) == 700
        assert indkoeb.indkoeb_uden_forsyning(uden) == 700

    def test_kun_de_valgte_arter_taelles(self):
        # 4.6 Betalinger til staten er ikke et indkøb hos en leverandør og må
        # ikke smugle sig med, selv om den står i svaret fra DST.
        pr_hk = {"22": _hk(100), "46": _hk(9999)}
        assert indkoeb.indkoeb_uden_forsyning(pr_hk) == 100

    def test_enkelt_art_kan_laeses_alene(self):
        pr_hk = {"22": _hk(500), "23": _hk(900)}
        assert indkoeb.indkoeb_uden_forsyning(pr_hk, [indkoeb.ART_BRAENDSEL]) == 900

    def test_manglende_art_taeller_ikke_som_nul(self):
        # Den regel hele projektet hviler på: manglende data er ikke nul.
        assert indkoeb.indkoeb_uden_forsyning({}) is None
        assert indkoeb.indkoeb_uden_forsyning({"22": {}}) is None

    def test_negativt_beloeb_tages_med(self):
        # Et negativt varekøb er en regnskabskorrektion, ikke et hul.
        assert indkoeb.indkoeb_uden_forsyning({"22": _hk(-50)}) == -50

    def test_arter_er_dem_docstringen_lover(self):
        assert indkoeb.ARTER_INDKOEB == ["22", "23", "27", "29", "40", "45", "49"]
        for udeladt in ("1", "25", "26", "46", "47", "48"):
            assert udeladt not in indkoeb.ARTER_INDKOEB


class TestUdjaevning:
    def test_gennemsnit_over_vinduet(self):
        assert indkoeb.udjaevn_over_vindue({"2024": 100, "2025": 200}) == 150

    def test_hul_springes_over_og_taeller_ikke_som_nul(self):
        # Med et hul talt som nul ville svaret være 50, ikke 100.
        assert indkoeb.udjaevn_over_vindue({"2024": 100, "2025": None}) == 100

    def test_tomt_vindue_giver_none(self):
        assert indkoeb.udjaevn_over_vindue({}) is None
        assert indkoeb.udjaevn_over_vindue({"2025": None}) is None

    def test_vinduet_slutter_paa_seneste_aar(self):
        vindue = indkoeb.anlaeg_vindue("2025")
        assert vindue == ["2021", "2022", "2023", "2024", "2025"]
        assert len(vindue) == indkoeb.ANLAEG_VINDUE_AAR


class TestFaergeforbehold:
    def test_andelen_regnes_af_indkoebet_uden_forsyning(self):
        # Nævneren skal være samme afgrænsning som nøgletallene selv.
        pr_hk = {"22": _hk(1000, forsyning=200, transport=400)}
        assert indkoeb.transportandel(pr_hk) == 0.5

    def test_kommune_over_graensen_faar_forbehold(self):
        andele = {"Læsø": 0.46, "Thisted": 0.07}
        ud = indkoeb.klassificer_faergedrift(andele)
        assert ud == {"Læsø": indkoeb.FAERGEDRIFT}

    def test_kommune_uden_andel_faar_intet_forbehold(self):
        # Et manglende grundlag er ikke et forbehold - det er bare ingenting.
        assert indkoeb.klassificer_faergedrift({"Ukendt": None}) == {}

    def test_graensen_er_ikke_finindstillet(self):
        # Docstringen lover, at grænsen kan flyttes mellem 20 og 40 procent
        # uden at ramme andre kommuner. De tre færgekommuner ligger på 42-52 %,
        # næste kommune på 17,4 %.
        faktiske = {"Samsø": 0.519, "Læsø": 0.461, "Ærø": 0.420,
                    "Bornholm": 0.174, "Fanø": 0.117}
        for graense in (0.20, 0.30, 1 / 3, 0.40):
            ramt = {n for n, a in faktiske.items() if a > graense}
            assert ramt == {"Samsø", "Læsø", "Ærø"}, f"grænsen {graense} rammer andre"


class TestKilde:
    def test_kilden_peger_paa_energistyrelsen_og_kl(self):
        ud = indkoeb.byg_indkoeb("2025")
        ids = {k["id"] for k in ud["kilder"]}
        assert ids == {"ENS_GA23_INDKOEB", "KL_2022_INDKOEB"}
        for k in ud["kilder"]:
            assert k["url"].startswith("https://")

    def test_kildeposten_oplyser_afgraensningen(self):
        ud = indkoeb.byg_indkoeb("2025")
        assert ud["udeladt_hovedkonto"] == indkoeb.HOVEDKONTO_FORSYNING
        assert ud["anlaeg_vindue"] == ["2021", "2025"]
        assert ud["arter"] == indkoeb.ARTER_INDKOEB
