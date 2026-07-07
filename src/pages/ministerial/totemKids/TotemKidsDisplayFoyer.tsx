// ============================================================================
// Totem Kids · Painel central no foyer
// ============================================================================
// TV no foyer mostra todas as salas em grid · ocupação + chamadas atrasadas.
// URL: /ministerial/totem-kids/display-foyer?token=X
// ============================================================================

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { resolveApiBaseUrl } from '../../../lib/api-base';

const POLL_INTERVAL_MS = 3000;
const API_BASE = resolveApiBaseUrl(import.meta.env.VITE_API_URL);

type Sala = {
  id: string;
  nome: string;
  cor: string;
  capacidade: number;
  presentes: number;
  chamadas_ativas: number;
  max_espera_segundos: number;
};

type Resumo = {
  sessao: { id: string; culto?: { nome: string; data: string } | null } | null;
  salas: Sala[];
};

export default function TotemKidsDisplayFoyer() {
  const [params] = useSearchParams();
  const token = params.get('token') || localStorage.getItem('totem_kids_display_foyer_token');

  const [resumo, setResumo] = useState<Resumo | null>(null);
  const [erro, setErro] = useState<string>('');
  const [agora, setAgora] = useState(new Date());

  useEffect(() => {
    if (token) localStorage.setItem('totem_kids_display_foyer_token', token);
  }, [token]);

  useEffect(() => {
    const i = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(i);
  }, []);

  useEffect(() => {
    if (!token) {
      setErro('Display não pareado · gere QR em /configuracoes → Estações');
      return;
    }
    let mounted = true;
    let timeout: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const res = await fetch(`${API_BASE}/totem-kids/display/foyer-resumo?token=${encodeURIComponent(token)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!mounted) return;
        setResumo(data);
        setErro('');
      } catch (e) {
        if (mounted) setErro(String(e));
      }
      timeout = setTimeout(poll, POLL_INTERVAL_MS);
    }
    poll();
    return () => { mounted = false; clearTimeout(timeout); };
  }, [token]);

  function tryFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
  }

  if (erro) {
    return <div style={fullScreenStyle('#400')}>
      <div style={{ color: '#fff', fontSize: 24, padding: 40, textAlign: 'center' }}>⚠ {erro}</div>
    </div>;
  }
  if (!resumo) {
    return <div style={fullScreenStyle('#111')}>
      <div style={{ color: '#fff', fontSize: 28 }}>Carregando...</div>
    </div>;
  }
  if (!resumo.sessao) {
    return <div style={fullScreenStyle('#111')} onClick={tryFullscreen}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#666' }}>
        <div style={{ fontSize: 80, marginBottom: 20 }}>⛪</div>
        <div style={{ fontSize: 36 }}>Nenhuma sessão Kids ativa</div>
      </div>
    </div>;
  }

  return (
    <div onClick={tryFullscreen} style={{
      ...fullScreenStyle('#0a0a0a'),
      cursor: 'pointer',
      userSelect: 'none',
    }}>
      {/* Header */}
      <div style={{
        padding: '20px 40px',
        background: 'linear-gradient(135deg, #EC4899 0%, #BE185D 100%)',
        color: '#fff',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div>
          <div style={{ fontSize: 32, fontWeight: 800 }}>🏫 CBRio Kids</div>
          <div style={{ fontSize: 20, opacity: 0.95 }}>{resumo.sessao.culto?.nome}</div>
        </div>
        <div style={{ fontSize: 32, fontWeight: 600 }}>
          {agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>

      {/* Grid de salas */}
      <div style={{
        flex: 1, padding: 30, display: 'grid', gap: 20,
        gridTemplateColumns: `repeat(${Math.min(resumo.salas.length, 3)}, 1fr)`,
        gridAutoRows: '1fr',
      }}>
        {resumo.salas.map(s => {
          const ocupacaoPct = s.capacidade ? Math.round((s.presentes / s.capacidade) * 100) : 0;
          const lotada = ocupacaoPct >= 90;
          const atrasada = s.max_espera_segundos > 180; // 3min
          return (
            <div key={s.id} style={{
              background: '#1a1a1a',
              borderRadius: 16,
              padding: 24,
              border: `4px solid ${atrasada ? '#ef4444' : lotada ? '#f59e0b' : s.cor}`,
              animation: atrasada ? 'pulse 1.5s ease-in-out infinite' : 'none',
              display: 'flex',
              flexDirection: 'column',
              color: '#fff',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{ width: 16, height: 16, borderRadius: '50%', background: s.cor }} />
                <div style={{ fontSize: 26, fontWeight: 700, flex: 1 }}>{s.nome}</div>
                {lotada && !atrasada && <span style={{ fontSize: 20 }}>⚠</span>}
              </div>

              <div style={{
                fontSize: 56, fontWeight: 900, lineHeight: 1,
                color: lotada ? '#fbbf24' : '#fff',
              }}>
                {s.presentes}<span style={{ fontSize: 28, color: '#666', fontWeight: 400 }}>/{s.capacidade}</span>
              </div>
              <div style={{ fontSize: 18, color: '#888', marginTop: 4 }}>presentes ({ocupacaoPct}%)</div>

              {/* Barra de ocupação */}
              <div style={{ height: 8, background: '#333', borderRadius: 4, marginTop: 12, overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${Math.min(ocupacaoPct, 100)}%`,
                  background: lotada ? '#f59e0b' : s.cor,
                  transition: 'width 0.3s',
                }} />
              </div>

              {s.chamadas_ativas > 0 && (
                <div style={{
                  marginTop: 'auto', paddingTop: 16,
                  fontSize: 22, fontWeight: 700,
                  color: atrasada ? '#f87171' : '#fbbf24',
                }}>
                  🔔 {s.chamadas_ativas} chamada{s.chamadas_ativas > 1 ? 's' : ''}
                  {atrasada && <span style={{ display: 'block', fontSize: 18, marginTop: 4 }}>
                    ⚠ aguardando {Math.floor(s.max_espera_segundos / 60)}min
                  </span>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`@keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.015); } }`}</style>
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
