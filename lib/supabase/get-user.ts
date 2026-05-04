import { createClient } from './server'
import { createAdminClient } from './admin'

async function getUserFromBearer(token: string) {
  const admin = createAdminClient()
  const { data: { user } } = await admin.auth.getUser(token)
  return user ?? null
}

/**
 * Returns the authenticated user from either:
 * 1. Authorization: Bearer <access_token> header (iOS mobile)
 * 2. Supabase cookie session (web / SSR)
 *
 * Pass the raw Request/NextRequest for POST routes.
 * For GET routes with no req param, call with no argument — reads next/headers.
 */
export async function getUserFromRequest(req?: Request | null) {
  // If a request object was provided, check its Authorization header
  if (req) {
    const authHeader = req.headers.get('authorization')
    if (authHeader?.startsWith('Bearer ')) {
      const user = await getUserFromBearer(authHeader.slice(7))
      if (user) return user
    }
  } else {
    // No request object — read from next/headers (GET route pattern)
    const { headers } = await import('next/headers')
    const headerStore = await headers()
    const authHeader = headerStore.get('authorization')
    if (authHeader?.startsWith('Bearer ')) {
      const user = await getUserFromBearer(authHeader.slice(7))
      if (user) return user
    }
  }

  // Fall back to cookie session (web)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user ?? null
}
