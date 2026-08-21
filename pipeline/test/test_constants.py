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
            "FOLK_KVARTAL", "FOLK_KVARTAL_FORRIGE", "AREAL_AAR", "INDKOMST_AAR",
            "FORMUE_AAR", "GINI_AAR", "BOLIGER_AAR", "OPVARMNING_AAR",
            "BYGGERI_AAR", "BILER_MAANED", "AFFALD_AAR", "BOLIGPRIS_KVARTAL",
            "PENDLING_AAR", "ELDEKLARATION_AAR",
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
        # Alt på modulniveau skal være enten PERIODER eller EL_CO2_MANUAL.
        offentlige = {n for n in dir(constants) if n.isupper()}
        self.assertEqual(offentlige, {"PERIODER", "EL_CO2_MANUAL"})

    def test_el_co2_manual_er_maerket_som_sikkerhedsnet(self):
        # Uden mærkatet ville næste læser tro, det er en datakilde og bruge
        # to håndaflæste værdier frem for de 98 beregnede.
        kilde = open(constants.__file__, encoding="utf-8").read()
        foran = kilde[:kilde.index("EL_CO2_MANUAL = {")]
        self.assertIn("SIKKERHEDSNET", foran.upper())


if __name__ == "__main__":
    unittest.main()
