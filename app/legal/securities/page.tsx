import Link from 'next/link'

export const metadata = { title: 'Securities Disclaimer — ASE' }

export default function SecuritiesPage() {
  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--white)', fontFamily: 'var(--font-body)' }}>
      <nav style={{ position: 'sticky', top: 0, height: 56, display: 'flex', alignItems: 'center', padding: '0 2rem', borderBottom: '1px solid var(--border)', background: 'rgba(8,6,18,.95)', backdropFilter: 'blur(16px)', zIndex: 100, gap: '1rem' }}>
        <Link href="/" style={{ fontFamily: 'var(--font-head)', fontWeight: 900, fontSize: '1.1rem' }}>ASE<span style={{ color: 'var(--gold)' }}>.</span></Link>
        <Link href="/" style={{ marginLeft: 'auto', fontSize: '.85rem', color: 'var(--muted)' }}>← Back to home</Link>
      </nav>

      <main style={{ maxWidth: 760, margin: '0 auto', padding: '4rem 2rem 6rem' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', letterSpacing: '.12em', color: 'var(--gold)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '1rem' }}>Legal</div>
        <h1 style={{ fontFamily: 'var(--font-head)', fontSize: 'clamp(1.8rem,4vw,2.8rem)', fontWeight: 900, letterSpacing: '-.03em', marginBottom: '.5rem' }}>Securities Disclaimer</h1>
        <p style={{ color: 'var(--muted)', fontSize: '.88rem', marginBottom: '3rem' }}>Last updated: April 8, 2026</p>

        {/* Prominent warning box */}
        <div style={{ background: 'rgba(232,64,64,.07)', border: '1px solid rgba(232,64,64,.25)', borderRadius: 16, padding: '1.5rem', marginBottom: '3rem' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '.65rem', letterSpacing: '.1em', color: '#FB7185', fontWeight: 700, textTransform: 'uppercase', marginBottom: '.6rem' }}>Important Notice</div>
          <p style={{ fontSize: '.95rem', lineHeight: 1.7, color: 'rgba(255,200,200,.85)' }}>
            ASE is a <strong>paper trading simulation platform</strong>. No real money is invested or at risk.
            Nothing on this platform constitutes a securities offering, investment advice, or a solicitation to buy or sell any financial instrument.
            Agent tokens and paper credits have <strong>no monetary value</strong>.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2.5rem', lineHeight: 1.75, fontSize: '.95rem', color: 'rgba(220,215,255,.85)' }}>

          <Section title="1. Not a Registered Securities Offering">
            <p>Agent Securities Exchange (ASE) does not offer, sell, or solicit the purchase of securities as defined under the Securities Act of 1933, the Securities Exchange Act of 1934, or any applicable state securities laws.</p>
            <p style={{ marginTop: '.75rem' }}>Any reference to &quot;tokens&quot;, &quot;agent shares&quot;, or &quot;performance stakes&quot; on this platform refers exclusively to simulated paper-trading units with no monetary value and no legal claim on any assets, revenues, or profits.</p>
          </Section>

          <Section title="2. No Investment Advice">
            <p>The content on ASE — including agent performance data, backtested results, strategy descriptions, NAV figures, and any other information — is provided for informational and educational purposes only.</p>
            <p style={{ marginTop: '.75rem' }}>This information does not constitute investment advice, financial advice, trading advice, legal advice, tax advice, or any other form of professional advice. You should not make any investment decision based on information from this platform.</p>
            <p style={{ marginTop: '.75rem' }}>Always consult a qualified financial adviser before making investment decisions.</p>
          </Section>

          <Section title="3. Paper Trading — Simulated Environment Only">
            <p>All trading activity on ASE is executed through Alpaca Markets&apos; paper trading environment. This is a simulated environment that uses real market data but does not involve real money or real assets.</p>
            <p style={{ marginTop: '.75rem' }}>Paper trading results are not indicative of what would occur in live trading, as they do not account for real-world factors such as liquidity constraints, market impact, execution slippage, counterparty risk, or real capital requirements.</p>
          </Section>

          <Section title="4. Past Performance">
            <p>All backtested and live paper-trading performance data shown on ASE is historical and simulated. <strong>Past performance — whether backtested or paper-traded — does not guarantee or predict future results.</strong></p>
            <p style={{ marginTop: '.75rem' }}>Backtested results have inherent limitations including but not limited to: selection bias, survivorship bias, look-ahead bias, and overfitting to historical data. Hypothetical or simulated performance results have many inherent limitations and no representation is being made that any account will or is likely to achieve profits or losses similar to those shown.</p>
          </Section>

          <Section title="5. Risk Disclosure">
            <p>Trading financial instruments — including cryptocurrencies, equities, ETFs, and derivatives — involves substantial risk of loss and is not appropriate for all investors. The high degree of leverage that is often obtainable in trading can work against you as well as for you.</p>
            <p style={{ marginTop: '.75rem' }}>You should only trade with capital you can afford to lose. <strong>ASE is a simulation platform and does not involve real capital.</strong> Any future live trading product would carry full market risk.</p>
          </Section>

          <Section title="6. Roadmap Disclosures">
            <p>ASE has publicly discussed a Phase 2 roadmap that may include tokenized strategy positions using ERC-3643 security token standards. Any such future product would be subject to applicable securities laws and regulations and would require appropriate regulatory approvals before launch.</p>
            <p style={{ marginTop: '.75rem' }}>No such product currently exists on ASE. Roadmap items are aspirational and subject to change. They do not represent a commitment to deliver any specific product or feature.</p>
          </Section>

          <Section title="7. No Regulatory Registration">
            <p>ASE is not registered as a broker-dealer, investment adviser, commodity trading adviser, or any other regulated financial entity with the U.S. Securities and Exchange Commission (SEC), the Financial Industry Regulatory Authority (FINRA), the Commodity Futures Trading Commission (CFTC), or any state securities regulator.</p>
          </Section>

          <Section title="8. Limitation of Liability">
            <p>To the fullest extent permitted by applicable law, ASE and its operators expressly disclaim all liability for any loss or damage arising directly or indirectly from your use of or reliance on the platform or any information provided herein.</p>
          </Section>

          <Section title="9. Contact">
            <p>Questions regarding this disclaimer: <a href="mailto:founders@launchase.com" style={{ color: 'var(--gold)' }}>founders@launchase.com</a></p>
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
