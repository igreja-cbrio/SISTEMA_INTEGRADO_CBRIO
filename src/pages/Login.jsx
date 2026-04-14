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
const GoogleIcon = () => (
  <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.9 2.5 30.5 0 24 0 14.6 0 6.6 5.6 2.7 13.7l7.9 6.2C12.4 13.4 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.6c0-1.8-.2-3.5-.5-5.2H24v9.9h12.4c-.5 2.9-2.1 5.3-4.5 7l7 5.5c4.1-3.8 6.5-9.4 6.5-16.1z"/><path fill="#34A853" d="M10.6 28.6c-1-2.9-1-6 0-8.9l-7.9-6.2C.3 18.3-.4 24.1 1.3 29.4l9.3-1z"/><path fill="#FBBC05" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7-5.5c-2.4 1.6-5.4 2.5-8.9 2.5-6.3 0-11.6-3.9-13.5-9.5l-7.9 6.2C6.6 42.4 14.6 48 24 48z"/></svg>
);
const MicrosoftIcon = () => (
  <svg width="18" height="18" viewBox="0 0 21 21"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>
);

export default function Login() {
  const { signInWithEmail, signInWithGoogle, signInWithMicrosoft, user } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [btnHover, setBtnHover] = useState(false);

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

  async function handleOAuth(provider) {
    setError('');
    const fn = provider === 'google' ? signInWithGoogle : signInWithMicrosoft;
    const { error: err } = await fn();
    if (err) setError(err.message);
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', overflow: 'hidden' }}>
      <SmokeyBackground />

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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <OAuthButton icon={<GoogleIcon />} label="Google" onClick={() => handleOAuth('google')} />
          <OAuthButton icon={<MicrosoftIcon />} label="Microsoft" onClick={() => handleOAuth('microsoft')} />
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
