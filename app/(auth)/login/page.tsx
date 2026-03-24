import { Suspense } from 'react'
import LoginForm from './LoginForm'

export const dynamic = 'force-dynamic'

export default function LoginPage() {
  return (
    <Suspense fallback={<div style={{color:'var(--muted)',fontFamily:'var(--font-mono)',fontSize:'.8rem'}}>Loading...</div>}>
      <LoginForm />
    </Suspense>
  )
}
