import { redirect } from 'next/navigation'

// New /dashboard/build/backtest page replaced by the original
// /dashboard/backtest page per user request. This stub forwards any
// existing links cleanly.
export default function BuildBacktestRedirect() {
  redirect('/dashboard/backtest')
}
