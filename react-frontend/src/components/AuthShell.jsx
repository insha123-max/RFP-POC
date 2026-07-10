import { useState, useEffect } from 'react'

/* Shared visual shell for Login/Signup — light theme matching the rest of the
 * app (Dashboard/TopBar use white cards + blue/indigo accents on light gray),
 * with a soft animated backdrop and a fade-up entrance for the card.
 */
export default function AuthShell({ headerTitle, headerSubtitle, children }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { const t = setTimeout(() => setMounted(true), 20); return () => clearTimeout(t) }, [])

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(160deg, #F5F7FF 0%, #EEF2FF 45%, #F8FAFC 100%)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      padding: '1.5rem 1rem',
      position: 'relative',
      overflow: 'hidden',
    }}>
      {/* Soft floating color blobs — subtle, on-brand (blue/indigo/violet) */}
      <div className="auth-blob auth-blob-1" />
      <div className="auth-blob auth-blob-2" />
      <div className="auth-blob auth-blob-3" />

      {/* Faint grid, consistent with the dark-theme version this replaces */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: 'linear-gradient(rgba(59,111,232,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(59,111,232,0.05) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }} />

      <div style={{
        position: 'relative', zIndex: 1, width: '100%', maxWidth: 440,
        opacity: mounted ? 1 : 0,
        transform: mounted ? 'translateY(0)' : 'translateY(16px)',
        transition: 'opacity .5s ease, transform .5s ease',
      }}>
        <div style={{
          background: '#fff',
          borderRadius: 20,
          boxShadow: '0 20px 50px rgba(59,111,232,0.16), 0 4px 12px rgba(15,23,42,0.06)',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div className="auth-header" style={{
            background: 'linear-gradient(135deg, #3B6FE8 0%, #4F46E5 100%)',
            padding: '2rem 2rem 1.75rem',
            textAlign: 'center',
            position: 'relative',
            overflow: 'hidden',
          }}>
            <div className="auth-shine" />
            <img
              src="/logo.png"
              alt="BidEval AI"
              className="auth-logo"
              style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: '3px solid rgba(255,255,255,0.3)', marginBottom: '0.875rem', position: 'relative' }}
            />
            <div style={{ color: '#fff', fontSize: '1.375rem', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.2, position: 'relative' }}>
              BidEval AI
            </div>
            <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '0.8rem', fontWeight: 500, marginTop: 4, position: 'relative' }}>
              Procurement Intelligence Platform
            </div>
          </div>

          {/* Form area */}
          <div style={{ padding: '2rem' }}>
            {(headerTitle || headerSubtitle) && (
              <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
                {headerTitle && (
                  <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#111827', marginBottom: 4 }}>
                    {headerTitle}
                  </div>
                )}
                {headerSubtitle && (
                  <div style={{ fontSize: '0.82rem', color: '#6B7280' }}>
                    {headerSubtitle}
                  </div>
                )}
              </div>
            )}
            {children}
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: '1.25rem', color: '#94A3B8', fontSize: '0.72rem' }}>
          Powered by GlobalLogic · BidEval AI
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }

        @keyframes floatBlob1 { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(30px, -24px) scale(1.08); } }
        @keyframes floatBlob2 { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(-24px, 24px) scale(1.06); } }
        @keyframes floatBlob3 { 0%, 100% { transform: translate(0, 0) scale(1); } 50% { transform: translate(18px, 18px) scale(0.94); } }

        .auth-blob {
          position: absolute; border-radius: 50%; filter: blur(60px); pointer-events: none;
        }
        .auth-blob-1 {
          width: 340px; height: 340px; top: -80px; left: -80px;
          background: radial-gradient(circle, rgba(59,111,232,0.22), transparent 70%);
          animation: floatBlob1 14s ease-in-out infinite;
        }
        .auth-blob-2 {
          width: 300px; height: 300px; bottom: -100px; right: -60px;
          background: radial-gradient(circle, rgba(139,92,246,0.18), transparent 70%);
          animation: floatBlob2 16s ease-in-out infinite;
        }
        .auth-blob-3 {
          width: 220px; height: 220px; bottom: 20%; left: 6%;
          background: radial-gradient(circle, rgba(79,70,229,0.14), transparent 70%);
          animation: floatBlob3 12s ease-in-out infinite;
        }

        .auth-logo { animation: logoPop .6s cubic-bezier(.34,1.56,.64,1) .1s both; }
        @keyframes logoPop { from { opacity: 0; transform: scale(0.6); } to { opacity: 1; transform: scale(1); } }

        .auth-shine {
          position: absolute; top: 0; left: -60%; width: 40%; height: 100%;
          background: linear-gradient(120deg, transparent, rgba(255,255,255,0.18), transparent);
          transform: skewX(-20deg);
          animation: shineSweep 5s ease-in-out infinite;
        }
        @keyframes shineSweep { 0% { left: -60%; } 45% { left: 130%; } 100% { left: 130%; } }

        @media (prefers-reduced-motion: reduce) {
          .auth-blob, .auth-logo, .auth-shine { animation: none !important; }
        }
      `}</style>
    </div>
  )
}
