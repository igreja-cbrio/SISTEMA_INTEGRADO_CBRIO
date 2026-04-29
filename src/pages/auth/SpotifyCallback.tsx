import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, AlertCircle, Music2 } from 'lucide-react';
import { exchangeCodeForToken } from '@/hooks/useSpotify';

const C = { primary: '#1DB954' };

export default function SpotifyCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [errorMsg, setErrorMsg] = useState<string>('');

  useEffect(() => {
    (async () => {
      const params = new URLSearchParams(window.location.search);
      const code = params.get('code');
      const errorParam = params.get('error');
      const stateParam = params.get('state');
      const expectedState = sessionStorage.getItem('sp_oauth_state');

      if (errorParam) {
        setStatus('error');
        setErrorMsg(`Spotify: ${errorParam}`);
        return;
      }
      if (!code) {
        setStatus('error');
        setErrorMsg('Code não retornado pelo Spotify');
        return;
      }
      if (expectedState && stateParam !== expectedState) {
        setStatus('error');
        setErrorMsg('State mismatch — possivel CSRF, login cancelado por seguranca');
        return;
      }

      try {
        await exchangeCodeForToken(code);
        setStatus('success');
        const returnTo = sessionStorage.getItem('sp_return_to') || '/dashboard';
        sessionStorage.removeItem('sp_return_to');
        sessionStorage.removeItem('sp_oauth_state');
        // Pequeno delay pro user ver o "conectado"
        setTimeout(() => navigate(returnTo, { replace: true }), 800);
      } catch (e: any) {
        setStatus('error');
        setErrorMsg(e.message || 'Erro ao conectar com Spotify');
      }
    })();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6" style={{ background: 'var(--cbrio-bg)' }}>
      <div className="rounded-2xl border border-border bg-card p-8 max-w-md w-full text-center space-y-4">
        <div className="flex justify-center">
          <div
            className="w-14 h-14 rounded-full flex items-center justify-center"
            style={{ background: `${C.primary}20` }}
          >
            <Music2 className="h-7 w-7" style={{ color: C.primary }} />
          </div>
        </div>

        {status === 'processing' && (
          <>
            <h1 className="text-lg font-bold text-foreground">Conectando ao Spotify...</h1>
            <div className="flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: C.primary }} />
            </div>
          </>
        )}

        {status === 'success' && (
          <>
            <h1 className="text-lg font-bold text-foreground">Conectado!</h1>
            <p className="text-sm text-muted-foreground">Redirecionando...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="flex justify-center">
              <AlertCircle className="h-6 w-6 text-red-500" />
            </div>
            <h1 className="text-lg font-bold text-foreground">Falha ao conectar</h1>
            <p className="text-sm text-muted-foreground break-words">{errorMsg}</p>
            <p className="text-xs text-muted-foreground/70">
              Possíveis causas: sua conta Spotify não está cadastrada no app (User Management) ou a sessão expirou. Tente novamente.
            </p>
            <button
              onClick={() => navigate('/dashboard', { replace: true })}
              className="mt-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
              style={{ background: C.primary }}
            >
              Voltar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
