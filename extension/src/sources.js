// Data sources for the Flemish layers. Everything is requested/returned in EPSG:31370.
import { intersectsContour } from './geom.js';
import { safeName } from './dxf.js';

const PREFIX = '00_LDH_';
const WFS_GRB = 'https://geo.api.vlaanderen.be/GRB/wfs';
const WFS_MERCATOR = 'https://www.mercator.vlaanderen.be/raadpleegdienstenmercatorpubliek/wfs';
const AGS = 'https://inspirepub.waterinfo.be/arcgis/rest/services/Watertoets';
const OMW = 'https://geo.api.vlaanderen.be/OMW/wms';

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
const getJson = (url, opts) => fetchRetry(url, opts, async r => {
  const d = await r.json();
  if (d.error) throw new Error(d.error.message || 'service error');
  return d;
});

const PALETTE = [30, 40, 50, 70, 90, 110, 130, 150, 170, 190, 210, 230, 12, 32, 52, 72, 92, 112];
const colorFor = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return PALETTE[h % PALETTE.length]; };

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

/** Each source returns [{layer, color, geom, label?}] already filtered on the contour. */
export const SOURCES = {
  async gewestplan({ ring, ringBox, log }) {
    const res = [];
    for (const t of ['gv', 'ln', 'ov']) {
      const fs = await wfsAll(WFS_MERCATOR, `lu:lu_gwp_${t}`, ringBox, log);
      for (const f of fs) {
        if (!intersectsContour(f.geometry, ring, ringBox)) continue;
        const p = f.properties || {};
        const name = safeName(p.svnaam || p.legende || p.categorie || t);
        res.push({ layer: `${PREFIX}Gewestplan_${name}`, color: colorFor(name), geom: f.geometry });
      }
    }
    return res;
  },

  async kadaster({ ring, ringBox, log }) {
    const fs = await wfsAll(WFS_GRB, 'GRB:ADP', ringBox, log);
    const res = [];
    for (const f of fs) {
      if (!intersectsContour(f.geometry, ring, ringBox)) continue;
      res.push({ layer: `${PREFIX}Kadastrale grenzen`, color: 7, geom: f.geometry, label: f.properties?.CANU });
    }
    return res;
  },

  async overstroming({ ring, log }) {
    const esri = JSON.stringify({ rings: [ring], spatialReference: { wkid: 31370 } });
    const classes = { 1: 'B', 2: 'C', 3: 'D' };       // gridcode 0 = A = geen overstroming
    const colors = { 1: 142, 2: 140, 3: 150 };
    const res = [];
    for (const [svc, tag] of [['watertoets_fluviaal', 'fluviaal'], ['watertoets_kust', 'kust'], ['watertoets_pluviaal', 'pluviaal']]) {
      try {
        for (let off = 0; ; off += 1000) {
          const body = new URLSearchParams({
            where: 'gridcode>0', geometry: esri, geometryType: 'esriGeometryPolygon', inSR: '31370', outSR: '31370',
            spatialRel: 'esriSpatialRelIntersects', outFields: 'gridcode', returnGeometry: 'true',
            resultOffset: String(off), resultRecordCount: '1000', f: 'geojson',
          });
          const d = await getJson(`${AGS}/${svc}/MapServer/0/query`, { method: 'POST', body });
          for (const f of d.features) {
            const g = f.properties?.gridcode;
            if (!classes[g]) continue;
            res.push({ layer: `${PREFIX}Overstromingslagen_${tag}_${classes[g]}`, color: colors[g], geom: f.geometry });
          }
          if (d.features.length < 1000) break;
          log(`  overstroming ${tag}: ${res.length} objecten...`);
        }
      } catch (e) { log(`  ! ${tag} overgeslagen: ${e.message}`); }
    }
    return res;
  },
};

/** Orthophoto as 2048px JPEG tiles with world-file geometry. */
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
      const url = `${OMW}?service=WMS&version=1.3.0&request=GetMap&layers=${layer}&styles=&crs=EPSG:31370` +
        `&bbox=${b.join(',')}&width=${w}&height=${h}&format=image/jpeg`;
      const bytes = await fetchRetry(url, {}, async resp => {
        if (!(resp.headers.get('content-type') || '').includes('image')) throw new Error('geen afbeelding');
        return new Uint8Array(await resp.arrayBuffer());
      }, 5);
      tiles.push({ name: `r${r + 1}c${c + 1}`, bytes, wPx: w, hPx: h, x0: b[0], y0: b[1], res });
    }
  }
  return tiles;
}
