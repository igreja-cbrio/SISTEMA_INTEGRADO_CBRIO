// ============================================================================
// /g/a/:token — o LÍDER aprova/recusa um pedido de inscrição no grupo dele
// direto do link recebido no WhatsApp, SEM login.
//
// O token (HMAC assinado no backend, expira em 7 dias) é a credencial: dá
// acesso a UM pedido específico. Fora do prazo ou inválido → orienta a
// decidir pelo sistema em /grupos (fluxo logado continua valendo sempre).
// Mobile-first: o líder abre isso no celular.
//
// Grupo de CASAIS (Marcos · 30/07): quando a inscrição veio em par, o backend
// devolve `casal` (o pedido do cônjuge) e a decisão vale pros DOIS — a tela
// mostra os dois nomes e diz claramente que aprovar/recusar decide o casal.
// ============================================================================

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { gruposPublic } from '../../api';
import AnimatedBackground from './AnimatedBackground';
import { usePublicTheme, PublicThemeToggle } from './publicTheme';
import { Check, X, User, Phone, PhoneOff, Mail, MapPin, Clock, Users, CheckCircle2, AlertTriangle } from 'lucide-react';

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
  const [casalResultado, setCasalResultado] = useState(null); // { nome, ok, status, error } após decidir

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
      setCasalResultado(r.casal || null);
      setEstado('decidido');
    } catch (e) {
      setEstado('pronto');
      setErroMsg(e?.message || 'Erro ao registrar a decisão. Tente de novo.');
    }
  };

  const pedido = dados?.pedido;
  const grupo = dados?.grupo;
  // Inscrição de casal: o cônjuge veio no mesmo formulário e a decisão vale
  // pros dois. Só tratamos como par quando o pedido do cônjuge ainda está
  // pendente — se a triagem já decidiu o dele, esta tela decide só este.
  const casal = dados?.casal || null;
  const casalPendente = Boolean(casal && casal.status === 'pendente');
  const nomesJuntos = casalPendente ? `${pedido?.nome} e ${casal.nome}` : pedido?.nome;
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
              {decisao === 'aprovado' ? 'Pedido aprovado!'
                : decisao === 'encaminhado' ? 'Pedido com a equipe de grupos'
                : decisao === 'cancelado' ? 'Pedido encerrado'
                : decisao === 'sem_contato' ? 'Obrigado por tentar!'
                : 'Pedido recusado'}
            </h1>
            {pedido && (
              <p style={{ fontSize: 14, color: C.text3, margin: 0, lineHeight: 1.5 }}>
                {decisao === 'aprovado'
                  ? <><strong>{casalResultado?.ok ? `${pedido.nome} e ${casalResultado.nome}` : pedido.nome}</strong>{casalResultado?.ok ? ' agora fazem' : ' agora faz'} parte do grupo {grupo?.nome}. {casalResultado?.ok ? 'O casal foi avisado' : 'A pessoa foi avisada'} — vale mandar um "bem-vindo(a)" pessoal também.</>
                  : decisao === 'encaminhado'
                  ? <>A equipe de grupos sugeriu outro grupo para <strong>{pedido.nome}</strong> — não precisa fazer mais nada.</>
                  : decisao === 'cancelado'
                  ? <>O pedido de <strong>{pedido.nome}</strong> foi encerrado.</>
                  : decisao === 'sem_contato'
                  ? <>Registramos que você tentou falar com <strong>{casalResultado?.ok ? `${pedido.nome} e ${casalResultado.nome}` : pedido.nome}</strong> e não conseguiu.
                      Isso <strong>não</strong> foi registrado como recusa — a equipe de grupos assume o contato daqui.</>
                  // rejeitado (agora) ou devolvido (recusa sua aguardando a triagem)
                  : <>O pedido de <strong>{casalResultado?.ok ? `${pedido.nome} e ${casalResultado.nome}` : pedido.nome}</strong> para o grupo {grupo?.nome} não segue.
                      A equipe de grupos foi avisada e cuida do próximo passo com {casalResultado?.ok ? 'o casal' : 'a pessoa'} — não precisa fazer mais nada.</>}
              </p>
            )}
            {/* Honestidade: o cônjuge não entrou junto (a triagem já tinha
                decidido o pedido dele, ou o registro falhou). */}
            {casalResultado && !casalResultado.ok && (
              <p style={{ fontSize: 13, color: AMBAR, margin: '12px 0 0', lineHeight: 1.5 }}>
                A inscrição de <strong>{casalResultado.nome}</strong> não foi decidida junto
                {casalResultado.status && casalResultado.status !== 'pendente' && casalResultado.status !== 'decidido'
                  ? ` (ela já estava como "${casalResultado.status}")` : ''}.
                {casalResultado.error ? ` ${casalResultado.error}` : ' A equipe de grupos resolve pelo sistema.'}
              </p>
            )}
          </div>
        )}

        {(estado === 'pronto' || estado === 'enviando') && pedido && (
          <>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: VERDE, margin: '0 0 6px' }}>
              {casalPendente ? 'Inscrição de casal' : 'Pedido de inscrição'} · {grupo?.nome}
            </p>
            <h1 style={{ fontSize: 'clamp(20px, 5vw, 24px)', fontWeight: 800, color: C.text, margin: '0 0 16px' }}>
              {casalPendente ? `${nomesJuntos} querem entrar no seu grupo` : `${pedido.nome} quer entrar no seu grupo`}
            </h1>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16, fontSize: 14, color: C.text2 }}>
              {casalPendente && <span style={{ fontWeight: 700, color: C.text2 }}>{pedido.nome}</span>}
              {pedido.telefone && <span><Phone size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />{pedido.telefone}</span>}
              {pedido.email && <span><Mail size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />{pedido.email}</span>}
              {casalPendente && (
                <>
                  <span style={{ fontWeight: 700, color: C.text2, marginTop: 4 }}>{casal.nome}</span>
                  {casal.telefone && <span><Phone size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />{casal.telefone}</span>}
                  {casal.email && <span><Mail size={14} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />{casal.email}</span>}
                </>
              )}
              {pedido.observacao && (
                <span style={{ fontStyle: 'italic', color: C.text3 }}>"{pedido.observacao}"</span>
              )}
            </div>

            {casalPendente && (
              <p style={{ fontSize: 12.5, color: C.text3, margin: '-6px 0 16px', lineHeight: 1.5 }}>
                Eles se inscreveram juntos como casal — a sua decisão vale para os dois.
              </p>
            )}
            {casal && !casalPendente && (
              <p style={{ fontSize: 12.5, color: AMBAR, margin: '-6px 0 16px', lineHeight: 1.5 }}>
                A inscrição de <strong>{casal.nome}</strong> (cônjuge) já está como "{casal.status}" — aqui você decide só a de {pedido.nome}.
              </p>
            )}

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
              <>
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
                    {estado === 'enviando' ? 'Aprovando...' : (casalPendente ? 'Aprovar o casal' : 'Aprovar entrada')}
                  </button>
                </div>

                {/* 3ª saída (Naná · 17/08): o fluxo pede que o líder LIGUE antes
                    de decidir, e quando a pessoa não atende nenhuma das duas
                    acima serve — recusar diria "não quero essa pessoa", que não
                    é o caso. Fica em terceiro plano de propósito: é o desfecho
                    menos desejado dos três, não pode competir com "Aprovar". */}
                <button
                  onClick={() => { setErroMsg(''); decidir('sem_contato'); }}
                  disabled={estado === 'enviando'}
                  style={{
                    width: '100%', marginTop: 10, padding: '11px 10px', borderRadius: 12,
                    fontSize: 14, fontWeight: 600, border: `1px dashed ${C.inputBorder}`,
                    background: 'transparent', color: C.text3, cursor: 'pointer',
                    opacity: estado === 'enviando' ? 0.6 : 1,
                  }}
                >
                  <PhoneOff size={15} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />
                  Tentei, mas não consegui contato
                </button>
                <p style={{ fontSize: 11.5, color: C.textDim, margin: '8px 0 0', lineHeight: 1.5 }}>
                  Use quando {casalPendente ? 'eles não responderam' : 'a pessoa não respondeu'} suas
                  tentativas. Isso <strong>não é uma recusa</strong> — a equipe de grupos assume o
                  contato por outro caminho.
                </p>
              </>
            ) : (
              <div>
                {casalPendente && (
                  <p style={{ fontSize: 12.5, color: C.text3, margin: '0 0 10px', lineHeight: 1.5 }}>
                    A recusa vale para o casal — a equipe de grupos cuida do próximo passo com os dois.
                  </p>
                )}
                <input
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Motivo (opcional — fica só com a equipe de grupos)"
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
