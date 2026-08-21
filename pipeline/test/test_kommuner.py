import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import unittest
from kommuner import KOMMUNER, by_navn, REGIONER

class TestKommuner(unittest.TestCase):
    def test_alle_98_kommuner(self):
        self.assertEqual(len(KOMMUNER), 98)

    def test_ingen_dubletter(self):
        koder = [k[0] for k in KOMMUNER]
        self.assertEqual(len(koder), len(set(koder)))

    def test_thisted_og_greve(self):
        m = by_navn()
        self.assertEqual(m["Thisted"], (787, "Nordjylland"))
        self.assertEqual(m["Greve"], (253, "Sjælland"))

    def test_fem_regioner_med_korrekt_antal(self):
        fordeling = {}
        for _, _, region in KOMMUNER:
            fordeling[region] = fordeling.get(region, 0) + 1
        self.assertEqual(fordeling, {
            "Hovedstaden": 29, "Sjælland": 17, "Syddanmark": 22,
            "Midtjylland": 19, "Nordjylland": 11,
        })

    def test_alle_fem_regionnavne_i_konstant(self):
        self.assertEqual(set(REGIONER), {
            "Hovedstaden", "Sjælland", "Syddanmark", "Midtjylland", "Nordjylland",
        })

if __name__ == "__main__":
    unittest.main()
