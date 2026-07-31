// ============================================================================
// /g/c/:token — CONFIRA A LISTA DO SEU GRUPO: o LÍDER abre pelo link do
// WhatsApp (sem login) e vê a lista ATUAL do grupo TODA MARCADA como "faz
// parte". Ele DESMARCA quem não faz mais parte.
//
// É o oposto da renovação (/g/r/), de propósito (decisão do Marcos 31/07): lá a
// lista vem desmarcada e o líder confirma quem fica; aqui o padrão esperado é
// "a lista está certa" e o atrito fica só em quem sai. Não pergunta "vai
// continuar?" e não é bloqueada com as inscrições da temporada abertas.
//
// Antes de aplicar, um modal lista os NOMES de quem vai sair (o líder tem que
// ver quem está removendo). Motivo é UM só, do lote, e OPCIONAL. Reedição
// permitida enquanto o link vale: a última resposta vence.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { gruposPublic } from '../../api';
import AnimatedBackground from './AnimatedBackground';
import { usePublicTheme, PublicThemeToggle } from './publicTheme';
import { CheckCircle2, AlertTriangle, Users, Check, ListChecks, Lock } from 'lucide-react';

const VERDE = '#00B39D';
const AMBAR = '#f59e0b';
const VERMELHO = '#ef4444';

export default function GrupoConfiraLista() {
  const { token } = useParams();
  const { C } = usePublicTheme();
  // carregando | erro | lista | enviando | salvo
  const [estado, setEstado] = useState('carregando');
  const [erroMsg, setErroMsg] = useState('');
  const [dados, setDados] = useState(null);
  const [marcados, setMarcados] = useState(() => new Set());
  const [exibidos, setExibidos] = useState([]);
  const [observacao, setObservacao] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    if (!token) { setEstado('erro'); setErroMsg('Link inválido.'); return; }
    let vivo = true;
    gruposPublic.confiraPorToken(token)
      .then((d) => {
        if (!vivo) return;
        setDados(d);
        setExibidos((d.membros || []).map(m => m.id));
        // Vem do servidor com `marcado: true` em quem está ativo — a lista
        // nasce toda marcada ("faz parte").
        setMarcados(new Set((d.membros || []).filter(m => m.marcado).map(m => m.id)));
        setObservacao(d.observacao || '');
        setEstado('lista');
      })
      .catch((e) => {
        if (!vivo) return;
        setEstado('erro');
        setErroMsg(e?.message || 'Não foi possível abrir a lista do grupo.');
      });
    return () => { vivo = false; };
  }, [token]);

  const membros = dados?.membros || [];
  const saem = useMemo(() => membros.filter(m => !marcados.has(m.id)), [membros, marcados]);
  const todosMarcados = membros.length > 0 && saem.length === 0;
  // Liderança do grupo não é removível por aqui (o servidor também recusa):
  // tirar um co-líder da lista some com o grupo da busca pública pelo nome dele.
  const temProtegido = useMemo(() => membros.some(m => m.protegido), [membros]);
  const marcarTodos = () => new Set(membros.map(m => m.id));
  const desmarcarTodos = () => new Set(membros.filter(m => m.protegido).map(m => m.id));

  const toggle = (id) => {
    const m = membros.find(x => x.id === id);
    if (m?.protegido) return; // liderança fica
    setMarcados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const enviar = async () => {
    setEstado('enviando'); setConfirmando(false); setErroMsg('');
    try {
      const r = await gruposPublic.responderConfira(token, {
        mantem: [...marcados], exibidos, observacao: observacao.trim() || null,
      });
      setResultado(r);
      setEstado('salvo');
    } catch (e) {
      setEstado('lista');
      setErroMsg(e?.message || 'Erro ao salvar. Tente de novo.');
    }
  };

  const chip = (texto, cor) => (
    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.1, textTransform: 'uppercase', color: cor, display: 'block', marginBottom: 6 }}>
      {texto}
    </span>
  );

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
      position: 'relative', overflow: 'hidden', padding: 'clamp(20px, 5vw, 40px) clamp(10px, 3vw, 16px)',
      background: C.pageBg,
    }}>
      <AnimatedBackground />
      <PublicThemeToggle />

      <div style={{
        position: 'relative', zIndex: 1, width: '100%', maxWidth: 560,
        background: C.card, backdropFilter: 'blur(24px)',
        border: `1px solid ${C.cardBorder}`, borderRadius: 20,
        padding: 'clamp(18px, 4vw, 30px)',
      }}>
        {estado === 'carregando' && (
          <p style={{ color: C.text3, textAlign: 'center', margin: '30px 0' }}>Carregando...</p>
        )}

        {estado === 'erro' && (
          <div style={{ textAlign: 'center', padding: '18px 0' }}>
            <AlertTriangle size={40} color={AMBAR} style={{ marginBottom: 12 }} />
            <h1 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: '0 0 8px' }}>Não deu para abrir</h1>
            <p style={{ fontSize: 14, color: C.text3, margin: 0, lineHeight: 1.5 }}>{erroMsg}</p>
            <p style={{ fontSize: 13, color: C.textDim, marginTop: 14 }}>
              Qualquer dúvida, fale com a coordenação de grupos.
            </p>
          </div>
        )}

        {estado === 'salvo' && (
          <div style={{ textAlign: 'center', padding: '18px 0' }}>
            <CheckCircle2 size={44} color={VERDE} style={{ marginBottom: 12 }} />
            <h1 style={{ fontSize: 19, fontWeight: 700, color: C.text, margin: '0 0 8px' }}>Lista conferida!</h1>
            <p style={{ fontSize: 14, color: C.text3, margin: 0, lineHeight: 1.6 }}>
              Obrigado por cuidar da lista do <strong style={{ color: C.text }}>{dados?.grupo?.nome}</strong>. 💛<br />
              {resultado?.mantidos ?? marcados.size} pessoa(s) seguem no grupo
              {(resultado?.removidos ?? 0) > 0 && <> · {resultado.removidos} saíram da lista (continuam cadastradas e podem voltar)</>}.
            </p>
            <p style={{ fontSize: 12, color: C.textDim, marginTop: 12 }}>
              Precisou corrigir? Abra este mesmo link de novo enquanto ele estiver válido.
            </p>
          </div>
        )}

        {(estado === 'lista' || (estado === 'enviando' && !confirmando)) && dados && (
          <>
            {chip('Confira a lista do seu grupo', VERDE)}
            <h1 style={{ fontSize: 'clamp(19px, 5vw, 23px)', fontWeight: 800, color: C.text, margin: '0 0 8px' }}>
              {dados.grupo?.nome}
            </h1>
            <p style={{ fontSize: 13.5, color: C.text3, margin: '0 0 14px', lineHeight: 1.6 }}>
              Esta é a lista que o sistema tem hoje. <strong style={{ color: C.text2 }}>Desmarque quem não faz
              mais parte do grupo</strong> — quem continua, deixe marcado. Quem sair continua cadastrado na
              igreja e pode voltar depois.
              {dados.ja_respondeu && (
                <> <strong style={{ color: AMBAR }}>Você já respondeu</strong> — pode ajustar abaixo se algo mudou.</>
              )}
            </p>

            {membros.length === 0 ? (
              <p style={{ fontSize: 14, color: C.text3, padding: '14px 0', textAlign: 'center' }}>
                Este grupo não tem participantes na lista. Nada a conferir por aqui — qualquer dúvida, fale
                com a coordenação.
              </p>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <button
                    type="button"
                    onClick={() => setMarcados(todosMarcados ? desmarcarTodos() : marcarTodos())}
                    style={{
                      padding: '7px 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                      border: `1px solid ${C.inputBorder}`, background: 'transparent', color: C.text2,
                    }}
                  >
                    {todosMarcados ? 'Desmarcar todos' : 'Marcar todos'}
                  </button>
                  <span style={{ marginLeft: 'auto', fontSize: 12.5, color: C.text3 }}>
                    <Users size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: -2 }} />
                    {marcados.size} de {membros.length} na lista
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '48vh', overflowY: 'auto', marginBottom: 14 }}>
                  {membros.map(m => {
                    const on = marcados.has(m.id);
                    const travado = !!m.protegido;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggle(m.id)}
                        disabled={travado}
                        title={travado ? 'A liderança do grupo não sai por aqui — fale com a coordenação.' : undefined}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                          padding: '10px 12px', borderRadius: 10,
                          cursor: travado ? 'default' : 'pointer',
                          border: `1px solid ${on ? VERDE : C.inputBorder}`,
                          background: on ? 'rgba(0,179,157,0.10)' : (C.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                          color: C.text,
                          opacity: travado ? 0.85 : 1,
                        }}
                      >
                        <span style={{
                          width: 34, height: 34, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
                          background: on ? VERDE : (C.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: on ? '#fff' : C.text3, fontWeight: 700, fontSize: 14,
                        }}>
                          {m.foto_url
                            ? <img src={m.foto_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                            : (m.nome || '?').charAt(0).toUpperCase()}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 14, fontWeight: on ? 700 : 500 }}>{m.nome}</span>
                            {m.papel && (
                              <span style={{
                                fontSize: 10.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase',
                                padding: '2px 6px', borderRadius: 999,
                                color: travado ? VERDE : C.text3,
                                background: travado ? 'rgba(0,179,157,0.16)' : (C.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'),
                              }}>
                                {m.papel}
                              </span>
                            )}
                          </span>
                          {travado ? (
                            <span style={{ display: 'block', fontSize: 11.5, color: C.textDim, marginTop: 2 }}>
                              <Lock size={10} style={{ display: 'inline', verticalAlign: -1, marginRight: 3 }} />
                              a liderança fica na lista
                            </span>
                          ) : !on && (
                            <span style={{ display: 'block', fontSize: 11.5, color: AMBAR, fontWeight: 600, marginTop: 2 }}>
                              vai sair da lista
                            </span>
                          )}
                        </span>
                        <span style={{
                          width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                          border: `2px solid ${on ? VERDE : C.inputBorder}`,
                          background: on ? VERDE : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {on && (travado ? <Lock size={12} color="#fff" /> : <Check size={14} color="#fff" />)}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {temProtegido && (
                  <p style={{ fontSize: 11.5, color: C.textDim, margin: '-6px 0 12px', lineHeight: 1.5 }}>
                    <Lock size={11} style={{ display: 'inline', verticalAlign: -1, marginRight: 4 }} />
                    Quem lidera o grupo não pode sair por aqui (o nome dele é o que faz o grupo
                    aparecer na busca). Mudança de liderança é com a coordenação.
                  </p>
                )}

                {/* Motivo/observação: UM só, do lote, e OPCIONAL (decisão de
                    produto — por pessoa é atrito demais). Só aparece quando há
                    alguém saindo. */}
                {saem.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ display: 'block', fontSize: 12.5, color: C.text3, marginBottom: 6 }}>
                      Quer contar o motivo? (opcional)
                    </label>
                    <textarea
                      value={observacao}
                      onChange={e => setObservacao(e.target.value)}
                      placeholder="Ex.: pessoas que nunca chegaram a participar, mudaram de cidade..."
                      rows={3}
                      style={{
                        width: '100%', padding: '12px', borderRadius: 10, border: `1px solid ${C.inputBorder}`,
                        background: C.isDark ? 'rgba(255,255,255,0.04)' : '#fff', color: C.text,
                        fontSize: 16, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit',
                      }}
                    />
                  </div>
                )}
              </>
            )}

            {erroMsg && <p style={{ fontSize: 13, color: VERMELHO, marginBottom: 10 }}>{erroMsg}</p>}

            <button
              type="button"
              onClick={() => setConfirmando(true)}
              disabled={estado === 'enviando' || membros.length === 0}
              style={{
                width: '100%', padding: '14px', borderRadius: 12, fontSize: 15, fontWeight: 800,
                border: 'none', background: VERDE, color: '#fff',
                cursor: membros.length === 0 ? 'not-allowed' : 'pointer',
                opacity: (estado === 'enviando' || membros.length === 0) ? 0.6 : 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <ListChecks size={17} />
              {saem.length > 0
                ? `Confirmar (${saem.length} saem da lista)`
                : 'Confirmar que a lista está certa'}
            </button>
            <p style={{ fontSize: 11.5, color: C.textDim, marginTop: 10, lineHeight: 1.5, textAlign: 'center' }}>
              Errou? Abra este link de novo e reenvie — a última resposta vale.
            </p>
          </>
        )}

        {estado === 'enviando' && (
          <p style={{ color: C.text3, textAlign: 'center', margin: '20px 0 6px', fontSize: 13 }}>Enviando...</p>
        )}
      </div>

      {/* Confirmação antes de aplicar — lista os NOMES de quem sai da lista */}
      {confirmando && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center',
          justifyContent: 'center', background: 'rgba(0,0,0,0.55)', padding: 16,
        }}>
          <div style={{
            width: '100%', maxWidth: 440, background: C.card, backdropFilter: 'blur(24px)',
            border: `1px solid ${C.cardBorder}`, borderRadius: 16, padding: 20,
          }}>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: C.text, margin: '0 0 10px' }}>
              {saem.length > 0 ? 'Confirmar quem sai da lista?' : 'A lista está certa?'}
            </h2>
            {saem.length === 0 ? (
              <p style={{ fontSize: 13.5, color: C.text2, margin: '0 0 14px', lineHeight: 1.6 }}>
                Você está confirmando que as <strong style={{ color: VERDE }}>{marcados.size}</strong> pessoa(s)
                da lista fazem parte do grupo. Ninguém sai.
              </p>
            ) : (
              <>
                {saem.length === membros.length && membros.length > 0 ? (
                  <p style={{ fontSize: 13.5, color: VERMELHO, margin: '0 0 10px', lineHeight: 1.6 }}>
                    <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: -2, marginRight: 4 }} />
                    Nenhuma pessoa marcada — <strong>todas as {membros.length}</strong> vão sair da lista
                    do grupo. Tem certeza?
                  </p>
                ) : (
                  <p style={{ fontSize: 13.5, color: C.text2, margin: '0 0 10px', lineHeight: 1.6 }}>
                    <strong style={{ color: AMBAR }}>{saem.length}</strong> pessoa(s) saem da lista ·{' '}
                    <strong style={{ color: VERDE }}>{marcados.size}</strong> continuam.
                  </p>
                )}
                <div style={{
                  maxHeight: '32vh', overflowY: 'auto', border: `1px solid ${C.inputBorder}`,
                  borderRadius: 10, padding: '8px 12px', marginBottom: 10,
                }}>
                  {saem.map(m => (
                    <div key={m.id} style={{ fontSize: 13, color: C.text2, padding: '3px 0' }}>{m.nome}</div>
                  ))}
                </div>
                <p style={{ fontSize: 12, color: C.textDim, margin: '0 0 14px', lineHeight: 1.5 }}>
                  Quem sai continua cadastrado na igreja e não recebe nenhum aviso disso.
                </p>
              </>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                type="button"
                onClick={() => setConfirmando(false)}
                style={{
                  flex: 1, padding: '12px', borderRadius: 10, fontSize: 14, fontWeight: 700,
                  border: `1px solid ${C.inputBorder}`, background: 'transparent', color: C.text2, cursor: 'pointer',
                }}
              >
                Voltar e ajustar
              </button>
              <button
                type="button"
                onClick={enviar}
                style={{
                  flex: 1, padding: '12px', borderRadius: 10, fontSize: 14, fontWeight: 800,
                  border: 'none', background: VERDE, color: '#fff', cursor: 'pointer',
                }}
              >
                Confirmar e enviar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
