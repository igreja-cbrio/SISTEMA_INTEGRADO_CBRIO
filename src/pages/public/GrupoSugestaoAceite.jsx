// ============================================================================
// /g/s/:token — a PESSOA aceita (ou ignora) a sugestão de OUTRO grupo que a
// liderança mandou pelo WhatsApp, sem login.
//
// Token 'suges' (HMAC, expira em 7 dias) aponta pro pedido original + grupo
// sugerido. Aceitar move o pedido pro grupo sugerido e já aprova (quem
// sugeriu tem autoridade de triagem — o aceite fecha o combinado). "Manter
// meu pedido" não chama o backend: o pedido original continua pendente.
// ============================================================================

import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { gruposPublic } from '../../api';
import AnimatedBackground from './AnimatedBackground';
import { usePublicTheme, PublicThemeToggle } from './publicTheme';
import { Check, MapPin, Clock, Users, CheckCircle2, AlertTriangle } from 'lucide-react';

const VERDE = '#00B39D';
const AMBAR = '#f59e0b';

export default function GrupoSugestaoAceite() {
  const { token } = useParams();
  const { C } = usePublicTheme();
  const [estado, setEstado] = useState('carregando'); // carregando | erro | pronto | enviando | aceito | mantido
  const [erroMsg, setErroMsg] = useState('');
  const [dados, setDados] = useState(null);
  // Nome do grupo em que a aprovação DE FATO caiu (o backend devolve — pode
  // diferir do sugerido se dois aceites correrem).
  const [grupoConfirmado, setGrupoConfirmado] = useState(null);

  useEffect(() => {
    if (!token) { setEstado('erro'); setErroMsg('Link inválido.'); return; }
    let vivo = true;
    gruposPublic.sugestaoPorToken(token)
      .then((d) => {
        if (!vivo) return;
        setDados(d);
        // Link revisitado depois de decidido: aprovado não é "erro" — mostra
        // a tela positiva (sem cravar o nome do grupo, que pode ter sido outro).
        if (d.pedido.status === 'aprovado') {
          setEstado('ja-aprovado');
        } else if (d.pedido.status !== 'pendente') {
          setEstado('erro');
          setErroMsg(`Este pedido já foi ${d.pedido.status === 'rejeitado' ? 'encerrado' : d.pedido.status}.`);
        } else {
          setEstado('pronto');
        }
      })
      .catch((e) => {
        if (!vivo) return;
        setEstado('erro');
        setErroMsg(e?.message || 'Não foi possível abrir a sugestão.');
      });
    return () => { vivo = false; };
  }, [token]);

  const aceitar = async () => {
    setEstado('enviando');
    try {
      const r = await gruposPublic.aceitarSugestao(token);
      setGrupoConfirmado(r?.grupo || null);
      setEstado('aceito');
    } catch (e) {
      setEstado('pronto');
      setErroMsg(e?.message || 'Erro ao confirmar. Tente de novo.');
    }
  };

  const pedido = dados?.pedido;
  const grupo = dados?.grupo;

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
          <p style={{ color: C.text3, textAlign: 'center', margin: '30px 0' }}>Carregando sugestão...</p>
        )}

        {estado === 'erro' && (
          <div style={{ textAlign: 'center', padding: '18px 0' }}>
            <AlertTriangle size={40} color={AMBAR} style={{ marginBottom: 12 }} />
            <h1 style={{ fontSize: 18, fontWeight: 700, color: C.text, margin: '0 0 8px' }}>Não deu para abrir a sugestão</h1>
            <p style={{ fontSize: 14, color: C.text3, margin: 0, lineHeight: 1.5 }}>{erroMsg}</p>
          </div>
        )}

        {estado === 'aceito' && (
          <div style={{ textAlign: 'center', padding: '18px 0' }}>
            <CheckCircle2 size={44} color={VERDE} style={{ marginBottom: 12 }} />
            <h1 style={{ fontSize: 19, fontWeight: 700, color: C.text, margin: '0 0 8px' }}>Você está no grupo!</h1>
            <p style={{ fontSize: 14, color: C.text3, margin: 0, lineHeight: 1.5 }}>
              Bem-vindo(a) ao grupo <strong>{grupoConfirmado || grupo?.nome}</strong>. O líder vai entrar em contato para dar as boas-vindas.
            </p>
          </div>
        )}

        {estado === 'ja-aprovado' && (
          <div style={{ textAlign: 'center', padding: '18px 0' }}>
            <CheckCircle2 size={44} color={VERDE} style={{ marginBottom: 12 }} />
            <h1 style={{ fontSize: 19, fontWeight: 700, color: C.text, margin: '0 0 8px' }}>Tudo certo por aqui!</h1>
            <p style={{ fontSize: 14, color: C.text3, margin: 0, lineHeight: 1.5 }}>
              Seu pedido já foi aprovado — você já está num grupo. O líder entra em contato para as boas-vindas.
            </p>
          </div>
        )}

        {estado === 'mantido' && (
          <div style={{ textAlign: 'center', padding: '18px 0' }}>
            <CheckCircle2 size={44} color={C.text3} style={{ marginBottom: 12 }} />
            <h1 style={{ fontSize: 19, fontWeight: 700, color: C.text, margin: '0 0 8px' }}>Tudo certo</h1>
            <p style={{ fontSize: 14, color: C.text3, margin: 0, lineHeight: 1.5 }}>
              Seu pedido original{pedido?.grupo_original ? <> para o grupo <strong>{pedido.grupo_original}</strong></> : ''} continua na fila do líder.
            </p>
          </div>
        )}

        {(estado === 'pronto' || estado === 'enviando') && grupo && (
          <>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.2, textTransform: 'uppercase', color: VERDE, margin: '0 0 6px' }}>
              Sugestão de grupo para você
            </p>
            <h1 style={{ fontSize: 'clamp(20px, 5vw, 24px)', fontWeight: 800, color: C.text, margin: '0 0 10px' }}>
              Que tal o grupo {grupo.nome}?
            </h1>
            <p style={{ fontSize: 14, color: C.text3, margin: '0 0 16px', lineHeight: 1.55 }}>
              {pedido?.nome ? `${pedido.nome.split(' ')[0]}, a` : 'A'} liderança olhou seu pedido
              {pedido?.grupo_original ? <> para o grupo <strong>{pedido.grupo_original}</strong></> : ''} e
              acredita que este grupo combina melhor com você:
            </p>

            <div style={{
              border: `1px solid ${C.cardBorder}`, borderRadius: 12, padding: '12px 14px',
              marginBottom: 18, fontSize: 13, color: C.text3, display: 'flex', flexDirection: 'column', gap: 5,
            }}>
              <span style={{ fontWeight: 700, color: C.text2 }}><Users size={13} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />{grupo.nome}{grupo.codigo ? ` · ${grupo.codigo}` : ''}</span>
              {grupo.quando && grupo.quando !== 'a combinar' && <span><Clock size={13} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />{grupo.quando}</span>}
              {grupo.onde && grupo.onde !== 'a combinar' && <span><MapPin size={13} style={{ display: 'inline', marginRight: 6, verticalAlign: -2 }} />{grupo.onde}</span>}
            </div>

            {erroMsg && <p style={{ fontSize: 13, color: '#ef4444', marginBottom: 12 }}>{erroMsg}</p>}

            <div style={{ display: 'flex', gap: 10, flexDirection: 'column' }}>
              <button
                onClick={() => { setErroMsg(''); aceitar(); }}
                disabled={estado === 'enviando'}
                style={{
                  padding: '14px 10px', borderRadius: 12, fontSize: 15, fontWeight: 700,
                  border: 'none', background: VERDE, color: '#fff', cursor: 'pointer',
                  opacity: estado === 'enviando' ? 0.6 : 1,
                }}
              >
                <Check size={16} style={{ display: 'inline', marginRight: 6, verticalAlign: -3 }} />
                {estado === 'enviando' ? 'Confirmando...' : 'Aceitar e entrar neste grupo'}
              </button>
              <button
                onClick={() => setEstado('mantido')}
                disabled={estado === 'enviando'}
                style={{
                  padding: '12px 10px', borderRadius: 12, fontSize: 14, fontWeight: 600,
                  border: `1px solid ${C.inputBorder}`, background: 'transparent', color: C.text2, cursor: 'pointer',
                }}
              >
                Prefiro manter meu pedido original
              </button>
            </div>

            <p style={{ fontSize: 11.5, color: C.textDim, marginTop: 16, lineHeight: 1.5 }}>
              Este link é pessoal e expira em 7 dias. Se não fizer nada, seu pedido original continua valendo.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
