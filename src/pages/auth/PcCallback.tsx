import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../supabaseClient';

export default function PcCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');

  useEffect(() => {
    const tokenHash = searchParams.get('token_hash');
    const type = searchParams.get('type') as 'magiclink';

    if (!tokenHash || !supabase) {
      navigate('/login?error=no_token', { replace: true });
      return;
    }

    supabase.auth
      .verifyOtp({ token_hash: tokenHash, type: type || 'magiclink' })
      .then(({ error: verifyErr }) => {
        if (verifyErr) {
          console.error('[PC Callback] Verify error:', verifyErr.message);
          setError(verifyErr.message);
          setTimeout(() => navigate('/login?error=verify_failed', { replace: true }), 2500);
        } else {
          navigate('/ministerial/voluntariado/checkin', { replace: true });
        }
      });
  }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#0a0a0a',
        color: '#e5e5e5',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        {error ? (
          <>
            <p style={{ fontSize: 18, fontWeight: 600, color: '#ef4444' }}>Erro na autenticacao</p>
            <p style={{ fontSize: 14, color: '#737373', marginTop: 8 }}>{error}</p>
            <p style={{ fontSize: 12, color: '#525252', marginTop: 16 }}>Redirecionando para login...</p>
          </>
        ) : (
          <>
            <div
              style={{
                height: 32,
                width: 32,
                margin: '0 auto 16px',
                border: '3px solid #333',
                borderTopColor: '#00B39D',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <p style={{ fontSize: 16, fontWeight: 500 }}>Autenticando com Planning Center...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </>
        )}
      </div>
    </div>
  );
}
