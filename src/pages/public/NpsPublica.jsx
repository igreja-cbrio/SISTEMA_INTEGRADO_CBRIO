import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { nps as api } from '../../api';
import { Loader2, CheckCircle2, MessageSquare } from 'lucide-react';
import NpsForm from '../../components/nps/NpsForm';
import AnimatedBackground from './AnimatedBackground';
import { PublicThemeToggle } from './publicTheme';

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
  const [anonimo, setAnonimo] = useState(false);

  // ── Fila offline (localStorage) ──────────────────────────────────────────
  // A resposta é salva no próprio aparelho e sobe em segundo plano com re-tentativa.
  // Assim a pessoa vê "Obrigado" NA HORA e não perdemos resposta se a borda do
  // Vercel der um soluço no pico do culto (fila é drenada até zerar).
  const QKEY = `nps_fila_${token}`;
  function lerFila() { try { return JSON.parse(localStorage.getItem(QKEY) || '[]'); } catch { return []; } }
  function salvarFila(arr) { try { localStorage.setItem(QKEY, JSON.stringify(arr)); } catch { /* quota/modo privado */ } }
  async function subirFila() {
    const fila = lerFila();
    if (!fila.length) return;
    const restante = [];
    for (const item of fila) {
      try { await api.publicResponder(token, item.payload); }   // 2xx → não re-enfileira
      catch { restante.push(item); }                            // falhou → mantém pra re-tentar
    }
    salvarFila(restante);
    if (restante.length) setTimeout(subirFila, 8000);           // re-tenta em 8s até zerar
  }

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
    subirFila(); // sobe pendências que tenham sobrado de antes
    // Última tentativa ao fechar/ocultar a aba · sendBeacon envia durante o unload.
    const aoOcultar = () => { for (const it of lerFila()) api.publicResponderBeacon(token, it.payload); };
    const onVis = () => { if (document.visibilityState === 'hidden') aoOcultar(); };
    window.addEventListener('pagehide', aoOcultar);
    document.addEventListener('visibilitychange', onVis);
    return () => { window.removeEventListener('pagehide', aoOcultar); document.removeEventListener('visibilitychange', onVis); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  function enviar({ score, respostas, comentario }) {
    if (!anonimo) {
      if (!nome.trim()) return alert('Informe seu nome (ou marque "responder como anônimo").');
      if (!email.trim()) return alert('Informe seu e-mail (ou marque "responder como anônimo").');
    }
    const payload = { nome: anonimo ? null : nome.trim(), email: anonimo ? null : email.trim(), anonimo, score, respostas, comentario };
    // Enfileira no aparelho e mostra "Obrigado" IMEDIATAMENTE · o upload roda em
    // segundo plano (com re-tentativa). Nunca perde a resposta no pico.
    const fila = lerFila();
    fila.push({ _id: (globalThis.crypto?.randomUUID?.() || (String(Date.now()) + Math.random())), payload, ts: Date.now() });
    salvarFila(fila);
    setEnviado(true);
    subirFila();
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, padding: '40px 20px', position: 'relative', overflow: 'hidden' }}>
      <AnimatedBackground />
      <PublicThemeToggle />
      <div style={{ maxWidth: 640, margin: '0 auto', position: 'relative', zIndex: 1 }}>
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
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: -0.5, background: 'linear-gradient(90deg, #00B39D, #00d9bd)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>{pesquisa.titulo}</h1>
            </div>
            {pesquisa.perguntas?.descricao_curta && (
              <p style={{ margin: '0 0 20px', fontSize: 13, color: C.t2, lineHeight: 1.5 }}>{pesquisa.perguntas.descricao_curta}</p>
            )}

            <NpsForm
              pesquisa={pesquisa}
              onSubmit={enviar}
              enviando={enviando}
              extraHeader={
                <div style={{ paddingBottom: 16, borderBottom: `1px dashed ${C.border}` }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: C.text, cursor: 'pointer', marginBottom: anonimo ? 0 : 12 }}>
                    <input type="checkbox" checked={anonimo} onChange={e => setAnonimo(e.target.checked)} style={{ accentColor: C.cyan, width: 16, height: 16 }} />
                    Responder como anônimo (não pede nome nem e-mail)
                  </label>
                  {!anonimo && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.t2, marginBottom: 6 }}>Seu nome *</label>
                        <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Como prefere ser chamado" style={inp} />
                      </div>
                      <div>
                        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.t2, marginBottom: 6 }}>Seu e-mail *</label>
                        <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@exemplo.com" style={inp} />
                      </div>
                    </div>
                  )}
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
