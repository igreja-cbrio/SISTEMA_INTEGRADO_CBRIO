// Página pública de status do pagamento da inscrição · /pagamento/:token
//
// A pessoa paga na página do provedor (um link serve Pix, cartão parcelado e
// boleto). Esta tela é o "depois": diz se caiu, reoferece o link enquanto não
// caiu, e mostra o QR do Pix quando houver.
//
// ⚠️ LEI: nenhuma confirmação — texto, confete, "está tudo certo" — sem
// `pago === true` LIDO DO SERVIDOR. Quem decide é `pag_cobrancas.status`, nunca
// o fato de a pessoa ter voltado do checkout (voltar não é pagar).
//
// Acessada pelo `public_token`, nunca pelo uuid da cobrança.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import QRCode from 'qrcode';
import confetti from 'canvas-confetti';
import { eventoPublico } from '../../api';
import { usePublicTheme, PublicThemeToggle } from './publicTheme';

interface Pagamento {
  status: string;
  pago: boolean;
  valor_centavos: number;
  valor_pago_centavos: number;
  metodo: string | null;
  parcelas: number | null;
  checkout_url: string | null;
  pix_payload: string | null;
  boleto_linha_digitavel: string | null;
  boleto_url: string | null;
  expira_em: string | null;
  pago_em: string | null;
  evento_nome: string | null;
  evento_slug: string | null;
  comprovante_token: string | null;
}

const brl = (c: number) => (Number(c || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

// Vocabulário do usuário — não expõe o status canônico cru na tela.
const TEXTO: Record<string, { titulo: string; sub: string; cor: string }> = {
  pago: { titulo: 'Pagamento confirmado!', sub: 'Sua inscrição está garantida.', cor: '#10b981' },
  pago_parcial: { titulo: 'Pagamento parcial recebido', sub: 'Recebemos parte do valor. A equipe vai falar com você.', cor: '#f59e0b' },
  criada: { titulo: 'Aguardando pagamento', sub: 'Sua vaga está reservada. Conclua o pagamento para confirmar.', cor: '#f59e0b' },
  aguardando_pagamento: { titulo: 'Aguardando pagamento', sub: 'Sua vaga está reservada. Conclua o pagamento para confirmar.', cor: '#f59e0b' },
  expirada: { titulo: 'O prazo do pagamento venceu', sub: 'A vaga voltou para a fila. Você pode se inscrever de novo se ainda houver vaga.', cor: '#ef4444' },
  cancelada: { titulo: 'Pagamento cancelado', sub: 'Se foi sem querer, faça a inscrição de novo.', cor: '#ef4444' },
  falhou: { titulo: 'O pagamento não foi aprovado', sub: 'Nada foi cobrado. Você pode tentar de novo com outro cartão ou por Pix.', cor: '#ef4444' },
  estornado: { titulo: 'Pagamento estornado', sub: 'O valor foi devolvido. Fale com a equipe se tiver dúvida.', cor: '#ef4444' },
  estornado_parcial: { titulo: 'Estorno parcial', sub: 'Parte do valor foi devolvida. Fale com a equipe.', cor: '#f59e0b' },
  chargeback: { titulo: 'Pagamento contestado', sub: 'A equipe já foi avisada e vai entrar em contato.', cor: '#ef4444' },
};

const ABERTOS = ['criada', 'aguardando_pagamento', 'pago_parcial'];

// QR do comprovante de inscrição (SPEC-06) — mostrado só com `pago` do
// servidor. Codifica /i/c/<token>, a página que a portaria escaneia na entrada.
function ComprovanteCheckin({ token, corTexto }: { token: string; corTexto: string }) {
  const [qr, setQr] = useState<string | null>(null);
  const url = `${window.location.origin}/i/c/${token}`;
  useEffect(() => {
    QRCode.toDataURL(url, { width: 480, margin: 2, color: { dark: '#000000', light: '#ffffff' } })
      .then(setQr).catch(() => setQr(null));
  }, [url]);
  if (!qr) return null;
  return (
    <div style={{ marginTop: 14, textAlign: 'center' }}>
      <div style={{ fontSize: 13, color: '#00B39D', fontWeight: 700 }}>Seu comprovante de inscrição</div>
      <div style={{ display: 'inline-block', background: '#fff', padding: 10, borderRadius: 12, marginTop: 8 }}>
        <img src={qr} alt="QR do comprovante de inscrição" style={{ width: 168, height: 168, display: 'block' }} />
      </div>
      <p style={{ fontSize: 12, color: corTexto, marginTop: 8, lineHeight: 1.5 }}>
        Apresente este QR na entrada do evento — ou abra <a href={url} style={{ color: '#00B39D', fontWeight: 600 }}>o comprovante</a> quando precisar.
      </p>
    </div>
  );
}

export default function PagamentoInscricao() {
  const { token = '' } = useParams();
  const { C } = usePublicTheme();
  const [pag, setPag] = useState<Pagamento | null>(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [qr, setQr] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  // Confete só uma vez, e só quando o SERVIDOR disse pago.
  const festejou = useRef(false);

  const carregar = useCallback(async (primeira = false) => {
    try {
      const r = await eventoPublico.pagamento(token);
      setPag(r);
      setErro('');
      if (r.pago && !festejou.current) {
        festejou.current = true;
        confetti({ particleCount: 120, spread: 90, origin: { y: 0.6 }, colors: ['#00B39D', '#00d9bd', '#ffd166', '#ffffff'] });
      }
    } catch (e: any) {
      if (primeira) setErro(e?.message || 'Não encontramos este pagamento.');
    } finally {
      if (primeira) setCarregando(false);
    }
  }, [token]);

  useEffect(() => { carregar(true); }, [carregar]);

  // Polling enquanto está em aberto. Para sozinho quando resolve — e o backend
  // consulta o provedor quando a cobrança está parada há mais de 2 min, então
  // não dependemos do webhook chegar.
  useEffect(() => {
    if (!pag || !ABERTOS.includes(pag.status)) return;
    const iv = setInterval(() => carregar(), 6000);
    // Voltar do checkout dispara uma consulta na hora, sem esperar o intervalo.
    const aoVoltar = () => { if (document.visibilityState === 'visible') carregar(); };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => { clearInterval(iv); document.removeEventListener('visibilitychange', aoVoltar); };
  }, [pag, carregar]);

  useEffect(() => {
    if (!pag?.pix_payload) { setQr(null); return; }
    QRCode.toDataURL(pag.pix_payload, { width: 640, margin: 1 })
      .then(setQr).catch(() => setQr(null));
  }, [pag?.pix_payload]);

  async function copiarPix() {
    if (!pag?.pix_payload) return;
    await navigator.clipboard.writeText(pag.pix_payload);
    setCopiado(true);
    setTimeout(() => setCopiado(false), 2500);
  }

  const t = pag ? (TEXTO[pag.status] || { titulo: 'Pagamento em análise', sub: 'Estamos conferindo com o provedor.', cor: '#f59e0b' }) : null;
  const emAberto = !!pag && ABERTOS.includes(pag.status);

  return (
    <div style={{ minHeight: '100dvh', background: C.pageBg, color: C.text, padding: '32px 16px', display: 'flex' }}>
      <PublicThemeToggle />
      <div style={{
        maxWidth: 520, width: '100%', margin: 'auto', background: C.card,
        border: `1px solid ${C.cardBorder}`, borderRadius: 18, padding: '28px 22px',
        backdropFilter: 'blur(12px)',
      }}>
        {carregando ? (
          <p style={{ textAlign: 'center', color: C.text3, fontSize: 14 }}>Carregando…</p>
        ) : erro ? (
          <>
            <h1 style={{ fontSize: 19, fontWeight: 800, margin: 0 }}>Pagamento não encontrado</h1>
            <p style={{ fontSize: 14, color: C.text3, marginTop: 8 }}>{erro}</p>
            <p style={{ fontSize: 13, color: C.textDim, marginTop: 12 }}>
              Confira o link que você recebeu. Se o problema continuar, fale com a equipe da igreja.
            </p>
          </>
        ) : pag && t ? (
          <>
            {pag.evento_nome && (
              <div style={{ fontSize: 12, color: C.text3, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {pag.evento_nome}
              </div>
            )}
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: '4px 0 0', color: t.cor }}>{t.titulo}</h1>
            <p style={{ fontSize: 14, color: C.text2, marginTop: 6 }}>{t.sub}</p>

            <div style={{
              marginTop: 16, padding: '12px 14px', borderRadius: 12,
              border: `1px solid ${C.cardBorder}`, display: 'flex', flexWrap: 'wrap',
              gap: 12, justifyContent: 'space-between', alignItems: 'center',
            }}>
              <div>
                <div style={{ fontSize: 11, color: C.text3, textTransform: 'uppercase', letterSpacing: 0.4 }}>Valor</div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{brl(pag.valor_centavos)}</div>
              </div>
              {pag.metodo && (
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 11, color: C.text3, textTransform: 'uppercase', letterSpacing: 0.4 }}>Forma</div>
                  <div style={{ fontSize: 14 }}>
                    {pag.metodo}{pag.parcelas && pag.parcelas > 1 ? ` · ${pag.parcelas}x` : ''}
                  </div>
                </div>
              )}
            </div>

            {pag.pago && pag.pago_em && (
              <p style={{ fontSize: 12.5, color: C.text3, marginTop: 10 }}>
                Pago em {new Date(pag.pago_em).toLocaleString('pt-BR')}.
              </p>
            )}

            {/* Comprovante do check-in (SPEC-06): pagou → o QR da entrada
                aparece AQUI (a tela de sucesso do formulário ficou pra trás
                quando a pessoa foi pro checkout). Sem `pago`, sem QR. */}
            {pag.pago && pag.comprovante_token && (
              <ComprovanteCheckin token={pag.comprovante_token} corTexto={C.text3} />
            )}

            {emAberto && (
              <>
                {pag.expira_em && (
                  <p style={{ fontSize: 12.5, color: '#b45309', marginTop: 10 }}>
                    Sua vaga fica reservada até {new Date(pag.expira_em).toLocaleString('pt-BR')}.
                  </p>
                )}

                {pag.checkout_url && (
                  <a href={pag.checkout_url} style={{ textDecoration: 'none' }}>
                    <button style={{
                      width: '100%', marginTop: 14, padding: '13px 18px', borderRadius: 999,
                      border: 'none', background: '#00B39D', color: '#fff',
                      fontSize: 15, fontWeight: 700, cursor: 'pointer',
                    }}>
                      Pagar agora
                    </button>
                  </a>
                )}

                {qr && (
                  <div style={{ marginTop: 18, textAlign: 'center' }}>
                    <div style={{ fontSize: 12, color: C.text3, marginBottom: 8 }}>Ou pague com Pix escaneando o código</div>
                    <img src={qr} alt="QR Code do Pix" style={{ width: 200, height: 200, borderRadius: 10, background: '#fff', padding: 8 }} />
                    <button onClick={copiarPix} style={{
                      display: 'block', margin: '10px auto 0', padding: '8px 16px', borderRadius: 999,
                      border: `1px solid ${C.inputBorder}`, background: 'transparent',
                      color: C.text2, fontSize: 13, cursor: 'pointer',
                    }}>
                      {copiado ? 'Código copiado!' : 'Copiar código Pix'}
                    </button>
                  </div>
                )}

                {pag.boleto_url && (
                  <a href={pag.boleto_url} target="_blank" rel="noreferrer"
                    style={{ display: 'block', marginTop: 12, fontSize: 13, color: '#00B39D', textAlign: 'center' }}>
                    Abrir boleto
                  </a>
                )}

                <p style={{ fontSize: 12, color: C.textDim, marginTop: 16, textAlign: 'center' }}>
                  Esta página se atualiza sozinha quando o pagamento cair. Pode deixá-la aberta.
                </p>
              </>
            )}

            {/* Prazo vencido ou pagamento recusado: o caminho de volta é
                inscrever-se de novo — não reaproveitamos cobrança terminal. */}
            {!pag.pago && !emAberto && pag.evento_slug && (
              <Link to={`/evento/${pag.evento_slug}`} style={{ textDecoration: 'none' }}>
                <button style={{
                  width: '100%', marginTop: 16, padding: '12px 18px', borderRadius: 999,
                  border: `1px solid ${C.inputBorder}`, background: 'transparent',
                  color: C.text, fontSize: 14, fontWeight: 600, cursor: 'pointer',
                }}>
                  Voltar para a inscrição
                </button>
              </Link>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
