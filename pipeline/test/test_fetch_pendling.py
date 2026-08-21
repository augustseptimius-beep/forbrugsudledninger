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


class TestKommuneAfvigelse(unittest.TestCase):
    """Kommunale bil-km-afvigelser. Samme kalibrering som regionerne, fordi
    faktoren retter niveauet, ikke den kommunale spredning."""

    AFSTANDE_MED_KOMMUNER = dict(AFSTANDE, **{
        "Thisted": 23.6, "Aalborg": 26.0, "Vordingborg": 36.3, "Frederiksberg": 12.4,
    })
    KOMMUNER = [(787, "Thisted", "Nordjylland"), (851, "Aalborg", "Nordjylland"),
                (390, "Vordingborg", "Sjælland"), (147, "Frederiksberg", "Hovedstaden")]

    def _bereg(self):
        _, faktor = fetch_pendling.beregn_bilkm_afvigelse(AFSTANDE)
        return fetch_pendling.beregn_bilkm_afvigelse_kommune(
            self.AFSTANDE_MED_KOMMUNER, faktor, self.KOMMUNER)

    def test_hver_kommune_faar_sin_egen_vaerdi(self):
        ud = self._bereg()
        self.assertEqual(len(set(ud.values())), 4, "fire forskellige afstande, fire forskellige tal")

    def test_kommunen_afviger_fra_sin_region(self):
        # Hele pointen med at gå til kommuneniveau. Thisted ligger langt under
        # Nordjyllands regionsværdi.
        regionalt, _ = fetch_pendling.beregn_bilkm_afvigelse(AFSTANDE)
        ud = self._bereg()
        self.assertLess(ud[787], regionalt["Nordjylland"] / 2)

    def test_fortegn_foelger_afstanden(self):
        ud = self._bereg()
        self.assertGreater(ud[390], 0, "Vordingborg pendler langt")
        self.assertLess(ud[147], 0, "Frederiksberg pendler kort")

    def test_kommune_uden_afstand_udelades(self):
        # Så motoren kan vise transporten som uoplyst frem for at gætte.
        _, faktor = fetch_pendling.beregn_bilkm_afvigelse(AFSTANDE)
        ud = fetch_pendling.beregn_bilkm_afvigelse_kommune(
            AFSTANDE, faktor, [(999, "Findes Ikke", "Sjælland")])
        self.assertEqual(ud, {})

    def test_manglende_landsvaerdi_fejler(self):
        with self.assertRaises(ValueError):
            fetch_pendling.beregn_bilkm_afvigelse_kommune({"Thisted": 23.6}, 1.0, self.KOMMUNER)
