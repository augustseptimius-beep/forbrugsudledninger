"""constants.py må kun indeholde periodeangivelser og et sikkerhedsnet.

Den indeholdt tidligere fem beregningskoefficienter - et nationalt anker, en
indkomstelasticitet, en bilkørselsandel, en byggeandel og en
boligudgiftsmodregning - som ingen af dem kunne kildebelægges. Testene her
holder dem ude igen."""
import re
import unittest

import constants


class TestPerioder(unittest.TestCase):
    def test_perioder_indeholder_alle_forventede_noegler(self):
        forventede = {
            "FOLK_KVARTAL", "FOLK_KVARTAL_FORRIGE", "INDKOMST_AAR",
            "GINI_AAR", "BOLIGER_AAR", "OPVARMNING_AAR",
            "BYGGERI_AAR", "BILER_MAANED", "AFFALD_AAR",
            "PENDLING_AAR", "KLIMAREGNSKAB_AAR", "FORBRUG_AAR",
        }
        self.assertEqual(set(constants.PERIODER.keys()), forventede)

    def test_alle_perioder_er_strenge(self):
        for noegle, vaerdi in constants.PERIODER.items():
            self.assertIsInstance(vaerdi, str, f"{noegle} skal være en streng")


class TestIngenKoefficienter(unittest.TestCase):
    def test_de_fjernede_koefficienter_er_ikke_kommet_tilbage(self):
        for navn in ("KONSTANTER", "BILKM_AFVIGELSE_REGION"):
            self.assertFalse(hasattr(constants, navn),
                             f"{navn} kunne ikke kildebelægges og skal blive ude")

    def test_ingen_ukildebelagte_talkonstanter(self):
        # PERIODER er det eneste tilbage på modulniveau. Ethvert nyt tal her
        # ville være et datapunkt uden kilde.
        offentlige = {n for n in dir(constants) if n.isupper()}
        self.assertEqual(offentlige, {"PERIODER"})

    def test_det_haandaflaeste_el_co2_sikkerhedsnet_er_ikke_kommet_tilbage(self):
        # EL_CO2_MANUAL dækkede kun landet og én kommune. Et frafald ville sætte
        # landsgennemsnittet efter én metode og de 98 kommuner efter en anden,
        # så hver eneste afvigelse blev regnet mod et forkert landstal.
        # El-CO2 pr. kWh er siden taget helt af siden.
        self.assertFalse(hasattr(constants, "EL_CO2_MANUAL"))
        kilde = open(constants.__file__, encoding="utf-8").read()
        self.assertNotIn("51.8", kilde, "det håndaflæste landstal må ikke stå som kode")


if __name__ == "__main__":
    unittest.main()
