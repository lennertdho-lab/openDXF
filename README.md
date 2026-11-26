# openDXF – Belgium in Lambert '72

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A Chrome extension that lets you **draw a contour on a map and download the planning, flood, cadastral and aerial data for that area – for Flanders, Brussels *and* Wallonia – as one set of DXF files in Belgian Lambert 72 (EPSG:31370)**.

You get CAD layers named `00_LDH_<layer name>` and orthophotos attached as an **XREF**, ready to drop into AutoCAD, BricsCAD, ZWCAD, etc.

- [Why this exists: the fragmentation problem](#why-this-exists-the-fragmentation-problem)
- [What the extension does about it](#what-the-extension-does-about-it)
- [Install](#install) · [Use](#use) · [What you get](#what-you-get)
- [Data sources per region](#data-sources-per-region)
- [Limitations and honest caveats](#limitations-and-honest-caveats)
- [Development](#development) · [License](#license)

---

## Why this exists: the fragmentation problem

Ask a simple question about a plot of land in Belgium: *What is the zoning? Does it flood? What are the parcel boundaries? What does it look like from above?* Four questions, one country, and yet there is **no single place that answers them**. Belgium is a federal state in which almost everything that matters for land – spatial planning, water management, environment, topographic base maps – is a **regional competence**, and each of the three regions built its own data infrastructure, on its own schedule, in its own language, with its own technology. A fourth, federal layer (the cadastre, the national mapping agency) sits on top and does not line up with any of them.

This is not an abstract complaint. It is the daily reality of anyone drawing a site plan, preparing a permit application, doing a due-diligence check or a flood-risk screening in a CAD environment, especially if the site is near a regional border (and in a country this small and this densely built, many are).

### 1. Three regions, three governments, three geoportals

| | **Flanders** | **Wallonia** | **Brussels-Capital** |
|---|---|---|---|
| Responsible body for geodata | Digitaal Vlaanderen ("Geopunt"), plus agencies such as VMM (water) and Departement Omgeving (planning) | Service public de Wallonie (SPW), "Géoportail de la Wallonie" | Paradigm / perspective.brussels (planning, UrbIS), Bruxelles Environnement (water, environment) |
| Primary language of data | Dutch | French (plus German for the German-speaking Community) | French **and** Dutch, side by side (`NAME_FR` / `NAME_NL`) |
| Server technology | GeoServer (WFS/WMS) for base data, ArcGIS Server for VMM | ArcGIS Server (REST/WMS) | GeoServer (urban.brussels) and MapServer (Bruxelles Environnement) |

There is no federal "Belgium geoportal" that merges them. Each portal is excellent *inside* its own borders and silent, or simply empty, outside of them.

### 2. The same legal instrument, three different datasets

The **zoning plan** is the clearest example. Historically, Belgium was covered by the *gewestplannen / plans de secteur* of the late 1970s and 1980s. After regionalisation the instrument lived on separately in each region:

- **Flanders**: *Gewestplan*, published as WFS with polygons (`lu:lu_gwp_gv`), lines (`lu_gwp_ln`) and overprints (`lu_gwp_ov`), classified by `svnaam` ("woongebieden", "agrarisch gebied", …).
- **Wallonia**: *Plan de secteur* (now governed by the CoDT), published as an ArcGIS MapServer with ~25 layers; the land-use zones are in layer 22 with codes like `H02` and a French `DESCRIPTION`.
- **Brussels**: *PRAS / GBP* (Plan régional d'affectation du sol / Gewestelijk Bestemmingsplan), a newer plan with its own zone vocabulary ("zones d'habitation", "zones de forte mixité", …), published through a GeoServer layer `PERSPECTIVE:A10_AF_AFFECT`.

Same purpose, three schemas, three vocabularies, three languages, and no crosswalk between them. A "residential" zone is named, coded and attributed differently in each. If your site straddles a border you need all of them *and* a decision about how to present them as one drawing.

### 3. Flood data that cannot be compared

Flood hazard is a regional matter too, and the three regions did not even agree on **how to express the hazard**:

| Region | Source | Classification |
|---|---|---|
| Flanders | VMM *Watertoets* – "overstromingsgevoelige gebieden" (fluvial, coastal, pluvial) | Classes **A–D** ("geen overstroming gemodelleerd" … "middelgrote kans") |
| Wallonia | SPW *Aléa d'inondation* (overflow and run-off) | **Faible / moyen / élevé** (codes 10 / 20 / 30), by type of event |
| Brussels | Bruxelles Environnement hazard map 2025 | **Return periods** T25 / T100 / T1000, with its own (fluvial, pluvial, combined) variants |

These are different quantities derived with different methodologies. A "D" in Flanders and an "élevé" in Wallonia are **not the same thing**, and one cannot be turned into the other. This tool does not pretend otherwise: it keeps each region's classes in separately named layers (`Overstromingslagen_fluviaal_D`, `Overstromingslagen_Wallonie_Alea eleve`, `Overstromingslagen_Brussel_T25`) and leaves the interpretation to you.

### 4. Cadastre: federal data, regional copies

The cadastral plan is the one dataset that is *not* regional: the Cadastre is run by the federal **FPS Finance**, which publishes parcels nationally. But in practice each region redistributes and re-processes it:

- **Flanders** works with its own large-scale reference map, the **GRB** (*Grootschalig Referentiebestand*), and publishes parcels as `GRB:ADP` with attributes such as `CAPAKEY` and `CANU`.
- **Wallonia** publishes **CadMap** parcels (`CAPAKEY`, `RADICAL`, `EXPOSANT`, `PUISSANCE`, …) via the SPW.
- **Brussels** has no equivalent of its own parcel service in the portal used here, so the **federal** INSPIRE cadastral parcels service is used, filtered to arrondissement `21` (Brussels).

Same concept (parcel identified by its *capakey*), three schemas, three services, three label conventions.

### 5. Three coordinate-system generations

Belgium's official reference systems have changed over time:

- **Belgian Lambert 72 (EPSG:31370)** – the classic system, based on the 1972 Belgian datum (International 1924 ellipsoid). Still **the working system of most Belgian surveyors, architects and CAD users**, and the system this tool outputs.
- **Belgian Lambert 2008 (EPSG:3812)** – the modern, ETRS89-based system. Official, and used by some services natively.
- **WGS84 / Web Mercator (EPSG:4326 / 3857)** – what web maps, and therefore the Esri and Geopunt basemaps, speak.

Services are inconsistent about which of these they offer. Concretely, while building this tool: the Flemish, Walloon and Brussels services all return **EPSG:31370** on request, but the national mapping agency's (NGI) orthophoto WMS **rejects 31370 outright** (`unsupported crs: EPSG:31370`) and only offers 3812 / 3857 / 4326 / 4258 / 3035. A drawing that mixes sources therefore needs careful, explicit handling of CRS, because a silent shift of tens of metres between systems (or a metre-level error from a simplified datum transformation) is invisible on screen and expensive on site.

### 6. Different protocols, different dialects

Even when two regions publish "the same kind" of service, the details differ enough that a client written for one breaks on the other. Examples encountered here:

- **WFS 2.0 GeoServer** (Flanders GRB, Mercator, Brussels PRAS) accepts `outputFormat=application/json`; the **MapServer WFS 1.1.0** of Bruxelles Environnement does not – it needs `application/vnd.geo+json`, ignores `count`/`startIndex` paging and returns the entire region (~21 MB) regardless of the requested bounding box.
- **ArcGIS REST** (Wallonia, VMM, federal cadastre) wants a polygon filter as *Esri JSON*, pages with `resultOffset`, caps at 1000–2000 records, and – for the federal service – **redirected** its host from `ccff02.minfin.fgov.be` to `eservices.minfin.fgov.be`, turning POST requests into GETs.
- **Layers that are simply down**: at the time of writing the VMM *pluviaal* flood service answers `HTTP 500 – Service not started`, and the Flemish orthophoto WMS intermittently returns `504` for large `GetMap` requests.
- **Coverage and no-data conventions**: the Flemish orthophoto service quietly returns a white image outside Flanders/Brussels; the Walloon one does the same outside Wallonia. There is no error – just a white rectangle.

### 7. Why you feel it most at the borders

Everything above is merely annoying inside one region and **actively obstructive on a border**. A plot in Halle, Ukkel, Sint-Genesius-Rode, Enghien or Komen-Waasten can need Flemish and Brussels *or* Flemish and Walloon sources at the same time, each with its own naming, language, classification and CRS handling, each possibly down on the day you need it. By hand that means: find four or five different portals, learn each one's quirks, export in whichever CRS they offer, reproject, rename layers, re-attach images, and repeat for the next region.

## What the extension does about it

One contour in, one consistent package out:

| Problem | What openDXF does |
|---|---|
| Three geoportals | Queries **all** regions for the contour and merges the results into the same layers. Brussels-only sources are only contacted if the contour touches Brussels. |
| Three zoning schemas | Maps Flemish gewestplan, Walloon plan de secteur and Brussels PRAS into `00_LDH_Gewestplan_<zone name>` layers, keeping each region's own zone names (Dutch for VL/BRU, French for WAL). |
| Incomparable flood classes | Keeps each region's classification in separate, clearly named layers instead of faking a harmonisation. |
| Three parcel services | Normalises them into one `00_LDH_Kadastrale grenzen` layer with a `00_LDH_Kadastrale nummers` text layer. |
| CRS chaos | Requests every dataset **natively in EPSG:31370** (no reprojection of the data); only the user's contour is converted from web-map coordinates using the standard 7-parameter Belgian datum shift. |
| Different protocols | One source module per service, with retries and pagination per dialect (GeoServer WFS, ArcGIS REST query, MapServer WFS 1.1.0). |
| Silent white images at borders | Orthophoto tiles are fetched from the Flemish service first; if a tile has "no data" areas, the Walloon service is queried and the two are **merged** (darken blend) into one seamless tile. |
| Flaky services | Each source fails independently: if one is down you still get the rest, with a note in the log. |
| Every CAD user's workflow | Output is plain **DXF (AC1015)**, layers named `00_LDH_*`, orthophotos as an **XREF** drawing with georeferenced `IMAGE` entities and `.jgw` world files. |

## Install

1. Download the latest `openDXF-belgium-v*.zip` from the [Releases](../../releases) page and unzip it, or clone this repo and use the `extension/` folder.
2. Open `chrome://extensions` and switch on **Developer mode**.
3. Click **Load unpacked** and select the extension folder.
4. Click the openDXF icon – the map opens in a new tab.

Works in Chrome and other Chromium browsers (Edge, Brave, …) that support Manifest V3.

## Use

1. Search for an address or pan/zoom the map. Pick a basemap: **Esri World Imagery**, **Esri World Street Map** or the **Geopunt GRB-basiskaart** (Flanders only).
2. Draw a contour with **Veelhoek** (polygon) or **Rechthoek** (rectangle). Without a contour, the current map view is used.
3. Tick the layers you want and, for the orthophoto, pick the year and resolution (25 cm / 50 cm / 1 m).
4. Click **Download (.zip)** and keep all files in one folder.

Limit: 25 km² per download; orthophoto limited to 36 tiles of 2048 px (choose a lower resolution for larger areas).

## What you get

| File | Contents |
|---|---|
| `00_LDH_Plan.dxf` | all vector layers + an XREF to the orthophoto drawing |
| `00_LDH_Orthofoto.dxf` | the XREF drawing: one georeferenced `IMAGE` per tile |
| `00_LDH_Orthofoto_rXcY.jpg` / `.jgw` | orthophoto tiles and world files (usable in GIS too) |
| `LEESMIJ.txt` | sources and notes |

Everything is in Lambert 72, metres. Layers:

| Layer | Content |
|---|---|
| `00_LDH_Contour` | your contour |
| `00_LDH_Gewestplan_<zone>` | zoning: Flemish gewestplan, Walloon plan de secteur (zones, overprints, road/rail/waterway lines), Brussels PRAS |
| `00_LDH_Overstromingslagen_<fluviaal\|kust\|pluviaal>_<B\|C\|D>` | Flanders (Watertoets); class A = no flooding is omitted |
| `00_LDH_Overstromingslagen_Wallonie_<aléa>` | Wallonia hazard (faible / moyen / élevé) |
| `00_LDH_Overstromingslagen_Brussel_<T25\|T100\|T1000>` | Brussels hazard by return period |
| `00_LDH_Kadastrale grenzen` / `00_LDH_Kadastrale nummers` | parcels and parcel numbers |
| `00_LDH_Orthofoto` | aerial imagery (inside the XREF) |

Layer names are ASCII-only on purpose (accents stripped) for maximum CAD compatibility.

## Data sources per region

| Layer | Flanders | Wallonia | Brussels |
|---|---|---|---|
| Zoning plan | Mercator WFS `lu:lu_gwp_gv/ln/ov` | SPW ArcGIS `PDS` layers 22, 17, 18, 9, 11, 13 | `PERSPECTIVE:A10_AF_AFFECT` (urban.brussels WFS) |
| Flood hazard | VMM Watertoets (`inspirepub.waterinfo.be`) | SPW `EAU/ALEA_INOND` layer 2 | Bruxelles Environnement `flood_hazardmap_combined_2025` |
| Parcels | GRB WFS `GRB:ADP` | SPW `CADMAP_PARCELLES` | FPS Finance INSPIRE `CP` layer 1 (arrondissement 21) |
| Orthophoto | OMW WMS (2021–2025) | SPW `ORTHO_LAST` WMS (latest) | OMW WMS (covers Brussels) |

## Limitations and honest caveats

- **Not a legal document.** The output is a convenience copy of public web services. For permits, notarial deeds or legal certainty use the official extracts (stedenbouwkundig uittreksel / certificat d'urbanisme, official flood maps, cadastral extracts).
- **No clipping.** Objects that touch the contour are included whole; they are not cut at its edge. The contour itself is included as `00_LDH_Contour`.
- **Licences of the data differ.** The code is MIT; the data is not. Each region and agency publishes under its own terms (for example, Bruxelles Environnement states open data under CC-BY). Check the terms and attribute the source.
- **Flood classes are not harmonised** across regions (see above) – do not compare them directly.
- **Brussels flood data** is a ~21 MB download because the service cannot filter spatially; it is fetched only when the contour touches Brussels.
- **Walloon orthophoto** is always the latest available; the year selector only applies to the Flemish/Brussels imagery.
- **German-speaking Community** (East Belgium) is covered by the Walloon services; names there are French.
- **Contour accuracy**: the contour is drawn in web-map coordinates and converted with the standard 7-parameter datum shift (metre-level accuracy). The *data* is fetched natively in Lambert 72 and is not reprojected.
- **Tested** against live services, and the DXF files pass `ezdxf`'s audit without errors, but were **not yet opened in AutoCAD/BricsCAD** by the author – please report problems.
- **Services change.** Endpoints, host names and availability are outside this project's control (see §6).

## Development

```
extension/
  manifest.json        Manifest V3
  background.js        opens map.html when the icon is clicked
  map.html/.css        UI (Leaflet map + side panel)
  src/
    app.js             map, drawing, download orchestration
    sources.js         one fetcher per service/region, incl. orthophoto merging
    dxf.js             ASCII DXF (AC1015) writer: LWPOLYLINE, TEXT, IMAGE, XREF
    geom.js            contour-intersection helpers
    crs.js             EPSG:31370 definition for proj4
    zip.js             tiny ZIP writer
  lib/                 vendored Leaflet 1.9.4 and proj4js 2.11
scripts/package.sh     builds dist/openDXF-belgium-vX.Y.Z.zip
```

No build step: load `extension/` unpacked. To adjust a source, edit `src/sources.js` – each region is a separate block wrapped so one failing service doesn't break the download.

## License

[MIT](LICENSE) for the code in this repository. Bundled libraries keep their own licenses (Leaflet: BSD-2-Clause, proj4js: MIT). Data downloaded through the extension remains subject to the licences of the respective data providers.
