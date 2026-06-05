import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, CheckCircle, XCircle, ShieldOff } from 'lucide-react'
import { API_BASE } from '@/config/api'

interface AccessDeniedInfo {
  code: string
  applyUrl: string
}

const ACCESS_DENIED_KEYS: Record<string, { title: string; desc: string }> = {
  BLACKLISTED: { title: 'auth.blacklisted', desc: 'auth.blacklistedDesc' },
  SERVICE_CLOSED: { title: 'auth.serviceClosed', desc: 'auth.serviceClosedDesc' },
  ACCESS_DENIED: { title: 'auth.accessDenied', desc: 'auth.accessDeniedDesc' },
}

/**
 *  /auth/callback
 *
 * /pre-teemai  302
 *  URL  token POST  /api/auth/teemai/save-token
 *
 *  callback  window.location.origin
 */
const AuthCallbackPage = () => {
  const { t } = useTranslation('common')
  const [state, setState] = useState<'loading' | 'success' | 'denied' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')
  const [deniedInfo, setDeniedInfo] = useState<AccessDeniedInfo | null>(null)
  const called = useRef(false)

  useEffect(() => {
    if (called.current) return
    called.current = true

    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    const workid = params.get('workid')
    const name = params.get('name') ?? ''
    const expires_at = params.get('expires_at') ?? ''
    const dept_path = params.get('dept_path') ?? ''

    if (!token || !workid) {
      setState('error')
      setErrorMsg(t('auth.missingParams'))
      return
    }

    fetch(`${API_BASE}/api/auth/teemai/save-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, workid, name, expires_at, dept_path }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || `HTTP ${res.status}`)
        }
        const data = await res.json()
        if (!data.accessAllowed && data.accessDenied) {
          setDeniedInfo(data.accessDenied)
          setState('denied')
          return
        }
        setState('success')
        setTimeout(() => window.close(), 2000)
      })
      .catch((err) => {
        setState('error')
        setErrorMsg(err.message || t('auth.saveFailed'))
      })
  }, [])

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif',
        background: '#0a0a0a',
        color: '#e5e5e5',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        {state === 'loading' && (
          <>
            <Loader2
              size={40}
              style={{ margin: '0 auto 16px', animation: 'spin 1s linear infinite' }}
            />
            <p style={{ color: '#888' }}>{t('auth.savingLogin')}</p>
          </>
        )}
        {state === 'success' && (
          <>
            <CheckCircle size={48} style={{ margin: '0 auto 16px', color: '#4ade80' }} />
            <h2 style={{ marginBottom: 8 }}>{t('auth.loginSuccess')}</h2>
            <p style={{ color: '#888' }}>{t('auth.loginSuccessDesc')}</p>
          </>
        )}
        {state === 'denied' && (() => {
          const keys = ACCESS_DENIED_KEYS[deniedInfo?.code ?? ''] ?? ACCESS_DENIED_KEYS.ACCESS_DENIED
          return (
            <>
              <ShieldOff size={48} style={{ margin: '0 auto 16px', color: '#f59e0b' }} />
              <h2 style={{ marginBottom: 8 }}>{t(keys.title)}</h2>
              <p style={{ color: '#888' }}>{t(keys.desc)}</p>
            </>
          )
        })()}
        {state === 'error' && (
          <>
            <XCircle size={48} style={{ margin: '0 auto 16px', color: '#f87171' }} />
            <h2 style={{ marginBottom: 8 }}>{t('auth.loginFailed')}</h2>
            <p style={{ color: '#888' }}>{errorMsg}</p>
          </>
        )}
      </div>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

export default AuthCallbackPage
