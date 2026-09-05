import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { AppConfigService } from '../config/config.service';

const CREDENTIAL_KEY = 'RESEND_API_PYTHON_SDK_API_KEY';
const SERVICE = 'Resend API (Python SDK)';
const MAX_ERROR_CHARS = 300;

/**
 * Outcome of a send attempt. `error` is a short, storable reason — it is
 * persisted to `orders.emailError` and shown to admins, never thrown.
 */
export interface EmailResult {
  sent: boolean;
  error: string | null;
}

/** One money row on the confirmation email (parts, shipping, …). */
export interface EmailLine {
  label: string;
  amountCents: number;
}

export interface OrderConfirmationInput {
  to: string;
  orderNumber: string;
  companyName: string;
  totalCents: number;
  currency: string;
  lines: EmailLine[];
  receiptPdf: Buffer | null;
}

/**
 * Transactional email.
 *
 * The single hard rule here: sending NEVER throws. The order is already paid
 * for by the time we get to the mail step, so a Resend outage — or a missing
 * API key on a fresh namespace — must degrade to a recorded `emailError` on the
 * order rather than failing the checkout callback and losing the payment link.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly clients = new Map<string, Resend>();

  constructor(private readonly config: AppConfigService) {}

  /** True when an API key is available; lets callers skip a pointless attempt. */
  async isConfigured(): Promise<boolean> {
    return (await this.config.resolveConfig(CREDENTIAL_KEY)) !== null;
  }

  async sendOrderConfirmation(input: OrderConfirmationInput): Promise<EmailResult> {
    try {
      const apiKey = await this.config.resolveConfig(CREDENTIAL_KEY);
      if (apiKey === null) {
        return { sent: false, error: `${SERVICE} is not configured.` };
      }

      const client = this.client(apiKey);
      const attachments = input.receiptPdf
        ? [
            {
              filename: `receipt-${input.orderNumber}.pdf`,
              content: input.receiptPdf.toString('base64'),
            },
          ]
        : undefined;

      const response = await client.emails.send({
        from: this.config.fromEmail,
        to: input.to,
        subject: `Order ${input.orderNumber} confirmed`,
        html: renderHtml(input),
        text: renderText(input),
        attachments,
      });

      if (response.error) {
        return { sent: false, error: truncate(response.error.message) };
      }

      return { sent: true, error: null };
    } catch (error) {
      const message = truncate(error instanceof Error ? error.message : String(error));
      this.logger.warn(`order ${input.orderNumber} confirmation email failed: ${message}`);
      return { sent: false, error: message };
    }
  }

  /** Cached per key so a rotated key is picked up without a restart. */
  private client(apiKey: string): Resend {
    const existing = this.clients.get(apiKey);
    if (existing) return existing;
    const created = new Resend(apiKey);
    this.clients.set(apiKey, created);
    return created;
  }
}

/** Cents → `$1,234.56`; the currency code is upper-cased for Intl. */
function money(cents: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(cents / 100);
}

/** Escaped so a company or line label containing `<` cannot break the markup. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderHtml(input: OrderConfirmationInput): string {
  const rows = input.lines
    .map(
      (line) =>
        `<tr><td style="padding:6px 0;">${escapeHtml(line.label)}</td>` +
        `<td style="padding:6px 0;text-align:right;">${money(line.amountCents, input.currency)}</td></tr>`,
    )
    .join('');

  return [
    '<div style="font-family:Helvetica,Arial,sans-serif;color:#1c2331;max-width:560px;">',
    `<h1 style="font-size:20px;margin:0 0 4px;">${escapeHtml(input.companyName)}</h1>`,
    `<p style="margin:0 0 16px;color:#5b6472;">Thanks — your order is confirmed.</p>`,
    `<p style="margin:0 0 16px;">Order <strong>${escapeHtml(input.orderNumber)}</strong></p>`,
    '<table style="width:100%;border-collapse:collapse;font-size:14px;">',
    rows,
    '<tr><td style="padding:10px 0 0;border-top:1px solid #d8dde5;font-weight:bold;">Total</td>',
    `<td style="padding:10px 0 0;border-top:1px solid #d8dde5;text-align:right;font-weight:bold;">${money(
      input.totalCents,
      input.currency,
    )}</td></tr>`,
    '</table>',
    input.receiptPdf
      ? '<p style="margin:20px 0 0;color:#5b6472;font-size:13px;">Your receipt is attached as a PDF.</p>'
      : '',
    '</div>',
  ].join('');
}

/** Plain-text alternative keeps the mail out of spam filters that dislike HTML-only. */
function renderText(input: OrderConfirmationInput): string {
  const lines = input.lines.map(
    (line) => `${line.label}: ${money(line.amountCents, input.currency)}`,
  );
  return [
    input.companyName,
    `Order ${input.orderNumber} confirmed.`,
    '',
    ...lines,
    `Total: ${money(input.totalCents, input.currency)}`,
  ].join('\n');
}

function truncate(message: string): string {
  const clean = message.trim() || 'Unknown error.';
  return clean.length > MAX_ERROR_CHARS ? clean.slice(0, MAX_ERROR_CHARS) : clean;
}
