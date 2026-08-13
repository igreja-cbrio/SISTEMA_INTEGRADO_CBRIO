// ============================================================================
// /g/r/:token — RENOVAÇÃO DE TEMPORADA: o LÍDER responde pelo link do WhatsApp
// (1×/semestre · sem login) se continua com o grupo na próxima temporada.
//
// SIM → checklist do roster ("quem deve continuar" · estimativa, sem precisar
// ter certeza); quem não for marcado sai da lista do grupo (soft — segue
// cadastrado e pode se reinscrever na abertura). Reedição permitida enquanto
// o link vale: a última resposta vence.
// NÃO → motivo obrigatório; o grupo NÃO fecha — a coordenação tria.
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { gruposPublic } from '../../api';
import AnimatedBackground from './AnimatedBackground';
import { usePublicTheme, PublicThemeToggle } from './publicTheme';
import { CheckCircle2, AlertTriangle, Users, Check, HeartHandshake, ArrowLeft } from 'lucide-react';

const VERDE = '#00B39D';
const AMBAR = '#f59e0b';
const VERMELHO = '#ef4444';

export default function GrupoRenovacao() {
  const { token } = useParams();
  const { C } = usePublicTheme();
  // carregando | erro | pergunta | checklist | motivo | enviando | salvo
  const [estado, setEstado] = useState('carregando');
  const [erroMsg, setErroMsg] = useState('');
  const [dados, setDados] = useState(null);
  const [marcados, setMarcados] = useState(() => new Set());
  const [exibidos, setExibidos] = useState([]);
  const [motivo, setMotivo] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    if (!token) { setEstado('erro'); setErroMsg('Link inválido.'); return; }
    let vivo = true;
    gruposPublic.renovacaoPorToken(token)
      .then((d) => {
        if (!vivo) return;
        setDados(d);
        setExibidos((d.membros || []).map(m => m.id));
        setMarcados(new Set((d.membros || []).filter(m => m.marcado).map(m => m.id)));
        setMotivo(d.motivo || '');
        setEstado('pergunta');
      })
      .catch((e) => {
        if (!vivo) return;
        setEstado('erro');
        setErroMsg(e?.message || 'Não foi possível abrir a renovação.');
      });
    return () => { vivo = false; };
  }, [token]);

  const membros = dados?.membros || [];
  const naoMarcados = useMemo(() => membros.filter(m => !marcados.has(m.id)), [membros, marcados]);
  const todosMarcados = membros.length > 0 && naoMarcados.length === 0;

  const toggle = (id) => setMarcados(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const enviarContinua = async () => {
    setEstado('enviando'); setConfirmando(false); setErroMsg('');
    try {
      const r = await gruposPublic.responderRenovacao(token, {
        resposta: 'continua', continuam: [...marcados], exibidos,
      });
      setResultado(r);
      setEstado('salvo');
    } catch (e) {
      setEstado('checklist');
      setErroMsg(e?.message || 'Erro ao salvar. Tente de novo.');
    }
  };

  const enviarNaoContinua = async () => {
    if (motivo.trim().length < 5) {
      setErroMsg('Conte pra gente o motivo — ele ajuda a coordenação a cuidar do grupo.');
      return;
    }
    setEstado('enviando'); setErroMsg('');
    try {
      const r = await gruposPublic.responderRenovacao(token, { resposta: 'nao_continua', motivo: motivo.trim() });
      setResultado(r);
      setEstado('salvo');
    } catch (e) {
      setEstado('motivo');
      setErroMsg(e?.message || 'Erro ao salvar. Tente de novo.');
    }
  };

  const chip = (texto, cor) => (
    <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.1, textTransform: 'uppercase', color: cor, display: 'block', marginBottom: 6 }}>
      {texto}
    </span>
  );

  const botaoVoltar = (para) => (
    <button
      type="button"
      onClick={() => { setEstado(para); setErroMsg(''); }}
      style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', color: C.text3, fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 12 }}
    >
      <ArrowLeft size={14} /> Voltar
    </button>
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
            <h1 style={{ fontSize: 19, fontWeight: 700, color: C.text, margin: '0 0 8px' }}>Resposta registrada!</h1>
            {resultado?.status === 'continua' ? (
              <>
                <p style={{ fontSize: 14, color: C.text3, margin: 0, lineHeight: 1.6 }}>
                  Que alegria ter você à frente do <strong style={{ color: C.text }}>{dados?.grupo?.nome}</strong> mais uma temporada! 💛<br />
                  {resultado?.confirmados ?? marcados.size} pessoa(s) confirmadas
                  {(resultado?.removidos ?? 0) > 0 && <> · {resultado.removidos} saíram da lista (continuam cadastradas e podem voltar na abertura)</>}.
                </p>
                <p style={{ fontSize: 12, color: C.textDim, marginTop: 12 }}>
                  Precisou corrigir? Abra este mesmo link de novo enquanto ele estiver válido.
                </p>
              </>
            ) : (
              <p style={{ fontSize: 14, color: C.text3, margin: 0, lineHeight: 1.6 }}>
                Obrigado por tudo nesta temporada! 💛 A coordenação recebeu sua resposta e vai
                cuidar do futuro do grupo — nada muda para as pessoas agora, e alguém pode te
                procurar para conversar.
              </p>
            )}
          </div>
        )}

        {estado === 'pergunta' && dados && (
          <>
            {chip(`Renovação · temporada ${dados.temporada?.label || ''}`, VERDE)}
            <h1 style={{ fontSize: 'clamp(19px, 5vw, 23px)', fontWeight: 800, color: C.text, margin: '0 0 8px' }}>
              Você continua com o {dados.grupo?.nome}?
            </h1>
            <p style={{ fontSize: 13.5, color: C.text3, margin: '0 0 18px', lineHeight: 1.6 }}>
              Estamos preparando a próxima temporada dos Grupos de Conexão e queremos saber se
              você segue à frente do seu grupo.
              {dados.ja_respondeu && (
                <> <strong style={{ color: AMBAR }}>
                  Você já respondeu ({dados.status === 'continua' ? 'continua' : 'não continua'})
                </strong> — pode ajustar abaixo se algo mudou.</>
              )}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <button
                type="button"
                onClick={() => { setEstado('checklist'); setErroMsg(''); }}
                style={{
                  width: '100%', padding: '16px', borderRadius: 12, fontSize: 15.5, fontWeight: 800,
                  border: 'none', background: VERDE, color: '#fff', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                }}
              >
                <HeartHandshake size={18} /> Sim, continuo com o grupo
              </button>
              <button
                type="button"
                onClick={() => { setEstado('motivo'); setErroMsg(''); }}
                style={{
                  width: '100%', padding: '14px', borderRadius: 12, fontSize: 14, fontWeight: 700,
                  border: `1px solid ${C.inputBorder}`, background: 'transparent', color: C.text2, cursor: 'pointer',
                }}
              >
                Não vou continuar na próxima temporada
              </button>
            </div>
          </>
        )}

        {(estado === 'checklist' || (estado === 'enviando' && exibidos.length > 0 && !confirmando)) && dados && (
          <>
            {botaoVoltar('pergunta')}
            {chip('Quem continua com você?', VERDE)}
            <h1 style={{ fontSize: 'clamp(18px, 5vw, 21px)', fontWeight: 800, color: C.text, margin: '0 0 6px' }}>
              {dados.grupo?.nome}
            </h1>
            <p style={{ fontSize: 13, color: C.text3, margin: '0 0 14px', lineHeight: 1.6 }}>
              Marque quem você espera que continue no grupo — <strong style={{ color: C.text2 }}>é uma
              estimativa, não precisa ter certeza</strong>. Quem ficar de fora sai da lista do grupo,
              mas continua cadastrado e pode se inscrever de novo na abertura das inscrições.
            </p>

            {membros.length === 0 ? (
              <p style={{ fontSize: 14, color: C.text3, padding: '14px 0', textAlign: 'center' }}>
                Este grupo não tem participantes na lista. É só confirmar abaixo que você continua.
              </p>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <button
                    type="button"
                    onClick={() => setMarcados(todosMarcados ? new Set() : new Set(membros.map(m => m.id)))}
                    style={{
                      padding: '7px 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                      border: `1px solid ${C.inputBorder}`, background: 'transparent', color: C.text2,
                    }}
                  >
                    {todosMarcados ? 'Desmarcar todos' : 'Selecionar todos'}
                  </button>
                  <span style={{ marginLeft: 'auto', fontSize: 12.5, color: C.text3 }}>
                    <Users size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: -2 }} />
                    {marcados.size} de {membros.length}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '52vh', overflowY: 'auto', marginBottom: 14 }}>
                  {membros.map(m => {
                    const on = marcados.has(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggle(m.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                          padding: '10px 12px', borderRadius: 10, cursor: 'pointer',
                          border: `1px solid ${on ? VERDE : C.inputBorder}`,
                          background: on ? 'rgba(0,179,157,0.10)' : (C.isDark ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.02)'),
                          color: C.text,
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
                        <span style={{ flex: 1, fontSize: 14, fontWeight: on ? 700 : 500 }}>{m.nome}</span>
                        <span style={{
                          width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                          border: `2px solid ${on ? VERDE : C.inputBorder}`,
                          background: on ? VERDE : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          {on && <Check size={14} color="#fff" />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {erroMsg && <p style={{ fontSize: 13, color: VERMELHO, marginBottom: 10 }}>{erroMsg}</p>}

            <button
              type="button"
              onClick={() => setConfirmando(true)}
              disabled={estado === 'enviando'}
              style={{
                width: '100%', padding: '14px', borderRadius: 12, fontSize: 15, fontWeight: 800,
                border: 'none', background: VERDE, color: '#fff', cursor: 'pointer',
                opacity: estado === 'enviando' ? 0.6 : 1,
              }}
            >
              Enviar confirmação ({marcados.size} de {membros.length})
            </button>
            <p style={{ fontSize: 11.5, color: C.textDim, marginTop: 10, lineHeight: 1.5, textAlign: 'center' }}>
              Errou? Abra este link de novo e reenvie — a última resposta vale.
            </p>
          </>
        )}

        {estado === 'motivo' && dados && (
          <>
            {botaoVoltar('pergunta')}
            {chip('Não vou continuar', AMBAR)}
            <h1 style={{ fontSize: 'clamp(18px, 5vw, 21px)', fontWeight: 800, color: C.text, margin: '0 0 8px' }}>
              Obrigado por liderar nesta temporada 💛
            </h1>
            <p style={{ fontSize: 13.5, color: C.text3, margin: '0 0 14px', lineHeight: 1.6 }}>
              Conta pra gente o motivo? Ele ajuda a coordenação a cuidar do futuro do grupo —
              <strong style={{ color: C.text2 }}> nada muda para as pessoas agora</strong>, e alguém
              pode te procurar para conversar.
            </p>
            <textarea
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
              placeholder="Ex.: mudança de cidade, novo horário de trabalho, fase da família..."
              rows={4}
              style={{
                width: '100%', padding: '12px', borderRadius: 10, border: `1px solid ${C.inputBorder}`,
                background: C.isDark ? 'rgba(255,255,255,0.04)' : '#fff', color: C.text,
                fontSize: 16, boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit',
              }}
            />
            {erroMsg && <p style={{ fontSize: 13, color: VERMELHO, margin: '10px 0 0' }}>{erroMsg}</p>}
            <button
              type="button"
              onClick={enviarNaoContinua}
              disabled={estado === 'enviando'}
              style={{
                width: '100%', marginTop: 12, padding: '14px', borderRadius: 12, fontSize: 15, fontWeight: 800,
                border: 'none', background: AMBAR, color: '#fff', cursor: 'pointer',
              }}
            >
              Enviar resposta
            </button>
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
              Confirmar a lista?
            </h2>
            {marcados.size === 0 && membros.length > 0 ? (
              <p style={{ fontSize: 13.5, color: VERMELHO, margin: '0 0 10px', lineHeight: 1.6 }}>
                <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: -2, marginRight: 4 }} />
                Nenhuma pessoa marcada — <strong>todas as {membros.length}</strong> vão sair da lista
                do grupo. Tem certeza?
              </p>
            ) : (
              <p style={{ fontSize: 13.5, color: C.text2, margin: '0 0 10px', lineHeight: 1.6 }}>
                <strong style={{ color: VERDE }}>{marcados.size}</strong> pessoa(s) continuam
                {naoMarcados.length > 0 && <> · <strong style={{ color: AMBAR }}>{naoMarcados.length}</strong> saem da lista</>}.
              </p>
            )}
            {naoMarcados.length > 0 && (
              <div style={{
                maxHeight: '28vh', overflowY: 'auto', border: `1px solid ${C.inputBorder}`,
                borderRadius: 10, padding: '8px 12px', marginBottom: 10,
              }}>
                {naoMarcados.map(m => (
                  <div key={m.id} style={{ fontSize: 13, color: C.text2, padding: '3px 0' }}>{m.nome}</div>
                ))}
              </div>
            )}
            <p style={{ fontSize: 12, color: C.textDim, margin: '0 0 14px', lineHeight: 1.5 }}>
              Quem sai continua cadastrado e pode se inscrever de novo na abertura das inscrições.
            </p>
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
                onClick={enviarContinua}
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
