import { useState } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { cadastroPublico } from '@/api';
import MemberWalletPass from '@/components/membresia/MemberWalletPass';

function maskCpf(v: string) {
  const d = v.replace(/\D+/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

export default function WalletPage() {
  const [cpf, setCpf] = useState('');
  const [dob, setDob] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [verified, setVerified] = useState(false);

  const handleVerify = async () => {
    const clean = cpf.replace(/\D+/g, '');
    if (clean.length !== 11) { setError('Digite um CPF válido (11 dígitos).'); return; }
    if (!dob) { setError('Informe sua data de nascimento.'); return; }
    setBusy(true);
    setError('');
    try {
      const r = await cadastroPublico.walletVerify(clean, dob);
      if (!r.found) {
        setError('Cadastro não encontrado. Verifique os dados ou preencha o formulário de cadastro.');
        return;
      }
      setVerified(true);
    } catch (e: any) {
      setError(e.message || 'Erro ao verificar cadastro');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh', background: '#0a0a0a', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        width: '100%', maxWidth: 400,
        background: '#161616', border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: 24, padding: 32,
      }}>
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <img src="/logo-cbrio-icon.png" alt="CBRio" style={{ width: 52, height: 52, marginBottom: 10 }} />
          <h1 style={{ fontSize: 20, fontWeight: 800, color: '#e5e5e5', margin: 0 }}>CBRio — QR de Membro</h1>
          {!verified && (
            <p style={{ fontSize: 13, color: '#737373', marginTop: 8, lineHeight: 1.5 }}>
              Informe seu CPF e data de nascimento para gerar seu QR de membro.
            </p>
          )}
        </div>

        {!verified ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#a3a3a3', marginBottom: 6 }}>CPF</label>
              <input
                inputMode="numeric"
                autoFocus
                value={cpf}
                onChange={e => setCpf(maskCpf(e.target.value))}
                placeholder="000.000.000-00"
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 12,
                  background: '#1f1f1f', border: '1px solid rgba(255,255,255,0.1)',
                  color: '#e5e5e5', fontSize: 15, outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: '#a3a3a3', marginBottom: 6 }}>Data de nascimento</label>
              <input
                type="date"
                value={dob}
                onChange={e => setDob(e.target.value)}
                style={{
                  width: '100%', padding: '10px 14px', borderRadius: 12,
                  background: '#1f1f1f', border: '1px solid rgba(255,255,255,0.1)',
                  color: '#e5e5e5', fontSize: 15, outline: 'none', boxSizing: 'border-box',
                }}
              />
            </div>
            {error && (
              <div style={{ display: 'flex', gap: 8, color: '#f87171', fontSize: 13 }}>
                <AlertCircle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                <span>{error}</span>
              </div>
            )}
            <button
              onClick={handleVerify}
              disabled={busy}
              style={{
                padding: '12px', borderRadius: 12, background: '#00B39D',
                color: '#fff', fontWeight: 700, fontSize: 15, border: 'none',
                cursor: busy ? 'not-allowed' : 'pointer', display: 'flex',
                alignItems: 'center', justifyContent: 'center', gap: 8,
                opacity: busy ? 0.7 : 1,
              }}
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : 'Gerar meu QR'}
            </button>
            <p style={{ textAlign: 'center', fontSize: 12, color: '#525252' }}>
              Ainda não tem cadastro?{' '}
              <a href="/cadastro-membresia" style={{ color: '#00B39D' }}>Cadastre-se aqui</a>
            </p>
          </div>
        ) : (
          <MemberWalletPass cpf={cpf.replace(/\D+/g, '')} dataNascimento={dob} inline />
        )}
      </div>
    </div>
  );
}
