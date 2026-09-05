/**
 * Drawing code for the order receipt, kept apart from the Nest service so the
 * layout can be tweaked (and read) without wading through stream plumbing.
 *
 * Only the PDF standard fonts (Helvetica / Helvetica-Bold) are used: the
 * production container ships no font files, so anything else would render as
 * boxes or throw at request time.
 */

/** One priced row of the receipt table. */
export interface ReceiptLine {
  label: string;
  detail: string;
  amountCents: number;
}

/** Everything the receipt renders. Pure data — the service does no lookups. */
export interface ReceiptData {
  orderNumber: string;
  placedAt: Date;
  companyName: string;
  supportEmail: string;
  supportPhone: string;
  addressLines: string[];
  customerName: string;
  customerEmail: string;
  quoteReference: string;
  materialName: string;
  quantity: number;
  lines: ReceiptLine[];
  subtotalCents: number;
  shippingLabel: string;
  shippingCents: number;
  totalCents: number;
  currency: string;
}

const PAGE_MARGIN = 50;
const CONTENT_WIDTH = 495;
const COL_LABEL_X = PAGE_MARGIN;
const COL_LABEL_W = 200;
const COL_DETAIL_X = PAGE_MARGIN + 205;
const COL_DETAIL_W = 165;
const COL_AMOUNT_X = PAGE_MARGIN + 375;
const COL_AMOUNT_W = 120;
const ROW_GAP = 6;
const INK = '#1c2331';
const MUTED = '#5b6472';
const RULE = '#c9d0da';

export const PDF_OPTIONS = {
  size: 'A4' as const,
  margin: PAGE_MARGIN,
  info: { Title: 'Receipt' },
};

/** Cents → `$1,234.56`. Upper-casing guards against a stored `"usd"`. */
export function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

/** UTC so two servers in different regions never print different dates. */
function formatDate(value: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(value);
}

/** Paints the whole document. The caller owns creating and ending `doc`. */
export function drawReceipt(doc: PDFKit.PDFDocument, data: ReceiptData): void {
  let y = drawHeader(doc, data);
  y = drawMeta(doc, data, y);
  y = drawTable(doc, data, y);
  drawTotals(doc, data, y);
  drawFooter(doc, data);
}

function drawHeader(doc: PDFKit.PDFDocument, data: ReceiptData): number {
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(20);
  doc.text(data.companyName, PAGE_MARGIN, PAGE_MARGIN, { width: 300 });

  doc.font('Helvetica').fontSize(9).fillColor(MUTED);
  const address = data.addressLines.filter((line) => line.trim() !== '');
  if (address.length > 0) {
    doc.text(address.join('\n'), COL_AMOUNT_X - 105, PAGE_MARGIN + 3, {
      width: COL_AMOUNT_W + 105,
      align: 'right',
    });
  }

  const y = Math.max(doc.y, PAGE_MARGIN + 46) + 10;
  return rule(doc, y);
}

function drawMeta(doc: PDFKit.PDFDocument, data: ReceiptData, top: number): number {
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(16);
  doc.text('Receipt', PAGE_MARGIN, top + 14, { width: COL_LABEL_W });

  doc.font('Helvetica').fontSize(10).fillColor(MUTED);
  doc.text(
    `Order ${data.orderNumber}\n${formatDate(data.placedAt)}`,
    COL_AMOUNT_X - 105,
    top + 16,
    { width: COL_AMOUNT_W + 105, align: 'right' },
  );

  const blockTop = top + 48;
  labelled(doc, 'Billed to', PAGE_MARGIN, blockTop, [
    data.customerName,
    data.customerEmail,
  ]);
  labelled(doc, 'Quote', COL_DETAIL_X, blockTop, [
    data.quoteReference,
    `${data.materialName} × ${data.quantity}`,
  ]);

  return rule(doc, blockTop + 62);
}

function drawTable(doc: PDFKit.PDFDocument, data: ReceiptData, top: number): number {
  let y = top + 12;
  y = tableHead(doc, y);

  for (const line of data.lines) {
    if (y > pageBottom(doc) - 120) {
      doc.addPage();
      y = tableHead(doc, PAGE_MARGIN);
    }

    doc.fillColor(INK).font('Helvetica').fontSize(10);
    doc.text(line.label, COL_LABEL_X, y, { width: COL_LABEL_W });
    const labelBottom = doc.y;

    doc.fillColor(MUTED).fontSize(9);
    doc.text(line.detail, COL_DETAIL_X, y + 1, { width: COL_DETAIL_W });
    const detailBottom = doc.y;

    doc.fillColor(INK).font('Helvetica').fontSize(10);
    doc.text(formatMoney(line.amountCents, data.currency), COL_AMOUNT_X, y, {
      width: COL_AMOUNT_W,
      align: 'right',
    });

    y = Math.max(labelBottom, detailBottom, doc.y) + ROW_GAP;
  }

  return rule(doc, y + 2);
}

function tableHead(doc: PDFKit.PDFDocument, top: number): number {
  doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8);
  doc.text('ITEM', COL_LABEL_X, top, { width: COL_LABEL_W });
  doc.text('DETAIL', COL_DETAIL_X, top, { width: COL_DETAIL_W });
  doc.text('AMOUNT', COL_AMOUNT_X, top, { width: COL_AMOUNT_W, align: 'right' });
  return rule(doc, top + 14) + 8;
}

function drawTotals(doc: PDFKit.PDFDocument, data: ReceiptData, top: number): void {
  let y = top + 10;
  y = totalRow(doc, 'Subtotal', formatMoney(data.subtotalCents, data.currency), y, false);
  y = totalRow(
    doc,
    data.shippingLabel || 'Shipping',
    formatMoney(data.shippingCents, data.currency),
    y,
    false,
  );
  rule(doc, y + 2);
  totalRow(doc, 'Total', formatMoney(data.totalCents, data.currency), y + 10, true);
}

function totalRow(
  doc: PDFKit.PDFDocument,
  label: string,
  amount: string,
  top: number,
  emphasised: boolean,
): number {
  doc
    .fillColor(emphasised ? INK : MUTED)
    .font(emphasised ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(emphasised ? 12 : 10);
  doc.text(label, COL_DETAIL_X, top, { width: COL_DETAIL_W, align: 'right' });
  doc.text(amount, COL_AMOUNT_X, top, { width: COL_AMOUNT_W, align: 'right' });
  return doc.y + ROW_GAP;
}

/** Pinned to the page bottom so it reads as a footer regardless of row count. */
function drawFooter(doc: PDFKit.PDFDocument, data: ReceiptData): void {
  const contact = [data.supportEmail, data.supportPhone]
    .filter((value) => value.trim() !== '')
    .join('  ·  ');

  const y = pageBottom(doc) - 24;
  rule(doc, y - 10);
  doc.fillColor(MUTED).font('Helvetica').fontSize(9);
  doc.text(
    contact === '' ? `Thank you for your order — ${data.companyName}` : `Questions? ${contact}`,
    PAGE_MARGIN,
    y,
    { width: CONTENT_WIDTH, align: 'center' },
  );
}

function labelled(
  doc: PDFKit.PDFDocument,
  heading: string,
  x: number,
  top: number,
  values: string[],
): void {
  doc.fillColor(MUTED).font('Helvetica-Bold').fontSize(8);
  doc.text(heading.toUpperCase(), x, top, { width: COL_LABEL_W });
  doc.fillColor(INK).font('Helvetica').fontSize(10);
  doc.text(values.join('\n'), x, top + 12, { width: COL_LABEL_W });
}

/** Horizontal rule; returns the y it was drawn at so callers can chain offsets. */
function rule(doc: PDFKit.PDFDocument, y: number): number {
  doc
    .strokeColor(RULE)
    .lineWidth(0.75)
    .moveTo(PAGE_MARGIN, y)
    .lineTo(PAGE_MARGIN + CONTENT_WIDTH, y)
    .stroke();
  return y;
}

function pageBottom(doc: PDFKit.PDFDocument): number {
  return doc.page.height - PAGE_MARGIN;
}
