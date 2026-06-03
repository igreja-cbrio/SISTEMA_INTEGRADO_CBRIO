import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../contexts/AuthContext';
import AnimatedBackground from './public/AnimatedBackground';
import { PublicThemeToggle } from './public/publicTheme';
import { useTheme } from '../contexts/ThemeContext';

const mkCOL = (isDark) => isDark ? {
  text: '#f5f5f5', textMuted: '#a3a3a3', textDim: '#737373',
  border: 'rgba(255,255,255,0.18)', borderFocus: '#00B39D',
  cardBg: 'rgba(22,22,22,0.78)', cardBorder: 'rgba(255,255,255,0.08)', pageBg: '#0a0a0a',
} : {
  text: '#171717', textMuted: '#525252', textDim: '#737373',
  border: 'rgba(0,0,0,0.18)', borderFocus: '#00B39D',
  cardBg: 'rgba(255,255,255,0.92)', cardBorder: 'rgba(0,0,0,0.08)', pageBg: '#eef2f1',
};

export default function RedefinirSenha() {
  const { isDark } = useTheme();
  const COL = mkCOL(isDark);
  const navigate = useNavigate();
  const { updatePasswordOnly } = useAuth();
  // Quando o link do e-mail eh aberto, Supabase coloca tokens no hash da URL.
  // O onAuthStateChange dispara PASSWORD_RECOVERY · ai a sessão já estah valida.
  const [pronto, setPronto] = useState(false);
  const [erroSessao, setErroSessao] = useState('');

  const [senha, setSenha] = useState('');
  const [confirma, setConfirma] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setErroSessao('Sistema de autenticação indisponível.');
      return;
    }
    // Se já tem sessão (Supabase parseou o hash), libera direto
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) setPronto(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setPronto(true);
    });
    // Se em 4s nada disparou, mostra erro
    const t = setTimeout(() => {
      supabase.auth.getSession().then(({ data }) => {
        if (!data?.session) {
          setErroSessao('Link invalido ou expirado. Solicite outro em "Esqueci minha senha".');
        }
      });
    }, 4000);
    return () => { sub?.subscription?.unsubscribe(); clearTimeout(t); };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setErro('');
    if (senha.length < 6) return setErro('A senha precisa ter pelo menos 6 caracteres.');
    if (senha !== confirma) return setErro('As senhas não conferem.');
    setLoading(true);
    const { error } = await updatePasswordOnly(senha);
    setLoading(false);
    if (error) return setErro(error.message || 'Erro ao atualizar senha.');
    setSucesso(true);
    setTimeout(() => navigate('/'), 1800);
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', background: COL.pageBg }}>
      <AnimatedBackground />
      <PublicThemeToggle />

      <div style={{
        position: 'relative', zIndex: 1, width: '100%', maxWidth: 420, margin: '0 16px',
        background: COL.cardBg, backdropFilter: 'blur(24px)',
        border: `1px solid ${COL.cardBorder}`, borderRadius: 20, padding: '40px 36px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img src="/logo-cbrio-icon.png" alt="CBRio" style={{ width: 64, height: 64, marginBottom: 12 }} />
          <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5, margin: 0, background: 'linear-gradient(90deg, #00B39D, #00d9bd)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>Criar nova senha</h1>
          <p style={{ fontSize: 13, color: COL.textDim, marginTop: 4 }}>
            Defina uma senha forte que voce vai lembrar
          </p>
        </div>

        {erroSessao && (
          <div style={{ background: '#ef444418', border: '1px solid #ef444440', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: '#ef4444', marginBottom: 16 }}>
            {erroSessao}
            <div style={{ marginTop: 8 }}>
              <button onClick={() => navigate('/login')} style={{ background: 'none', border: 'none', color: '#ef4444', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>
                Voltar para o login
              </button>
            </div>
          </div>
        )}

        {sucesso && (
          <div style={{ background: '#00B39D18', border: '1px solid #00B39D40', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: '#00B39D', marginBottom: 16 }}>
            Senha atualizada! Redirecionando...
          </div>
        )}

        {erro && (
          <div style={{ background: '#ef444418', border: '1px solid #ef444440', borderRadius: 10, padding: '10px 14px', fontSize: 13, color: '#ef4444', marginBottom: 16 }}>
            {erro}
          </div>
        )}

        {pronto && !sucesso && (
          <form onSubmit={handleSubmit}>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: COL.textMuted, display: 'block', marginBottom: 6 }}>Nova senha</label>
              <input
                type={show ? 'text' : 'password'}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete="new-password"
                required
                style={{ width: '100%', padding: '10px 12px', fontSize: 14, color: COL.text, background: 'rgba(255,255,255,0.04)', border: `1px solid ${COL.border}`, borderRadius: 8, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: COL.textMuted, display: 'block', marginBottom: 6 }}>Confirme a nova senha</label>
              <input
                type={show ? 'text' : 'password'}
                value={confirma}
                onChange={(e) => setConfirma(e.target.value)}
                autoComplete="new-password"
                required
                style={{ width: '100%', padding: '10px 12px', fontSize: 14, color: COL.text, background: 'rgba(255,255,255,0.04)', border: `1px solid ${COL.border}`, borderRadius: 8, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: COL.textDim, marginBottom: 18, cursor: 'pointer' }}>
              <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} style={{ accentColor: COL.borderFocus }} />
              Mostrar senha
            </label>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '12px 16px',
                background: COL.borderFocus, color: '#fff',
                border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600,
                cursor: loading ? 'wait' : 'pointer', opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? 'Salvando...' : 'Atualizar senha'}
            </button>
          </form>
        )}

        {!pronto && !erroSessao && (
          <p style={{ textAlign: 'center', color: COL.textDim, fontSize: 13 }}>Validando link...</p>
        )}
      </div>
    </div>
  );
}
