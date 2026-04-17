export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg)', minHeight: 'calc(100vh - 60px)' }}>
      {children}
    </div>
  )
}