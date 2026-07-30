// Página pública de pagamento da inscrição · /pagamento/:token
//
// É AQUI que a pessoa escolhe como pagar, e é aqui que ela volta pra conferir.
//
// ⚠️ Divisão que não deve ser mexida sem entender o motivo: **Pix e boleto são
// nativos** (QR e linha digitável não são dados sensíveis) e **cartão sai pro
// checkout do Asaas**. Número de cartão não entra no nosso domínio, no nosso
// Express nem nos nossos logs (lei nº 5 do núcleo de pagamentos) — coletar PAN
// em formulário nosso ampliaria o escopo PCI-DSS da igreja.
//
// ⚠️ LEI: nenhuma confirmação — texto, confete, "está tudo certo" — sem
// `pago === true` LIDO DO SERVIDOR. Quem decide é `pag_cobrancas.status`, nunca
// o fato de a pessoa ter voltado do checkout (voltar não é pagar).
//
// Acessada pelo `public_token`, nunca pelo uuid da cobrança.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  metodos: string[] | null;
  parcelas_max: number | null;
  checkout_url: string | null;
  pix_payload: string | null;
  boleto_linha_digitavel: string | null;
  boleto_url: string | null;
  expira_em: string | null;
  pago_em: string | null;
  evento_nome: string | null;
  evento_slug: string | null;
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

const METODO_LABEL: Record<string, string> = { pix: 'Pix', cartao: 'Cartão', boleto: 'Boleto' };
// Pix primeiro de propósito: cai na hora e é o que a maioria usa. Boleto por
// último — leva dias úteis pra compensar.
const ORDEM_METODOS = ['pix', 'cartao', 'boleto'];

export default function PagamentoInscricao() {
  const { token = '' } = useParams();
  const { C } = usePublicTheme();
  const [pag, setPag] = useState<Pagamento | null>(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [qr, setQr] = useState<string | null>(null);
  // Guarda O QUE foi copiado (Pix ou boleto), pra dar retorno no botão certo.
  const [copiado, setCopiado] = useState('');
  const [metodoSel, setMetodoSel] = useState<string | null>(null);
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

  async function copiar(qual: string, texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(qual);
      setTimeout(() => setCopiado(''), 2500);
    } catch {
      // Navegador sem permissão de clipboard: o código segue visível na tela
      // pra copiar à mão. Não vale quebrar a tela por isso.
    }
  }

  const t = pag ? (TEXTO[pag.status] || { titulo: 'Pagamento em análise', sub: 'Estamos conferindo com o provedor.', cor: '#f59e0b' }) : null;
  const emAberto = !!pag && ABERTOS.includes(pag.status);

  /**
   * O que a tela oferece = formas que o EVENTO aceita ∩ formas que sabemos
   * apresentar agora. Cobrança antiga sem `metodos` cai nos três (é o
   * comportamento que existia antes deste seletor).
   *
   * ⚠️ Cada forma tem um caminho nativo e um de reserva pelo checkout: se o
   * provedor não devolveu o artefato (QR do Pix, linha do boleto), a aba não
   * mente nem aparece vazia — ela manda pro ambiente do Asaas, que sempre sabe
   * cobrar. Isso mantém a tela honesta se o Pix vier só depois da escolha.
   */
  const metodos = useMemo(() => {
    if (!pag) return [];
    const base = pag.metodos?.length ? pag.metodos : ORDEM_METODOS;
    return base
      .filter(m => {
        if (m === 'pix') return !!pag.pix_payload || !!pag.checkout_url;
        if (m === 'cartao') return !!pag.checkout_url;
        if (m === 'boleto') return !!pag.boleto_url || !!pag.boleto_linha_digitavel || !!pag.checkout_url;
        return false;
      })
      .sort((a, b) => ORDEM_METODOS.indexOf(a) - ORDEM_METODOS.indexOf(b));
  }, [pag]);

  // Pré-seleciona a primeira forma (Pix, quando há). Só uma vez — se a pessoa
  // trocou de aba, o polling não deve arrastá-la de volta.
  useEffect(() => {
    if (!metodoSel && metodos.length) setMetodoSel(metodos[0]);
  }, [metodos, metodoSel]);

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

            {emAberto && (
              <>
                {pag.expira_em && (
                  <p style={{ fontSize: 12.5, color: '#b45309', marginTop: 10 }}>
                    Sua vaga fica reservada até {new Date(pag.expira_em).toLocaleString('pt-BR')}.
                  </p>
                )}

                {metodos.length > 1 && (
                  <div style={{ display: 'flex', gap: 6, marginTop: 16 }}>
                    {metodos.map(m => (
                      <button key={m} onClick={() => setMetodoSel(m)} style={{
                        flex: 1, padding: '10px 8px', borderRadius: 10, cursor: 'pointer',
                        border: `1px solid ${metodoSel === m ? '#00B39D' : C.inputBorder}`,
                        background: metodoSel === m ? 'rgba(0,179,157,0.12)' : 'transparent',
                        color: metodoSel === m ? '#00B39D' : C.text2,
                        fontSize: 14, fontWeight: metodoSel === m ? 700 : 500,
                      }}>
                        {METODO_LABEL[m] || m}
                      </button>
                    ))}
                  </div>
                )}

                {metodoSel === 'pix' && (
                  qr ? (
                    <div style={{ marginTop: 16, textAlign: 'center' }}>
                      <img src={qr} alt="QR Code do Pix" style={{ width: 200, height: 200, borderRadius: 10, background: '#fff', padding: 8 }} />
                      <p style={{ fontSize: 12.5, color: C.text3, margin: '10px 0 0' }}>
                        Abra o app do seu banco, escolha Pix e leia o código. Cai na hora.
                      </p>
                      <button onClick={() => copiar('pix', pag.pix_payload || '')} style={{
                        display: 'block', margin: '10px auto 0', padding: '10px 18px', borderRadius: 999,
                        border: `1px solid ${C.inputBorder}`, background: 'transparent',
                        color: C.text2, fontSize: 13, cursor: 'pointer',
                      }}>
                        {copiado === 'pix' ? 'Código copiado!' : 'Copiar código Pix'}
                      </button>
                    </div>
                  ) : (
                    <>
                      <p style={{ fontSize: 13, color: C.text2, marginTop: 14 }}>
                        Você conclui o Pix no ambiente do Asaas, que processa o pagamento da igreja.
                      </p>
                      {pag.checkout_url && (
                        <a href={pag.checkout_url} style={{ textDecoration: 'none' }}>
                          <button style={{
                            width: '100%', marginTop: 10, padding: '13px 18px', borderRadius: 999,
                            border: 'none', background: '#00B39D', color: '#fff',
                            fontSize: 15, fontWeight: 700, cursor: 'pointer',
                          }}>
                            Pagar com Pix
                          </button>
                        </a>
                      )}
                    </>
                  )
                )}

                {metodoSel === 'cartao' && (
                  <>
                    <p style={{ fontSize: 13, color: C.text2, marginTop: 14 }}>
                      Você digita os dados do cartão no ambiente seguro do Asaas.
                      {pag.parcelas_max && pag.parcelas_max > 1
                        ? ` Dá para parcelar em até ${pag.parcelas_max}x.`
                        : ''}
                    </p>
                    <p style={{ fontSize: 12, color: C.textDim, marginTop: 6 }}>
                      A igreja não recebe nem guarda o número do seu cartão.
                    </p>
                    {pag.checkout_url && (
                      <a href={pag.checkout_url} style={{ textDecoration: 'none' }}>
                        <button style={{
                          width: '100%', marginTop: 10, padding: '13px 18px', borderRadius: 999,
                          border: 'none', background: '#00B39D', color: '#fff',
                          fontSize: 15, fontWeight: 700, cursor: 'pointer',
                        }}>
                          Pagar com cartão
                        </button>
                      </a>
                    )}
                  </>
                )}

                {metodoSel === 'boleto' && (
                  <>
                    <p style={{ fontSize: 12.5, color: '#b45309', marginTop: 14 }}>
                      O boleto leva até 3 dias úteis para compensar. Sua vaga fica reservada
                      nesse tempo, mas se o prazo acima vencer antes, ela volta para a fila.
                    </p>
                    {pag.boleto_linha_digitavel && (
                      <>
                        <div style={{
                          marginTop: 12, padding: '10px 12px', borderRadius: 10,
                          border: `1px solid ${C.inputBorder}`, background: C.optionBg,
                          fontFamily: 'ui-monospace, monospace', fontSize: 13,
                          wordBreak: 'break-all', color: C.text,
                        }}>
                          {pag.boleto_linha_digitavel}
                        </div>
                        <button onClick={() => copiar('boleto', pag.boleto_linha_digitavel || '')} style={{
                          display: 'block', margin: '10px auto 0', padding: '10px 18px', borderRadius: 999,
                          border: `1px solid ${C.inputBorder}`, background: 'transparent',
                          color: C.text2, fontSize: 13, cursor: 'pointer',
                        }}>
                          {copiado === 'boleto' ? 'Linha copiada!' : 'Copiar linha digitável'}
                        </button>
                      </>
                    )}
                    {(pag.boleto_url || pag.checkout_url) && (
                      <a href={pag.boleto_url || pag.checkout_url || '#'} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                        <button style={{
                          width: '100%', marginTop: 10, padding: '13px 18px', borderRadius: 999,
                          border: pag.boleto_linha_digitavel ? `1px solid ${C.inputBorder}` : 'none',
                          background: pag.boleto_linha_digitavel ? 'transparent' : '#00B39D',
                          color: pag.boleto_linha_digitavel ? C.text : '#fff',
                          fontSize: 15, fontWeight: 700, cursor: 'pointer',
                        }}>
                          {pag.boleto_url ? 'Abrir boleto em PDF' : 'Gerar boleto'}
                        </button>
                      </a>
                    )}
                  </>
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
