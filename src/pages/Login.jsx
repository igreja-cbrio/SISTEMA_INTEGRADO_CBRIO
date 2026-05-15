import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LoginShapesBackground } from '../components/ui/shape-landing-hero';

// Paleta fixa do login · pagina sempre dark independente do tema do usuario,
// senao a fonte fica invisivel em quem ta no tema claro.
const COL = {
  text: '#f5f5f5',
  textMuted: '#a3a3a3',
  textDim: '#737373',
  border: 'rgba(255,255,255,0.18)',
  borderFocus: '#00B39D',
  cardBg: 'rgba(22,22,22,0.78)',
  cardBorder: 'rgba(255,255,255,0.08)',
  oauthBg: 'rgba(255,255,255,0.04)',
  oauthHover: 'rgba(255,255,255,0.08)',
};

function FloatingInput({ id, type, icon, label, value, onChange, rightAction, autoComplete }) {
  const [focused, setFocused] = useState(false);
  const active = focused || (value && value.length > 0);

  return (
    <div style={{ position: 'relative', marginBottom: 24 }}>
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoComplete={autoComplete}
        required
        style={{
          display: 'block', width: '100%',
          padding: rightAction ? '10px 36px 10px 0' : '10px 0',
          fontSize: 15,
          color: COL.text,
          background: 'transparent',
          border: 'none',
          borderBottom: `2px solid ${focused ? COL.borderFocus : COL.border}`,
          outline: 'none', transition: 'border-color 0.3s', boxSizing: 'border-box',
          // Forca a cor mesmo quando o navegador autocompleta (Chrome usa amarelo)
          WebkitTextFillColor: COL.text,
          caretColor: COL.borderFocus,
        }}
      />
      <label htmlFor={id} style={{
        position: 'absolute', left: 0,
        top: active ? -14 : 10,
        fontSize: active ? 11 : 14,
        color: focused ? COL.borderFocus : COL.textMuted,
        transition: 'all 0.2s', pointerEvents: 'none',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        {icon}{label}
      </label>
      {rightAction && (
        <div style={{ position: 'absolute', right: 0, top: 8 }}>{rightAction}</div>
      )}
    </div>
  );
}

const UserIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="8" r="4"/><path d="M20 21a8 8 0 1 0-16 0"/></svg>
);
const LockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
);
const ArrowIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
);
const EyeIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
  </svg>
);
const EyeOffIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
    <line x1="1" y1="1" x2="23" y2="23"/>
  </svg>
);
const MicrosoftIcon = () => (
  <svg width="18" height="18" viewBox="0 0 21 21"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>
);
const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48">
    <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
    <path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
    <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
    <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
  </svg>
);
const PlanningCenterIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#00B39D" strokeWidth="2"/><circle cx="12" cy="12" r="4" fill="#00B39D"/></svg>
);

export default function Login() {
  const { signInWithEmail, signInWithMicrosoft, signInWithGoogle, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [btnHover, setBtnHover] = useState(false);

  // Show OAuth error messages from redirects
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const oauthError = params.get('error');
    const hashError = hashParams.get('error');
    const errorCode = params.get('error_code') || hashParams.get('error_code');
    const errorDescription = params.get('error_description') || hashParams.get('error_description');
    const authError = oauthError || hashError;
    if (authError) {
      const msgs = {
        pc_oauth_denied: 'Login com Planning Center foi cancelado.',
        pc_no_email: 'Nenhum e-mail encontrado na sua conta do Planning Center.',
        pc_oauth_failed: 'Erro ao autenticar com Planning Center. Tente novamente.',
        verify_failed: 'Erro ao verificar sessao. Tente novamente.',
        server_error: 'Erro no provedor de login. Tente novamente.',
      };
      const baseMessage = msgs[authError] || 'Erro na autenticacao.';
      const detail = errorDescription || errorCode;
      setError(detail ? `${baseMessage} Detalhe: ${detail}` : baseMessage);
      window.history.replaceState({}, '', '/login');
    }
  }, []);

  useEffect(() => {
    if (user) navigate('/');
  }, [user, navigate]);

  async function handleEmail(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error: err } = await signInWithEmail(email, password);
    setLoading(false);
    if (err) return setError(err.message);
    navigate('/');
  }

  async function handleMicrosoft() {
    setError('');
    const { error: err } = await signInWithMicrosoft();
    if (err) setError(err.message);
  }

  async function handleGoogle() {
    setError('');
    const { error: err } = await signInWithGoogle();
    if (err) setError(err.message);
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', background: '#0a0a0a' }}>
      <LoginShapesBackground />

      {/* Autofill do Chrome usa cor amarela no background · forca o fundo a ficar transparente */}
      <style>{`
        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus,
        input:-webkit-autofill:active {
          -webkit-text-fill-color: ${COL.text} !important;
          -webkit-box-shadow: 0 0 0 1000px transparent inset !important;
          transition: background-color 5000s ease-in-out 0s;
          caret-color: ${COL.borderFocus};
        }
      `}</style>

      <div style={{
        position: 'relative', zIndex: 1, width: '100%', maxWidth: 420, margin: '0 16px',
        background: COL.cardBg, backdropFilter: 'blur(24px)',
        border: `1px solid ${COL.cardBorder}`, borderRadius: 20, padding: '40px 36px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img src="/logo-cbrio-icon.png" alt="CBRio" style={{ width: 72, height: 72, marginBottom: 12, display: 'inline-block' }} />
          <h1 style={{ fontSize: 22, fontWeight: 800, color: COL.text, margin: 0 }}>CBRio ERP</h1>
          <p style={{ fontSize: 13, color: COL.textDim, marginTop: 4 }}>Sistema de gestão interna</p>
        </div>

        {error && (
          <div style={{
            background: '#ef444418', border: '1px solid #ef444440', borderRadius: 10,
            padding: '10px 14px', marginBottom: 20, fontSize: 13, color: '#ef4444',
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleEmail}>
          <FloatingInput
            id="email" type="email" icon={<UserIcon />} label="E-mail"
            value={email} onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
          <FloatingInput
            id="password"
            type={showPassword ? 'text' : 'password'}
            icon={<LockIcon />} label="Senha"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            rightAction={
              <button
                type="button"
                onClick={() => setShowPassword(s => !s)}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                tabIndex={-1}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  color: showPassword ? COL.borderFocus : COL.textMuted,
                  padding: 4, display: 'flex', alignItems: 'center',
                }}
              >
                {showPassword ? <EyeOffIcon /> : <EyeIcon />}
              </button>
            }
          />

          <button
            type="submit"
            disabled={loading}
            onMouseEnter={() => setBtnHover(true)}
            onMouseLeave={() => setBtnHover(false)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 8, padding: '13px 20px',
              background: btnHover ? '#009985' : '#00B39D',
              color: '#fff', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 600,
              cursor: loading ? 'wait' : 'pointer', transition: 'all 0.3s', opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? 'Entrando...' : 'Entrar'}
            {!loading && <ArrowIcon />}
          </button>
        </form>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0' }}>
          <div style={{ flex: 1, height: 1, background: COL.cardBorder }} />
          <span style={{ fontSize: 12, color: COL.textDim }}>ou continue com</span>
          <div style={{ flex: 1, height: 1, background: COL.cardBorder }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <OAuthButton icon={<MicrosoftIcon />} label="Microsoft" onClick={handleMicrosoft} />
          <OAuthButton icon={<GoogleIcon />} label="Google" onClick={handleGoogle} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0 0' }}>
          <div style={{ flex: 1, height: 1, background: COL.cardBorder }} />
          <span style={{ fontSize: 12, color: COL.textDim }}>voluntários</span>
          <div style={{ flex: 1, height: 1, background: COL.cardBorder }} />
        </div>

        <div style={{ marginTop: 12 }}>
          <OAuthButton
            icon={<PlanningCenterIcon />}
            label="Entrar com Planning Center"
            onClick={() => { window.location.href = '/api/auth/planning-center/login'; }}
          />
        </div>
      </div>
    </div>
  );
}

function OAuthButton({ icon, label, onClick }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 10, padding: '11px 16px',
        background: hover ? COL.oauthHover : COL.oauthBg,
        border: `1px solid ${COL.cardBorder}`, borderRadius: 10,
        fontSize: 14, fontWeight: 600, color: COL.text,
        cursor: 'pointer', transition: 'all 0.3s',
      }}
    >
      {icon}
      {label}
    </button>
  );
}
