import { Injectable } from '@nestjs/common';
import PDFDocument = require('pdfkit');
import { drawReceipt, PDF_OPTIONS, ReceiptData } from './receipt.layout';

export type { ReceiptData, ReceiptLine } from './receipt.layout';

/**
 * Renders order receipts as PDF bytes.
 *
 * Deliberately pure: it neither reads the database nor writes to object storage.
 * That keeps it trivially testable and lets the order flow decide whether a
 * given receipt is stored, emailed, streamed back, or all three.
 */
@Injectable()
export class ReceiptService {
  /** Resolves the finished PDF; rejects if the PDFKit stream errors mid-render. */
  async render(input: ReceiptData): Promise<Buffer> {
    return new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let settled = false;

      const fail = (error: Error): void => {
        if (settled) return;
        settled = true;
        reject(error);
      };

      try {
        const doc = new PDFDocument(PDF_OPTIONS);

        doc.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
        doc.on('error', fail);
        doc.on('end', () => {
          if (settled) return;
          settled = true;
          resolve(Buffer.concat(chunks));
        });

        drawReceipt(doc, input);
        doc.end();
      } catch (error) {
        // A synchronous layout throw (bad currency code, missing page) must
        // reject the promise rather than escape an un-awaited constructor.
        fail(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }
}
