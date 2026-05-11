import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { nps as api } from '../../api';
import { Loader2, CheckCircle2, MessageSquare } from 'lucide-react';
import NpsForm from '../../components/nps/NpsForm';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)',
  text: 'var(--cbrio-text)', t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', inputBg: 'var(--cbrio-input-bg)',
  cyan: '#06b6d4',
};

const inp = {
  width: '100%', padding: '10px 12px', borderRadius: 8,
  border: `1px solid ${C.border}`, background: C.inputBg,
  color: C.text, fontSize: 14, boxSizing: 'border-box', fontFamily: 'inherit',
};

export default function NpsPublica() {
  const { token } = useParams();
  const [pesquisa, setPesquisa] = useState(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');

  // Forca dark theme (consistente com outras paginas publicas)
  useEffect(() => {
    const html = document.documentElement;
    const prev = html.getAttribute('data-theme');
    html.setAttribute('data-theme', 'dark');
    return () => {
      if (prev) html.setAttribute('data-theme', prev);
      else html.removeAttribute('data-theme');
    };
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.publicGet(token);
        setPesquisa(data);
      } catch (e) {
        setErro(e.message || 'Pesquisa indisponível');
      }
      setLoading(false);
    })();
  }, [token]);

  async function enviar({ score, respostas, comentario }) {
    if (!nome.trim()) return alert('Informe seu nome.');
    if (!email.trim()) return alert('Informe seu e-mail.');
    setEnviando(true);
    try {
      await api.publicResponder(token, { nome: nome.trim(), email: email.trim(), score, respostas, comentario });
      setEnviado(true);
    } catch (e) {
      alert(e.message || 'Erro ao enviar resposta');
    }
    setEnviando(false);
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, padding: '40px 20px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <img src="/logo-cbrio-text.png" alt="CBRio" style={{ height: 32 }} />
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: 60, color: C.t3 }}>
            <Loader2 size={28} className="animate-spin" style={{ display: 'inline-block' }} />
          </div>
        ) : erro ? (
          <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 32, textAlign: 'center' }}>
            <p style={{ color: C.t2, margin: 0 }}>{erro}</p>
          </div>
        ) : enviado ? (
          <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 40, textAlign: 'center' }}>
            <CheckCircle2 size={56} style={{ color: C.cyan, marginBottom: 16 }} />
            <h2 style={{ margin: '0 0 8px', fontSize: 22, color: C.text }}>Resposta enviada!</h2>
            <p style={{ fontSize: 14, color: C.t2, margin: 0 }}>Obrigado por nos ajudar a melhorar.</p>
          </div>
        ) : pesquisa ? (
          <div style={{ background: C.card, borderRadius: 12, border: `1px solid ${C.border}`, padding: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <MessageSquare size={20} style={{ color: C.cyan }} />
              <h1 style={{ margin: 0, fontSize: 22, color: C.text, fontWeight: 700 }}>{pesquisa.titulo}</h1>
            </div>
            {pesquisa.perguntas?.descricao_curta && (
              <p style={{ margin: '0 0 20px', fontSize: 13, color: C.t2, lineHeight: 1.5 }}>{pesquisa.perguntas.descricao_curta}</p>
            )}

            <NpsForm
              pesquisa={pesquisa}
              onSubmit={enviar}
              enviando={enviando}
              extraHeader={
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, paddingBottom: 16, borderBottom: `1px dashed ${C.border}` }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.t2, marginBottom: 6 }}>Seu nome *</label>
                    <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Como prefere ser chamado" style={inp} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.t2, marginBottom: 6 }}>Seu e-mail *</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" style={inp} />
                  </div>
                </div>
              }
            />
          </div>
        ) : null}

        <p style={{ textAlign: 'center', fontSize: 11, color: C.t3, marginTop: 16 }}>
          Suas respostas são confidenciais e usadas apenas para melhorar nossa atuação.
        </p>
      </div>
    </div>
  );
}
