'use client'

// Lab pages are reached via the sidebar (LAB section). No top-tabs here —
// the sidebar already carries Agent / Studio / Backtest / My Agents.
export default function LabLayout({ children }: { children: React.ReactNode }) {
  return <div style={{ height: '100%', minHeight: 0, display: 'flex', flexDirection: 'column' }}>{children}</div>
}
