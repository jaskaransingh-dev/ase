import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  try {
    const { email } = await req.json()

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 })
    }

    const admin = createAdminClient()
    const target = email.toLowerCase()

    // listUsers paginates at 50 by default — if we only check page 1 we'll
    // miss anyone past the first page and create a duplicate-key collision
    // when Supabase tries to insert. Walk every page until we find the email
    // or run out, capped at a sane page count to avoid infinite loops.
    const PAGE_SIZE = 1000
    for (let page = 1; page <= 25; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE_SIZE })
      if (error) {
        console.error('[check-email] listUsers error', error)
        // Fail open: don't block signup over an admin-API hiccup. Supabase
        // will still reject duplicates server-side.
        return NextResponse.json({ exists: false, warning: 'lookup_unavailable' })
      }
      if (data.users.some(u => u.email?.toLowerCase() === target)) {
        return NextResponse.json({ exists: true })
      }
      if (data.users.length < PAGE_SIZE) break
    }
    return NextResponse.json({ exists: false })
  } catch (error) {
    console.error('Check email error:', error)
    // Fail open instead of fail closed so a malformed admin call can't lock
    // every new user out of signup.
    return NextResponse.json({ exists: false, warning: 'lookup_unavailable' })
  }
}
