import { lngLatToL72 } from './crs.js';
import { bboxOf, ringArea, centroid, parts } from './geom.js';
import { Dxf, safeName } from './dxf.js';
import { SOURCES, fetchOrtho } from './sources.js';
import { makeZip } from './zip.js';

const $ = id => document.getElementById(id);
const logEl = $('log');
const log = m => { logEl.textContent += m + '\n'; logEl.scrollTop = logEl.scrollHeight; };

// ---- map -------------------------------------------------------------------
const map = L.map('map', { center: [51.05, 4.4], zoom: 9, zoomControl: true });
const BASE = {
  'esri-img': () => L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri, Maxar, Earthstar Geographics' }),
  'esri-street': () => L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Esri' }),
  'geopunt': () => L.tileLayer.wms('https://geo.api.vlaanderen.be/GRB-basiskaart/wms', { layers: 'GRB_BSK', format: 'image/png', version: '1.3.0', maxZoom: 20, attribution: 'Digitaal Vlaanderen - GRB' }),
};
let base = BASE['esri-img']().addTo(map);
$('basemap').addEventListener('change', e => { map.removeLayer(base); base = BASE[e.target.value]().addTo(map); base.bringToBack(); });

// ---- search ----------------------------------------------------------------
async function search() {
  const q = $('search').value.trim(); if (!q) return;
  const ul = $('results'); ul.textContent = '';
  try {
    const r = await fetch(`https://geo.api.vlaanderen.be/geolocation/v4/Location?q=${encodeURIComponent(q)}&c=5`);
    const d = await r.json();
    for (const it of d.LocationResult || []) {
      const li = document.createElement('li'); li.textContent = it.FormattedAddress;
      li.onclick = () => {
        const bb = it.BoundingBox;
        if (bb) map.fitBounds([[bb.LowerLeft.Lat_WGS84, bb.LowerLeft.Lon_WGS84], [bb.UpperRight.Lat_WGS84, bb.UpperRight.Lon_WGS84]], { maxZoom: 18 });
        else map.setView([it.Location.Lat_WGS84, it.Location.Lon_WGS84], 17);
        ul.textContent = '';
      };
      ul.appendChild(li);
    }
    if (!ul.children.length) ul.textContent = 'Niets gevonden';
  } catch (e) { ul.textContent = 'Zoeken mislukt: ' + e.message; }
}
$('searchBtn').onclick = search;
$('search').addEventListener('keydown', e => { if (e.key === 'Enter') search(); });

// ---- contour drawing -------------------------------------------------------
const STYLE = { color: '#e8590c', weight: 2, fillOpacity: 0.12 };
let contour = null, mode = null, pts = [], temp = null;

function setMode(m) {
  mode = m; pts = [];
  if (temp) { map.removeLayer(temp); temp = null; }
  $('drawPoly').classList.toggle('active', m === 'poly');
  $('drawRect').classList.toggle('active', m === 'rect');
  $('map').classList.toggle('drawing', !!m);
  if (m) map.doubleClickZoom.disable(); else map.doubleClickZoom.enable();
  $('drawHint').textContent = m === 'poly' ? 'Klik de hoekpunten. Dubbelklik, Enter of klik op het eerste punt om te sluiten. Esc = annuleren.'
    : m === 'rect' ? 'Klik twee tegenoverliggende hoeken.' : $('drawHint').textContent;
}
function setContour(latlngs) {
  if (contour) map.removeLayer(contour);
  contour = L.polygon(latlngs, STYLE).addTo(map);
  const ring = ringL72(latlngs);
  $('area').textContent = `Oppervlakte: ${(ringArea(ring) / 10000).toFixed(2)} ha`;
  setMode(null);
}
function finishPoly() { if (pts.length >= 3) setContour(pts); else setMode(null); }

$('drawPoly').onclick = () => setMode(mode === 'poly' ? null : 'poly');
$('drawRect').onclick = () => setMode(mode === 'rect' ? null : 'rect');
$('clear').onclick = () => { if (contour) map.removeLayer(contour); contour = null; $('area').textContent = ''; setMode(null); };

map.on('click', e => {
  if (!mode) return;
  if (mode === 'rect') {
    if (!pts.length) { pts = [e.latlng]; return; }
    const a = pts[0], b = e.latlng;
    setContour([[a.lat, a.lng], [a.lat, b.lng], [b.lat, b.lng], [b.lat, a.lng]]);
    return;
  }
  if (pts.length >= 3) {                                  // click near first vertex closes
    const p0 = map.latLngToContainerPoint(pts[0]), p1 = map.latLngToContainerPoint(e.latlng);
    if (p0.distanceTo(p1) < 10) return finishPoly();
  }
  pts.push(e.latlng);
  if (temp) map.removeLayer(temp);
  temp = L.polyline(pts, STYLE).addTo(map);
});
map.on('dblclick', () => { if (mode === 'poly') { pts.pop(); finishPoly(); } });   // dblclick fires click twice
map.on('mousemove', e => {
  if (mode === 'rect' && pts.length) {
    const a = pts[0], b = e.latlng;
    if (temp) map.removeLayer(temp);
    temp = L.rectangle([[a.lat, a.lng], [b.lat, b.lng]], STYLE).addTo(map);
  }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && mode === 'poly') finishPoly();
  if (e.key === 'Escape') setMode(null);
});

const ringL72 = latlngs => {
  const ll = latlngs.map(p => (Array.isArray(p) ? p : [p.lat, p.lng]));
  const r = ll.map(([lat, lng]) => lngLatToL72([lng, lat]));
  r.push(r[0]);
  return r;
};

// ---- download --------------------------------------------------------------
const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');

async function download() {
  const btn = $('download'); btn.disabled = true; logEl.textContent = '';
  try {
    let latlngs;
    if (contour) latlngs = contour.getLatLngs()[0];
    else { const b = map.getBounds(); latlngs = [b.getSouthWest(), b.getNorthWest(), b.getNorthEast(), b.getSouthEast()]; log('Geen contour getekend: huidig kaartbeeld gebruikt.'); }
    const ring = ringL72(latlngs), ringBox = bboxOf(ring);
    const km2 = ringArea(ring) / 1e6;
    log(`Contour: ${km2.toFixed(3)} km2 (L72 bbox ${ringBox.map(v => Math.round(v)).join(', ')})`);
    if (km2 > 25) throw new Error('Contour te groot (max 25 km2).');

    const dxf = new Dxf();
    const files = [];
    const ctx = { ring, ringBox, log };

    dxf.layer('00_LDH_Contour', 1);
    dxf.polyline('00_LDH_Contour', ring, true);

    const jobs = [['gewestplan', 'l-gewestplan'], ['overstroming', 'l-overstroming'], ['kadaster', 'l-kadaster']];
    for (const [key, cb] of jobs) {
      if (!$(cb).checked) continue;
      log(`Ophalen: ${key}...`);
      const feats = await SOURCES[key](ctx);
      log(`  ${feats.length} objecten binnen contour`);
      for (const f of feats) {
        dxf.layer(f.layer, f.color);
        for (const p of parts(f.geom)) {
          if (p.coords.length >= 2) dxf.polyline(f.layer, p.coords, p.closed);
        }
        if (f.label && f.geom.type.endsWith('Polygon')) {
          const ext = f.geom.type === 'Polygon' ? f.geom.coordinates[0] : f.geom.coordinates[0][0];
          const [cx, cy] = centroid(ext);
          const tl = '00_LDH_Kadastrale nummers';
          dxf.layer(tl, 8);
          dxf.text(tl, cx, cy, 1.2, f.label);
        }
      }
    }

    if ($('l-ortho').checked) {
      log('Ophalen: orthofoto...');
      const tiles = await fetchOrtho({ layer: $('orthoLayer').value, res: parseFloat($('orthoRes').value), bbox: ringBox, log });
      const od = new Dxf(); od.layer('00_LDH_Orthofoto', 7);
      for (const t of tiles) {
        const base = `00_LDH_Orthofoto_${t.name}`;
        files.push({ name: `${base}.jpg`, data: t.bytes });
        const r = t.res;
        files.push({ name: `${base}.jgw`, data: [r, 0, 0, -r, t.x0 + r / 2, t.y0 + t.hPx * r - r / 2].map(v => v.toFixed(6)).join('\r\n') + '\r\n' });
        od.image('00_LDH_Orthofoto', `${base}.jpg`, t.x0, t.y0, t.wPx, t.hPx, r);
      }
      files.push({ name: '00_LDH_Orthofoto.dxf', data: od.toString() });
      dxf.layer('00_LDH_Orthofoto', 7);
      dxf.xref('00_LDH_Orthofoto', '00_LDH_Orthofoto', '00_LDH_Orthofoto.dxf');
    }

    files.unshift({ name: '00_LDH_Plan.dxf', data: dxf.toString() });
    files.push({ name: 'LEESMIJ.txt', data:
      `openDXF Vlaanderen - ${new Date().toISOString()}\r\nCoordinatenstelsel: Belgian Lambert 72 (EPSG:31370), eenheid meter\r\n` +
      `00_LDH_Plan.dxf bevat de vectorlagen en een XREF naar 00_LDH_Orthofoto.dxf.\r\n` +
      `Houd alle bestanden samen in een map zodat de xref en de afbeeldingen (relatieve paden) gevonden worden.\r\n` +
      `Bronnen: Vlaanderen: Digitaal Vlaanderen (GRB, Gewestplan, OMW orthofoto), VMM Watertoets.\r\n` +
      `Wallonie: SPW (Plan de secteur, aleas d'inondation, CadMap, orthophoto).\r\n` +
      `Brussel: perspective.brussels (PRAS/GBP), Bruxelles Environnement (inondation 2025), FOD Financien (kadaster).\r\n` +
      `Controleer de gebruiksvoorwaarden van elke dataset. Dit bestand heeft geen juridische waarde.\r\n` });

    log('Zip maken...');
    const blob = makeZip(files);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `LDH_Belgie_L72_${stamp()}.zip`;
    document.body.appendChild(a); a.click(); a.remove();
    log(`Klaar: ${files.length} bestanden, ${(blob.size / 1e6).toFixed(1)} MB.`);
  } catch (e) { log('FOUT: ' + e.message); console.error(e); }
  finally { btn.disabled = false; }
}
$('download').onclick = download;
