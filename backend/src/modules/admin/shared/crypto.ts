import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';
import { env } from '../../../config/env';

const PREFIX = 'enc:v1:';
const key = () => createHash('sha256').update(`${process.env.INTEGRATION_SECRET_KEY ?? env.jwtSecret}::integration-secrets`).digest();

/** AES-256-GCM. Output: enc:v1:<iv>.<tag>.<ciphertext> (base64). */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return `${PREFIX}${iv.toString('base64')}.${c.getAuthTag().toString('base64')}.${ct.toString('base64')}`;
}

export function isEncrypted(v: unknown): v is string { return typeof v === 'string' && v.startsWith(PREFIX); }

export function decryptSecret(v: string): string {
  if (!isEncrypted(v)) return v;
  const [iv, tag, ct] = v.slice(PREFIX.length).split('.').map((p) => Buffer.from(p, 'base64'));
  const d = createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]).toString('utf8');
}
