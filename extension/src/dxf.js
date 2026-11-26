// Hand-rolled ASCII DXF (AutoCAD 2000 / AC1015) writer: LWPOLYLINE, TEXT, IMAGE and XREF.
// Output is pure ASCII so it opens regardless of code page.

const ascii = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e]/g, '');

/** AutoCAD-safe layer/block name. */
export function safeName(s) {
  return ascii(s).replace(/[<>/\\":;?*|,=`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 120) || 'x';
}

export class Dxf {
  constructor() {
    this._h = 0x30;
    this.layers = new Map();      // name -> aci colour
    this.entities = [];
    this.images = [];             // {def, ent, reactor}
    this.xrefs = [];              // {name, path}
    this.layer('0', 7);
    this.ms = this.h();           // *Model_Space block record handle
    this.ps = this.h();           // *Paper_Space block record handle
    this.ext = null;
  }
  h() { return (this._h++).toString(16).toUpperCase(); }
  layer(name, color = 7) { if (!this.layers.has(name)) this.layers.set(name, color); return name; }
  _grow(x, y) {
    if (!this.ext) this.ext = [x, y, x, y];
    else { if (x < this.ext[0]) this.ext[0] = x; if (y < this.ext[1]) this.ext[1] = y; if (x > this.ext[2]) this.ext[2] = x; if (y > this.ext[3]) this.ext[3] = y; }
  }
  _head(type, layer, sub) { return `0\n${type}\n5\n${this.h()}\n330\n${this.ms}\n100\nAcDbEntity\n8\n${layer}\n100\n${sub}\n`; }

  polyline(layer, pts, closed) {
    if (pts.length < 2) return;
    let s = this._head('LWPOLYLINE', layer, 'AcDbPolyline') + `90\n${pts.length}\n70\n${closed ? 1 : 0}\n`;
    for (const [x, y] of pts) { s += `10\n${x.toFixed(3)}\n20\n${y.toFixed(3)}\n`; this._grow(x, y); }
    this.entities.push(s);
  }
  text(layer, x, y, height, str) {
    const t = ascii(str); if (!t) return;
    this._grow(x, y);
    this.entities.push(
      this._head('TEXT', layer, 'AcDbText') +
      `10\n${x.toFixed(3)}\n20\n${y.toFixed(3)}\n30\n0.0\n40\n${height}\n1\n${t}\n72\n1\n11\n${x.toFixed(3)}\n21\n${y.toFixed(3)}\n31\n0.0\n100\nAcDbText\n73\n2\n`);
  }
  /** Georeferenced raster. (x0,y0) = lower-left corner, pixel size in metres. */
  image(layer, file, x0, y0, wPx, hPx, pixel) {
    const def = this.h(), ent = this.h(), reactor = this.h();
    this.images.push({ def, ent, reactor, file, wPx, hPx });
    this._grow(x0, y0); this._grow(x0 + wPx * pixel, y0 + hPx * pixel);
    this.entities.push(
      `0\nIMAGE\n5\n${ent}\n330\n${this.ms}\n100\nAcDbEntity\n8\n${layer}\n100\nAcDbRasterImage\n90\n0\n` +
      `10\n${x0.toFixed(3)}\n20\n${y0.toFixed(3)}\n30\n0.0\n11\n${pixel}\n21\n0.0\n31\n0.0\n12\n0.0\n22\n${pixel}\n32\n0.0\n` +
      `13\n${wPx}\n23\n${hPx}\n340\n${def}\n70\n3\n280\n0\n281\n50\n282\n50\n283\n0\n360\n${reactor}\n` +
      `71\n1\n91\n2\n14\n-0.5\n24\n-0.5\n14\n${wPx - 0.5}\n24\n${hPx - 0.5}\n`);
  }
  /** Attach another DXF as external reference at 0,0,0. */
  xref(layer, name, path) {
    const rec = this.h(), blk = this.h(), end = this.h();
    this.xrefs.push({ name, path, rec, blk, end });
    this.entities.push(
      `0\nINSERT\n5\n${this.h()}\n330\n${this.ms}\n100\nAcDbEntity\n8\n${layer}\n100\nAcDbBlockReference\n2\n${name}\n10\n0.0\n20\n0.0\n30\n0.0\n`);
  }

  toString() {
    const out = [];
    const p = (c, v) => out.push(`${c}\n${v}`);
    const tbl = {}; for (const k of ['VPORT', 'LTYPE', 'LAYER', 'STYLE', 'VIEW', 'UCS', 'APPID', 'DIMSTYLE', 'BLOCK_RECORD']) tbl[k] = this.h();
    const [x0, y0, x1, y1] = this.ext || [0, 0, 1, 1];
    const ltByLayer = this.h(), ltByBlock = this.h(), ltCont = this.h();
    const rootDict = this.h(), groupDict = this.h(), imgDict = this.h(), imgVars = this.h();
    const hasImg = this.images.length > 0;

    // HEADER
    out.push('0\nSECTION\n2\nHEADER');
    p(9, '$ACADVER'); p(1, 'AC1015');
    p(9, '$INSBASE'); out.push('10\n0.0\n20\n0.0\n30\n0.0');
    p(9, '$EXTMIN'); out.push(`10\n${x0}\n20\n${y0}\n30\n0.0`);
    p(9, '$EXTMAX'); out.push(`10\n${x1}\n20\n${y1}\n30\n0.0`);
    p(9, '$MEASUREMENT'); p(70, 1);
    p(9, '$INSUNITS'); p(70, 6);
    p(9, '$LUNITS'); p(70, 2);
    p(9, '$LUPREC'); p(70, 3);
    p(9, '$CLAYER'); p(8, '0');
    p(9, '$HANDSEED'); p(5, (this._h + 64).toString(16).toUpperCase());
    out.push('0\nENDSEC');

    // CLASSES
    out.push('0\nSECTION\n2\nCLASSES');
    if (hasImg) {
      out.push('0\nCLASS\n1\nIMAGE\n2\nAcDbRasterImage\n3\nISM\n90\n2175\n280\n0\n281\n1');
      out.push('0\nCLASS\n1\nIMAGEDEF\n2\nAcDbRasterImageDef\n3\nISM\n90\n0\n280\n0\n281\n0');
      out.push('0\nCLASS\n1\nIMAGEDEF_REACTOR\n2\nAcDbRasterImageDefReactor\n3\nISM\n90\n1\n280\n0\n281\n0');
      out.push('0\nCLASS\n1\nRASTERVARIABLES\n2\nAcDbRasterVariables\n3\nISM\n90\n0\n280\n0\n281\n0');
    }
    out.push('0\nENDSEC');

    // TABLES
    out.push('0\nSECTION\n2\nTABLES');
    const table = (name, count, body) => out.push(`0\nTABLE\n2\n${name}\n5\n${tbl[name]}\n330\n0\n100\nAcDbSymbolTable\n70\n${count}\n${body}0\nENDTAB`);
    table('VPORT', 1, `0\nVPORT\n5\n${this.h()}\n330\n${tbl.VPORT}\n100\nAcDbSymbolTableRecord\n100\nAcDbViewportTableRecord\n2\n*Active\n70\n0\n10\n0.0\n20\n0.0\n11\n1.0\n21\n1.0\n12\n${(x0 + x1) / 2}\n22\n${(y0 + y1) / 2}\n13\n0.0\n23\n0.0\n14\n10.0\n24\n10.0\n15\n10.0\n25\n10.0\n16\n0.0\n26\n0.0\n36\n1.0\n17\n0.0\n27\n0.0\n37\n0.0\n40\n${Math.max(y1 - y0, 10) * 1.2}\n41\n1.5\n42\n50.0\n43\n0.0\n44\n0.0\n50\n0.0\n51\n0.0\n71\n0\n72\n100\n73\n1\n74\n3\n75\n0\n76\n0\n77\n0\n78\n0\n`);
    table('LTYPE', 3,
      `0\nLTYPE\n5\n${ltByBlock}\n330\n${tbl.LTYPE}\n100\nAcDbSymbolTableRecord\n100\nAcDbLinetypeTableRecord\n2\nByBlock\n70\n0\n3\n\n72\n65\n73\n0\n40\n0.0\n` +
      `0\nLTYPE\n5\n${ltByLayer}\n330\n${tbl.LTYPE}\n100\nAcDbSymbolTableRecord\n100\nAcDbLinetypeTableRecord\n2\nByLayer\n70\n0\n3\n\n72\n65\n73\n0\n40\n0.0\n` +
      `0\nLTYPE\n5\n${ltCont}\n330\n${tbl.LTYPE}\n100\nAcDbSymbolTableRecord\n100\nAcDbLinetypeTableRecord\n2\nCONTINUOUS\n70\n0\n3\nSolid line\n72\n65\n73\n0\n40\n0.0\n`);
    let lay = '';
    for (const [name, color] of this.layers)
      lay += `0\nLAYER\n5\n${this.h()}\n330\n${tbl.LAYER}\n100\nAcDbSymbolTableRecord\n100\nAcDbLayerTableRecord\n2\n${name}\n70\n0\n62\n${color}\n6\nCONTINUOUS\n`;
    table('LAYER', this.layers.size, lay);
    table('STYLE', 1, `0\nSTYLE\n5\n${this.h()}\n330\n${tbl.STYLE}\n100\nAcDbSymbolTableRecord\n100\nAcDbTextStyleTableRecord\n2\nSTANDARD\n70\n0\n40\n0.0\n41\n1.0\n50\n0.0\n71\n0\n42\n2.5\n3\ntxt\n4\n\n`);
    table('VIEW', 0, '');
    table('UCS', 0, '');
    table('APPID', 1, `0\nAPPID\n5\n${this.h()}\n330\n${tbl.APPID}\n100\nAcDbSymbolTableRecord\n100\nAcDbRegAppTableRecord\n2\nACAD\n70\n0\n`);
    table('DIMSTYLE', 1, `0\nDIMSTYLE\n105\n${this.h()}\n330\n${tbl.DIMSTYLE}\n100\nAcDbSymbolTableRecord\n100\nAcDbDimStyleTableRecord\n2\nSTANDARD\n70\n0\n`);
    let br = `0\nBLOCK_RECORD\n5\n${this.ms}\n330\n${tbl.BLOCK_RECORD}\n100\nAcDbSymbolTableRecord\n100\nAcDbBlockTableRecord\n2\n*Model_Space\n70\n0\n280\n1\n281\n0\n` +
             `0\nBLOCK_RECORD\n5\n${this.ps}\n330\n${tbl.BLOCK_RECORD}\n100\nAcDbSymbolTableRecord\n100\nAcDbBlockTableRecord\n2\n*Paper_Space\n70\n0\n280\n1\n281\n0\n`;
    for (const x of this.xrefs)
      br += `0\nBLOCK_RECORD\n5\n${x.rec}\n330\n${tbl.BLOCK_RECORD}\n100\nAcDbSymbolTableRecord\n100\nAcDbBlockTableRecord\n2\n${x.name}\n1\n${x.path}\n70\n0\n280\n1\n281\n0\n`;
    table('BLOCK_RECORD', 2 + this.xrefs.length, br);
    out.push('0\nENDSEC');

    // BLOCKS
    out.push('0\nSECTION\n2\nBLOCKS');
    const blk = (name, rec, bh, eh, layer, flags, path) =>
      out.push(`0\nBLOCK\n5\n${bh}\n330\n${rec}\n100\nAcDbEntity\n8\n${layer}\n100\nAcDbBlockBegin\n2\n${name}\n70\n${flags}\n10\n0.0\n20\n0.0\n30\n0.0\n3\n${name}\n1\n${path || ''}\n0\nENDBLK\n5\n${eh}\n330\n${rec}\n100\nAcDbEntity\n8\n${layer}\n100\nAcDbBlockEnd`);
    blk('*Model_Space', this.ms, this.h(), this.h(), '0', 0);
    blk('*Paper_Space', this.ps, this.h(), this.h(), '0', 0);
    for (const x of this.xrefs) blk(x.name, x.rec, x.blk, x.end, '0', 20, x.path);
    out.push('0\nENDSEC');

    // ENTITIES
    out.push('0\nSECTION\n2\nENTITIES');
    for (const e of this.entities) out.push(e.replace(/\n$/, ''));
    out.push('0\nENDSEC');

    // OBJECTS
    out.push('0\nSECTION\n2\nOBJECTS');
    out.push(`0\nDICTIONARY\n5\n${rootDict}\n330\n0\n100\nAcDbDictionary\n281\n1\n3\nACAD_GROUP\n350\n${groupDict}` +
      (hasImg ? `\n3\nACAD_IMAGE_DICT\n350\n${imgDict}\n3\nACAD_IMAGE_VARS\n350\n${imgVars}` : ''));
    out.push(`0\nDICTIONARY\n5\n${groupDict}\n330\n${rootDict}\n100\nAcDbDictionary\n281\n1`);
    if (hasImg) {
      let d = `0\nDICTIONARY\n5\n${imgDict}\n330\n${rootDict}\n100\nAcDbDictionary\n281\n1`;
      for (const im of this.images) d += `\n3\n${safeName(im.file)}\n350\n${im.def}`;
      out.push(d);
      out.push(`0\nRASTERVARIABLES\n5\n${imgVars}\n102\n{ACAD_REACTORS\n330\n${rootDict}\n102\n}\n330\n${rootDict}\n100\nAcDbRasterVariables\n90\n0\n70\n0\n71\n1\n72\n3`);
      for (const im of this.images) {
        out.push(`0\nIMAGEDEF\n5\n${im.def}\n102\n{ACAD_REACTORS\n330\n${imgDict}\n330\n${im.reactor}\n102\n}\n330\n${imgDict}\n100\nAcDbRasterImageDef\n90\n0\n1\n${im.file}\n10\n${im.wPx}\n20\n${im.hPx}\n11\n1.0\n21\n1.0\n280\n1\n281\n0`);
        out.push(`0\nIMAGEDEF_REACTOR\n5\n${im.reactor}\n330\n${im.ent}\n100\nAcDbRasterImageDefReactor\n90\n2\n330\n${im.ent}`);
      }
    }
    out.push('0\nENDSEC\n0\nEOF\n');
    return out.join('\n').replace(/\n/g, '\r\n');
  }
}
