/**
 * Cron auth helper. Centralized so we don't repeat the empty-string bug
 * across every /api/cron/* route.
 *
 * If CRON_SECRET is unset OR set to literal quoted-empty (`""` / `''`)
 * — which Vercel CLI shows when there's no real secret — auth is skipped.
 * Otherwise the request must include `x-cron-secret: <value>` OR
 * `Authorization: Bearer <value>` (Vercel Cron's default).
 */

export function checkCronAuth(req: Request): { ok: boolean; reason?: string } {
  const raw = process.env.CRON_SECRET ?? ''
  const secret = (raw === '""' || raw === "''") ? '' : raw
  if (!secret || secret.length === 0) return { ok: true }

  const headerSecret = req.headers.get('x-cron-secret')
  const authHeader = req.headers.get('authorization')
  const bearerSecret = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null

  if (headerSecret === secret || bearerSecret === secret) return { ok: true }
  return { ok: false, reason: 'Unauthorized' }
}
