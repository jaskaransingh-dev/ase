'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function VerifyEmailContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const verifyAndLogin = async () => {
      const supabase = createClient()
      
      // Try to get tokens from URL
      const accessToken = searchParams.get('access_token')
      const refreshToken = searchParams.get('refresh_token')
      
      if (accessToken && refreshToken) {
        // Set session with tokens from URL
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken
        })
        
        if (error) {
          console.error('Session setting failed:', error)
          setStatus('error')
          setMessage('Failed to verify email')
          setTimeout(() => {
            router.push('/login')
          }, 2000)
        } else {
          setStatus('success')
          setMessage('Email verified successfully!')
          setTimeout(() => {
            router.push('/dashboard')
          }, 1500)
        }
      } else {
        // Check if user is already logged in
        const { data: { user }, error } = await supabase.auth.getUser()
        
        if (user && !error) {
          setStatus('success')
          setMessage('Already logged in! Redirecting...')
          setTimeout(() => {
            router.push('/dashboard')
          }, 1500)
        } else {
          // Try to verify with token_hash
          const tokenHash = searchParams.get('token_hash')
          const type = searchParams.get('type')
          
          if (tokenHash && type) {
            const { error } = await supabase.auth.verifyOtp({
              token_hash: tokenHash,
              type: type as 'signup'
            })
            
            if (error) {
              setStatus('error')
              setMessage('Verification link expired')
              setTimeout(() => {
                router.push('/login')
              }, 2000)
            } else {
              setStatus('success')
              setMessage('Email verified successfully!')
              setTimeout(() => {
                router.push('/dashboard')
              }, 1500)
            }
          } else {
            setStatus('error')
            setMessage('Invalid verification link')
            setTimeout(() => {
              router.push('/login')
            }, 2000)
          }
        }
      }
    }

    verifyAndLogin()
  }, [searchParams, router])

  return (
    <div style={{ width: '100%', maxWidth: 420 }}>
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,.6)', padding: '2rem', textAlign: 'center' }}>
        {status === 'loading' && (
          <>
            <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⟳</div>
            <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '1.4rem', fontWeight: 800, marginBottom: '.5rem' }}>Verifying your email</h2>
            <p style={{ color: 'var(--muted)', fontSize: '.9rem', lineHeight: 1.7 }}>Please wait while we verify your email address...</p>
          </>
        )}
        
        {status === 'success' && (
          <>
            <div style={{ fontSize: '2rem', marginBottom: '1rem', color: 'var(--green)' }}>✓</div>
            <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '1.4rem', fontWeight: 800, marginBottom: '.5rem' }}>Email Verified</h2>
            <p style={{ color: 'var(--muted)', fontSize: '.9rem', lineHeight: 1.7, marginBottom: '1.5rem' }}>
              {message}. Redirecting you to your dashboard...
            </p>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <span className="spinner" />
            </div>
          </>
        )}
        
        {status === 'error' && (
          <>
            <div style={{ fontSize: '2rem', marginBottom: '1rem', color: 'var(--red)' }}>🔐</div>
            <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '1.4rem', fontWeight: 800, marginBottom: '.5rem' }}>Login Required</h2>
            <p style={{ color: 'var(--muted)', fontSize: '.9rem', lineHeight: 1.7, marginBottom: '1.5rem' }}>
              Redirecting you to login page...
            </p>
          </>
        )}
      </div>
    </div>
  )
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: 20, overflow: 'hidden', boxShadow: '0 40px 100px rgba(0,0,0,.6)', padding: '2rem', textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⟳</div>
          <h2 style={{ fontFamily: 'var(--font-head)', fontSize: '1.4rem', fontWeight: 800, marginBottom: '.5rem' }}>Loading...</h2>
        </div>
      </div>
    }>
      <VerifyEmailContent />
    </Suspense>
  )
}
