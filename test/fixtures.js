// Golden rådata fra Beregninger_Forbrugsbaserede_udledninger_Thisted_v5.xlsx, fanen "Rådata".
// Disse værdier er facit for golden-testene og må kun ændres, hvis regnearket ændres.

export const land = {
  navn: "Hele landet",
  disp_indkomst: 287682, folketal: 6025603, folketal_forrige: 5992734, areal: 42955.6,
  formue_gns: 2177950, formue_median: 800815, gini: 30.43,
  boliger_parcel: 1177875, boliger_raekke: 440156, boliger_etage: 1148673, boligareal: 111,
  byggeri: 25966,
  biler: 2918153, biler_el: 556394, biler_plugin: 127933, biler_diesel: 575355,
  opv_boliger_ialt: 2872738, opv_olie: 92448, opv_naturgas: 334724,
  affald_kg: 543, genanvendelse_pct: 58,
  elco2_g_kwh: 51.8, boligpris_m2: 18439,
  ve_daekning_pct: 28.3, pendlingsafstand_km: 22.6,
};

export const thisted = {
  navn: "Thisted", kode: 787, region: "Nordjylland",
  disp_indkomst: 252934, folketal: 42572, folketal_forrige: 42698, areal: 1072.2,
  formue_gns: 1838139, formue_median: 813928, gini: 26.42,
  boliger_parcel: 14246, boliger_raekke: 2677, boliger_etage: 3295, boligareal: 133,
  byggeri: 103,
  biler: 23656, biler_el: 3404, biler_plugin: 946, biler_diesel: 7114,
  opv_boliger_ialt: 20515, opv_olie: 1582, opv_naturgas: 958,
  affald_kg: 508, genanvendelse_pct: 45,
  elco2_g_kwh: 26.7, boligpris_m2: 7430,
  ve_daekning_pct: 79.7, pendlingsafstand_km: 23.6,
};

export const greve = {
  navn: "Greve", kode: 253, region: "Sjælland",
  disp_indkomst: 306548, folketal: 54120, folketal_forrige: 53536, areal: 60.4,
  formue_gns: 2419897, formue_median: 1222322, gini: 26.35,
  boliger_parcel: 10368, boliger_raekke: 5625, boliger_etage: 6549, boligareal: 119,
  byggeri: 495,
  biler: 27441, biler_el: 6557, biler_plugin: 1654, biler_diesel: 3705,
  opv_boliger_ialt: 22856, opv_olie: 319, opv_naturgas: 9040,
  affald_kg: null, genanvendelse_pct: null, // "-" i regnearket
  elco2_g_kwh: null, boligpris_m2: 30347,
  ve_daekning_pct: null, pendlingsafstand_km: 20.7,
};

// Der er ingen koefficienter i modellen længere. Fixturen indeholdt tidligere
// et anker, en elasticitet, en bilkørselsandel, en byggeandel og en
// boligudgiftsmodregning; ingen af dem kunne kildebelægges, og de er fjernet
// sammen med det estimat, de indgik i. Se pipeline/constants.py.
