"""Tests for udledningen af regional bil-km-afvigelse fra pendlingsafstande.
Ingen netværk - kalibreringslogikken testes mod kendte tal."""
import unittest

import fetch_pendling


AFSTANDE = {
    "Hele landet": 22.6,
    "Hovedstaden": 15.8,
    "Sjælland": 29.0,
    "Syddanmark": 25.7,
    "Midtjylland": 24.6,
    "Nordjylland": 26.8,
}


class TestBilkmAfvigelse(unittest.TestCase):
    def test_alle_fem_regioner_faar_en_vaerdi(self):
        dev, _ = fetch_pendling.beregn_bilkm_afvigelse(AFSTANDE)
        self.assertEqual(set(dev), {"Hovedstaden", "Sjælland", "Syddanmark",
                                    "Midtjylland", "Nordjylland"})

    def test_ankerregionen_rammer_dtus_vaerdi_eksakt(self):
        # Nordjylland er det eneste direkte målte punkt. Rammer det ikke DTU's
        # tal præcist, er de fire øvrige regioner på et andet målegrundlag.
        dev, _ = fetch_pendling.beregn_bilkm_afvigelse(AFSTANDE)
        self.assertEqual(dev["Nordjylland"], fetch_pendling.DTU_NORDJYLLAND)

    def test_kalibreringsfaktoren_er_taet_paa_en(self):
        # AFSTB4 giver Nordjylland +18,58 % mod DTU's +17,84 %. Faktoren skal
        # derfor ligge lige under 1. Ligger den langt fra, er de to mål holdt
        # op mod hinanden forkert.
        _, faktor = fetch_pendling.beregn_bilkm_afvigelse(AFSTANDE)
        self.assertAlmostEqual(faktor, 0.9601, places=3)

    def test_fortegn_foelger_afstanden(self):
        dev, _ = fetch_pendling.beregn_bilkm_afvigelse(AFSTANDE)
        self.assertLess(dev["Hovedstaden"], 0, "kortere pendling end land skal give negativt")
        self.assertGreater(dev["Sjælland"], 0, "længere pendling end land skal give positivt")

    def test_raekkefoelge_bevares_fra_afstandene(self):
        dev, _ = fetch_pendling.beregn_bilkm_afvigelse(AFSTANDE)
        efter_afstand = sorted(("Hovedstaden", "Midtjylland", "Syddanmark",
                                "Nordjylland", "Sjælland"), key=lambda r: AFSTANDE[r])
        efter_dev = sorted(dev, key=lambda r: dev[r])
        self.assertEqual(efter_afstand, efter_dev)

    def test_manglende_landsvaerdi_fejler_frem_for_at_gaette(self):
        with self.assertRaises(ValueError):
            fetch_pendling.beregn_bilkm_afvigelse({"Sjælland": 29.0})

    def test_manglende_ankerregion_fejler(self):
        # Uden ankeret kan kalibreringen ikke sættes, og de fire regioner ville
        # ende på et andet grundlag end DTU's. Bedre at fejle end at udgive.
        uden = {k: v for k, v in AFSTANDE.items() if k != "Nordjylland"}
        with self.assertRaises(ValueError):
            fetch_pendling.beregn_bilkm_afvigelse(uden)


if __name__ == "__main__":
    unittest.main()
