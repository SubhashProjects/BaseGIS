import type { ImportFeature } from './dataManagementService';

function readVarint(bytes: Uint8Array, offset: number): [number, number] {
  let res = 0;
  for (let i = 0; i < 9; i++) {
    if (offset + i >= bytes.length) return [res, bytes.length];
    const b = bytes[offset + i];
    if (i === 8) {
      res = (res << 8) | b;
      return [res, offset + 9];
    }
    res = (res << 7) | (b & 0x7f);
    if ((b & 0x80) === 0) {
      return [res, offset + i + 1];
    }
  }
  return [res, offset + 9];
}

function parseGpkgGeometry(blob: Uint8Array): any | null {
  if (!blob || blob.length < 8 || blob[0] !== 0x47 || blob[1] !== 0x50) {
    return null;
  }

  const flags = blob[3];
  const envelopeType = (flags >> 1) & 0x07;
  const envSizes: Record<number, number> = { 0: 0, 1: 32, 2: 48, 3: 48, 4: 64 };
  const offset = 8 + (envSizes[envelopeType] ?? 0);
  if (offset >= blob.length) return null;

  const wkb = blob.subarray(offset);
  if (wkb.length < 5) return null;

  const view = new DataView(wkb.buffer, wkb.byteOffset, wkb.byteLength);
  const isLittle = wkb[0] === 1;
  const geomType = view.getUint32(1, isLittle);
  const baseType = geomType % 1000;

  if (baseType === 1) {
    // Point
    if (wkb.length < 21) return null;
    const x = view.getFloat64(5, isLittle);
    const y = view.getFloat64(13, isLittle);
    return {
      type: 'Point',
      coordinates: [Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6],
    };
  }

  if (baseType === 2) {
    // LineString
    if (wkb.length < 9) return null;
    const numPoints = view.getUint32(5, isLittle);
    const is3D = (geomType >= 1000 && geomType < 2000) || geomType >= 3000;
    const ptSize = is3D ? 24 : 16;
    const points: [number, number][] = [];
    for (let i = 0; i < numPoints; i++) {
      const ptOffset = 9 + i * ptSize;
      if (ptOffset + 16 > wkb.length) break;
      const x = view.getFloat64(ptOffset, isLittle);
      const y = view.getFloat64(ptOffset + 8, isLittle);
      points.push([Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6]);
    }
    return { type: 'LineString', coordinates: points };
  }

  if (baseType === 5) {
    // MultiLineString
    if (wkb.length < 9) return null;
    const numLines = view.getUint32(5, isLittle);
    const lines: [number, number][][] = [];
    let curr = 9;
    for (let l = 0; l < numLines; l++) {
      if (curr + 9 > wkb.length) break;
      const subLittle = wkb[curr] === 1;
      const subType = view.getUint32(curr + 1, subLittle);
      const subIs3D = (subType >= 1000 && subType < 2000) || subType >= 3000;
      const ptSize = subIs3D ? 24 : 16;
      const subNumPts = view.getUint32(curr + 5, subLittle);
      const pts: [number, number][] = [];
      let currPts = curr + 9;
      for (let p = 0; p < subNumPts; p++) {
        if (currPts + 16 > wkb.length) break;
        const x = view.getFloat64(currPts, subLittle);
        const y = view.getFloat64(currPts + 8, subLittle);
        pts.push([Math.round(x * 1e6) / 1e6, Math.round(y * 1e6) / 1e6]);
        currPts += ptSize;
      }
      lines.push(pts);
      curr = currPts;
    }
    return { type: 'MultiLineString', coordinates: lines };
  }

  return null;
}

export function parseGeoPackageArrayBuffer(buffer: ArrayBuffer, defaultType: string): ImportFeature[] {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 100) return [];

  // Check magic "SQLite format 3\0"
  const magic = String.fromCharCode(...bytes.subarray(0, 15));
  if (!magic.startsWith('SQLite format 3')) {
    throw new Error('Invalid GeoPackage / SQLite file format.');
  }

  const view = new DataView(buffer);
  let pageSize = view.getUint16(16, false);
  if (pageSize === 1) pageSize = 65536;

  const numPages = Math.floor(bytes.length / pageSize);
  const features: ImportFeature[] = [];

  for (let p = 0; p < numPages; p++) {
    const pageStart = p * pageSize;
    const headerOffset = p === 0 ? 100 : 0;
    const pageType = bytes[pageStart + headerOffset];

    // 0x0d = Leaf table B-tree page
    if (pageType === 0x0d) {
      const numCells = view.getUint16(pageStart + headerOffset + 3, false);
      const ptrOffset = pageStart + headerOffset + 8;

      for (let c = 0; c < numCells; c++) {
        if (ptrOffset + c * 2 + 2 > bytes.length) break;
        const cellPtr = view.getUint16(ptrOffset + c * 2, false);
        const cellAbs = pageStart + cellPtr;
        if (cellAbs >= bytes.length) continue;

        let off = cellAbs;
        const [, nextOff] = readVarint(bytes, off);
        off = nextOff;
        const [rowid, offAfterRowid] = readVarint(bytes, off);
        off = offAfterRowid;

        const [headerLen, offAfterHdrLen] = readVarint(bytes, off);
        const headerEnd = off + headerLen;
        let offCol = offAfterHdrLen;
        const colTypes: number[] = [];
        while (offCol < headerEnd && offCol < bytes.length) {
          const [st, nextColOff] = readVarint(bytes, offCol);
          colTypes.push(st);
          offCol = nextColOff;
        }

        let valOffset = headerEnd;
        const rowVals: any[] = [];
        let geomObj: any = null;

        for (const st of colTypes) {
          if (valOffset >= bytes.length) break;
          if (st === 0) {
            rowVals.push(null);
          } else if (st === 1) {
            rowVals.push(view.getInt8(valOffset));
            valOffset += 1;
          } else if (st === 2) {
            rowVals.push(view.getInt16(valOffset, false));
            valOffset += 2;
          } else if (st === 3) {
            const b0 = bytes[valOffset];
            const b1 = bytes[valOffset + 1];
            const b2 = bytes[valOffset + 2];
            const val = ((b0 << 24) >> 8) | (b1 << 8) | b2;
            rowVals.push(val);
            valOffset += 3;
          } else if (st === 4) {
            rowVals.push(view.getInt32(valOffset, false));
            valOffset += 4;
          } else if (st === 5) {
            valOffset += 6;
            rowVals.push(null);
          } else if (st === 6) {
            valOffset += 8;
            rowVals.push(null);
          } else if (st === 7) {
            rowVals.push(view.getFloat64(valOffset, false));
            valOffset += 8;
          } else if (st === 8) {
            rowVals.push(0);
          } else if (st === 9) {
            rowVals.push(1);
          } else if (st >= 12 && st % 2 === 0) {
            const blobLen = (st - 12) / 2;
            const blobSlice = bytes.subarray(valOffset, valOffset + blobLen);
            valOffset += blobLen;
            if (blobSlice[0] === 0x47 && blobSlice[1] === 0x50) {
              geomObj = parseGpkgGeometry(blobSlice);
            }
            rowVals.push(null);
          } else if (st >= 13 && st % 2 === 1) {
            const textLen = (st - 13) / 2;
            const textSlice = bytes.subarray(valOffset, valOffset + textLen);
            valOffset += textLen;
            try {
              rowVals.push(new TextDecoder('utf-8').decode(textSlice));
            } catch {
              rowVals.push(null);
            }
          }
        }

        if (geomObj) {
          const textCols = rowVals.filter((v) => typeof v === 'string' && v.trim() !== '');
          const assetName = textCols[0] || `GPKG-${rowid}`;
          features.push({
            assetNo: String(assetName),
            assetType: defaultType,
            status: 'ACTIVE',
            geometry: geomObj,
            latitude: geomObj.type === 'Point' ? geomObj.coordinates[1] : undefined,
            longitude: geomObj.type === 'Point' ? geomObj.coordinates[0] : undefined,
            metadata: {
              source: 'GeoPackage Import',
              fid: rowid,
              attributes: textCols,
            },
          });
        }
      }
    }
  }

  return features;
}
