// Pass-through layout. /dashboard/lab is being phased out — every page in
// here just redirects to /dashboard/build.
export default function LabLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
