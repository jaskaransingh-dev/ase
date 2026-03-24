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

    // Check if user exists in auth.users
    const { data: users, error } = await admin.auth.admin.listUsers()

    if (error) {
      console.error('Error checking email:', error)
      return NextResponse.json({ error: 'Failed to check email' }, { status: 500 })
    }

    const exists = users.users.some((user) => user.email?.toLowerCase() === email.toLowerCase())

    return NextResponse.json({ exists })
  } catch (error) {
    console.error('Check email error:', error)
    return NextResponse.json({ error: 'Failed to check email' }, { status: 500 })
  }
}
