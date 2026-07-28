// Página pública · comprovante de inscrição (/i/c/:token · SPEC-06).
// É a URL que o QR da tela de sucesso codifica: a pessoa reabre o comprovante
// quando quiser e a portaria escaneia este MESMO QR no check-in do evento.
// Token assinado (HMAC) resolvido no backend — sem assinatura válida, 404.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import QRCode from 'qrcode';
import { eventoPublico } from '../../api';
import AnimatedBackground from './AnimatedBackground';
import { usePublicTheme, PublicThemeToggle } from './publicTheme';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
function dataLonga(iso?: string | null) {
  if (!iso) return '';
  const d = new Date(iso + 'T12:00:00');
  return `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
}

type Comprovante = {
  nome: string;
  numero_sorte: number | null;
  tem_sorteio: boolean;
  status: string;
  inscrito_em: string | null;
  checkin_em: string | null;
  evento: { nome: string; slug: string; data: string | null; hora: string | null; local: string | null };
};

export default function InscricaoComprovante() {
  const { token = '' } = useParams();
  const { C } = usePublicTheme();
  const [comp, setComp] = useState<Comprovante | null>(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [qr, setQr] = useState('');

  useEffect(() => {
    eventoPublico.comprovante(token)
      .then(setComp)
      .catch((e: any) => setErro(e?.message || 'Comprovante não encontrado'))
      .finally(() => setCarregando(false));
  }, [token]);

  useEffect(() => {
    // O QR exibido codifica ESTA página — é o mesmo que a portaria escaneia.
    const url = `${window.location.origin}/i/c/${token}`;
    QRCode.toDataURL(url, { width: 560, margin: 2, color: { dark: '#000000', light: '#ffffff' } })
      .then(setQr).catch(() => {});
  }, [token]);

  const cancelada = comp?.status === 'cancelada';
  const pendente = comp?.status === 'recebida';

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', position: 'relative',
      padding: 'clamp(20px, 5vw, 40px) clamp(10px, 3vw, 16px)',
      paddingBottom: 'calc(clamp(20px, 5vw, 40px) + env(safe-area-inset-bottom, 0px))',
      background: C.pageBg,
    }}>
      <div aria-hidden="true" style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <AnimatedBackground />
      </div>
      <PublicThemeToggle />

      <div style={{
        position: 'relative', zIndex: 1, width: '100%', maxWidth: 460, margin: 'auto',
        background: C.card, backdropFilter: 'blur(24px)',
        border: `1px solid ${C.cardBorder}`, borderRadius: 20,
        padding: 'clamp(20px, 4.5vw, 30px) clamp(16px, 4vw, 26px)',
        textAlign: 'center',
      }}>
        {carregando ? (
          <p style={{ color: C.text3, fontSize: 14 }}>Carregando…</p>
        ) : erro || !comp ? (
          <>
            <img src="/logo-cbrio-icon.png" alt="CBRio" style={{ width: 56, height: 56, marginBottom: 10 }} />
            <h1 style={{ fontSize: 19, fontWeight: 800, margin: 0, color: C.text }}>Comprovante não encontrado</h1>
            <p style={{ fontSize: 13, color: C.text3, marginTop: 8 }}>
              Confira o link que você recebeu. Se o problema continuar, procure a equipe do evento.
            </p>
          </>
        ) : (
          <>
            <div style={{ fontSize: 11, color: C.text3, textTransform: 'uppercase', letterSpacing: 1 }}>
              Comprovante de inscrição
            </div>
            <h1 style={{
              fontSize: 'clamp(20px, 5.5vw, 24px)', fontWeight: 800, margin: '6px 0 0', letterSpacing: -0.4,
              background: 'linear-gradient(90deg, #00B39D, #00d9bd)',
              WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent',
            }}>{comp.evento.nome}</h1>
            {(dataLonga(comp.evento.data) || comp.evento.hora) && (
              <div style={{ display: 'inline-block', marginTop: 8, padding: '5px 14px', borderRadius: 999, background: 'rgba(0,179,157,0.12)', border: '1px solid rgba(0,179,157,0.3)', color: '#00B39D', fontSize: 13, fontWeight: 700 }}>
                {[dataLonga(comp.evento.data), comp.evento.hora].filter(Boolean).join(' · ')}
              </div>
            )}
            {comp.evento.local && <p style={{ fontSize: 12.5, color: C.text3, marginTop: 6 }}>{comp.evento.local}</p>}

            <div style={{ marginTop: 16, fontSize: 17, fontWeight: 700, color: C.text }}>{comp.nome}</div>

            {comp.tem_sorteio && comp.numero_sorte != null && (
              <div style={{ marginTop: 6 }}>
                <span style={{ fontSize: 12, color: '#00B39D', fontWeight: 600 }}>Número da sorte </span>
                <span style={{ fontSize: 22, fontWeight: 800, color: '#00B39D', fontVariantNumeric: 'tabular-nums' }}>{comp.numero_sorte}</span>
              </div>
            )}

            {/* Situação: cancelada apaga o QR; check-in feito vira selo verde;
                pagamento pendente avisa (a portaria decide na hora). */}
            {cancelada ? (
              <div style={{ marginTop: 16, padding: '10px 14px', borderRadius: 10, background: '#ef444418', border: '1px solid #ef444440', color: '#ef4444', fontSize: 13, fontWeight: 600 }}>
                Esta inscrição está cancelada.
              </div>
            ) : (
              <>
                {comp.checkin_em && (
                  <div style={{ marginTop: 14, padding: '8px 14px', borderRadius: 999, display: 'inline-block', background: '#10b98118', border: '1px solid #10b98140', color: '#10b981', fontSize: 12.5, fontWeight: 700 }}>
                    ✓ Check-in realizado às {new Date(comp.checkin_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </div>
                )}
                {pendente && (
                  <div style={{ marginTop: 14, padding: '8px 14px', borderRadius: 10, background: '#f59e0b18', border: '1px solid #f59e0b40', color: '#b45309', fontSize: 12.5, fontWeight: 600 }}>
                    Pagamento pendente — conclua o pagamento pra garantir sua vaga.
                  </div>
                )}
                {qr && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ display: 'inline-block', background: '#fff', padding: 12, borderRadius: 14 }}>
                      <img src={qr} alt="QR do comprovante de inscrição" style={{ width: 200, height: 200, display: 'block' }} />
                    </div>
                    <p style={{ fontSize: 12, color: C.text3, marginTop: 10, lineHeight: 1.5 }}>
                      Apresente este QR na entrada do evento.
                    </p>
                  </div>
                )}
              </>
            )}

            {comp.inscrito_em && (
              <p style={{ fontSize: 11, color: C.text3, marginTop: 14, opacity: 0.8 }}>
                Inscrição feita em {new Date(comp.inscrito_em).toLocaleDateString('pt-BR')}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
