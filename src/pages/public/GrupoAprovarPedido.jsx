// ============================================================================
// /g/a/:token — o LÍDER aprova/recusa um pedido de inscrição no grupo dele
// direto do link recebido no WhatsApp, SEM login.
//
// O token (HMAC assinado no backend, expira em 7 dias) é a credencial: dá
// acesso a UM pedido específico. Fora do prazo ou inválido → orienta a
// decidir pelo sistema em /grupos (fluxo logado continua valendo sempre).
// Mobile-first: o líder abre isso no celular.
// ============================================================================

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { gruposPublic } from '../../api';
import AnimatedBackground from './AnimatedBackground';
import { usePublicTheme, PublicThemeToggle } from './publicTheme';
import { Check, X, User, Phone, Mail, MapPin, Clock, Users, CheckCircle2, AlertTriangle } from 'lucide-react';

const VERDE = '#00B39D';
const VERMELHO = '#ef4444';
const AMBAR = '#f59e0b';

export default function GrupoAprovarPedido() {
  const { token } = useParams();
  const { C } = usePublicTheme();
  const [estado, setEstado] = useState('carregando'); // carregando | erro | pronto | enviando | decidido
  const [erroMsg, setErroMsg] = useState('');
  const [dados, setDados] = useState(null);
  const [decisao, setDecisao] = useState(null); // 'aprovado' | 'rejeitado'
  const [recusando, setRecusando] = useState(false);
  const [motivo, setMotivo] = useState('');

  useEffect(() => {
    if (!token) { setEstado('erro'); setErroMsg('Link inválido.'); return; }
    let vivo = true;
    gruposPublic.pedidoPorToken(token)
      .then((d) => {
        if (!vivo) return;
        setDados(d);
        if (d.pedido.status !== 'pendente') {
          setDecisao(d.pedido.status);
          setEstado('decidido');
        } else {
          setEstado('pronto');
        }
      })
      .catch((e) => {
        if (!vivo) return;
        setEstado('erro');
        setErroMsg(e?.message || 'Não foi possível abrir o pedido.');
      });
    return () => { vivo = false; };
  }, [token]);

  const decidir = async (acao) => {
    setEstado('enviando');
    try {
      const r = await gruposPublic.aprovarPorToken(token, acao, acao === 'rejeitar' ? motivo.trim() || null : null);
      setDecisao(r.acao);
      setEstado('decidido');
    } catch (e) {
      setEstado('pronto');
      setErroMsg(e?.message || 'Erro ao registrar a decisão. Tente de novo.');
    }
  };

  const pedido = dados?.pedido;
  const grupo = dados?.grupo;
  const lotado = grupo?.capacidade != null && grupo?.membros_ativos != null && grupo.membros_ativos >= grupo.capacidade;

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden', padding: '32px 14px', background: C.pageBg,
    }}>
      <AnimatedBackground />
      <PublicThemeToggle />

      <div style={{
        position: 'relative', zIndex: 1, width: '100%', maxWidth: 520,
        background: C.card, backdropFilter: 'blur(24px)',
        border: `1px solid ${C.cardBorder}`, borderRadius: 20,
        padding: 'clamp(22px, 5vw, 34px) clamp(18px, 5vw, 30px)',
      }}>
        {estado === 'carregando' && (
          <p style={{ color: C.text3, textAlign: 'center', margin: '30px 0' }}>Carregando pedido...</p>
        )}

        {estado === 'erro' && (
          <div style={{ textAlign: 'center', padding: '18px 0' }}>
            <AlertTriangle size={40} color={AMBAR} style={{ marginBottom: 12 }} />
            <h1 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: '0 0 8px' }}>Não deu para abrir este link</h1>
            <p style={{ fontSize: 14, color: C.text3, margin: 0, lineHeight: 1.5 }}>{erroMsg}</p>
            <p style={{ fontSize: 13, color: C.textDim, marginTop: 14 }}>
              Você ainda pode decidir pelo sistema: entre em <strong>cbrio.org</strong> e abra <strong>Grupos → Pedidos</strong>.
            </p>
          </div>
        )}

        {estado === 'decidido' && (
          <div style={{ textAlign: 'center', padding: '18px 0' }}>
            <CheckCircle2 size={44} color={decisao === 'aprovado' ? VERDE : C.text3} style={{ marginBottom: 12 }} />
            <h1 style={{ fontSize: 19, fontWeight: 700, color: C.text, margin: '0 0 8px' }}>
              {decisao === 'aprovado' ? 'Pedido aprovado!' : decisao === 'rejeitado' ? 'Pedido recusado' : `Pedido ${decisao}`}
            </h1>
            {pedido && (
              <p style={{ fontSize: 14, color: C.text3, margin: 0, lineHeight: 1.5 }}>
                {decisao === 'aprovado'
                  ? <><strong>{pedido.nome}</strong> agora faz parte do grupo {grupo?.nome}. A pessoa foi avisada — vale mandar um "bem-vindo(a)" pessoal também.</>
                  : <>O pedido de <strong>{pedido.nome}</strong> para o grupo {grupo?.nome} não foi aceito.</>}
              </p>
            )}
          </div>
        )}

        {(estado === 'pronto' || estado === 'enviando') && pedido && (
          <>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: VERDE, margin: '0 0 6px' }}>
              Pedido de inscrição · {grupo?.nome}
            </p>
            <h1 style={{ fontSize: 'clamp(20px, 5vw, 24px)', fontWeight: 800, color: C.text, margin: '0 0 16px' }}>
              {pedido.nome} quer entrar no seu grupo
            </h1>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16, fontSize: 14, color: C.text2 }}>
              {pedido.telefone && <span><Phone size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />{pedido.telefone}</span>}
              {pedido.email && <span><Mail size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />{pedido.email}</span>}
              {pedido.observacao && (
                <span style={{ fontStyle: 'italic', color: C.text3 }}>"{pedido.observacao}"</span>
              )}
            </div>

            <div style={{
              border: `1px solid ${C.cardBorder}`, borderRadius: 12, padding: '12px 14px',
              marginBottom: lotado ? 10 : 20, fontSize: 13, color: C.text3, display: 'flex', flexDirection: 'column', gap: 5,
            }}>
              <span style={{ fontWeight: 700, color: C.text2 }}><Users size={13} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />{grupo?.nome}{grupo?.codigo ? ` · ${grupo.codigo}` : ''}</span>
              {grupo?.quando && grupo.quando !== 'a combinar' && <span><Clock size={13} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />{grupo.quando}</span>}
              {grupo?.onde && grupo.onde !== 'a combinar' && <span><MapPin size={13} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />{grupo.onde}</span>}
              {grupo?.capacidade != null && grupo?.membros_ativos != null && (
                <span style={{ color: lotado ? AMBAR : C.text3, fontWeight: lotado ? 700 : 400 }}>
                  <User size={13} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />
                  {grupo.membros_ativos}/{grupo.capacidade} pessoas{lotado ? ' · no limite' : ''}
                </span>
              )}
            </div>

            {lotado && (
              <p style={{ fontSize: 12.5, color: AMBAR, margin: '0 0 16px', lineHeight: 1.5 }}>
                Seu grupo está no limite de capacidade — mas a decisão é sua: a capacidade é um conselho, não uma trava.
              </p>
            )}

            {erroMsg && <p style={{ fontSize: 13, color: VERMELHO, marginBottom: 12 }}>{erroMsg}</p>}

            {!recusando ? (
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => { setErroMsg(''); setRecusando(true); }}
                  disabled={estado === 'enviando'}
                  style={{
                    flex: 1, padding: '13px 10px', borderRadius: 12, fontSize: 15, fontWeight: 600,
                    border: `1px solid ${C.inputBorder}`, background: 'transparent', color: C.text2, cursor: 'pointer',
                  }}
                >
                  <X size={16} style={{ display: 'inline', marginRight: 6, verticalAlign: -3 }} />Recusar
                </button>
                <button
                  onClick={() => { setErroMsg(''); decidir('aprovar'); }}
                  disabled={estado === 'enviando'}
                  style={{
                    flex: 2, padding: '13px 10px', borderRadius: 12, fontSize: 15, fontWeight: 700,
                    border: 'none', background: VERDE, color: '#fff', cursor: 'pointer',
                    opacity: estado === 'enviando' ? 0.6 : 1,
                  }}
                >
                  <Check size={16} style={{ display: 'inline', marginRight: 6, verticalAlign: -3 }} />
                  {estado === 'enviando' ? 'Aprovando...' : 'Aprovar entrada'}
                </button>
              </div>
            ) : (
              <div>
                <input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Motivo (opcional — a pessoa pode ver)"
                  autoFocus
                  style={{
                    width: '100%', boxSizing: 'border-box', padding: '12px 14px', borderRadius: 12,
                    border: `1px solid ${C.inputBorder}`, background: C.optionBg, color: C.text,
                    fontSize: 14, marginBottom: 10, outline: 'none',
                  }}
                />
                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={() => { setRecusando(false); setMotivo(''); }}
                    disabled={estado === 'enviando'}
                    style={{
                      flex: 1, padding: '12px 10px', borderRadius: 12, fontSize: 14, fontWeight: 600,
                      border: `1px solid ${C.inputBorder}`, background: 'transparent', color: C.text2, cursor: 'pointer',
                    }}
                  >
                    Voltar
                  </button>
                  <button
                    onClick={() => decidir('rejeitar')}
                    disabled={estado === 'enviando'}
                    style={{
                      flex: 2, padding: '12px 10px', borderRadius: 12, fontSize: 14, fontWeight: 700,
                      border: 'none', background: VERMELHO, color: '#fff', cursor: 'pointer',
                      opacity: estado === 'enviando' ? 0.6 : 1,
                    }}
                  >
                    {estado === 'enviando' ? 'Enviando...' : 'Confirmar recusa'}
                  </button>
                </div>
              </div>
            )}

            <p style={{ fontSize: 11.5, color: C.textDim, marginTop: 16, lineHeight: 1.5 }}>
              Este link é pessoal e expira em 7 dias. Você também pode decidir pelo sistema em Grupos → Pedidos.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
