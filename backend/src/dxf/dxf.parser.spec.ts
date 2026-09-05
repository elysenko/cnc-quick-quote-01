import * as fs from 'fs';
import * as path from 'path';
import { DxfParseError, ParsedGeometry, parseDxf } from './dxf.parser';
import { DxfService } from './dxf.service';

/** Fixtures are checked-in ASCII DXF so the tests exercise real byte streams. */
function fixture(name: string): Buffer {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name));
}

function parseFixture(name: string): ParsedGeometry {
  return parseDxf(fixture(name));
}

/** Chord sum of the flattened output — always shorter than the true arc length. */
function chordSum(geometry: ParsedGeometry): number {
  let total = 0;
  for (const polyline of geometry.polylines) {
    for (let i = 1; i < polyline.length; i += 1) {
      total += Math.hypot(polyline[i][0] - polyline[i - 1][0], polyline[i][1] - polyline[i - 1][1]);
    }
  }
  return total;
}

function minX(geometry: ParsedGeometry): number {
  return Math.min(...geometry.polylines.flat().map((point) => point[0]));
}

function minY(geometry: ParsedGeometry): number {
  return Math.min(...geometry.polylines.flat().map((point) => point[1]));
}

describe('parseDxf', () => {
  describe('straight geometry', () => {
    it('measures a 100x50 rectangle built from four LINE entities', () => {
      const geometry = parseFixture('rect-lines.dxf');

      expect(Math.abs(geometry.cutLengthMm - 300)).toBeLessThan(1e-6);
      expect(geometry.bboxWidthMm).toBeCloseTo(100, 9);
      expect(geometry.bboxHeightMm).toBeCloseTo(50, 9);
      expect(geometry.entityCount).toBe(4);
      expect(geometry.skippedEntities).toBe(0);
      expect(geometry.polylines).toHaveLength(4);
    });

    it('tolerates CRLF line endings and indented group codes', () => {
      const geometry = parseFixture('crlf-whitespace.dxf');

      expect(Math.abs(geometry.cutLengthMm - 300)).toBeLessThan(1e-6);
      expect(geometry.entityCount).toBe(4);
    });

    it('reads an old-style POLYLINE / VERTEX / SEQEND run as one closed loop', () => {
      const geometry = parseFixture('polyline-vertex.dxf');

      // 20 x 10 closed rectangle: the closing segment must be counted.
      expect(Math.abs(geometry.cutLengthMm - 60)).toBeLessThan(1e-6);
      expect(geometry.entityCount).toBe(1);
      expect(geometry.skippedEntities).toBe(0);
      expect(geometry.bboxWidthMm).toBeCloseTo(20, 9);
      expect(geometry.bboxHeightMm).toBeCloseTo(10, 9);
    });

    it('falls back to BLOCKS geometry when the ENTITIES section is empty', () => {
      const geometry = parseFixture('blocks-only.dxf');

      expect(geometry.entityCount).toBe(2);
      expect(Math.abs(geometry.cutLengthMm - 50)).toBeLessThan(1e-6);
    });
  });

  describe('curved geometry (pricing regression guards)', () => {
    it('measures two 180 degree bulges as a true 100 mm circle, not chords', () => {
      const geometry = parseFixture('bulge-circle.dxf');

      // Perimeter of a circle of diameter 100. Asserted to 1e-6 because this
      // number is multiplied by the per-mm cut rate on every quote.
      expect(Math.abs(geometry.cutLengthMm - Math.PI * 100)).toBeLessThan(1e-6);
      expect(geometry.cutLengthMm).toBeCloseTo(Math.PI * 100, 9);

      // Prove the arcs are not measured as their chords: the naive chord sum of
      // the flattened outline is materially shorter than the true perimeter.
      expect(geometry.cutLengthMm).toBeGreaterThan(300);
      expect(chordSum(geometry)).toBeLessThan(geometry.cutLengthMm - 1);

      expect(geometry.entityCount).toBe(1);
      expect(geometry.bboxWidthMm).toBeCloseTo(100, 6);
      expect(geometry.bboxHeightMm).toBeCloseTo(100, 6);
    });

    it('measures a CIRCLE analytically as 2 pi r', () => {
      const geometry = parseFixture('circle.dxf');

      expect(Math.abs(geometry.cutLengthMm - 2 * Math.PI * 10)).toBeLessThan(1e-6);
      expect(geometry.bboxWidthMm).toBeCloseTo(20, 9);
      expect(geometry.bboxHeightMm).toBeCloseTo(20, 9);
      expect(geometry.entityCount).toBe(1);
      expect(chordSum(geometry)).toBeLessThan(geometry.cutLengthMm);
    });

    it('measures a 90 degree ARC as r * sweptRadians', () => {
      const geometry = parseFixture('arc.dxf');

      expect(Math.abs(geometry.cutLengthMm - 10 * (Math.PI / 2))).toBeLessThan(1e-6);
      expect(geometry.entityCount).toBe(1);
      expect(geometry.bboxWidthMm).toBeCloseTo(10, 6);
      expect(geometry.bboxHeightMm).toBeCloseTo(10, 6);
    });
  });

  describe('unsupported entities', () => {
    it('counts SPLINE and TEXT as skipped without failing the upload', () => {
      const geometry = parseFixture('skipped-entities.dxf');

      expect(geometry.entityCount).toBe(2);
      expect(geometry.skippedEntities).toBe(2);
    });
  });

  describe('origin normalisation', () => {
    it('translates a part drawn at x in [500, 600] back to the origin', () => {
      const geometry = parseFixture('offset-rect.dxf');

      expect(minX(geometry)).toBeCloseTo(0, 9);
      expect(minY(geometry)).toBeCloseTo(0, 9);
      expect(geometry.bboxWidthMm).toBeCloseTo(100, 9);
      expect(geometry.bboxHeightMm).toBeCloseTo(40, 9);
    });
  });

  describe('rejections', () => {
    it('rejects an empty ENTITIES section', () => {
      expect(() => parseFixture('empty-entities.dxf')).toThrow(DxfParseError);
      expect(() => parseFixture('empty-entities.dxf')).toThrow(/no supported geometry/i);
    });

    it('rejects a drawing that only contains unsupported entities', () => {
      const onlyText = fixture('skipped-entities.dxf').toString('utf8').replace(/LINE/g, 'MTEXT');

      expect(() => parseDxf(onlyText)).toThrow(/no supported geometry/i);
    });

    it('rejects a file truncated mid group-code stream', () => {
      expect(() => parseFixture('truncated.dxf')).toThrow(DxfParseError);
      expect(() => parseFixture('truncated.dxf')).toThrow(/incomplete or corrupted/i);
    });

    it('rejects a SECTION that is never closed by ENDSEC', () => {
      const unclosed = ['0', 'SECTION', '2', 'ENTITIES', '0', 'LINE', '10', '0.0'].join('\n');

      expect(() => parseDxf(unclosed)).toThrow(DxfParseError);
    });

    it('rejects a file that is not a DXF at all', () => {
      expect(() => parseDxf('hello world')).toThrow(DxfParseError);
      expect(() => parseDxf('hello world')).toThrow(/not a DXF/i);
    });

    it('rejects empty and whitespace-only input', () => {
      expect(() => parseDxf('')).toThrow(DxfParseError);
      expect(() => parseDxf('   \n\r\n   ')).toThrow(/empty/i);
      expect(() => parseDxf(Buffer.alloc(0))).toThrow(DxfParseError);
    });

    it('rejects binary DXF with an actionable message', () => {
      const binary = Buffer.from('AutoCAD Binary DXF\r\n   ', 'binary');

      expect(() => parseDxf(binary)).toThrow(/binary DXF/i);
    });
  });
});

describe('DxfService', () => {
  const service = new DxfService();

  it('delegates to the parser', () => {
    const geometry = service.parse(fixture('rect-lines.dxf'));

    expect(geometry.entityCount).toBe(4);
    expect(Math.abs(geometry.cutLengthMm - 300)).toBeLessThan(1e-6);
  });

  it('rethrows DxfParseError untouched', () => {
    expect(() => service.parse(Buffer.from('hello world'))).toThrow(DxfParseError);
  });
});
