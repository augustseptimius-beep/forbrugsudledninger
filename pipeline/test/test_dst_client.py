import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import unittest
from dst_client import parse_csv, sum_by, build_url

CANNED_CSV = (
    "﻿OMRÅDE;ALDER;TID;INDHOLD\n"
    "Hele landet;Alder i alt;2026K1;6025603\n"
    "Thisted;Alder i alt;2026K1;42572\n"
)

CANNED_CSV_MULTI_DIM = (
    "﻿OMRÅDE;OPVARMNING;TID;INDHOLD\n"
    "Thisted;Fjernvarme;2026;13236\n"
    "Thisted;Centralvarme med olie;2026;1452\n"
    "Thisted;Centralvarme med olie;2026;130\n"  # to rækker samme kommune+type - skal summeres
)

class TestParseCsv(unittest.TestCase):
    def test_parser_bom_og_raekker(self):
        rows = parse_csv(CANNED_CSV)
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["OMRÅDE"], "Hele landet")
        self.assertEqual(rows[1]["INDHOLD"], "42572")

class TestSumBy(unittest.TestCase):
    def test_sum_by_enkelt_kolonne(self):
        rows = parse_csv(CANNED_CSV)
        sums = sum_by(rows, ["OMRÅDE"])
        self.assertEqual(sums["Hele landet"], 6025603)
        self.assertEqual(sums["Thisted"], 42572)

    def test_sum_by_summerer_flere_raekker_samme_gruppe(self):
        rows = parse_csv(CANNED_CSV_MULTI_DIM)
        sums = sum_by(rows, ["OMRÅDE", "OPVARMNING"])
        self.assertEqual(sums[("Thisted", "Centralvarme med olie")], 1582)  # 1452+130

    def test_sum_by_ignorerer_ikke_numerisk(self):
        rows = [{"OMRÅDE": "Greve", "INDHOLD": "-"}, {"OMRÅDE": "Greve", "INDHOLD": "10"}]
        sums = sum_by(rows, ["OMRÅDE"])
        self.assertEqual(sums["Greve"], 10)

    def test_sum_by_fejler_hoejlydt_ved_forkert_kolonnenavn(self):
        rows = [{"OMRÅDE": "Greve", "INDHOLD": "10"}]
        with self.assertRaises(KeyError):
            sum_by(rows, ["OMRÅDE"], value_col="FINDES_IKKE")

    def test_sum_by_fejler_hoejlydt_ved_uventet_talformat(self):
        rows = [{"OMRÅDE": "Greve", "INDHOLD": "1.234"}]  # DST bruger ikke tusindtalsseparator
        with self.assertRaises(ValueError):
            sum_by(rows, ["OMRÅDE"])

class TestBuildUrl(unittest.TestCase):
    def test_build_url_encoder_danske_bogstaver(self):
        url = build_url("https://api.statbank.dk/v1", "FOLK1A", {"OMRÅDE": "*", "Tid": "2026K1"})
        self.assertTrue(url.startswith("https://api.statbank.dk/v1/data/FOLK1A/CSV?"))
        self.assertIn("Tid=2026K1", url)

if __name__ == "__main__":
    unittest.main()
