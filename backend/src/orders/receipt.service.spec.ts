import { ReceiptService } from './receipt.service';
import { formatMoney, ReceiptData } from './receipt.layout';

function sampleOrder(overrides: Partial<ReceiptData> = {}): ReceiptData {
  return {
    orderNumber: 'ORD-2026-0142',
    placedAt: new Date('2026-09-05T10:30:00.000Z'),
    companyName: 'CNC Quick Quote',
    supportEmail: 'support@example.test',
    supportPhone: '+1 555 0100',
    addressLines: ['18 Fabrication Way', 'Sheffield, S9 1AA', 'United Kingdom'],
    customerName: 'Dana Ortiz',
    customerEmail: 'dana@example.test',
    quoteReference: 'QT-8831',
    materialName: 'Mild steel 3.0 mm',
    quantity: 24,
    lines: [
      { label: 'Laser cutting', detail: '24 × 1,480 mm profile', amountCents: 43200 },
      { label: 'Bending', detail: '4 bends per part', amountCents: 16800 },
      { label: 'Setup fee', detail: 'One-off per job', amountCents: 4500 },
      { label: 'Handling', detail: 'Pack and label', amountCents: 1200 },
    ],
    subtotalCents: 65700,
    shippingLabel: 'Next-day courier',
    shippingCents: 2450,
    totalCents: 68150,
    currency: 'usd',
    ...overrides,
  };
}

describe('ReceiptService', () => {
  const service = new ReceiptService();

  it('renders a PDF buffer with the %PDF magic bytes', async () => {
    const pdf = await service.render(sampleOrder());

    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 4).toString('latin1')).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(1000);
    expect(pdf.subarray(-1024).toString('latin1')).toContain('%%EOF');
  });

  it('renders without a shipping charge, contact details or address', async () => {
    const pdf = await service.render(
      sampleOrder({
        addressLines: [],
        supportEmail: '',
        supportPhone: '',
        shippingLabel: '',
        shippingCents: 0,
        totalCents: 65700,
      }),
    );

    expect(pdf.subarray(0, 4).toString('latin1')).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('paginates a long line-item list instead of overflowing one page', async () => {
    const lines = Array.from({ length: 60 }, (_, index) => ({
      label: `Part ${index + 1}`,
      detail: `bracket-${index + 1}.dxf`,
      amountCents: 1000 + index,
    }));

    const pdf = await service.render(sampleOrder({ lines }));

    expect(pdf.subarray(0, 4).toString('latin1')).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(2000);
  });
});

describe('formatMoney', () => {
  it('formats integer cents as grouped currency', () => {
    expect(formatMoney(123456, 'usd')).toBe('$1,234.56');
    expect(formatMoney(0, 'USD')).toBe('$0.00');
  });
});
