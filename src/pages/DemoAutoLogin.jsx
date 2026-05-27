import { useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import { DEMO_MODE, DEMO_EMAIL, DEMO_PASSWORD } from '../lib/demo';

// Pagina publica de entrada da demonstracao. Faz login automatico com o
// usuario demo e cai no /dashboard · quem abre o link nao precisa digitar nada.
export default function DemoAutoLogin() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [erro, setErro] = useState(null);
  const tentou = useRef(false);

  useEffect(() => {
    if (!DEMO_MODE || !supabase) return;
    if (user) return; // ja autenticado · efeito abaixo cuida do redirect
    if (tentou.current) return;
    tentou.current = true;

    (async () => {
      const { error } = await supabase.auth.signInWithPassword({
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
      });
      if (error) {
        setErro(error.message || 'Falha ao entrar na demonstracao.');
        tentou.current = false;
      }
      // sucesso · onAuthStateChange no AuthContext atualiza `user` e o
      // efeito abaixo redireciona pro dashboard.
    })();
  }, [user]);

  useEffect(() => {
    if (user) navigate('/dashboard', { replace: true });
  }, [user, navigate]);

  if (!DEMO_MODE) return <Navigate to="/login" replace />;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: 'var(--cbrio-bg)' }}>
      <img src="/logo-cbrio-text.png" alt="CBRio" className="h-9 object-contain" />
      {erro ? (
        <div className="text-center max-w-sm px-6">
          <p className="text-sm text-red-500 mb-3">{erro}</p>
          <button
            onClick={() => { tentou.current = false; setErro(null); navigate(0); }}
            className="px-4 py-2 rounded-lg text-sm font-medium"
            style={{ background: 'var(--cbrio-card)', color: 'var(--cbrio-text)' }}
          >
            Tentar de novo
          </button>
        </div>
      ) : (
        <>
          <div className="h-8 w-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: '#00B39D', borderTopColor: 'transparent' }} />
          <p className="text-sm" style={{ color: 'var(--cbrio-text2)' }}>Entrando na demonstracao...</p>
        </>
      )}
    </div>
  );
}
