import type { AppConfigService } from '../config/config.service';
import { EmailService, OrderConfirmationInput } from './resend.service';

const mockSend = jest.fn();
const mockResendConstructor = jest.fn();

jest.mock('resend', () => ({
  Resend: class {
    emails = { send: mockSend };
    constructor(apiKey: string) {
      mockResendConstructor(apiKey);
    }
  },
}));

/** Minimal AppConfigService stand-in: only the two members EmailService touches. */
function stubConfig(apiKey: string | null): AppConfigService {
  const stub = {
    resolveConfig: jest.fn().mockResolvedValue(apiKey),
    fromEmail: 'orders@example.test',
  };
  // Narrowing cast: EmailService only ever reads `resolveConfig` and `fromEmail`.
  return stub as unknown as AppConfigService;
}

function input(overrides: Partial<OrderConfirmationInput> = {}): OrderConfirmationInput {
  return {
    to: 'dana@example.test',
    orderNumber: 'ORD-2026-0142',
    companyName: 'CNC Quick Quote',
    totalCents: 68150,
    currency: 'usd',
    lines: [
      { label: 'Parts', amountCents: 65700 },
      { label: 'Next-day courier', amountCents: 2450 },
    ],
    receiptPdf: null,
    ...overrides,
  };
}

describe('EmailService', () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockResendConstructor.mockReset();
  });

  it('reports unconfigured instead of throwing when no API key is set', async () => {
    const service = new EmailService(stubConfig(null));

    const result = await service.sendOrderConfirmation(input());

    expect(result.sent).toBe(false);
    expect(result.error).not.toBeNull();
    expect(result.error).toContain('not configured');
    expect(mockResendConstructor).not.toHaveBeenCalled();
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('resolves rather than rejects when the underlying send throws', async () => {
    mockSend.mockRejectedValue(new Error('socket hang up'));
    const service = new EmailService(stubConfig('re_test_key'));

    const result = await service.sendOrderConfirmation(input());

    expect(result).toEqual({ sent: false, error: 'socket hang up' });
  });

  it('resolves when the send throws a non-Error value', async () => {
    // Some SDK paths reject with a bare string; the catch must still narrow.
    mockSend.mockRejectedValue('gateway exploded');
    const service = new EmailService(stubConfig('re_test_key'));

    await expect(service.sendOrderConfirmation(input())).resolves.toEqual({
      sent: false,
      error: 'gateway exploded',
    });
  });

  it('truncates a very long failure message to 300 characters', async () => {
    mockSend.mockRejectedValue(new Error('x'.repeat(1000)));
    const service = new EmailService(stubConfig('re_test_key'));

    const result = await service.sendOrderConfirmation(input());

    expect(result.sent).toBe(false);
    expect(result.error).toHaveLength(300);
  });

  it('surfaces a Resend error payload as a non-throwing failure', async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: 'invalid from address' } });
    const service = new EmailService(stubConfig('re_test_key'));

    const result = await service.sendOrderConfirmation(input());

    expect(result).toEqual({ sent: false, error: 'invalid from address' });
  });

  it('sends with the receipt attached and reports success', async () => {
    mockSend.mockResolvedValue({ data: { id: 'email_1' }, error: null });
    const service = new EmailService(stubConfig('re_test_key'));
    const pdf = Buffer.from('%PDF-1.3 fake');

    const result = await service.sendOrderConfirmation(input({ receiptPdf: pdf }));

    expect(result).toEqual({ sent: true, error: null });
    expect(mockResendConstructor).toHaveBeenCalledWith('re_test_key');

    const payload = mockSend.mock.calls[0][0];
    expect(payload.from).toBe('orders@example.test');
    expect(payload.to).toBe('dana@example.test');
    expect(payload.subject).toBe('Order ORD-2026-0142 confirmed');
    expect(payload.html).toContain('$681.50');
    expect(payload.attachments).toEqual([
      { filename: 'receipt-ORD-2026-0142.pdf', content: pdf.toString('base64') },
    ]);
  });

  it('omits attachments when there is no receipt PDF', async () => {
    mockSend.mockResolvedValue({ data: { id: 'email_2' }, error: null });
    const service = new EmailService(stubConfig('re_test_key'));

    await service.sendOrderConfirmation(input());

    expect(mockSend.mock.calls[0][0].attachments).toBeUndefined();
  });
});
