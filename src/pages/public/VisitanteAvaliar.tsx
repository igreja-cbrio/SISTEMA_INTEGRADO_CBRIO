// Página PÚBLICA standalone · a PESQUISA DE SATISFAÇÃO do visitante.
// Chega pelo link assinado que vai no WhatsApp depois do culto
// (`/visitante/avaliar/<token>` · services/visitantePesquisa.js). Uma nota de
// 1 a 5 e, se quiser, um comentário. Vale UMA vez por visita.
//
// ⚠️ O token identifica a VISITA (namespace próprio, HMAC) — a resposta sabe
// quem respondeu sem pedir nada. A tela mostra só o 1º nome e o culto.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { visitantePublico } from '../../api';
import AnimatedBackground from './AnimatedBackground';
import { usePublicTheme, PublicThemeToggle } from './publicTheme';

type Dados = {
  ok: boolean; nome: string;
  culto: { nome: string; data: string } | null;
  ja_respondida: boolean; nota: number | null;
};

const NOTAS = [
  { v: 1, e: '😞', l: 'Ruim' },
  { v: 2, e: '😕', l: 'Fraco' },
  { v: 3, e: '😐', l: 'Ok' },
  { v: 4, e: '🙂', l: 'Bom' },
  { v: 5, e: '🤩', l: 'Excelente' },
];

export default function VisitanteAvaliar() {
  const { token } = useParams<{ token: string }>();
  const { C } = usePublicTheme();
  const [dados, setDados] = useState<Dados | null>(null);
  const [erroCarga, setErroCarga] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [nota, setNota] = useState<number | null>(null);
  const [comentario, setComentario] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    document.title = 'Como foi sua visita? · CBRio';
    if (!token) { setErroCarga('Link inválido.'); setCarregando(false); return; }
    visitantePublico.avaliacao(token)
      .then((r: Dados) => { setDados(r); if (r.ja_respondida) setPronto(true); })
      .catch((e: any) => setErroCarga(e?.message || 'Link inválido.'))
      .finally(() => setCarregando(false));
  }, [token]);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    setErro('');
    if (!nota) return setErro('Escolha uma nota de 1 a 5.');
    setEnviando(true);
    try {
      await visitantePublico.avaliar(token!, { nota, comentario: comentario.trim() || undefined });
      setPronto(true);
    } catch (err: any) {
      setErro(err?.message || 'Não foi possível enviar agora. Tente novamente.');
    } finally {
      setEnviando(false);
    }
  }

  const pagina: React.CSSProperties = {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    position: 'relative', overflow: 'hidden', padding: '40px 16px', background: C.pageBg,
  };
  const cartao: React.CSSProperties = {
    position: 'relative', zIndex: 1, width: '100%', maxWidth: 480,
    background: C.card, backdropFilter: 'blur(24px)',
    border: `1px solid ${C.cardBorder}`, borderRadius: 20,
    padding: 'clamp(28px, 6vw, 40px) clamp(18px, 5vw, 36px)', textAlign: 'center',
  };
  const titulo: React.CSSProperties = {
    fontSize: 24, fontWeight: 800, margin: '10px 0 8px', letterSpacing: -0.5,
    background: 'linear-gradient(90deg, #00B39D, #00d9bd)',
    WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
  };

  if (carregando) {
    return (
      <div style={pagina}><AnimatedBackground />
        <p style={{ position: 'relative', zIndex: 1, fontSize: 16, color: C.text3 }}>Carregando…</p>
      </div>
    );
  }

  if (erroCarga || !dados) {
    return (
      <div style={pagina}><AnimatedBackground /><PublicThemeToggle />
        <div style={cartao}>
          <div style={{ fontSize: 44 }}>🔗</div>
          <h1 style={titulo}>Este link não está mais válido</h1>
          <p style={{ fontSize: 14, color: C.text3, lineHeight: 1.6 }}>
            Se você quiser nos contar como foi sua visita, é só responder a mensagem no WhatsApp.
          </p>
        </div>
      </div>
    );
  }

  if (pronto) {
    return (
      <div style={pagina}><AnimatedBackground /><PublicThemeToggle />
        <div style={cartao}>
          <div style={{ fontSize: 52 }}>💚</div>
          <h1 style={titulo}>Obrigado, {dados.nome}!</h1>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--cbrio-text)' }}>
            Sua resposta chegou. Ela ajuda a gente a receber melhor quem chega pela primeira vez.
            Esperamos te ver de novo em breve!
          </p>
          <p style={{ fontSize: 12, color: C.text3, marginTop: 16 }}>Comunidade Batista do Rio · cbrio.com.br</p>
        </div>
      </div>
    );
  }

  return (
    <div style={pagina}><AnimatedBackground /><PublicThemeToggle />
      <div style={cartao}>
        <img src="/logo-cbrio-icon.png" alt="CBRio" style={{ width: 64, height: 64, display: 'inline-block' }} />
        <h1 style={titulo}>{dados.nome}, como foi sua visita?</h1>
        <p style={{ fontSize: 13.5, color: C.text3, lineHeight: 1.6 }}>
          {dados.culto ? <>Sobre o <strong>{dados.culto.nome}</strong> de {String(dados.culto.data || '').split('-').reverse().join('/')}. </> : null}
          Leva 10 segundos — e nos ajuda de verdade.
        </p>

        <form onSubmit={enviar}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, margin: '22px 0 6px' }}>
            {NOTAS.map((n) => {
              const ativo = nota === n.v;
              return (
                <button key={n.v} type="button" onClick={() => setNota(n.v)}
                  aria-pressed={ativo} aria-label={`${n.v} · ${n.l}`}
                  style={{
                    padding: '12px 4px 10px', borderRadius: 14, cursor: 'pointer',
                    background: ativo ? 'rgba(0,179,157,0.16)' : 'transparent',
                    border: `2px solid ${ativo ? '#00B39D' : C.inputBorder}`,
                    transition: 'all .15s', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  }}>
                  <span style={{ fontSize: 28, lineHeight: 1 }}>{n.e}</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: ativo ? '#00B39D' : 'var(--cbrio-text)' }}>{n.v}</span>
                  <span style={{ fontSize: 10, color: C.text3 }}>{n.l}</span>
                </button>
              );
            })}
          </div>

          <textarea
            value={comentario} onChange={(e) => setComentario(e.target.value.slice(0, 1000))}
            placeholder="Quer contar algo? (opcional)"
            rows={3}
            style={{
              width: '100%', marginTop: 16, padding: '12px 14px', fontSize: 15, borderRadius: 12,
              color: 'var(--cbrio-text)', background: 'transparent', resize: 'vertical',
              border: `1px solid ${C.inputBorder}`, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
            }}
          />

          {erro && <p style={{ color: '#ef4444', fontSize: 14, marginTop: 12 }}>{erro}</p>}
          <button type="submit" disabled={enviando} style={{
            width: '100%', padding: '15px 16px', fontSize: 17, fontWeight: 700, marginTop: 16,
            color: '#fff', background: '#00B39D', border: 'none', borderRadius: 12,
            cursor: enviando ? 'wait' : 'pointer', opacity: enviando ? 0.7 : 1,
          }}>
            {enviando ? 'Enviando…' : 'Enviar'}
          </button>
        </form>
        <p style={{ fontSize: 12, color: C.text3, marginTop: 22 }}>Comunidade Batista do Rio · cbrio.com.br</p>
      </div>
    </div>
  );
}
