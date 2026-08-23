"""ENS-tallene er ren afskrift fra Energistyrelsens datagrundlag. Testene
sikrer, at afskriften er intern konsistent - ikke at tallene er "rigtige",
for det afgør kilden."""
import unittest

import ens


class TestSummer(unittest.TestCase):
    def test_kategorierne_summerer_til_hovedtallet(self):
        # Det var hele grunden til at skifte fra CONCITO: deres kategorier
        # summerer til 12,8 mod eget hovedtal på 11. ENS' gør ikke.
        s = sum(k["ton"] for k in ens.KATEGORIER)
        self.assertAlmostEqual(s, ens.NATIONALT_AFTRYK["ton"], places=1)

    def test_procenterne_summerer_til_hundrede(self):
        s = sum(k["pct"] for k in ens.KATEGORIER)
        self.assertAlmostEqual(s, 100.0, delta=0.2)

    def test_hver_kategori_angiver_sine_kildeposter(self):
        # Grupperingen er vores, tallene er kildens. Posterne skal stå, så
        # enhver sum kan efterprøves mod Energistyrelsens eget ark.
        for k in ens.KATEGORIER:
            self.assertTrue(k["poster"], f"{k['navn']} mangler kildeposter")

    def test_praecis_en_restpost(self):
        rest = [k for k in ens.KATEGORIER if k.get("restpost")]
        self.assertEqual(len(rest), 1)
        self.assertEqual(rest[0]["navn"], "Øvrige investeringer")

    def test_kilden_har_url_og_opgoerelsesaar(self):
        self.assertTrue(ens.KILDE_ENS["url"].startswith("https://"))
        self.assertEqual(ens.KILDE_ENS["opgoerelsesaar"], ens.NATIONALT_AFTRYK["aar"])


class TestIngenKoefficienter(unittest.TestCase):
    def test_der_er_ingen_beregnede_stoerrelser(self):
        # Samme regel som concito.py: kun tal, der står i kilden.
        for k in ens.KATEGORIER:
            self.assertNotIn("koefficient", k)
            self.assertNotIn("faktor", k)


if __name__ == "__main__":
    unittest.main()
