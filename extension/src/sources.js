// Data sources for Flanders (VL), Brussels (BRU) and Wallonia (WAL).
// Everything is requested/returned in EPSG:31370 (Belgian Lambert 72).
import { intersectsContour } from './geom.js';
import { safeName } from './dxf.js';

const PREFIX = '00_LDH_';
const BRU_BOX = [138000, 158000, 165000, 184000];     // generous box around the Brussels-Capital Region

// ---- endpoints ---------------------------------------------------------------
const VL_GRB_WFS = 'https://geo.api.vlaanderen.be/GRB/wfs';
const VL_GWP_WFS = 'https://www.mercator.vlaanderen.be/raadpleegdienstenmercatorpubliek/wfs';
const VL_WATERTOETS = 'https://inspirepub.waterinfo.be/arcgis/rest/services/Watertoets';
const VL_ORTHO = 'https://geo.api.vlaanderen.be/OMW/wms';
const BRU_PRAS_WFS = 'https://gis.urban.brussels/geoserver/ows';
const BRU_FLOOD_WFS = 'https://ows.environnement.brussels/water';
const FED_CADASTRE = 'https://eservices.minfin.fgov.be/geoservices/arcgis/rest/services/INSPIRE/CP/MapServer/1';
const WAL = 'https://geoservices.wallonie.be/arcgis';
const WAL_PDS = `${WAL}/rest/services/AMENAGEMENT_TERRITOIRE/PDS/MapServer`;
const WAL_FLOOD = `${WAL}/rest/services/EAU/ALEA_INOND/MapServer/2`;
const WAL_CADASTRE = `${WAL}/rest/services/PLAN_REGLEMENT/CADMAP_PARCELLES/MapServer/0`;
const WAL_ORTHO = `${WAL}/services/IMAGERIE/ORTHO_LAST/MapServer/WMSServer`;

const touchesBrussels = b => !(b[2] < BRU_BOX[0] || b[0] > BRU_BOX[2] || b[3] < BRU_BOX[1] || b[1] > BRU_BOX[3]);

// ---- plumbing ----------------------------------------------------------------
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchRetry(url, opts, check, tries = 4) {
  let err;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, opts);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await check(r);
    } catch (e) { err = e; await sleep(800 * (i + 1)); }
  }
  throw err;
}
const getJson = (url, opts, tries) => fetchRetry(url, opts, async r => {
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || 'service error');
  return d;
}, tries);

/** One failing service must not sink the whole download. */
async function safe(name, log, fn) {
  try { return await fn(); } catch (e) { log(`  ! ${name} overgeslagen: ${e.message}`); return []; }
}

const PALETTE = [30, 40, 50, 70, 90, 110, 130, 150, 170, 190, 210, 230, 12, 32, 52, 72, 92, 112];
const colorFor = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; };

/** OGC WFS 2.0 GeoServer-style paging, GeoJSON in EPSG:31370. */
async function wfsAll(base, typeName, bbox, log) {
  const page = 5000, out = [];
  for (let start = 0; ; start += page) {
    const url = `${base}?service=WFS&version=2.0.0&request=GetFeature&typeNames=${encodeURIComponent(typeName)}` +
      `&srsName=EPSG:31370&outputFormat=application/json&count=${page}&startIndex=${start}&bbox=${bbox.join(',')},EPSG:31370`;
    const d = await getJson(url);
    out.push(...d.features);
    if (d.features.length < page) break;
    log(`  ${typeName}: ${out.length} objecten...`);
  }
  return out;
}

/** ArcGIS REST layer query with the contour as the spatial filter (GeoJSON, EPSG:31370). */
async function agsQuery(layerUrl, ring, log, { where = '1=1', outFields = '*', tries } = {}) {
  const geometry = JSON.stringify({ rings: [ring], spatialReference: { wkid: 31370 } });
  const out = [];
  for (let off = 0; ; off += 1000) {
    const body = new URLSearchParams({
      where, geometry, geometryType: 'esriGeometryPolygon', inSR: '31370', outSR: '31370',
      spatialRel: 'esriSpatialRelIntersects', outFields, returnGeometry: 'true',
      resultOffset: String(off), resultRecordCount: '1000', f: 'geojson',
    });
    const d = await getJson(`${layerUrl}/query`, { method: 'POST', body }, tries);
    out.push(...d.features);
    if (d.features.length < 1000) break;
    log(`  ${layerUrl.split('/').slice(-3, -2)}: ${out.length} objecten...`);
  }
  return out;
}

const keep = (feats, { ring, ringBox }) => feats.filter(f => intersectsContour(f.geometry, ring, ringBox));

// ---- vector sources ------------------------------------------------------------
// Each returns [{layer, color, geom, label?}] already filtered on the contour.
export const SOURCES = {
  /** Gewestplan (VL) / Plan de secteur (WAL) / PRAS-GBP (BRU): the land-use zoning plan. */
  async gewestplan(ctx) {
    const { ring, ringBox, log } = ctx, res = [];

    res.push(...await safe('Gewestplan Vlaanderen', log, async () => {
      const r = [];
      for (const t of ['gv', 'ln', 'ov']) {
        for (const f of keep(await wfsAll(VL_GWP_WFS, `lu:lu_gwp_${t}`, ringBox, log), ctx)) {
          const p = f.properties || {}, n = safeName(p.svnaam || p.legende || p.categorie || t);
          r.push({ layer: `${PREFIX}Gewestplan_${n}`, color: colorFor(n), geom: f.geometry });
        }
      }
      return r;
    }));

    res.push(...await safe('Plan de secteur Wallonie', log, async () => {
      const r = [];
      for (const id of [22, 17, 18, 9, 11, 13]) {              // zones, landscape/heritage overprints, road/rail/water lines
        for (const f of keep(await agsQuery(`${WAL_PDS}/${id}`, ring, log), ctx)) {
          const p = f.properties || {}, n = safeName(p.DESCRIPTION || p.AFFECT || p.STYPE || `PDS ${id}`);
          r.push({ layer: `${PREFIX}Gewestplan_${n}`, color: colorFor(n), geom: f.geometry });
        }
      }
      return r;
    }));

    if (touchesBrussels(ringBox)) {
      res.push(...await safe('GBP/PRAS Brussel', log, async () => {
        const r = [];
        for (const f of keep(await wfsAll(BRU_PRAS_WFS, 'PERSPECTIVE:A10_AF_AFFECT', ringBox, log), ctx)) {
          const p = f.properties || {}, n = safeName(p.NAME_NL || p.NAME_FR || p.AFFECTATION || 'PRAS');
          r.push({ layer: `${PREFIX}Gewestplan_${n}`, color: colorFor(n), geom: f.geometry });
        }
        return r;
      }));
    }
    return res;
  },

  /** Cadastral parcels: GRB (VL), CadMap (WAL), federal CadGIS (BRU). */
  async kadaster(ctx) {
    const { ring, ringBox, log } = ctx, res = [];
    const layer = `${PREFIX}Kadastrale grenzen`;

    res.push(...await safe('Percelen Vlaanderen', log, async () =>
      keep(await wfsAll(VL_GRB_WFS, 'GRB:ADP', ringBox, log), ctx)
        .map(f => ({ layer, color: 7, geom: f.geometry, label: f.properties?.CANU }))));

    res.push(...await safe('Percelen Wallonie', log, async () =>
      keep(await agsQuery(WAL_CADASTRE, ring, log), ctx).map(f => {
        const p = f.properties || {};
        const n = v => String(parseInt(v, 10) || '');
        const label = `${n(p.RADICAL)}${p.BIS && p.BIS !== '00' ? '/' + n(p.BIS) : ''}${p.EXPOSANT && p.EXPOSANT !== '_' ? p.EXPOSANT : ''}${n(p.PUISSANCE)}`;
        return { layer, color: 7, geom: f.geometry, label };
      })));

    if (touchesBrussels(ringBox)) {
      res.push(...await safe('Percelen Brussel', log, async () =>
        keep(await agsQuery(FED_CADASTRE, ring, log, { where: "id_localId LIKE '21%'" }), ctx)   // arrondissement 21 = Brussels
          .map(f => ({ layer, color: 7, geom: f.geometry, label: f.properties?.label }))));
    }
    return res;
  },

  /** Flood hazard: Watertoets (VL), Aléa d'inondation (WAL), Inondation aléa 2025 (BRU). */
  async overstroming(ctx) {
    const { ring, ringBox, log } = ctx, res = [];
    const classes = { 1: 'B', 2: 'C', 3: 'D' };          // gridcode 0 = A = geen overstroming
    const colors = { 1: 142, 2: 140, 3: 150 };

    for (const [svc, tag] of [['watertoets_fluviaal', 'fluviaal'], ['watertoets_kust', 'kust'], ['watertoets_pluviaal', 'pluviaal']]) {
      res.push(...await safe(`Overstroming ${tag}`, log, async () =>
        (await agsQuery(`${VL_WATERTOETS}/${svc}/MapServer/0`, ring, log, { where: 'gridcode>0', outFields: 'gridcode', tries: tag === 'pluviaal' ? 1 : undefined }))
          .filter(f => classes[f.properties?.gridcode])
          .map(f => ({ layer: `${PREFIX}Overstromingslagen_${tag}_${classes[f.properties.gridcode]}`, color: colors[f.properties.gridcode], geom: f.geometry }))));
    }

    res.push(...await safe('Alea inondation Wallonie', log, async () => {
      const colorOf = { 10: 142, 20: 140, 30: 150 };
      return (await agsQuery(WAL_FLOOD, ring, log, { outFields: 'CODEALEA,VALEUR' })).map(f => {
        const p = f.properties || {};
        return { layer: `${PREFIX}Overstromingslagen_Wallonie_${safeName(p.VALEUR || p.CODEALEA)}`, color: colorOf[p.CODEALEA] || 140, geom: f.geometry };
      });
    }));

    if (touchesBrussels(ringBox)) {
      res.push(...await safe('Inondation Bruxelles', log, async () => {
        const colorOf = { T25: 150, T100: 140, T1000: 142 };
        const url = `${BRU_FLOOD_WFS}?service=WFS&version=1.1.0&request=GetFeature&typename=flood_hazardmap_combined_2025` +
          `&srsName=EPSG:31370&outputFormat=application/vnd.geo%2Bjson&bbox=${ringBox.join(',')},EPSG:31370`;
        log('  Brussel overstromingskaart (groot bestand)...');
        const d = await getJson(url);
        return keep(d.features, ctx).map(f => {
          const c = safeName(f.properties?.class || f.properties?.code_alea || 'x');
          return { layer: `${PREFIX}Overstromingslagen_Brussel_${c}`, color: colorOf[c] || 140, geom: f.geometry };
        });
      }));
    }
    return res;
  },
};

// ---- orthophoto ---------------------------------------------------------------------
const imgBytes = resp => resp.arrayBuffer().then(b => new Uint8Array(b));
const checkImage = async resp => {
  if (!(resp.headers.get('content-type') || '').includes('image')) throw new Error('geen afbeelding');
  return imgBytes(resp);
};

/** Fraction of "no data" (pure white) pixels, sampled on a 96px thumbnail. */
async function blankFraction(bytes) {
  const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
  const c = new OffscreenCanvas(96, 96), g = c.getContext('2d');
  g.drawImage(bmp, 0, 0, 96, 96); bmp.close();
  const d = g.getImageData(0, 0, 96, 96).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) if (d[i] >= 252 && d[i + 1] >= 252 && d[i + 2] >= 252) n++;
  return n / (96 * 96);
}

/** Overlay two JPEGs: no-data areas are white, so "darken" keeps whichever has real pixels. */
async function composite(a, b, w, h) {
  const c = new OffscreenCanvas(w, h), g = c.getContext('2d');
  for (const [bytes, op] of [[a, 'source-over'], [b, 'darken']]) {
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
    g.globalCompositeOperation = op; g.drawImage(bmp, 0, 0); bmp.close();
  }
  return new Uint8Array(await (await c.convertToBlob({ type: 'image/jpeg', quality: 0.92 })).arrayBuffer());
}

/**
 * Orthophoto as 2048px JPEG tiles with world-file geometry.
 * Flanders+Brussels come from the Flemish OMW service, Wallonia from SPW's latest orthophoto;
 * tiles that touch both are merged.
 */
export async function fetchOrtho({ layer, res, bbox, log }) {
  const TILE = 2048;
  const x0 = Math.floor(bbox[0] / res) * res, y0 = Math.floor(bbox[1] / res) * res;
  const wPx = Math.ceil((bbox[2] - x0) / res), hPx = Math.ceil((bbox[3] - y0) / res);
  const cols = Math.ceil(wPx / TILE), rows = Math.ceil(hPx / TILE);
  if (cols * rows > 36) throw new Error(`Orthofoto te groot (${cols * rows} tegels). Kies een kleinere contour of lagere resolutie.`);
  const tiles = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const w = Math.min(TILE, wPx - c * TILE), h = Math.min(TILE, hPx - r * TILE);
      const tx = x0 + c * TILE * res, ty = y0 + r * TILE * res;       // r counts from the south
      const b = [tx, ty, tx + w * res, ty + h * res];
      log(`  ortho tegel ${tiles.length + 1}/${cols * rows}`);
      const q = `service=WMS&version=1.3.0&request=GetMap&styles=&crs=EPSG:31370&bbox=${b.join(',')}&width=${w}&height=${h}&format=image/jpeg`;

      let vl = null, wal = null;
      try { vl = await fetchRetry(`${VL_ORTHO}?${q}&layers=${layer}`, {}, checkImage, 5); }
      catch (e) { log(`  ! Vlaamse orthofoto tegel mislukt: ${e.message}`); }
      const blank = vl ? await blankFraction(vl) : 1;
      if (blank > 0.005) {                                  // part (or all) outside Flanders/Brussels -> try Wallonia
        try { wal = await fetchRetry(`${WAL_ORTHO}?${q}&layers=0`, {}, checkImage, 3); }
        catch (e) { log(`  ! Waalse orthofoto tegel mislukt: ${e.message}`); }
      }
      let bytes = vl || wal;
      if (vl && wal) bytes = blank > 0.995 ? wal : await composite(vl, wal, w, h);
      if (!bytes) throw new Error('Orthofoto tegel kon niet opgehaald worden.');
      tiles.push({ name: `r${r + 1}c${c + 1}`, bytes, wPx: w, hPx: h, x0: b[0], y0: b[1], res });
    }
  }
  return tiles;
}
