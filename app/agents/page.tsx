import { redirect } from 'next/navigation'

// The standalone /agents listing has been retired in favor of the single
// canonical Exchange surface at /dashboard/marketplace. We keep this route
// alive only as a 308 redirect so existing inbound links / bookmarks don't
// 404. The slug pages under /agents/[slug] still work and are unaffected.
export const dynamic = 'force-dynamic'

export default function AgentsRedirect() {
  redirect('/dashboard/marketplace')
}
