import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import unittest
from unittest.mock import patch
import fetch_dst

FOLK1A_CSV = (
    "﻿OMRÅDE;KØN;ALDER;CIVILSTAND;TID;INDHOLD\n"
    "Hele landet;I alt;Alder i alt;I alt;2026K1;6025603\n"
    "Thisted;I alt;Alder i alt;I alt;2026K1;42572\n"
)
ARE207_CSV = (
    "﻿OMRÅDE;TID;INDHOLD\n"
    "Hele landet;2025;42955,60\n"
    "Thisted;2025;1072,20\n"
)
INDKP101_CSV = (
    "﻿OMRÅDE;ENHED;KOEN;INDKOMSTTYPE;TID;INDHOLD\n"
    "Hele landet;Gennemsnit for alle personer (kr.);Mænd og kvinder i alt;1 Disponibel indkomst (2+30-31-32-35);2024;287682\n"
    "Thisted;Gennemsnit for alle personer (kr.);Mænd og kvinder i alt;1 Disponibel indkomst (2+30-31-32-35);2024;252934\n"
)
FORMUE12_CSV = (
    "﻿FORM1;ENHED;OMRÅDE;ALDER;POPU;TID;INDHOLD\n"
    "Nettoformue I alt (2020-definition A+B+CX-D-E-F);Gennemsnit, faste priser (seneste dataårs prisniveau);Hele landet;18 år og derover;Alle uanset om de har formuetypen;2024;2177950\n"
    "Nettoformue I alt (2020-definition A+B+CX-D-E-F);Median, faste priser (seneste dataårs prisniveau);Hele landet;18 år og derover;Alle uanset om de har formuetypen;2024;800815\n"
)
IFOR41_CSV = (
    "﻿ULLIG;KOMMUNEDK;TID;INDHOLD\n"
    "Gini-koefficient;Hele landet;2024;30,43\n"
    "Gini-koefficient;Thisted;2024;26,42\n"
)


class TestFetchDelA(unittest.TestCase):
    @patch("fetch_dst.dst_client.fetch")
    def test_folketal(self, mock_fetch):
        mock_fetch.side_effect = [
            fetch_dst.dst_client.parse_csv(FOLK1A_CSV),
            fetch_dst.dst_client.parse_csv(FOLK1A_CSV),
        ]
        nu, forrige = fetch_dst.fetch_folketal()
        self.assertEqual(nu["Thisted"], 42572)
        self.assertEqual(forrige["Hele landet"], 6025603)

    @patch("fetch_dst.dst_client.fetch")
    def test_areal(self, mock_fetch):
        mock_fetch.return_value = fetch_dst.dst_client.parse_csv(ARE207_CSV)
        result = fetch_dst.fetch_areal()
        self.assertAlmostEqual(result["Thisted"], 1072.20)

    @patch("fetch_dst.dst_client.fetch")
    def test_indkomst(self, mock_fetch):
        mock_fetch.return_value = fetch_dst.dst_client.parse_csv(INDKP101_CSV)
        result = fetch_dst.fetch_indkomst()
        self.assertEqual(result["Thisted"], 252934)

    @patch("fetch_dst.dst_client.fetch")
    def test_formue(self, mock_fetch):
        mock_fetch.return_value = fetch_dst.dst_client.parse_csv(FORMUE12_CSV)
        gns, median = fetch_dst.fetch_formue()
        self.assertEqual(gns["Hele landet"], 2177950)
        self.assertEqual(median["Hele landet"], 800815)

    @patch("fetch_dst.dst_client.fetch")
    def test_gini(self, mock_fetch):
        mock_fetch.return_value = fetch_dst.dst_client.parse_csv(IFOR41_CSV)
        result = fetch_dst.fetch_gini()
        self.assertAlmostEqual(result["Thisted"], 26.42)


BOL101_CSV = (
    "﻿OMRÅDE;BEBO;ANVENDELSE;UDLFORH;EJER;OPFØRELSESÅR;TID;INDHOLD\n"
    "Thisted;Boliger med CPR tilmeldte personer (beboede boliger);Parcel/Stuehuse;Beboet af ejer;Privatpersoner inkl I/S;2010;2025;100\n"
    "Thisted;Boliger med CPR tilmeldte personer (beboede boliger);Parcel/Stuehuse;Beboet af lejer;Privatpersoner inkl I/S;2011;2025;46\n"
    "Thisted;Boliger med CPR tilmeldte personer (beboede boliger);Række-, kæde- og dobbelthuse;Beboet af ejer;Privatpersoner inkl I/S;2010;2025;50\n"
)
BOL103_CSV = (
    "﻿AMT;BEBO;ANVENDELSE;BOLIGSTØR;TID;INDHOLD\n"
    "Thisted;Boliger med CPR tilmeldte personer (beboede boliger);Parcel/Stuehuse;100-124 kvm;2025;10\n"
    "Thisted;Boliger med CPR tilmeldte personer (beboede boliger);Parcel/Stuehuse;150-174 kvm;2025;5\n"
)
BOL103_CSV_MED_MANGLENDE_DATA = (
    "﻿AMT;BEBO;ANVENDELSE;BOLIGSTØR;TID;INDHOLD\n"
    "Greve;Boliger med CPR tilmeldte personer (beboede boliger);Parcel/Stuehuse;100-124 kvm;2025;-\n"
    "Greve;Boliger med CPR tilmeldte personer (beboede boliger);Parcel/Stuehuse;150-174 kvm;2025;5\n"
)


class TestFetchDelB(unittest.TestCase):
    @patch("fetch_dst.dst_client.fetch")
    def test_boliger_type(self, mock_fetch):
        mock_fetch.return_value = fetch_dst.dst_client.parse_csv(BOL101_CSV)
        parcel, raekke, etage = fetch_dst.fetch_boliger_type()
        self.assertEqual(parcel["Thisted"], 146)  # 100+46
        self.assertEqual(raekke["Thisted"], 50)

    @patch("fetch_dst.dst_client.fetch")
    def test_boliger_type_udelader_elimination_dimensioner(self, mock_fetch):
        """UDLFORH/EJER/OPFØRELSESÅR har elimination=True i BOL101's metadata (verificeret
        mod den levende API) - PX-Web summerer selv over dem når de UDELADES fra
        forespørgslen, samme mønster som ANTVÆR/HUSSTØR allerede udelades i fetch_boligareal().
        Wildcarding alle tre samtidig (i stedet for at udelade dem) overskrider i praksis DST's
        1-mio.-cellegrænse for OMRÅDE=* (fejlede live med HTTP 400 REQUEST-LIMIT ved 98 kommuner)."""
        mock_fetch.return_value = fetch_dst.dst_client.parse_csv(BOL101_CSV)
        fetch_dst.fetch_boliger_type()
        args, _ = mock_fetch.call_args
        params = args[2]
        for felt in ("UDLFORH", "EJER", "OPFØRELSESÅR"):
            self.assertNotIn(felt, params)

    @patch("fetch_dst.dst_client.fetch")
    def test_boligareal_midpoint(self, mock_fetch):
        mock_fetch.return_value = fetch_dst.dst_client.parse_csv(BOL103_CSV)
        result = fetch_dst.fetch_boligareal()
        # (10*112 + 5*162) / 15 = 128.67
        self.assertAlmostEqual(result["Thisted"], 128.67, places=1)

    @patch("fetch_dst.dst_client.fetch")
    def test_boligareal_springer_ingen_data_marker_over(self, mock_fetch):
        mock_fetch.return_value = fetch_dst.dst_client.parse_csv(BOL103_CSV_MED_MANGLENDE_DATA)
        result = fetch_dst.fetch_boligareal()
        # Kun 150-174-rækken (5 boliger, midtpunkt 162) tæller med - "-"-rækken er ingen data.
        self.assertAlmostEqual(result["Greve"], 162.0)


BOL102_CSV = (
    "﻿AMT;BEBO;ANVENDELSE;OPVARMNING;TID;INDHOLD\n"
    "Thisted;Boliger med CPR tilmeldte personer (beboede boliger);Parcel/Stuehuse;Fjernvarme;2026;100\n"
    "Thisted;Boliger med CPR tilmeldte personer (beboede boliger);Parcel/Stuehuse;Centralvarme med olie;2026;20\n"
    "Thisted;Boliger med CPR tilmeldte personer (beboede boliger);Parcel/Stuehuse;Centralvarme m naturgas;2026;5\n"
    "Thisted;Boliger med CPR tilmeldte personer (beboede boliger);Etageboliger;Fjernvarme;2026;50\n"
)
BYGV33_CSV = (
    "﻿OMRÅDE;BYGFASE;ANVEND;BYGHERRE;TID;INDHOLD\n"
    "Thisted;Fuldført byggeri;Parcelhuse;Private, I/S, A/S, ApS og lign.;2024K1;10\n"
    "Thisted;Fuldført byggeri;Kollegier;Private, I/S, A/S, ApS og lign.;2024K1;50\n"
    "Thisted;Fuldført byggeri;Etageboliger;Private, I/S, A/S, ApS og lign.;2024K2;5\n"
)


class TestFetchDelC(unittest.TestCase):
    @patch("fetch_dst.dst_client.fetch")
    def test_opvarmning(self, mock_fetch):
        mock_fetch.return_value = fetch_dst.dst_client.parse_csv(BOL102_CSV)
        ialt, olie, naturgas = fetch_dst.fetch_opvarmning()
        self.assertEqual(ialt["Thisted"], 175)  # 100+20+5+50
        self.assertEqual(olie["Thisted"], 20)
        self.assertEqual(naturgas["Thisted"], 5)

    @patch("fetch_dst.dst_client.fetch")
    def test_byggeri_udelader_kollegier(self, mock_fetch):
        mock_fetch.return_value = fetch_dst.dst_client.parse_csv(BYGV33_CSV)
        result = fetch_dst.fetch_byggeri()
        self.assertEqual(result["Thisted"], 15)  # 10+5, IKKE +50 (kollegier)


BIL54_CSV = (
    "﻿OMRÅDE;BILTYPE;BRUG;DRIV;TID;INDHOLD\n"
    "Thisted;Personbiler i alt;I alt;Drivmidler i alt;2026M01;23656\n"
    "Thisted;Personbiler i alt;I alt;El;2026M01;3404\n"
    "Thisted;Personbiler i alt;I alt;Pluginhybrid;2026M01;946\n"
    "Thisted;Personbiler i alt;I alt;Diesel;2026M01;7114\n"
)
LABY25_CSV = (
    "﻿KOMGRP;BNØGLE;TID;INDHOLD\n"
    "Thisted;Husholdningsaffald (kg. pr. indbygger);2023;508\n"
    "Thisted;Husholdningsaffald indsamlet til genanvendelse (pct.);2023;45\n"
)


class TestFetchDelD(unittest.TestCase):
    @patch("fetch_dst.dst_client.fetch")
    def test_biler(self, mock_fetch):
        mock_fetch.return_value = fetch_dst.dst_client.parse_csv(BIL54_CSV)
        biler, el, plugin, diesel = fetch_dst.fetch_biler()
        self.assertEqual(biler["Thisted"], 23656)
        self.assertEqual(el["Thisted"], 3404)
        self.assertEqual(plugin["Thisted"], 946)
        self.assertEqual(diesel["Thisted"], 7114)

    @patch("fetch_dst.dst_client.fetch")
    def test_affald(self, mock_fetch):
        mock_fetch.return_value = fetch_dst.dst_client.parse_csv(LABY25_CSV)
        kg, pct = fetch_dst.fetch_affald()
        self.assertEqual(kg["Thisted"], 508)
        self.assertEqual(pct["Thisted"], 45)

    def test_fetch_all_dst_samler_alle_felter(self):
        with patch.object(fetch_dst, "fetch_folketal", return_value=({"Thisted": 42572}, {"Thisted": 42698})), \
             patch.object(fetch_dst, "fetch_areal", return_value={"Thisted": 1072.2}), \
             patch.object(fetch_dst, "fetch_indkomst", return_value={"Thisted": 252934}), \
             patch.object(fetch_dst, "fetch_formue", return_value=({"Thisted": 1838139}, {"Thisted": 813928})), \
             patch.object(fetch_dst, "fetch_gini", return_value={"Thisted": 26.42}), \
             patch.object(fetch_dst, "fetch_boliger_type", return_value=({"Thisted": 14246}, {"Thisted": 2677}, {"Thisted": 3295})), \
             patch.object(fetch_dst, "fetch_boligareal", return_value={"Thisted": 133.0}), \
             patch.object(fetch_dst, "fetch_opvarmning", return_value=({"Thisted": 20515}, {"Thisted": 1582}, {"Thisted": 958})), \
             patch.object(fetch_dst, "fetch_byggeri", return_value={"Thisted": 103}), \
             patch.object(fetch_dst, "fetch_biler", return_value=({"Thisted": 23656}, {"Thisted": 3404}, {"Thisted": 946}, {"Thisted": 7114})), \
             patch.object(fetch_dst, "fetch_affald", return_value=({"Thisted": 508}, {"Thisted": 45})):
            result = fetch_dst.fetch_all_dst()
            self.assertEqual(result["Thisted"]["disp_indkomst"], 252934)
            self.assertEqual(result["Thisted"]["biler_diesel"], 7114)
            self.assertEqual(result["Thisted"]["opv_olie"], 1582)
            self.assertEqual(result["Thisted"]["genanvendelse_pct"], 45)

    def test_fetch_all_dst_manglende_felt_bliver_none_ikke_krak(self):
        with patch.object(fetch_dst, "fetch_folketal", return_value=({"Thisted": 42572}, {"Thisted": 42698})), \
             patch.object(fetch_dst, "fetch_areal", return_value={"Thisted": 1072.2}), \
             patch.object(fetch_dst, "fetch_indkomst", return_value={"Thisted": 252934}), \
             patch.object(fetch_dst, "fetch_formue", return_value=({"Thisted": 1838139}, {"Thisted": 813928})), \
             patch.object(fetch_dst, "fetch_gini", return_value={}), \
             patch.object(fetch_dst, "fetch_boliger_type", return_value=({"Thisted": 14246}, {"Thisted": 2677}, {"Thisted": 3295})), \
             patch.object(fetch_dst, "fetch_boligareal", return_value={"Thisted": 133.0}), \
             patch.object(fetch_dst, "fetch_opvarmning", return_value=({"Thisted": 20515}, {"Thisted": 1582}, {"Thisted": 958})), \
             patch.object(fetch_dst, "fetch_byggeri", return_value={"Thisted": 103}), \
             patch.object(fetch_dst, "fetch_biler", return_value=({"Thisted": 23656}, {"Thisted": 3404}, {"Thisted": 946}, {"Thisted": 7114})), \
             patch.object(fetch_dst, "fetch_affald", return_value=({"Thisted": 508}, {"Thisted": 45})):
            result = fetch_dst.fetch_all_dst()
            self.assertIsNone(result["Thisted"]["gini"])
            self.assertEqual(result["Thisted"]["disp_indkomst"], 252934)  # øvrige felter upåvirket


if __name__ == "__main__":
    unittest.main()
