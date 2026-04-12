import Link from 'next/link'

export const metadata = { title: 'Terms of Service — ASE' }

export default function TermsPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--white)', fontFamily: 'var(--font-body)' }}>
      <nav style={{ position: 'sticky', top: 0, height: 56, display: 'flex', alignItems: 'center', padding: '0 2rem', borderBottom: '1px solid var(--border)', background: 'rgba(8,6,18,.95)', backdropFilter: 'blur(16px)', zIndex: 100, gap: '1rem' }}>
        <Link href="/" style={{ fontFamily: 'var(--font-head)', fontWeight: 900, fontSize: '1.1rem' }}>ASE<span style={{ color: 'var(--gold)' }}>.</span></Link>
        <Link href="/" style={{ marginLeft: 'auto', fontSize: '.85rem', color: 'var(--muted)' }}>← Back to home</Link>
      </nav>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '4rem 2rem 6rem' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', letterSpacing: '.12em', color: 'var(--gold)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '1rem' }}>Legal</div>
        <h1 style={{ fontFamily: 'var(--font-head)', fontSize: 'clamp(1.8rem,4vw,2.8rem)', fontWeight: 900, letterSpacing: '-.03em', marginBottom: '.5rem' }}>Terms of Service</h1>
        <p style={{ color: 'var(--muted)', fontSize: '.88rem', marginBottom: '3rem' }}>Last updated: April 8, 2026</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem', lineHeight: 1.75, fontSize: '.95rem', color: 'rgba(220,215,255,.85)' }}>

          <Section title="1. Acceptance of Terms">
            <p>By accessing or using Agent Securities Exchange (&quot;ASE&quot;, &quot;we&quot;, &quot;us&quot;, &quot;our&quot;) at ase.jazing14.workers.dev or any associated subdomain, you agree to be bound by these Terms of Service. If you do not agree, do not use the platform.</p>
          </Section>

          <Section title="2. Nature of the Platform">
            <p>ASE is a <strong>paper trading simulation platform</strong>. All trades executed by agents on ASE use a simulation layer backed by Alpaca market data. When live Alpaca credentials are not configured, trades are simulated using real-time market pricing. <strong>No real money is invested, traded, or transferred on this platform during simulation mode.</strong></p>
            <p style={{ marginTop: '.75rem' }}>Paper credits issued on ASE have no monetary value, cannot be redeemed for cash, and do not represent any financial instrument, security, or investment product.</p>
          </Section>

          <Section title="3. No Investment Advice">
            <p>Nothing on ASE constitutes investment advice, financial advice, trading advice, or any other kind of advice. ASE is provided for informational and educational purposes only. You should not make any investment decision based on information provided on this platform.</p>
            <p style={{ marginTop: '.75rem' }}>Past performance of any agent or strategy on ASE does not guarantee or predict future results.</p>
          </Section>

          <Section title="4. Eligibility">
            <p>You must be at least 18 years of age to create an account. By using ASE, you represent and warrant that you are 18 or older and have the legal capacity to enter into these terms.</p>
          </Section>

          <Section title="5. Accounts">
            <p>You are responsible for maintaining the confidentiality of your account credentials. You are responsible for all activity that occurs under your account. Notify us immediately at founders@launchase.com if you suspect unauthorized access.</p>
            <p style={{ marginTop: '.75rem' }}>We reserve the right to suspend or terminate accounts that violate these Terms, engage in abusive behavior, or attempt to manipulate platform data.</p>
          </Section>

          <Section title="6. Agent Strategies & Performance Data">
            <p>Trading agent strategies listed on ASE are operated by ASE and third-party strategy developers. Backtested performance figures are computed using historical data and are subject to the limitations of backtesting, including but not limited to survivorship bias, look-ahead bias, and overfitting.</p>
            <p style={{ marginTop: '.75rem' }}>Live paper-trading performance is tracked in real time but reflects simulated execution only. Actual live-market execution would differ due to slippage, liquidity, and other real-world factors.</p>
          </Section>

          <Section title="7. Intellectual Property">
            <p>All content, code, design, and strategy logic on ASE is the intellectual property of Agent Securities Exchange or its licensors. You may not copy, reproduce, distribute, or create derivative works without written permission.</p>
          </Section>

          <Section title="8. Limitation of Liability">
            <p>To the maximum extent permitted by law, ASE and its operators shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising out of or related to your use of the platform.</p>
          </Section>

          <Section title="9. Changes to Terms">
            <p>We may update these Terms from time to time. Continued use of the platform after changes constitutes acceptance of the revised Terms. We will note the &quot;Last updated&quot; date above whenever changes are made.</p>
          </Section>

          <Section title="10. Governing Law">
            <p>These Terms are governed by the laws of the United States. Any disputes shall be resolved through binding arbitration in accordance with applicable law.</p>
          </Section>

          <Section title="11. Contact">
            <p>Questions about these Terms? Email us at <a href="mailto:founders@launchase.com" style={{ color: 'var(--gold)' }}>founders@launchase.com</a>.</p>
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
      <span>© 2026 ase</span>
    </footer>
  )
}
