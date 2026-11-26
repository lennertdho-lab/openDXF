# openDXF – Vlaanderen Lambert '72

Chrome-extensie (Manifest V3) waarmee je op een kaart (Esri World Imagery / Esri Street / Geopunt GRB-basiskaart) een contour tekent en daarna een `.zip` downloadt met alle relevante Vlaamse kaartlagen in **Belgian Lambert 72 (EPSG:31370)**.

## Installeren
1. `chrome://extensions` → *Ontwikkelaarsmodus* aan
2. *Uitgepakte extensie laden* → kies de map `extension/`
3. Klik op het extensie-icoon: de kaart opent in een nieuw tabblad.

## Gebruik
Zoek een adres, kies een basiskaart, teken een veelhoek of rechthoek (zonder contour wordt het zichtbare kaartbeeld gebruikt), vink de lagen aan en klik **Download**.

## Inhoud van de zip
| Bestand | Inhoud |
|---|---|
| `00_LDH_Plan.dxf` | vectorlagen + XREF naar de orthofoto |
| `00_LDH_Orthofoto.dxf` | IMAGE-entiteiten (de xref), verwijzen naar de JPG's |
| `00_LDH_Orthofoto_rXcY.jpg/.jgw` | orthofototegels (2048 px) met world file |
| `LEESMIJ.txt` | bronnen en opmerkingen |

Lagen (altijd `00_LDH_<naam>`): `Contour`, `Gewestplan_<bestemming>`, `Overstromingslagen_<fluviaal|kust|pluviaal>_<B|C|D>`, `Kadastrale grenzen`, `Kadastrale nummers`, `Orthofoto`.
Houd alle bestanden in één map, anders vindt AutoCAD de xref/afbeeldingen niet.

## Bronnen
- Gewestplan (vector): Mercator WFS `lu:lu_gwp_gv/ln/ov`
- Kadastrale percelen: GRB WFS `GRB:ADP`
- Overstromingsgevoelige gebieden (Watertoets, klasse B–D): VMM ArcGIS REST (`inspirepub.waterinfo.be`)
- Orthofoto: OMW WMS (`OMWRGB25VL` e.a.)

## Beperkingen
- Objecten die de contour raken worden volledig overgenomen (geen knip op de contourrand).
- Maximaal 25 km² per download.
- De pluviale Watertoets-service antwoordde ten tijde van ontwikkeling met HTTP 500 en wordt dan overgeslagen.
- DXF is gevalideerd met `ezdxf` (audit zonder fouten) maar nog niet in AutoCAD/BricsCAD getest.
