import { redirect } from 'next/navigation'

// /dashboard/lab has been folded into /dashboard/build.
// Keeping this stub so any lingering bookmarks or links forward cleanly.
export default function LabRedirect() {
  redirect('/dashboard/build')
}
