import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LoginShapesBackground } from '../components/ui/shape-landing-hero';


function FloatingInput({ id, type, icon, label, value, onChange }) {
  const [focused, setFocused] = useState(false);
  const active = focused || value.length > 0;

  return (
    <div style={{ position: 'relative', marginBottom: 24 }}>
      <input
        id={id}
        type={type}
        value={value}
        onChange={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        required
        style={{
          display: 'block', width: '100%', padding: '10px 0', fontSize: 14,
          color: 'var(--cbrio-text)', background: 'transparent', border: 'none',
          borderBottom: `2px solid ${focused ? '#00B39D' : 'var(--cbrio-border)'}`,
          outline: 'none', transition: 'border-color 0.3s', boxSizing: 'border-box',
        }}
      />
      <label htmlFor={id} style={{
        position: 'absolute', left: 0,
        top: active ? -14 : 10,
        fontSize: active ? 11 : 14,
        color: focused ? '#00B39D' : 'var(--cbrio-text3)',
        transition: 'all 0.2s', pointerEvents: 'none',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        {icon}{label}
      </label>
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
const MicrosoftIcon = () => (
  <svg width="18" height="18" viewBox="0 0 21 21"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>
);
const PlanningCenterIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#00B39D" strokeWidth="2"/><circle cx="12" cy="12" r="4" fill="#00B39D"/></svg>
);

export default function Login() {
  const { signInWithEmail, signInWithMicrosoft, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [btnHover, setBtnHover] = useState(false);

  // Show OAuth error messages from redirects
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oauthError = params.get('error');
    if (oauthError) {
      const msgs = {
        pc_oauth_denied: 'Login com Planning Center foi cancelado.',
        pc_no_email: 'Nenhum e-mail encontrado na sua conta do Planning Center.',
        pc_oauth_failed: 'Erro ao autenticar com Planning Center. Tente novamente.',
        verify_failed: 'Erro ao verificar sessao. Tente novamente.',
        use_email_login: 'Voce ja possui uma conta criada com este e-mail. Entre com seu e-mail e senha.',
      };
      setError(msgs[oauthError] || 'Erro na autenticacao.');
      // Clean the URL
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

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden', background: '#0a0a0a' }}>
      <LoginShapesBackground />

      <div style={{
        position: 'relative', zIndex: 1, width: '100%', maxWidth: 420, margin: '0 16px',
        background: 'rgba(22,22,22,0.75)', backdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.06)', borderRadius: 20, padding: '40px 36px',
      }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img src="/logo-cbrio-icon.png" alt="CBRio" style={{ width: 72, height: 72, marginBottom: 12, display: 'inline-block' }} />
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#e5e5e5', margin: 0 }}>CBRio ERP</h1>
          <p style={{ fontSize: 13, color: '#737373', marginTop: 4 }}>Sistema de gestão interna</p>
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
          <FloatingInput id="email" type="email" icon={<UserIcon />} label="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
          <FloatingInput id="password" type="password" icon={<LockIcon />} label="Senha" value={password} onChange={(e) => setPassword(e.target.value)} />

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
          <div style={{ flex: 1, height: 1, background: 'var(--cbrio-border)' }} />
          <span style={{ fontSize: 12, color: 'var(--cbrio-text3)' }}>ou continue com</span>
          <div style={{ flex: 1, height: 1, background: 'var(--cbrio-border)' }} />
        </div>

        <div>
          <OAuthButton icon={<MicrosoftIcon />} label="Microsoft" onClick={handleMicrosoft} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0 0' }}>
          <div style={{ flex: 1, height: 1, background: 'var(--cbrio-border)' }} />
          <span style={{ fontSize: 12, color: 'var(--cbrio-text3)' }}>voluntarios</span>
          <div style={{ flex: 1, height: 1, background: 'var(--cbrio-border)' }} />
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
        background: hover ? 'var(--cbrio-input-bg)' : 'var(--cbrio-modal-bg)',
        border: '1px solid var(--cbrio-border)', borderRadius: 10,
        fontSize: 14, fontWeight: 600, color: 'var(--cbrio-text2)',
        cursor: 'pointer', transition: 'all 0.3s',
      }}
    >
      {icon}
      {label}
    </button>
  );
}
