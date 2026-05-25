// ============================================================================
// Totem Kids · Display TV da sala
// ============================================================================
// Roda no Fire TV / Pi / Smart TV / Notebook ligado na TV da sala.
//
// URL: /ministerial/totem-kids/display-sala?sala=X&token=Y
//   - Sem login (validado via token da estacao)
//   - Pareamento via QR · token salvo no localStorage do device (Fire TV)
//   - Fullscreen automatico ao primeiro click
//
// Polling a cada 2s · quando chega chamada nova: sino + TTS + render grande.
// ============================================================================

import { useEffect, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

const POLL_INTERVAL_MS = 2000;
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '') || '/api';

type Chamada = {
  chamada_id: string;
  crianca_id: string;
  crianca_nome: string;
  observacoes_medicas: string | null;
  codigo_seguranca: string;
  responsavel_nome_snapshot: string | null;
  chamada_em: string;
  re_chamadas: number;
  ultima_rechamada_em: string | null;
  segundos_esperando: number;
};

type EstacaoInfo = {
  id: string;
  nome: string;
  tipo: string;
  sala_id: string | null;
  sala_nome: string | null;
  sala_cor: string | null;
};

export default function TotemKidsDisplaySala() {
  const [params] = useSearchParams();
  const token = params.get('token') || localStorage.getItem('totem_kids_display_token');

  const [estado, setEstado] = useState<'verificando' | 'ok' | 'erro' | 'sem-token'>('verificando');
  const [estacao, setEstacao] = useState<EstacaoInfo | null>(null);
  const [erro, setErro] = useState<string>('');
  const [chamadas, setChamadas] = useState<Chamada[]>([]);
  const [agora, setAgora] = useState(new Date());

  const idsConhecidosRef = useRef<Set<string>>(new Set());
  const ultimoRechamadaPorIdRef = useRef<Map<string, string | null>>(new Map());

  // Persiste token
  useEffect(() => {
    if (token) localStorage.setItem('totem_kids_display_token', token);
  }, [token]);

  // Relógio
  useEffect(() => {
    const i = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(i);
  }, []);

  // Boot · valida token e carrega info da estação
  useEffect(() => {
    if (!token) {
      setEstado('sem-token');
      return;
    }
    fetch(`${API_BASE}/totem-kids/display/info?token=${encodeURIComponent(token)}`)
      .then(r => r.ok ? r.json() : Promise.reject(r.statusText))
      .then((data: EstacaoInfo) => {
        if (data.tipo !== 'display') {
          throw new Error(`Esta estação é ${data.tipo}, não display de sala. Use /display-foyer.`);
        }
        if (!data.sala_id) {
          throw new Error('Estação display sem sala vinculada · admin precisa vincular');
        }
        setEstacao(data);
        setEstado('ok');
      })
      .catch(err => {
        setErro(String(err));
        setEstado('erro');
      });
  }, [token]);

  // Polling de chamadas
  useEffect(() => {
    if (estado !== 'ok' || !token) return;
    let mounted = true;
    let timeout: ReturnType<typeof setTimeout>;

    async function poll() {
      try {
        const res = await fetch(`${API_BASE}/totem-kids/display/chamadas-ativas?token=${encodeURIComponent(token)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!mounted) return;
        const novas: Chamada[] = data.chamadas || [];

        // Detecta chamadas novas pra tocar som + TTS
        const conhecidos = idsConhecidosRef.current;
        const ultimosRechamada = ultimoRechamadaPorIdRef.current;
        for (const c of novas) {
          const novo = !conhecidos.has(c.chamada_id);
          const rechamada = !novo && ultimosRechamada.get(c.chamada_id) !== c.ultima_rechamada_em;
          if (novo || rechamada) {
            tocarSino();
            falarTTS(`${c.crianca_nome}, sua família chegou`);
          }
          conhecidos.add(c.chamada_id);
          ultimosRechamada.set(c.chamada_id, c.ultima_rechamada_em);
        }
        // Remove ids que não estão mais ativos
        for (const id of [...conhecidos]) {
          if (!novas.find(c => c.chamada_id === id)) {
            conhecidos.delete(id);
            ultimosRechamada.delete(id);
          }
        }

        setChamadas(novas);
      } catch (e) {
        console.warn('[display] poll falhou:', e);
      }
      timeout = setTimeout(poll, POLL_INTERVAL_MS);
    }

    poll();
    return () => { mounted = false; clearTimeout(timeout); };
  }, [estado, token]);

  // Fullscreen no primeiro click
  function tryFullscreen() {
    if (document.fullscreenElement) return;
    document.documentElement.requestFullscreen?.().catch(() => {});
  }

  if (estado === 'verificando') {
    return <div style={fullScreenStyle('#111')}>
      <div style={{ color: '#fff', fontSize: 28 }}>Conectando ao Totem Kids...</div>
    </div>;
  }

  if (estado === 'sem-token') {
    return <div style={fullScreenStyle('#111')}>
      <div style={{ color: '#fff', fontSize: 24, padding: 40, textAlign: 'center' }}>
        Display não pareado.<br/><br/>
        Peça ao admin pra gerar o QR de pareamento da sala em
        <br/><code style={{ background: '#333', padding: '4px 8px', borderRadius: 4 }}>/configuracoes → Estações</code>
      </div>
    </div>;
  }

  if (estado === 'erro') {
    return <div style={fullScreenStyle('#400')}>
      <div style={{ color: '#fff', fontSize: 28, padding: 40, textAlign: 'center' }}>
        ⚠ {erro}
      </div>
    </div>;
  }

  const cor = estacao?.sala_cor || '#EC4899';
  const principal = chamadas[0]; // chamada mais antiga em destaque

  return (
    <div
      onClick={tryFullscreen}
      style={{
        ...fullScreenStyle('#0a0a0a'),
        cursor: 'pointer',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {/* Header */}
      <div style={{
        padding: '20px 40px',
        background: cor,
        color: '#fff',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 28,
        fontWeight: 700,
      }}>
        <div>🏫 {estacao?.sala_nome}</div>
        <div style={{ fontSize: 24, fontWeight: 500, opacity: 0.95 }}>
          {agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      {/* Conteúdo */}
      {chamadas.length === 0 ? (
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          color: '#666', fontSize: 36,
        }}>
          <div style={{ fontSize: 80, marginBottom: 20 }}>🧒</div>
          <div>Aguardando chamadas</div>
          <div style={{ fontSize: 18, marginTop: 12, opacity: 0.6 }}>(toque na tela pra entrar em fullscreen)</div>
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 30, gap: 20 }}>
          {/* Chamada principal · grande */}
          {principal && (
            <div style={{
              background: cor,
              color: '#fff',
              padding: 30,
              borderRadius: 16,
              boxShadow: '0 0 60px rgba(255,255,255,0.1)',
              animation: principal.re_chamadas > 0 ? 'pulse 1s ease-in-out infinite' : 'none',
            }}>
              <div style={{ fontSize: 28, fontWeight: 500, opacity: 0.95, marginBottom: 8 }}>
                🔔 CHAMADA · {principal.codigo_seguranca}
                {principal.re_chamadas > 0 && (
                  <span style={{ marginLeft: 16, background: 'rgba(255,255,255,0.3)', padding: '4px 12px', borderRadius: 6, fontSize: 22 }}>
                    + {principal.re_chamadas}× chamado
                  </span>
                )}
              </div>
              <div style={{ fontSize: 72, fontWeight: 900, lineHeight: 1.05, marginBottom: 12, wordBreak: 'break-word' }}>
                {principal.crianca_nome}
              </div>
              <div style={{ fontSize: 28, opacity: 0.95 }}>
                {principal.responsavel_nome_snapshot && <>Resp: <b>{principal.responsavel_nome_snapshot}</b></>}
                {' · '}
                aguardando {Math.floor(principal.segundos_esperando / 60)}min{principal.segundos_esperando % 60 > 30 ? '+' : ''}
              </div>
              {principal.observacoes_medicas && (
                <div style={{
                  marginTop: 16, background: '#000', color: '#fff', padding: '8px 16px',
                  borderRadius: 6, fontWeight: 700, fontSize: 22,
                  display: 'inline-block',
                }}>
                  ⚠ {principal.observacoes_medicas}
                </div>
              )}
            </div>
          )}

          {/* Fila · próximas chamadas */}
          {chamadas.length > 1 && (
            <div style={{ background: '#1a1a1a', borderRadius: 12, padding: 20 }}>
              <div style={{ color: '#888', fontSize: 20, marginBottom: 12 }}>
                Próximas ({chamadas.length - 1})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {chamadas.slice(1).map(c => (
                  <div key={c.chamada_id} style={{
                    color: '#fff', fontSize: 24, display: 'flex', justifyContent: 'space-between',
                    padding: '8px 12px', background: '#222', borderRadius: 8,
                  }}>
                    <div>
                      <span style={{ fontFamily: 'monospace', fontWeight: 700, marginRight: 12 }}>{c.codigo_seguranca}</span>
                      {c.crianca_nome}
                    </div>
                    <div style={{ color: c.segundos_esperando > 180 ? '#f87171' : '#999' }}>
                      {Math.floor(c.segundos_esperando / 60)}min
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.02); } }`}</style>
    </div>
  );
}

function fullScreenStyle(bg: string): React.CSSProperties {
  return {
    position: 'fixed',
    inset: 0,
    background: bg,
    display: 'flex',
    flexDirection: 'column',
    fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, sans-serif',
  };
}

function tocarSino() {
  try {
    const audio = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAESsAAABAAgAZGF0YQAAAAA=');
    // Bipe sintético simples · 880Hz por 200ms (não bloqueia)
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    osc.type = 'sine';
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
    void audio; // satisfaz TS
  } catch (e) {
    console.warn('[display] sino falhou:', e);
  }
}

function falarTTS(texto: string) {
  try {
    if (!('speechSynthesis' in window)) return;
    const utter = new SpeechSynthesisUtterance(texto);
    utter.lang = 'pt-BR';
    utter.rate = 0.95;
    utter.pitch = 1.0;
    utter.volume = 1.0;
    window.speechSynthesis.cancel(); // cancela qualquer fala anterior
    window.speechSynthesis.speak(utter);
  } catch (e) {
    console.warn('[display] TTS falhou:', e);
  }
}
