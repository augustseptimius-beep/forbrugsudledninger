"""Tests for udtrækket fra Klimaregnskabet.dk. Intet netværk.

Det kritiske er, at KUN kategorien Husholdninger tælles med. Tog man hele
kommunens energiforbrug, ville eksporterende industri lande i borgernes tal."""
import os
import unittest
from unittest.mock import patch

import fetch_klimaregnskabet as kr


RAEKKER = [
    {"kategori": "Husholdninger", "undertype_3": "Fjernvarme", "værdi": 100.0},
    {"kategori": "Husholdninger", "undertype_3": "Naturgas", "værdi": 20.0},
    {"kategori": "Husholdninger", "undertype_3": "Gas-/dieselolie", "værdi": 5.0},
    {"kategori": "Fremstillingsvirksomheder", "undertype_3": "Naturgas", "værdi": 9000.0},
    {"kategori": "Erhverv ekskl. fremstillingsvirksomhed", "undertype_3": "Kul", "værdi": 500.0},
    {"kategori": "Offentlig service", "undertype_3": "Fjernvarme", "værdi": 300.0},
]


class TestKunHusholdninger(unittest.TestCase):
    def test_erhverv_og_fremstilling_taelles_ikke_med(self):
        ud = kr.summer_husholdninger(RAEKKER)
        self.assertEqual(sum(ud.values()), 125.0,
                         "kun husholdningernes 100+20+5 må tælle med")

    def test_energikilder_bevares_hver_for_sig(self):
        ud = kr.summer_husholdninger(RAEKKER)
        self.assertEqual(set(ud), {"Fjernvarme", "Naturgas", "Gas-/dieselolie"})

    def test_samme_kilde_summeres(self):
        ud = kr.summer_husholdninger([
            {"kategori": "Husholdninger", "undertype_3": "Fjernvarme", "værdi": 10.0},
            {"kategori": "Husholdninger", "undertype_3": "Fjernvarme", "værdi": 5.0},
        ])
        self.assertEqual(ud["Fjernvarme"], 15.0)

    def test_tomt_svar_giver_tomt_resultat(self):
        self.assertEqual(kr.summer_husholdninger([]), {})


class TestFossilAndel(unittest.TestCase):
    def test_regner_paa_de_fossile_kilder(self):
        ud = kr.summer_husholdninger(RAEKKER)
        self.assertAlmostEqual(kr.fossil_andel(ud), 25.0 / 125.0)

    def test_fjernvarme_og_el_taeller_ikke_som_fossilt(self):
        # De har deres egen emissionsfaktor og er ikke brændsel i boligen.
        self.assertAlmostEqual(kr.fossil_andel({"Fjernvarme": 100.0, "El til andet": 50.0}), 0.0)

    def test_intet_forbrug_giver_none_ikke_nul(self):
        # Nul procent fossil og "ingen data" er ikke det samme.
        self.assertIsNone(kr.fossil_andel({}))
        self.assertIsNone(kr.fossil_andel({"Fjernvarme": 0.0}))


class TestElOgFjernvarme(unittest.TestCase):
    """Strøm og fjernvarme læses ud hver for sig. Klimaregnskabets el-faktor er
    kommunens egen produktion, så motoren regner strømmen om med landets fælles
    faktor; fjernvarmens faktor er lokal og bliver kommunens eget nøgletal."""

    def test_el_er_de_tre_elposter_lagt_sammen(self):
        energi = {"El til andet": 10.0, "El til paneler": 2.0, "El til varmepumpe": 3.0,
                  "Fjernvarme": 50.0, "Naturgas": 7.0}
        udledning = {"El til andet": 1.0, "El til paneler": 0.5, "El til varmepumpe": 0.5,
                     "Fjernvarme": 4.0, "Naturgas": 1.4}
        self.assertEqual(kr.el_og_fjernvarme(energi, udledning), {
            "el_tj": 15.0, "el_co2_ton": 2.0, "fjernvarme_tj": 50.0, "fjernvarme_co2_ton": 4.0})

    def test_uden_fjernvarme_er_det_et_reelt_nul(self):
        # Dragør og Stevns har ingen fjernvarme i husholdningerne. Det er ikke
        # manglende data, og motoren viser en streg, fordi 0/0 ikke er et tal.
        ud = kr.el_og_fjernvarme({"Naturgas": 7.0}, {"Naturgas": 1.4})
        self.assertEqual(ud["fjernvarme_tj"], 0.0)
        self.assertEqual(ud["el_tj"], 0.0)


class TestApiNoegle(unittest.TestCase):
    def test_miljoevariabel_vinder(self):
        with patch.dict(os.environ, {"KLIMAREGNSKABET_API_KEY": "fra-miljoe"}):
            self.assertEqual(kr._api_noegle(), "fra-miljoe")

    def test_fetch_fejler_hoejlydt_uden_noegle(self):
        # Bedre at build.py fanger en tydelig fejl end at hente uden nøgle.
        with patch.dict(os.environ, {}, clear=True), \
             patch.object(kr, "_api_noegle", return_value=None):
            with self.assertRaises(ValueError):
                kr.fetch_husholdninger([(787, "Thisted", "Nordjylland")], 2023)


class TestMaalteSammenhaenge(unittest.TestCase):
    def test_normaliseringen_er_dokumenteret_med_tal(self):
        # Valget af nævner hviler på målinger, ikke på et skøn. Forsvinder
        # dokumentationen, kan næste læser ikke efterprøve valget.
        m = kr._maalte_sammenhaenge
        pr_indb = m["energi pr. indbygger mod fritidshustæthed"]
        pr_bolig = m["energi pr. bolig inkl. fritidshuse mod fritidshustæthed"]
        self.assertGreater(pr_indb, 0.5, "sammenhængen pr. indbygger skal være stærk")
        self.assertLess(abs(pr_bolig), 0.3, "og skal forsvinde ved fordeling på boliger")


if __name__ == "__main__":
    unittest.main()
