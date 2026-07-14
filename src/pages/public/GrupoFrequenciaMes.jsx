// ============================================================================
// /g/f/:token — o LÍDER registra a frequência do MÊS do próprio grupo pelo
// link recebido no WhatsApp (1×/mês), sem login.
//
// Marca quem participou dos encontros → vira encontro + presenças no sistema
// (alimenta os relatórios de grupos). Token 'freq' amarrado ao líder; pode
// reeditar dentro da validade do link (7 dias).
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { gruposPublic } from '../../api';
import AnimatedBackground from './AnimatedBackground';
import { usePublicTheme, PublicThemeToggle } from './publicTheme';
import { CheckCircle2, AlertTriangle, Users, Check } from 'lucide-react';

const VERDE = '#00B39D';
const AMBAR = '#f59e0b';

export default function GrupoFrequenciaMes() {
  const { token } = useParams();
  const { C } = usePublicTheme();
  const [estado, setEstado] = useState('carregando'); // carregando | erro | pronto | enviando | salvo
  const [erroMsg, setErroMsg] = useState('');
  const [dados, setDados] = useState(null);
  const [marcados, setMarcados] = useState(() => new Set());
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    if (!token) { setEstado('erro'); setErroMsg('Link inválido.'); return; }
    let vivo = true;
    gruposPublic.frequenciaPorToken(token)
      .then((d) => {
        if (!vivo) return;
        setDados(d);
        setMarcados(new Set((d.membros || []).filter(m => m.presente).map(m => m.id)));
        setEstado('pronto');
      })
      .catch((e) => {
        if (!vivo) return;
        setEstado('erro');
        setErroMsg(e?.message || 'Não foi possível abrir a chamada.');
      });
    return () => { vivo = false; };
  }, [token]);

  const toggle = (id) => setMarcados(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const todosMarcados = useMemo(
    () => (dados?.membros || []).length > 0 && (dados?.membros || []).every(m => marcados.has(m.id)),
    [dados, marcados]
  );

  const salvar = async () => {
    setEstado('enviando');
    try {
      const r = await gruposPublic.salvarFrequencia(token, [...marcados]);
      setResultado(r);
      setEstado('salvo');
    } catch (e) {
      setEstado('pronto');
      setErroMsg(e?.message || 'Erro ao salvar. Tente de novo.');
    }
  };

  const membros = dados?.membros || [];

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
          <p style={{ color: C.text3, textAlign: 'center', margin: '30px 0' }}>Carregando o grupo...</p>
        )}

        {estado === 'erro' && (
          <div style={{ textAlign: 'center', padding: '18px 0' }}>
            <AlertTriangle size={40} color={AMBAR} style={{ marginBottom: 12 }} />
            <h1 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: '0 0 8px' }}>Não deu para abrir a chamada</h1>
            <p style={{ fontSize: 14, color: C.text3, margin: 0, lineHeight: 1.5 }}>{erroMsg}</p>
            <p style={{ fontSize: 13, color: C.textDim, marginTop: 14 }}>
              Você também pode registrar pelo sistema em Grupos → seu grupo → Registrar encontro.
            </p>
          </div>
        )}

        {estado === 'salvo' && (
          <div style={{ textAlign: 'center', padding: '18px 0' }}>
            <CheckCircle2 size={44} color={VERDE} style={{ marginBottom: 12 }} />
            <h1 style={{ fontSize: 19, fontWeight: 700, color: C.text, margin: '0 0 8px' }}>Frequência registrada!</h1>
            <p style={{ fontSize: 14, color: C.text3, margin: 0, lineHeight: 1.5 }}>
              {resultado?.marcados ?? marcados.size} de {resultado?.total ?? membros.length} participante(s)
              em {dados?.mes_rotulo}. Obrigado por cuidar do seu grupo!
            </p>
            <p style={{ fontSize: 12, color: C.textDim, marginTop: 12 }}>
              Precisou corrigir? É só abrir o mesmo link de novo enquanto ele estiver válido.
            </p>
          </div>
        )}

        {(estado === 'pronto' || estado === 'enviando') && dados && (
          <>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: VERDE, margin: '0 0 6px' }}>
              Frequência de {dados.mes_rotulo}
            </p>
            <h1 style={{ fontSize: 'clamp(19px, 5vw, 23px)', fontWeight: 800, color: C.text, margin: '0 0 6px' }}>
              {dados.grupo?.nome}
            </h1>
            <p style={{ fontSize: 13.5, color: C.text3, margin: '0 0 14px', lineHeight: 1.5 }}>
              Marque quem participou dos encontros neste mês.
              {dados.ja_salvo && <> <strong style={{ color: AMBAR }}>Você já registrou este mês</strong> — ajuste e salve de novo se precisar.</>}
            </p>

            {membros.length === 0 ? (
              <p style={{ fontSize: 14, color: C.text3, padding: '18px 0', textAlign: 'center' }}>
                Este grupo ainda não tem participantes cadastrados.
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
                    {todosMarcados ? 'Desmarcar todos' : 'Marcar todos'}
                  </button>
                  <span style={{ marginLeft: 'auto', fontSize: 12.5, color: C.text3 }}>
                    <Users size={13} style={{ display: 'inline', marginRight: 4, verticalAlign: -2 }} />
                    {marcados.size} de {membros.length}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: '55vh', overflowY: 'auto', marginBottom: 14 }}>
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

                {erroMsg && <p style={{ fontSize: 13, color: '#ef4444', marginBottom: 10 }}>{erroMsg}</p>}

                <button
                  onClick={salvar}
                  disabled={estado === 'enviando'}
                  style={{
                    width: '100%', padding: '14px', borderRadius: 12, fontSize: 15, fontWeight: 800,
                    border: 'none', background: VERDE, color: '#fff', cursor: 'pointer',
                    opacity: estado === 'enviando' ? 0.6 : 1,
                  }}
                >
                  {estado === 'enviando' ? 'Salvando...' : `Salvar frequência (${marcados.size})`}
                </button>
                <p style={{ fontSize: 11.5, color: C.textDim, marginTop: 10, lineHeight: 1.5, textAlign: 'center' }}>
                  Este link é pessoal e expira em alguns dias. Ninguém marcado? Salve com zero — também é informação.
                </p>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
