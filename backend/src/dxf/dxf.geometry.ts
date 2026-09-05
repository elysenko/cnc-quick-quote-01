/**
 * Pure geometry helpers for DXF flattening.
 *
 * Split out of `dxf.parser.ts` because the bulge/arc maths is the part that
 * decides whether a curved part is priced correctly: it is worth reading and
 * testing on its own, without the group-code plumbing around it.
 *
 * Every helper reports curve length ANALYTICALLY (r * sweptAngle) rather than
 * summing the flattened chords. Chord sums always undershoot the true cut path,
 * which would systematically under-price curved parts.
 */

/** Minimum segments per arc — keeps tiny arcs from collapsing to a single chord. */
const MIN_ARC_SEGMENTS = 4;

/** Target angular step when flattening: 22.5°, smooth enough for an SVG preview. */
const ARC_STEP_RADIANS = Math.PI / 8;

/** A 2D point in part-local millimetres. */
export interface Point2d {
  x: number;
  y: number;
}

/**
 * One vertex of a polyline. `bulge` belongs to the segment that STARTS here
 * (DXF convention), so the last vertex of a closed shape carries the bulge of
 * the closing segment.
 */
export interface PolyVertex extends Point2d {
  /** tan(includedAngle / 4). 0 = straight segment, negative = clockwise. */
  bulge: number;
}

/**
 * A flattened path plus the true length of the curve it approximates.
 * `lengthMm` is deliberately NOT derived from `points`.
 */
export interface FlattenedPath {
  points: number[][];
  lengthMm: number;
}

/** Straight-line distance in mm. */
export function distance(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(bx - ax, by - ay);
}

/**
 * How many straight segments to render an arc with. Uses a fixed angular step
 * so a 10 mm fillet and a 500 mm sweep both look smooth at any zoom level.
 */
export function arcSegmentCount(sweptRadians: number): number {
  return Math.max(MIN_ARC_SEGMENTS, Math.ceil(Math.abs(sweptRadians) / ARC_STEP_RADIANS));
}

/**
 * Flatten an arc given its centre, radius, start angle and signed sweep.
 * Points include both endpoints; length is analytic.
 */
export function flattenArc(
  centreX: number,
  centreY: number,
  radius: number,
  startRadians: number,
  sweptRadians: number,
): FlattenedPath {
  const segments = arcSegmentCount(sweptRadians);
  const points: number[][] = [];
  for (let i = 0; i <= segments; i += 1) {
    const angle = startRadians + (sweptRadians * i) / segments;
    points.push([centreX + radius * Math.cos(angle), centreY + radius * Math.sin(angle)]);
  }
  return { points, lengthMm: Math.abs(radius * sweptRadians) };
}

/**
 * Flatten a full circle into a closed polyline. The length is 2πr computed
 * directly — never the 16-chord approximation, which is ~2% short.
 */
export function flattenCircle(centreX: number, centreY: number, radius: number): FlattenedPath {
  const arc = flattenArc(centreX, centreY, radius, 0, 2 * Math.PI);
  // Snap the wrap-around point onto the start so the outline closes exactly.
  arc.points[arc.points.length - 1] = [arc.points[0][0], arc.points[0][1]];
  return { points: arc.points, lengthMm: 2 * Math.PI * radius };
}

/**
 * Expand one polyline segment, honouring its bulge.
 *
 * Bulge is defined as b = tan(includedAngle / 4), so:
 *   θ = 4·atan(b)                    (signed; negative = clockwise)
 *   r = chord / (2·sin(|θ| / 2))
 *   arcLength = |r · θ|
 *
 * The centre sits on the chord's perpendicular bisector at a signed offset of
 * sign(θ)·r·cos(θ/2) along the chord's left normal — that single expression
 * covers minor and major arcs in both directions.
 *
 * Returned points include both endpoints, with the endpoints copied verbatim
 * so repeated flattening never drifts away from the authored vertices.
 */
export function bulgeSegment(from: Point2d, to: Point2d, bulge: number): FlattenedPath {
  const chord = distance(from.x, from.y, to.x, to.y);
  const straight: FlattenedPath = {
    points: [
      [from.x, from.y],
      [to.x, to.y],
    ],
    lengthMm: chord,
  };
  if (!Number.isFinite(bulge) || bulge === 0 || chord === 0) {
    return straight;
  }

  const theta = 4 * Math.atan(bulge);
  const sinHalf = Math.sin(Math.abs(theta) / 2);
  if (sinHalf === 0) {
    return straight;
  }

  const radius = chord / (2 * sinHalf);
  const midX = (from.x + to.x) / 2;
  const midY = (from.y + to.y) / 2;
  const normalX = -(to.y - from.y) / chord;
  const normalY = (to.x - from.x) / chord;
  const offset = Math.sign(theta) * radius * Math.cos(theta / 2);
  const centreX = midX + normalX * offset;
  const centreY = midY + normalY * offset;

  const startRadians = Math.atan2(from.y - centreY, from.x - centreX);
  const arc = flattenArc(centreX, centreY, radius, startRadians, theta);
  arc.points[0] = [from.x, from.y];
  arc.points[arc.points.length - 1] = [to.x, to.y];
  return { points: arc.points, lengthMm: Math.abs(radius * theta) };
}

/**
 * Flatten a vertex list into a single path. When `closed`, the closing segment
 * is included and uses the LAST vertex's bulge — omitting it is the classic way
 * to under-measure a slot or a keyhole.
 */
export function flattenVertices(vertices: PolyVertex[], closed: boolean): FlattenedPath {
  if (vertices.length === 0) {
    return { points: [], lengthMm: 0 };
  }
  const first = vertices[0];
  const points: number[][] = [[first.x, first.y]];
  let lengthMm = 0;
  if (vertices.length < 2) {
    return { points, lengthMm };
  }

  const segmentCount = closed ? vertices.length : vertices.length - 1;
  for (let i = 0; i < segmentCount; i += 1) {
    const start = vertices[i];
    const end = vertices[(i + 1) % vertices.length];
    const segment = bulgeSegment(start, end, start.bulge);
    for (let j = 1; j < segment.points.length; j += 1) {
      points.push(segment.points[j]);
    }
    lengthMm += segment.lengthMm;
  }
  return { points, lengthMm };
}
