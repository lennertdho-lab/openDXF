// Small planar-geometry helpers (coordinates in metres, Lambert 72).

export function bboxOf(points) {
  let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
  for (const [x, y] of points) {
    if (x < minx) minx = x; if (y < miny) miny = y;
    if (x > maxx) maxx = x; if (y > maxy) maxy = y;
  }
  return [minx, miny, maxx, maxy];
}

export function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(a / 2);
}

export function pointInRing([px, py], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function ccw(a, b, c) { return (c[1] - a[1]) * (b[0] - a[0]) > (b[1] - a[1]) * (c[0] - a[0]); }
function segsCross(a, b, c, d) { return ccw(a, c, d) !== ccw(b, c, d) && ccw(a, b, c) !== ccw(a, b, d); }

/** Flatten a GeoJSON geometry into a list of {coords, closed}. */
export function parts(geom) {
  if (!geom) return [];
  const c = geom.coordinates;
  switch (geom.type) {
    case 'Point': return [{ coords: [c], closed: false }];
    case 'MultiPoint': return c.map(p => ({ coords: [p], closed: false }));
    case 'LineString': return [{ coords: c, closed: false }];
    case 'MultiLineString': return c.map(l => ({ coords: l, closed: false }));
    case 'Polygon': return c.map(r => ({ coords: r, closed: true }));
    case 'MultiPolygon': return c.flatMap(poly => poly.map(r => ({ coords: r, closed: true })));
    default: return [];
  }
}

/** True when the feature touches the contour polygon (ring). */
export function intersectsContour(geom, ring, ringBox) {
  const ps = parts(geom);
  const all = ps.flatMap(p => p.coords);
  if (!all.length) return false;
  const [a, b, c, d] = bboxOf(all);
  if (c < ringBox[0] || a > ringBox[2] || d < ringBox[1] || b > ringBox[3]) return false;

  for (const p of all) if (pointInRing(p, ring)) return true;               // vertex inside contour
  for (const p of ps) {                                                      // edge crossing
    const cs = p.coords;
    for (let i = 0; i < cs.length - 1; i++)
      for (let j = 0; j < ring.length - 1; j++)
        if (segsCross(cs[i], cs[i + 1], ring[j], ring[j + 1])) return true;
  }
  // contour inside a (polygon) feature
  if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') {
    const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
    for (const poly of polys) {
      if (!pointInRing(ring[0], poly[0])) continue;
      if (!poly.slice(1).some(h => pointInRing(ring[0], h))) return true;
    }
  }
  return false;
}

export function centroid(ring) {
  const [a, b, c, d] = bboxOf(ring);
  return [(a + c) / 2, (b + d) / 2];
}
