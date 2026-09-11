// Página PÚBLICA standalone · a PESQUISA DE SATISFAÇÃO do visitante.
// Chega pelo LINK assinado que vai no WhatsApp depois do culto
// (`/visitante/avaliar/<token>` · services/visitantePesquisa.js).
//
// ⚠️⚠️ DESENHO (decisão do Marcos, 11/09/2026): CINCO CARINHAS, de muito feliz
// a muito triste, SEM legenda e SEM número — e **um toque na carinha JÁ ENVIA**.
// O comentário vem DEPOIS, opcional, na tela de agradecimento. O motivo é
// atrito: a nota é o dado que precisamos, e pedir "escolha e depois confirme"
// perde gente no segundo passo. NÃO voltar a exigir botão de enviar pra nota.
// ⚠️ "Sem legenda" é só no VISUAL — cada botão tem `aria-label`, senão a tela
// fica inutilizável em leitor de tela.
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
  ja_respondida: boolean; nota: number | null; tem_comentario?: boolean;
};

// Da MAIS FELIZ para a MAIS TRISTE (ordem pedida pelo Marcos). O rótulo NÃO
// aparece na tela — existe só pro leitor de tela.
const CARINHAS = [
  { v: 5, e: '\u{1F929}', l: 'Muito feliz' },
  { v: 4, e: '\u{1F642}', l: 'Feliz' },
  { v: 3, e: '\u{1F610}', l: 'Indiferente' },
  { v: 2, e: '\u{1F641}', l: 'Triste' },
  { v: 1, e: '\u{1F61E}', l: 'Muito triste' },
];

export default function VisitanteAvaliar() {
  const { token } = useParams<{ token: string }>();
  const { C } = usePublicTheme();
  const [dados, setDados] = useState<Dados | null>(null);
  const [erroCarga, setErroCarga] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [notaEnviada, setNotaEnviada] = useState<number | null>(null);
  const [enviando, setEnviando] = useState<number | null>(null);
  const [erro, setErro] = useState('');
  const [pronto, setPronto] = useState(false);
  const [comentario, setComentario] = useState('');
  const [comentarioEnviado, setComentarioEnviado] = useState(false);
  const [enviandoComentario, setEnviandoComentario] = useState(false);
  const [comentarioJaExiste, setComentarioJaExiste] = useState(false);

  useEffect(() => {
    document.title = 'Como foi sua visita? · CBRio';
    if (!token) { setErroCarga('Link inválido.'); setCarregando(false); return; }
    visitantePublico.avaliacao(token)
      .then((r: Dados) => {
        setDados(r);
        if (r.ja_respondida) { setPronto(true); setNotaEnviada(r.nota); setComentarioJaExiste(!!r.tem_comentario); }
      })
      .catch((e: any) => setErroCarga(e?.message || 'Link inválido.'))
      .finally(() => setCarregando(false));
  }, [token]);

  // UM TOQUE = resposta registrada.
  async function escolher(nota: number) {
    if (enviando !== null || pronto) return;
    setErro(''); setEnviando(nota);
    try {
      await visitantePublico.avaliar(token!, { nota });
      setNotaEnviada(nota);
      setPronto(true);
    } catch (err: any) {
      setErro(err?.message || 'Não foi possível enviar agora. Toque de novo.');
    } finally {
      setEnviando(null);
    }
  }

  async function enviarComentario(e: React.FormEvent) {
    e.preventDefault();
    const txt = comentario.trim();
    if (!txt) return;
    setEnviandoComentario(true); setErro('');
    try {
      await visitantePublico.avaliar(token!, { comentario: txt });
      setComentarioEnviado(true);
    } catch (err: any) {
      setErro(err?.message || 'Não foi possível enviar o comentário.');
    } finally {
      setEnviandoComentario(false);
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
          <div style={{ fontSize: 44 }}>{'\u{1F517}'}</div>
          <h1 style={titulo}>Este link não está mais válido</h1>
          <p style={{ fontSize: 14, color: C.text3, lineHeight: 1.6 }}>
            Se você quiser nos contar como foi sua visita, é só responder a mensagem no WhatsApp.
          </p>
        </div>
      </div>
    );
  }

  if (pronto) {
    const carinha = CARINHAS.find((c) => c.v === notaEnviada);
    return (
      <div style={pagina}><AnimatedBackground /><PublicThemeToggle />
        <div style={cartao}>
          <div style={{ fontSize: 52 }}>{carinha ? carinha.e : '\u{1F49A}'}</div>
          <h1 style={titulo}>Obrigado, {dados.nome}!</h1>
          <p style={{ fontSize: 15, lineHeight: 1.6, color: 'var(--cbrio-text)' }}>
            Sua resposta chegou. Ela ajuda a gente a receber melhor quem chega pela primeira vez.
          </p>

          {!comentarioJaExiste && !comentarioEnviado ? (
            <form onSubmit={enviarComentario} style={{ marginTop: 20 }}>
              <textarea
                value={comentario} onChange={(e) => setComentario(e.target.value.slice(0, 1000))}
                placeholder="Quer contar algo? (opcional)"
                rows={3}
                style={{
                  width: '100%', padding: '12px 14px', fontSize: 15, borderRadius: 12,
                  color: 'var(--cbrio-text)', background: 'transparent', resize: 'vertical',
                  border: `1px solid ${C.inputBorder}`, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
                }}
              />
              {comentario.trim() ? (
                <button type="submit" disabled={enviandoComentario} style={{
                  width: '100%', padding: '13px 16px', fontSize: 16, fontWeight: 700, marginTop: 10,
                  color: '#fff', background: '#00B39D', border: 'none', borderRadius: 12,
                  cursor: enviandoComentario ? 'wait' : 'pointer', opacity: enviandoComentario ? 0.7 : 1,
                }}>
                  {enviandoComentario ? 'Enviando…' : 'Enviar comentário'}
                </button>
              ) : null}
            </form>
          ) : null}
          {comentarioEnviado ? (
            <p style={{ fontSize: 14, color: '#00B39D', marginTop: 16, fontWeight: 600 }}>
              {'Comentário recebido \u{1F49A}'}
            </p>
          ) : null}
          {erro ? <p style={{ color: '#ef4444', fontSize: 14, marginTop: 12 }}>{erro}</p> : null}

          <p style={{ fontSize: 12, color: C.text3, marginTop: 22 }}>Comunidade Batista do Rio · cbrio.com.br</p>
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
          É só tocar numa carinha.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, margin: '26px 0 4px' }}>
          {CARINHAS.map((c) => (
            <button key={c.v} type="button" onClick={() => escolher(c.v)}
              disabled={enviando !== null} aria-label={c.l}
              style={{
                padding: '14px 2px', borderRadius: 16, cursor: enviando !== null ? 'wait' : 'pointer',
                background: 'transparent', border: `2px solid ${C.inputBorder}`,
                transition: 'transform .12s, border-color .12s, background .12s',
                opacity: enviando !== null && enviando !== c.v ? 0.4 : 1,
                transform: enviando === c.v ? 'scale(1.12)' : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              <span style={{ fontSize: 'clamp(28px, 8vw, 36px)', lineHeight: 1 }}>{c.e}</span>
            </button>
          ))}
        </div>

        {erro ? <p style={{ color: '#ef4444', fontSize: 14, marginTop: 14 }}>{erro}</p> : null}
        <p style={{ fontSize: 12, color: C.text3, marginTop: 24 }}>Comunidade Batista do Rio · cbrio.com.br</p>
      </div>
    </div>
  );
}
