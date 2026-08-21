"""Tests for den forbrugsvægtede el-CO2-beregning. Ingen netværk."""
import unittest

import fetch_energi
import kommuner


class TestPrisomraader(unittest.TestCase):
    def test_alle_98_kommuner_faar_et_prisomraade(self):
        pa = fetch_energi.prisomraader(kommuner.KOMMUNER)
        self.assertEqual(len(pa), 98)

    def test_storebaeltsgraensen_er_rigtig(self):
        pa = fetch_energi.prisomraader(kommuner.KOMMUNER)
        self.assertEqual(pa[787], "DK1", "Thisted ligger i Jylland")
        self.assertEqual(pa[101], "DK2", "København ligger øst for Storebælt")
        self.assertEqual(pa[461], "DK1", "Odense ligger på Fyn, som hører til DK1")
        self.assertEqual(pa[400], "DK2", "Bornholm hører til DK2")


class TestBeregnElco2(unittest.TestCase):
    def test_vaegter_efter_forbrug_ikke_efter_timer(self):
        # Kommunen bruger 9 gange så meget strøm i den beskidte time som i den
        # rene. Et simpelt timegennemsnit ville give 55; forbrugsvægtet giver 91.
        forbrug = {(1, "t1"): 10.0, (1, "t2"): 90.0}
        deklaration = {("DK1", "t1"): 10.0, ("DK1", "t2"): 100.0}
        ud = fetch_energi.beregn_elco2(forbrug, deklaration, {1: "DK1"})
        self.assertAlmostEqual(ud[1], 91.0)

    def test_manglende_deklarationstime_udelades_ikke_taelles_som_nul(self):
        # En manglende emission er ikke nul emission. Timen skal ud af både
        # tæller og nævner, ellers trækkes gennemsnittet kunstigt ned.
        forbrug = {(1, "t1"): 100.0, (1, "t2"): 100.0}
        deklaration = {("DK1", "t1"): 50.0}
        ud = fetch_energi.beregn_elco2(forbrug, deklaration, {1: "DK1"})
        self.assertAlmostEqual(ud[1], 50.0)

    def test_kommune_uden_brugbare_timer_udelades_helt(self):
        forbrug = {(1, "t1"): 100.0}
        ud = fetch_energi.beregn_elco2(forbrug, {}, {1: "DK1"})
        self.assertNotIn(1, ud, "hellere manglende data end et opdigtet gennemsnit")

    def test_kommune_uden_prisomraade_udelades(self):
        forbrug = {(999, "t1"): 100.0}
        deklaration = {("DK1", "t1"): 50.0}
        self.assertEqual(fetch_energi.beregn_elco2(forbrug, deklaration, {}), {})

    def test_prisomraadet_afgoer_hvilken_deklaration_der_bruges(self):
        forbrug = {(1, "t1"): 100.0, (2, "t1"): 100.0}
        deklaration = {("DK1", "t1"): 70.0, ("DK2", "t1"): 40.0}
        ud = fetch_energi.beregn_elco2(forbrug, deklaration, {1: "DK1", 2: "DK2"})
        self.assertAlmostEqual(ud[1], 70.0)
        self.assertAlmostEqual(ud[2], 40.0)


class TestVEDaekning(unittest.TestCase):
    def test_procent_af_eget_forbrug(self):
        ud = fetch_energi.beregn_ve_daekning({787: (150.0, 100.0), 101: (2.0, 100.0)})
        self.assertAlmostEqual(ud[787], 150.0)
        self.assertAlmostEqual(ud[101], 2.0)

    def test_kan_overstige_hundrede(self):
        # En kommune, der producerer mere end den bruger, skal ikke klippes
        # til 100 - overskuddet er hele pointen i tallet.
        ud = fetch_energi.beregn_ve_daekning({1: (300.0, 100.0)})
        self.assertGreater(ud[1], 100)

    def test_nul_forbrug_udelades(self):
        self.assertEqual(fetch_energi.beregn_ve_daekning({1: (5.0, 0.0)}), {})


if __name__ == "__main__":
    unittest.main()


class TestFortraengning(unittest.TestCase):
    """Energinets lokationsbaserede metode: lokal VE forbrugt samme time
    regnes som nul-emission og fortrænger net-el time for time."""

    def test_lokal_ve_fortraenger_netstroem(self):
        forbrug = {(1, "t1"): 100.0}
        ve = {(1, "t1"): 60.0}
        dekl = {("DK1", "t1"): 100.0}
        ud = fetch_energi.beregn_elco2(forbrug, dekl, {1: "DK1"}, ve)
        self.assertAlmostEqual(ud[1], 40.0, msg="40 kWh fra nettet af 100 forbrugte")

    def test_fuld_daekning_giver_nul(self):
        ud = fetch_energi.beregn_elco2(
            {(1, "t1"): 100.0}, {("DK1", "t1"): 100.0}, {1: "DK1"}, {(1, "t1"): 100.0})
        self.assertAlmostEqual(ud[1], 0.0)

    def test_overskudsproduktion_krediteres_ikke(self):
        # En time med mere lokal VE end forbrug må ikke give negativ emission
        # eller bære over til andre timer - overskuddet eksporteres.
        ud = fetch_energi.beregn_elco2(
            {(1, "t1"): 100.0, (1, "t2"): 100.0},
            {("DK1", "t1"): 100.0, ("DK1", "t2"): 100.0},
            {1: "DK1"},
            {(1, "t1"): 500.0, (1, "t2"): 0.0})
        self.assertAlmostEqual(ud[1], 50.0, msg="kun t2 hentes fra nettet")

    def test_timeopgoerelse_ikke_aarsopgoerelse(self):
        # Samme årlige VE-mængde, men i den ene fordeling falder produktionen
        # sammen med forbruget og i den anden ikke. Et årsgennemsnit ville
        # give samme svar; det ville systematisk overvurdere fortrængningen.
        dekl = {("DK1", "t1"): 100.0, ("DK1", "t2"): 100.0}
        forbrug = {(1, "t1"): 100.0, (1, "t2"): 100.0}
        samtidig = fetch_energi.beregn_elco2(
            forbrug, dekl, {1: "DK1"}, {(1, "t1"): 50.0, (1, "t2"): 50.0})
        skaev = fetch_energi.beregn_elco2(
            forbrug, dekl, {1: "DK1"}, {(1, "t1"): 100.0, (1, "t2"): 0.0})
        self.assertAlmostEqual(samtidig[1], 50.0)
        self.assertAlmostEqual(skaev[1], 50.0)
        # Og med reelt overskud i den ene time bliver forskellen synlig:
        spildt = fetch_energi.beregn_elco2(
            forbrug, dekl, {1: "DK1"}, {(1, "t1"): 200.0, (1, "t2"): 0.0})
        self.assertAlmostEqual(spildt[1], 50.0, msg="overskud spildes, hæver ikke dækningen")

    def test_uden_lokal_ve_er_det_rene_netmix(self):
        ud = fetch_energi.beregn_elco2(
            {(1, "t1"): 100.0}, {("DK1", "t1"): 66.0}, {1: "DK1"})
        self.assertAlmostEqual(ud[1], 66.0)
