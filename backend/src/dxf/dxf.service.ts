import { Injectable } from '@nestjs/common';
import { ParsedGeometry, parseDxf } from './dxf.parser';

/**
 * Nest-facing wrapper around the pure parser.
 *
 * Deliberately thin: the parser stays free of framework types so it can be
 * unit-tested (and reasoned about) in isolation. `DxfParseError` is rethrown
 * untouched so callers can map it to their own HTTP envelope with its
 * user-facing message intact.
 */
@Injectable()
export class DxfService {
  /** Parse an uploaded DXF buffer into flattened, origin-normalised geometry. */
  parse(buffer: Buffer): ParsedGeometry {
    return parseDxf(buffer);
  }
}
