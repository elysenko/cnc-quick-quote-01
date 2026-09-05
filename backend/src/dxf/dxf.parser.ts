import {
  FlattenedPath,
  PolyVertex,
  bulgeSegment,
  flattenArc,
  flattenCircle,
  flattenVertices,
} from './dxf.geometry';

export {
  arcSegmentCount,
  bulgeSegment,
  distance,
  flattenArc,
  flattenCircle,
  flattenVertices,
} from './dxf.geometry';
export type { FlattenedPath, Point2d, PolyVertex } from './dxf.geometry';

/**
 * Result of reading one DXF upload. Everything is full-precision millimetres:
 * rounding here would compound through the quote maths, so callers round only
 * at the point of display.
 */
export interface ParsedGeometry {
  /** Flattened outline, part-local mm, translated so bbox min is (0,0). */
  polylines: number[][][];
  /** Sum of the true length of every cut path, in mm (arcs measured as arc length). */
  cutLengthMm: number;
  bboxWidthMm: number;
  bboxHeightMm: number;
  /** Count of whitelisted entities successfully converted. */
  entityCount: number;
  /** Count of entities skipped because their type is not on the whitelist. */
  skippedEntities: number;
}

/**
 * Thrown for any DXF we refuse to price. The message is user-facing on purpose:
 * "we could not read your file" is useless to someone trying to fix an export.
 */
export class DxfParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DxfParseError';
  }
}

/** One group-code / value pair — the entire DXF file format, really. */
interface GroupPair {
  code: number;
  value: string;
}

/** A `0/TYPE` record with the pairs that follow it. */
interface EntityRecord {
  type: string;
  pairs: GroupPair[];
}

/**
 * Records that only structure the file (they are not drawable geometry), so
 * they must not inflate `skippedEntities` and alarm the customer.
 */
const STRUCTURAL_TYPES = new Set(['SEQEND', 'VERTEX', 'BLOCK', 'ENDBLK', 'ENDSEC', 'EOF']);

const BINARY_SENTINEL = 'AutoCAD Binary DXF';

/** A DXF always contains at least one of these as a standalone value line. */
const DXF_MARKER = /^[ \t]*(SECTION|ENTITIES)[ \t\r]*$/m;

const MSG_EMPTY = 'The uploaded file is empty. Please export the part again and re-upload it.';
const MSG_BINARY =
  'This is a binary DXF. Please re-export it as an ASCII/plain DXF (in AutoCAD: DXFOUT → ASCII).';
const MSG_NOT_DXF =
  'This file is not a DXF drawing. Please upload a 2D DXF exported from your CAD package.';
const MSG_TRUNCATED =
  'This DXF file is incomplete or corrupted — it ends part-way through the drawing data. Please re-export and upload it again.';
const MSG_NO_GEOMETRY =
  'This drawing contained no supported geometry. The cut path must be made of lines, arcs, circles or polylines (splines, text and dimensions are ignored).';

/**
 * Parse an ASCII DXF into a flattened, origin-normalised outline.
 *
 * Only 2D cutting geometry is understood; anything else is counted and ignored
 * so the caller can warn ("3 entities skipped") instead of failing the upload.
 */
export function parseDxf(source: string | Buffer): ParsedGeometry {
  const text = typeof source === 'string' ? source : source.toString('utf8');

  if (text.trim().length === 0) {
    throw new DxfParseError(MSG_EMPTY);
  }
  if (text.trimStart().startsWith(BINARY_SENTINEL)) {
    throw new DxfParseError(MSG_BINARY);
  }
  if (!DXF_MARKER.test(text)) {
    throw new DxfParseError(MSG_NOT_DXF);
  }

  const pairs = tokenize(text);
  const { entities, blocks } = collectSectionBodies(pairs);

  // BLOCKS is a fallback only: some exporters wrap the whole part in a block and
  // leave ENTITIES empty. When both carry geometry, ENTITIES is the real drawing.
  const records = entities.length > 0 ? entities : blocks;
  return convert(records);
}

/**
 * Split the file into group-code pairs. DXF is strictly two lines per pair, so
 * an odd tally is the cheapest reliable truncation check there is.
 */
function tokenize(text: string): GroupPair[] {
  const lines = text.split(/\r\n|\n|\r/);
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
    lines.pop();
  }
  if (lines.length % 2 !== 0) {
    throw new DxfParseError(MSG_TRUNCATED);
  }

  const pairs: GroupPair[] = [];
  for (let i = 0; i < lines.length; i += 2) {
    const rawCode = lines[i].trim();
    const code = Number(rawCode);
    if (rawCode.length === 0 || !Number.isInteger(code)) {
      throw new DxfParseError(MSG_NOT_DXF);
    }
    pairs.push({ code, value: lines[i + 1].trim() });
  }
  return pairs;
}

/** Gather the raw pairs of the ENTITIES and BLOCKS sections, as entity records. */
function collectSectionBodies(pairs: GroupPair[]): {
  entities: EntityRecord[];
  blocks: EntityRecord[];
} {
  const entityPairs: GroupPair[] = [];
  const blockPairs: GroupPair[] = [];

  let i = 0;
  while (i < pairs.length) {
    const pair = pairs[i];
    if (pair.code !== 0 || pair.value.toUpperCase() !== 'SECTION') {
      i += 1;
      continue;
    }

    const namePair = pairs[i + 1];
    if (!namePair || namePair.code !== 2) {
      throw new DxfParseError(MSG_TRUNCATED);
    }
    const name = namePair.value.toUpperCase();

    let end = -1;
    for (let j = i + 2; j < pairs.length; j += 1) {
      if (pairs[j].code === 0 && pairs[j].value.toUpperCase() === 'ENDSEC') {
        end = j;
        break;
      }
    }
    if (end === -1) {
      throw new DxfParseError(MSG_TRUNCATED);
    }

    const body = pairs.slice(i + 2, end);
    if (name === 'ENTITIES') {
      entityPairs.push(...body);
    } else if (name === 'BLOCKS') {
      blockPairs.push(...body);
    }
    i = end + 1;
  }

  return {
    entities: groupEntities(entityPairs),
    blocks: groupEntities(blockPairs).filter((r) => r.type !== 'BLOCK' && r.type !== 'ENDBLK'),
  };
}

/** Every code-0 pair opens a new entity; the pairs after it are its payload. */
function groupEntities(body: GroupPair[]): EntityRecord[] {
  const records: EntityRecord[] = [];
  let current: EntityRecord | null = null;
  for (const pair of body) {
    if (pair.code === 0) {
      current = { type: pair.value.toUpperCase(), pairs: [] };
      records.push(current);
    } else if (current) {
      current.pairs.push(pair);
    }
  }
  return records;
}

/** First value for a group code, as a finite number, or undefined. */
function num(record: EntityRecord, code: number): number | undefined {
  for (const pair of record.pairs) {
    if (pair.code === code) {
      const value = Number(pair.value);
      return Number.isFinite(value) ? value : undefined;
    }
  }
  return undefined;
}

/** Bit 1 of group code 70 means "closed" for both LWPOLYLINE and POLYLINE. */
function isClosed(record: EntityRecord): boolean {
  const flags = num(record, 70);
  return flags !== undefined && (Math.trunc(flags) & 1) === 1;
}

/** Dispatch every record, accumulating paths, lengths and the skip tally. */
function convert(records: EntityRecord[]): ParsedGeometry {
  const polylines: number[][][] = [];
  let cutLengthMm = 0;
  let entityCount = 0;
  let skippedEntities = 0;

  const accept = (path: FlattenedPath | null): void => {
    if (!path || path.points.length < 2) {
      skippedEntities += 1;
      return;
    }
    polylines.push(path.points);
    cutLengthMm += path.lengthMm;
    entityCount += 1;
  };

  for (let i = 0; i < records.length; i += 1) {
    const record = records[i];
    switch (record.type) {
      case 'LINE':
        accept(convertLine(record));
        break;
      case 'CIRCLE':
        accept(convertCircle(record));
        break;
      case 'ARC':
        accept(convertArc(record));
        break;
      case 'LWPOLYLINE':
        accept(flattenVertices(readLwVertices(record), isClosed(record)));
        break;
      case 'POLYLINE': {
        const collected = collectPolylineVertices(records, i);
        i = collected.nextIndex;
        accept(flattenVertices(collected.vertices, isClosed(record)));
        break;
      }
      default:
        if (!STRUCTURAL_TYPES.has(record.type)) {
          skippedEntities += 1;
        }
    }
  }

  if (entityCount === 0) {
    throw new DxfParseError(MSG_NO_GEOMETRY);
  }

  return normalise(polylines, cutLengthMm, entityCount, skippedEntities);
}

function convertLine(record: EntityRecord): FlattenedPath | null {
  const x1 = num(record, 10);
  const y1 = num(record, 20);
  const x2 = num(record, 11);
  const y2 = num(record, 21);
  if (x1 === undefined || y1 === undefined || x2 === undefined || y2 === undefined) {
    return null;
  }
  return bulgeSegment({ x: x1, y: y1 }, { x: x2, y: y2 }, 0);
}

function convertCircle(record: EntityRecord): FlattenedPath | null {
  const cx = num(record, 10);
  const cy = num(record, 20);
  const radius = num(record, 40);
  if (cx === undefined || cy === undefined || radius === undefined || radius <= 0) {
    return null;
  }
  return flattenCircle(cx, cy, radius);
}

/**
 * ARC sweeps counter-clockwise from code 50 to code 51. The sweep is normalised
 * into (0, 360] so a 0°→0° arc reads as a full circle rather than a zero-length
 * (free) cut.
 */
function convertArc(record: EntityRecord): FlattenedPath | null {
  const cx = num(record, 10);
  const cy = num(record, 20);
  const radius = num(record, 40);
  const startDeg = num(record, 50);
  const endDeg = num(record, 51);
  if (
    cx === undefined ||
    cy === undefined ||
    radius === undefined ||
    radius <= 0 ||
    startDeg === undefined ||
    endDeg === undefined
  ) {
    return null;
  }
  const rawSweep = (((endDeg - startDeg) % 360) + 360) % 360;
  const sweepDeg = rawSweep === 0 ? 360 : rawSweep;
  return flattenArc(cx, cy, radius, (startDeg * Math.PI) / 180, (sweepDeg * Math.PI) / 180);
}

/** LWPOLYLINE stores vertices inline; a 42 bulge belongs to the vertex before it. */
function readLwVertices(record: EntityRecord): PolyVertex[] {
  const vertices: PolyVertex[] = [];
  let current: PolyVertex | null = null;
  for (const pair of record.pairs) {
    const value = Number(pair.value);
    if (pair.code === 10 && Number.isFinite(value)) {
      current = { x: value, y: 0, bulge: 0 };
      vertices.push(current);
    } else if (pair.code === 20 && current && Number.isFinite(value)) {
      current.y = value;
    } else if (pair.code === 42 && current && Number.isFinite(value)) {
      current.bulge = value;
    }
  }
  return vertices;
}

/**
 * Old-style POLYLINE keeps its vertices in sibling VERTEX records terminated by
 * SEQEND, so it has to consume records past its own index.
 */
function collectPolylineVertices(
  records: EntityRecord[],
  startIndex: number,
): { vertices: PolyVertex[]; nextIndex: number } {
  const vertices: PolyVertex[] = [];
  let i = startIndex + 1;
  for (; i < records.length; i += 1) {
    const record = records[i];
    if (record.type === 'SEQEND') {
      break;
    }
    if (record.type !== 'VERTEX') {
      i -= 1;
      break;
    }
    const x = num(record, 10);
    const y = num(record, 20);
    if (x === undefined || y === undefined) {
      continue;
    }
    vertices.push({ x, y, bulge: num(record, 42) ?? 0 });
  }
  return { vertices, nextIndex: i };
}

/**
 * Translate so the bounding box starts at (0,0). Downstream nesting and preview
 * code assumes part-local coordinates; CAD files routinely sit far from origin.
 */
function normalise(
  polylines: number[][][],
  cutLengthMm: number,
  entityCount: number,
  skippedEntities: number,
): ParsedGeometry {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const polyline of polylines) {
    for (const [x, y] of polyline) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {
    throw new DxfParseError(MSG_NO_GEOMETRY);
  }

  return {
    polylines: polylines.map((polyline) => polyline.map(([x, y]) => [x - minX, y - minY])),
    cutLengthMm,
    bboxWidthMm: maxX - minX,
    bboxHeightMm: maxY - minY,
    entityCount,
    skippedEntities,
  };
}
