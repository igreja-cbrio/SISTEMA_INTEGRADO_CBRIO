// ============================================================================
// FeedbackButton · Onda 0 · loop de feedback do piloto (2026-06-09)
//
// Botão flutuante (canto inferior esquerdo, pra não colidir com o ChatIA) que
// qualquer usuário autenticado usa pra reportar um problema/ideia enquanto
// testa. Captura a rota atual + contexto e manda pro /api/feedback. Estilo
// inline com as CSS vars --cbrio-* (igual ao resto do painel) · sem dep nova.
// ============================================================================
import { useEffect, useRef, useState } from 'react';
import { MessageSquareWarning, X, Bug, HelpCircle, Lightbulb, Send } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { feedback as feedbackApi } from '../api';
import { toast } from 'sonner';
import { useOverlayAberto } from '../hooks/useOverlayAberto';

const TEMPO_DESARME_MS = 4000; // some voltando a minimizado se não confirmar

const TIPOS = [
  { id: 'bug', label: 'Algo quebrou', icon: Bug },
  { id: 'confusao', label: 'Fiquei confuso', icon: HelpCircle },
  { id: 'sugestao', label: 'Tenho uma ideia', icon: Lightbulb },
];

export default function FeedbackButton() {
  const { profile } = useAuth();
  const [open, setOpen] = useState(false);
  const [tipo, setTipo] = useState('bug');
  const [msg, setMsg] = useState('');
  const [enviando, setEnviando] = useState(false);
  const { aberto: overlayAberto, drawerEsquerdo } = useOverlayAberto();
  const [armado, setArmado] = useState(false);
  const desarmeTimer = useRef(null);

  // Desarma sozinho (volta a minimizado) se a pessoa não confirmar o toque,
  // e sempre que o overlay que motivou a minimização fechar.
  useEffect(() => {
    if (!overlayAberto) { setArmado(false); return; }
    if (!armado) return;
    desarmeTimer.current = setTimeout(() => setArmado(false), TEMPO_DESARME_MS);
    return () => clearTimeout(desarmeTimer.current);
  }, [armado, overlayAberto]);

  if (!profile) return null; // só pra quem está logado

  // Drawer lateral: o botão só se REALOCA (fica cheio, 1 toque já funciona —
  // não sobrepõe nada ali). Nos demais overlays (modais/dialogs no meio da
  // tela) ele MINIMIZA e exige confirmar com um 2º toque, pra evitar que a
  // pessoa acerte sem querer algo que apareceu no lugar dele.
  const minimizado = overlayAberto && !drawerEsquerdo && !armado;

  function aoClicarBotao() {
    if (minimizado) { setArmado(true); return; } // 1º toque: só reexpande
    setOpen(true); // realocado, já expandido, ou sem overlay: abre de vez
  }

  async function enviar() {
    if (msg.trim().length < 3) {
      toast.error('Conta um pouquinho do que aconteceu.');
      return;
    }
    setEnviando(true);
    try {
      await feedbackApi.enviar({
        tipo,
        mensagem: msg.trim(),
        rota: window.location.pathname + (window.location.hash || ''),
        severidade: tipo === 'bug' ? 'alta' : 'media',
        contexto: {
          user_agent: navigator.userAgent,
          viewport: `${window.innerWidth}x${window.innerHeight}`,
        },
      });
      toast.success('Recebido! Obrigado por reportar 🙏');
      setMsg('');
      setTipo('bug');
      setOpen(false);
    } catch (e) {
      toast.error(e?.message || 'Não consegui enviar. Tente de novo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <button
        onClick={aoClicarBotao}
        title={minimizado ? 'Toque de novo pra reportar um problema ou ideia' : 'Reportar um problema ou ideia'}
        aria-label="Reportar problema"
        className="floating-action-btn"
        style={{
          position: 'fixed',
          // drawer de navegação (lateral esquerda) aberto → sai da frente,
          // vai pra faixa livre à direita; nos demais overlays só minimiza.
          left: drawerEsquerdo ? 'auto' : 20,
          right: drawerEsquerdo ? 12 : 'auto',
          bottom: 'calc(20px + env(safe-area-inset-bottom, 0px))', zIndex: 1200,
          display: 'flex', alignItems: 'center', gap: minimizado ? 0 : 8,
          padding: minimizado ? 10 : '10px 14px', borderRadius: 999,
          background: '#00B39D', color: 'white', border: 'none',
          boxShadow: '0 4px 16px rgba(0,0,0,0.18)', cursor: 'pointer',
          fontSize: 13, fontWeight: 600,
        }}
      >
        <MessageSquareWarning size={18} />
        {!minimizado && 'Reportar'}
      </button>

      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1300,
            background: 'var(--cbrio-overlay, rgba(0,0,0,0.45))',
            display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-start',
            padding: 20,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%', maxWidth: 420,
              background: 'var(--cbrio-modal-bg, var(--cbrio-card, #fff))',
              color: 'var(--cbrio-text, #111)',
              border: '1px solid var(--cbrio-border, #e5e7eb)',
              borderRadius: 16, padding: 20,
              boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Reportar pro time</h3>
              <button onClick={() => setOpen(false)} aria-label="Fechar"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--cbrio-text3, #888)' }}>
                <X size={18} />
              </button>
            </div>
            <p style={{ marginTop: 0, marginBottom: 12, fontSize: 12, color: 'var(--cbrio-text3, #888)' }}>
              Está testando e achou algo estranho? Conta aqui — vai direto pro time, junto com a página em que você está.
            </p>

            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              {TIPOS.map((t) => {
                const Icon = t.icon;
                const ativo = tipo === t.id;
                return (
                  <button key={t.id} onClick={() => setTipo(t.id)}
                    style={{
                      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                      padding: '10px 6px', borderRadius: 10, cursor: 'pointer',
                      border: `1px solid ${ativo ? '#00B39D' : 'var(--cbrio-border, #e5e7eb)'}`,
                      background: ativo ? '#00B39D18' : 'transparent',
                      color: ativo ? '#00B39D' : 'var(--cbrio-text2, #555)',
                      fontSize: 11, fontWeight: 600, lineHeight: 1.2, textAlign: 'center',
                    }}>
                    <Icon size={18} />
                    {t.label}
                  </button>
                );
              })}
            </div>

            <textarea
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              autoFocus
              rows={4}
              placeholder="O que aconteceu? (ex.: cliquei em salvar e não aconteceu nada)"
              style={{
                width: '100%', resize: 'vertical', padding: 10, borderRadius: 10,
                border: '1px solid var(--cbrio-border, #e5e7eb)',
                background: 'var(--cbrio-input-bg, #fff)', color: 'var(--cbrio-text, #111)',
                fontSize: 13, fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
              <button onClick={() => setOpen(false)}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--cbrio-border, #e5e7eb)', background: 'transparent', color: 'var(--cbrio-text2, #555)', cursor: 'pointer', fontSize: 13 }}>
                Cancelar
              </button>
              <button onClick={enviar} disabled={enviando}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#00B39D', color: 'white', cursor: enviando ? 'not-allowed' : 'pointer', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, opacity: enviando ? 0.7 : 1 }}>
                <Send size={14} /> {enviando ? 'Enviando…' : 'Enviar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
