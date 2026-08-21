import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import unittest
import build

# Samme rå værdier som Plan 1's test/fixtures.js (land + Thisted).
DST_DATA = {
    "Hele landet": {
        "disp_indkomst": 287682, "folketal": 6025603, "folketal_forrige": 5992734,
        "areal": 42955.6, "formue_gns": 2177950, "formue_median": 800815, "gini": 30.43,
        "boliger_parcel": 1177875, "boliger_raekke": 440156, "boliger_etage": 1148673,
        "boligareal": 111, "byggeri": 25966,
        "biler": 2918153, "biler_el": 556394, "biler_plugin": 127933, "biler_diesel": 575355,
        "opv_boliger_ialt": 2872738, "opv_olie": 92448, "opv_naturgas": 334724,
        "affald_kg": 543, "genanvendelse_pct": 58,
    },
    "Thisted": {
        "disp_indkomst": 252934, "folketal": 42572, "folketal_forrige": 42698,
        "areal": 1072.2, "formue_gns": 1838139, "formue_median": 813928, "gini": 26.42,
        "boliger_parcel": 14246, "boliger_raekke": 2677, "boliger_etage": 3295,
        "boligareal": 133, "byggeri": 103,
        "biler": 23656, "biler_el": 3404, "biler_plugin": 946, "biler_diesel": 7114,
        "opv_boliger_ialt": 20515, "opv_olie": 1582, "opv_naturgas": 958,
        "affald_kg": 508, "genanvendelse_pct": 45,
    },
}
BOLIGPRISER = {"Hele landet": 18439, "Thisted": 7430}


class TestBuildGolden(unittest.TestCase):
    def test_thisted_matcher_plan1_fixture_eksakt(self):
        post = build.saml_kommune_post("Thisted", DST_DATA, BOLIGPRISER, kode=787, region="Nordjylland")
        self.assertEqual(post["navn"], "Thisted")
        self.assertEqual(post["kode"], 787)
        self.assertEqual(post["region"], "Nordjylland")
        self.assertEqual(post["disp_indkomst"], 252934)
        self.assertEqual(post["biler_diesel"], 7114)
        self.assertEqual(post["boligpris_m2"], 7430)
        self.assertEqual(post["elco2_g_kwh"], 26.7)  # fra EL_CO2_MANUAL

    def test_land_har_ikke_kode_eller_region(self):
        post = build.saml_kommune_post("Hele landet", DST_DATA, BOLIGPRISER)
        self.assertNotIn("kode", post)
        self.assertNotIn("region", post)
        self.assertEqual(post["disp_indkomst"], 287682)
        self.assertEqual(post["elco2_g_kwh"], 51.8)

    def test_alle_forventede_felter_er_til_stede(self):
        post = build.saml_kommune_post("Thisted", DST_DATA, BOLIGPRISER, kode=787, region="Nordjylland")
        for felt in build.FORVENTEDE_FELTER:
            self.assertIn(felt, post)

    def test_manglende_kommune_faar_none_ikke_krak(self):
        post = build.saml_kommune_post("Ukendt Ø", DST_DATA, BOLIGPRISER, kode=999, region="Nordjylland")
        self.assertIsNone(post["disp_indkomst"])
        self.assertEqual(build.find_manglende(post), build.FORVENTEDE_FELTER)


if __name__ == "__main__":
    unittest.main()
