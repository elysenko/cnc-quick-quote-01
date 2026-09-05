import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Symmetric encryption for provider secrets at rest (Stripe keys, Resend key).
 *
 * AES-256-GCM with a random IV per value; the key is derived from
 * APP_ENCRYPTION_KEY by SHA-256 so any passphrase length works. Losing or
 * rotating APP_ENCRYPTION_KEY makes stored secrets undecryptable — `decrypt`
 * returns null in that case rather than throwing, so `/api/health/deep` can
 * report it and checkout can fail loudly instead of silently mis-charging.
 */
const PREFIX = 'enc.v1:';

function keyFrom(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

export function encryptSecret(plaintext: string, secret: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyFrom(secret), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function decryptSecret(value: string, secret: string): string | null {
  if (!isEncrypted(value)) return value; // seeded plaintext from env — still usable
  try {
    const [ivB64, tagB64, dataB64] = value.slice(PREFIX.length).split('.');
    if (!ivB64 || !tagB64 || !dataB64) return null;
    const decipher = createDecipheriv(
      'aes-256-gcm',
      keyFrom(secret),
      Buffer.from(ivB64, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    return null;
  }
}

/**
 * Masks a secret for display: keeps the provider-recognisable prefix and the
 * last 4 characters (`sk_live_••••4242`) so an admin can tell which key is
 * installed without the value ever leaving the server in full.
 */
export function mask(plaintext: string | null): string | null {
  if (!plaintext) return null;
  const value = plaintext.trim();
  if (value.length <= 8) return '••••';
  const head = value.slice(0, Math.min(8, value.length - 4));
  return `${head}••••${value.slice(-4)}`;
}
