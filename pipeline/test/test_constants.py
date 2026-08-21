import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import unittest
from constants import KONSTANTER, BILKM_AFVIGELSE_REGION, EL_CO2_MANUAL, PERIODER

class TestConstants(unittest.TestCase):
    def test_konstanter_matcher_plan1_fixture(self):
        self.assertEqual(KONSTANTER["anker"], 10.0)
        self.assertEqual(KONSTANTER["elasticitet"], {"low": 0.30, "high": 0.50})
        self.assertEqual(KONSTANTER["byggeandel"]["high"], 0.0456045)
        self.assertEqual(KONSTANTER["boligudgift_modregning"], 0.45)

    def test_dtu_har_kun_nordjylland_kendt(self):
        self.assertAlmostEqual(BILKM_AFVIGELSE_REGION["Nordjylland"], 0.178423236514523)
        for region in ("Hovedstaden", "Sjælland", "Syddanmark", "Midtjylland"):
            self.assertNotIn(region, BILKM_AFVIGELSE_REGION)

    def test_el_co2_har_kun_land_og_thisted_kendt(self):
        self.assertEqual(EL_CO2_MANUAL["Hele landet"], 51.8)
        self.assertEqual(EL_CO2_MANUAL["Thisted"], 26.7)
        self.assertNotIn("Greve", EL_CO2_MANUAL)

    def test_perioder_indeholder_alle_forventede_noegler(self):
        forventede = {
            "FOLK_KVARTAL", "FOLK_KVARTAL_FORRIGE", "AREAL_AAR", "INDKOMST_AAR",
            "FORMUE_AAR", "GINI_AAR", "BOLIGER_AAR", "OPVARMNING_AAR",
            "BYGGERI_AAR", "BILER_MAANED", "AFFALD_AAR", "BOLIGPRIS_KVARTAL",
        }
        self.assertEqual(set(PERIODER.keys()), forventede)

if __name__ == "__main__":
    unittest.main()
