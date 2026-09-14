import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import unittest
import build

# Samme rå værdier som Plan 1's test/fixtures.js (land + Thisted).
DST_DATA = {
    "Hele landet": {
        "disp_indkomst": 287682, "folketal": 6025603, "folketal_forrige": 5992734,
        "gini": 30.43,
        "boliger_parcel": 1177875, "boliger_raekke": 440156, "boliger_etage": 1148673,
        "boligareal": 111, "byggeri": 25966,
        "biler": 2918153, "biler_el": 556394, "biler_plugin": 127933, "biler_diesel": 575355,
        "biler_benzin": 1658341,
        "opv_boliger_ialt": 2872738, "opv_olie": 92448, "opv_naturgas": 334724,
        "affald_kg": 543, "genanvendelse_pct": 58,
    },
    "Thisted": {
        "disp_indkomst": 252934, "folketal": 42572, "folketal_forrige": 42698,
        "gini": 26.42,
        "boliger_parcel": 14246, "boliger_raekke": 2677, "boliger_etage": 3295,
        "boligareal": 133, "byggeri": 103,
        "biler": 23656, "biler_el": 3404, "biler_plugin": 946, "biler_diesel": 7114,
        "biler_benzin": 12180,
        "opv_boliger_ialt": 20515, "opv_olie": 1582, "opv_naturgas": 958,
        "affald_kg": 508, "genanvendelse_pct": 45,
    },
}


class TestBuildGolden(unittest.TestCase):
    def test_thisted_matcher_plan1_fixture_eksakt(self):
        post = build.saml_kommune_post("Thisted", DST_DATA, kode=787, region="Nordjylland")
        self.assertEqual(post["navn"], "Thisted")
        self.assertEqual(post["kode"], 787)
        self.assertEqual(post["region"], "Nordjylland")
        self.assertEqual(post["disp_indkomst"], 252934)
        self.assertEqual(post["biler_diesel"], 7114)
        self.assertEqual(post["biler_benzin"], 12180)

    def test_land_har_ikke_kode_eller_region(self):
        post = build.saml_kommune_post("Hele landet", DST_DATA)
        self.assertNotIn("kode", post)
        self.assertNotIn("region", post)
        self.assertEqual(post["disp_indkomst"], 287682)

    def test_el_og_fjernvarme_foeres_igennem_og_el_co2_er_vaek(self):
        h = {787: {"co2_ton": 22322.6, "energi_tj": 1537.2, "fossil_andel": 0.06,
                   "el_tj": 302.2, "el_co2_ton": 2601.0,
                   "fjernvarme_tj": 680.0, "fjernvarme_co2_ton": 13538.7}}
        post = build.saml_kommune_post("Thisted", DST_DATA, kode=787,
                                       region="Nordjylland", husholdning=h)
        self.assertEqual(post["husholdning_el_tj"], 302.2)
        self.assertEqual(post["husholdning_el_co2_ton"], 2601.0)
        self.assertEqual(post["husholdning_fjernvarme_tj"], 680.0)
        self.assertEqual(post["husholdning_fjernvarme_co2_ton"], 13538.7)
        self.assertNotIn("elco2_g_kwh", post)
        self.assertNotIn("ve_daekning_pct", post)

    def test_alle_forventede_felter_er_til_stede(self):
        post = build.saml_kommune_post("Thisted", DST_DATA, kode=787, region="Nordjylland")
        for felt in build.FORVENTEDE_FELTER:
            self.assertIn(felt, post)

    def test_manglende_kommune_faar_none_ikke_krak(self):
        post = build.saml_kommune_post("Ukendt Ø", DST_DATA, kode=999, region="Nordjylland")
        self.assertIsNone(post["disp_indkomst"])
        self.assertEqual(build.find_manglende(post), build.FORVENTEDE_FELTER)


if __name__ == "__main__":
    unittest.main()
