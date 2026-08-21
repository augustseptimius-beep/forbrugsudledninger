"""CONCITO-tallene er ren afskrift fra en trykt kilde. Testene sikrer, at
afskriften er intern konsistent og at hvert tal bærer sin sidehenvisning -
ikke at tallene er "rigtige", for det afgør kilden, ikke os."""
import unittest

import concito


class TestSidehenvisninger(unittest.TestCase):
    def test_hvert_tal_har_en_side(self):
        for gruppe in (concito.KATEGORIER, concito.TRANSPORT_UNDERKATEGORIER,
                       concito.FOEDEVARE_UNDERKATEGORIER):
            for post in gruppe:
                self.assertIn("side", post, f"{post['navn']} mangler sidehenvisning")
                self.assertIsInstance(post["side"], int)

    def test_nationalt_aftryk_har_kilde_side_og_citat(self):
        n = concito.NATIONALT_AFTRYK
        for felt in ("ton", "aar", "kilde", "side", "citat"):
            self.assertIn(felt, n)

    def test_niras_anbefalinger_har_afsnit_og_side(self):
        for a in concito.NIRAS_ANBEFALINGER:
            self.assertIsInstance(a["side"], int)
            self.assertTrue(a["afsnit"])
            self.assertTrue(a["tilgaengelighed"], "det skal fremgå om kilden er tilgængelig")

    def test_kilderne_har_url(self):
        for kilde in (concito.KILDE_CONCITO, concito.KILDE_NIRAS):
            self.assertTrue(kilde["url"].startswith("https://"))


class TestInternKonsistens(unittest.TestCase):
    def test_kategoriprocenter_summerer_til_hundrede(self):
        self.assertEqual(sum(k["pct"] for k in concito.KATEGORIER), 100)

    def test_uoverensstemmelser_er_dokumenterede_ikke_glattet_ud(self):
        # Kildens egne tal summerer ikke. Det skal stå i NOTER, ikke rettes.
        kategorisum = round(sum(k["ton"] for k in concito.KATEGORIER), 1)
        self.assertNotEqual(kategorisum, concito.NATIONALT_AFTRYK["ton"])
        emner = " ".join(n["emne"] for n in concito.NOTER)
        self.assertIn("12,8", emner, "afvigelsen skal være dokumenteret i NOTER")

    def test_transportsum_afviger_og_er_noteret(self):
        transport = [k for k in concito.KATEGORIER if k["navn"] == "Transport"][0]
        undersum = round(sum(t["ton"] for t in concito.TRANSPORT_UNDERKATEGORIER), 1)
        self.assertNotEqual(undersum, transport["ton"])
        self.assertTrue(any("3,2" in n["emne"] or "3,2" in n["tekst"] for n in concito.NOTER))

    def test_ingen_beregnede_koefficienter(self):
        # Modulet må kun indeholde afskrevne tal. Dukker der en koefficient op,
        # er princippet brudt.
        forbudte = ("elasticitet", "andel_af_anker", "kalibrering", "faktor")
        kilde = open(concito.__file__, encoding="utf-8").read().lower()
        for ord_ in forbudte:
            self.assertNotIn(ord_ + " =", kilde, f"{ord_} hører ikke hjemme her")


if __name__ == "__main__":
    unittest.main()
