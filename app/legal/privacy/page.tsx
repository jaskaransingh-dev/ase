import Link from 'next/link'

export const metadata = { title: 'Privacy Policy — ASE' }

export default function PrivacyPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--white)', fontFamily: 'var(--font-body)' }}>
      <nav style={{ position: 'sticky', top: 0, height: 56, display: 'flex', alignItems: 'center', padding: '0 2rem', borderBottom: '1px solid var(--border)', background: 'rgba(8,6,18,.95)', backdropFilter: 'blur(16px)', zIndex: 100, gap: '1rem' }}>
        <Link href="/" style={{ fontFamily: 'var(--font-head)', fontWeight: 900, fontSize: '1.1rem' }}>ASE<span style={{ color: 'var(--gold)' }}>.</span></Link>
        <Link href="/" style={{ marginLeft: 'auto', fontSize: '.85rem', color: 'var(--muted)' }}>← Back to home</Link>
      </nav>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '4rem 2rem 6rem' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', letterSpacing: '.12em', color: 'var(--gold)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '1rem' }}>Legal</div>
        <h1 style={{ fontFamily: 'var(--font-head)', fontSize: 'clamp(1.8rem,4vw,2.8rem)', fontWeight: 900, letterSpacing: '-.03em', marginBottom: '.5rem' }}>Privacy Policy</h1>
        <p style={{ color: 'var(--muted)', fontSize: '.88rem', marginBottom: '3rem' }}>Last updated: April 8, 2026</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem', lineHeight: 1.75, fontSize: '.95rem', color: 'rgba(220,215,255,.85)' }}>

          <Section title="1. Information We Collect">
            <p><strong>Account information:</strong> Email address and display name when you register. If you use Coinbase OAuth, we receive your name, email, and Coinbase user ID.</p>
            <p style={{ marginTop: '.75rem' }}><strong>Usage data:</strong> Pages visited, agents subscribed to, and interactions with the platform (via Supabase).</p>
            <p style={{ marginTop: '.75rem' }}><strong>Wallet addresses:</strong> If you connect a Web3 wallet, we store the public address. We never have access to private keys.</p>
          </Section>

          <Section title="2. How We Use Your Information">
            <ul style={{ paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
              <li>To operate and maintain your account</li>
              <li>To display your portfolio and subscription data on the dashboard</li>
              <li>To send transactional emails (account verification, password reset)</li>
              <li>To improve the platform and diagnose issues</li>
              <li>To comply with legal obligations</li>
            </ul>
            <p style={{ marginTop: '.75rem' }}>We do not sell your personal data to third parties.</p>
          </Section>

          <Section title="3. Data Storage">
            <p>User data is stored securely in Supabase (PostgreSQL), hosted on infrastructure provided by Supabase, Inc. Authentication is handled by Supabase Auth with industry-standard encryption.</p>
          </Section>

          <Section title="4. Third-Party Services">
            <p>We use the following third-party services:</p>
            <ul style={{ paddingLeft: '1.25rem', marginTop: '.75rem', display: 'flex', flexDirection: 'column', gap: '.5rem' }}>
              <li><strong>Supabase</strong> — database and authentication</li>
              <li><strong>Alpaca Markets</strong> — paper trading execution (no real funds)</li>
              <li><strong>Resend</strong> — transactional email delivery</li>
              <li><strong>Coinbase</strong> — optional OAuth login</li>
              <li><strong>Cloudflare Workers</strong> — serverless infrastructure</li>
            </ul>
            <p style={{ marginTop: '.75rem' }}>Each third party has its own privacy policy. We encourage you to review them.</p>
          </Section>

          <Section title="5. Cookies">
            <p>We use cookies and similar technologies to maintain your session. These are essential for the platform to function. We do not use advertising or tracking cookies.</p>
          </Section>

          <Section title="6. Your Rights">
            <p>You may request deletion of your account and associated data at any time by emailing <a href="mailto:founders@launchase.com" style={{ color: 'var(--gold)' }}>founders@launchase.com</a>. We will process deletion requests within 30 days.</p>
          </Section>

          <Section title="7. Children's Privacy">
            <p>ASE is not directed at individuals under the age of 18. We do not knowingly collect data from minors. If you believe a minor has provided us data, contact us immediately.</p>
          </Section>

          <Section title="8. Changes to This Policy">
            <p>We may update this Privacy Policy periodically. We will update the &quot;Last updated&quot; date and notify users of material changes via email where required.</p>
          </Section>

          <Section title="9. Contact">
            <p>Privacy questions or requests: <a href="mailto:founders@launchase.com" style={{ color: 'var(--gold)' }}>founders@launchase.com</a></p>
          </Section>

        </div>
      </main>
      <LegalFooter />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '1.05rem', fontWeight: 800, marginBottom: '.75rem', color: 'var(--white)' }}>{title}</h2>
      {children}
    </div>
  )
}

function LegalFooter() {
  return (
    <footer style={{ borderTop: '1px solid rgba(148,130,255,.1)', padding: '2rem', textAlign: 'center', fontSize: '.8rem', color: 'var(--faint)', display: 'flex', gap: '1.5rem', justifyContent: 'center', flexWrap: 'wrap' }}>
      <Link href="/legal/terms" style={{ color: 'var(--faint)' }}>Terms</Link>
      <Link href="/legal/privacy" style={{ color: 'var(--faint)' }}>Privacy</Link>
      <Link href="/legal/securities" style={{ color: 'var(--faint)' }}>Securities Disclaimer</Link>
      <span>© 2026 Agent Securities Exchange</span>
    </footer>
  )
}
