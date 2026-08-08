// ============================================================================
// Cartão NA PRÓPRIA PÁGINA (Card Payment Brick do Mercado Pago) — 2026-08-06
//
// Existe por um pedido do Matheus: *"tem alguma possibilidade de, no momento do
// pagamento, a pessoa NÃO ser direcionada para outra página da web? às vezes
// pode ter pessoas que ficam com medo disso"*. Este componente é a resposta —
// o formulário fica aqui e o salto pro site do provedor deixa de existir.
//
// ⚠️ O QUE SAI DAQUI É TOKEN, NUNCA O NÚMERO DO CARTÃO. Os campos são do SDK do
// provedor (iframes dele), o cartão é tokenizado NO NAVEGADOR e o nosso servidor
// recebe só `token` + meio/emissor/parcelas. É isso que mantém a lei nº 5 do
// núcleo de pagamentos intacta enquanto tira o redirecionamento: o PAN não passa
// pelo nosso Express, então a aplicação da igreja não entra em escopo PCI SAQ-D.
//
// ⚠️ NÃO acrescentar aqui campo próprio de número/CVV/validade "pra ficar mais
// bonito". No momento em que um dígito de cartão tocar o nosso DOM, a
// responsabilidade legal da igreja num vazamento muda de patamar.
//
// ⚠️ O VALOR é informado ao SDK só pra ele calcular as parcelas na tela. Quem
// decide quanto cobrar é o servidor, a partir da cobrança — o `transaction_amount`
// que este formulário devolve é ignorado lá.
// ============================================================================
import { useEffect, useRef, useState } from 'react';
import CartaoVisual from './CartaoVisual';

const SDK_URL = 'https://sdk.mercadopago.com/js/v2';
const CONTAINER_ID = 'cbrio-cartao-brick';

declare global {
  interface Window { MercadoPago?: any }
}

/** Carrega o SDK uma vez por página, mesmo com dois componentes montando. */
let sdkPromise: Promise<void> | null = null;
function carregarSdk(): Promise<void> {
  if (window.MercadoPago) return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SDK_URL;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      // Deixa tentar de novo numa próxima montagem em vez de travar pra sempre.
      sdkPromise = null;
      reject(new Error('Não foi possível carregar o formulário de cartão.'));
    };
    document.head.appendChild(s);
  });
  return sdkPromise;
}

export type CartaoBrickProps = {
  publicKey: string;
  valorCentavos: number;
  /** Teto de parcelas do evento (NULL/0 = 1x). */
  parcelasMax?: number | null;
  /** Recebe o formData do Brick (token + meio + parcelas). Deve LANÇAR em erro. */
  onPagar: (formData: any) => Promise<void>;
  /** Caminho de reserva: checkout hospedado, quando existir. */
  checkoutUrl?: string | null;
  corTexto?: string;
  corTextoFraco?: string;
  /** Paleta da página, pro formulário não parecer um bloco colado de fora. */
  escuro?: boolean;
  corFundoInput?: string;
  corBorda?: string;
};

// Verde da casa (mesmo `C.primary` do sistema). O Brick aceita 34 variáveis
// visuais; estas são as que mudam a percepção — cor de ação, texto, fundo de
// campo, raio e foco. O resto herda do tema.
const VERDE_CBRIO = '#00B39D';

export default function CartaoBrick({
  publicKey, valorCentavos, parcelasMax, onPagar, checkoutUrl,
  corTexto = '#111', corTextoFraco = '#666',
  escuro = false, corFundoInput, corBorda,
}: CartaoBrickProps) {
  const [estado, setEstado] = useState<'carregando' | 'pronto' | 'erro'>('carregando');
  const [erro, setErro] = useState<string | null>(null);
  // ⚠️ BIN — os 6 primeiros dígitos, que identificam o EMISSOR e que o SDK nos
  // entrega de propósito. É o ÚNICO pedaço do cartão que existe do nosso lado, e
  // é o que faz a bandeira aparecer sozinha no desenho. O número completo segue
  // dentro do iframe do provedor (lei nº 5).
  const [bin, setBin] = useState<string | null>(null);
  const [pagando, setPagando] = useState(false);
  const [erroPagamento, setErroPagamento] = useState<string | null>(null);
  const controller = useRef<any>(null);
  // ⚠️ `onPagar` numa ref: o Brick é criado UMA vez e guarda o callback que
  // recebeu. Sem a ref, a versão capturada envelheceria e o submit mandaria
  // estado velho — e em pagamento isso significa cobrar com dado desatualizado.
  const onPagarRef = useRef(onPagar);
  onPagarRef.current = onPagar;

  const teto = Math.max(1, Math.min(Number(parcelasMax) > 0 ? Number(parcelasMax) : 1, 12));

  /**
   * Nosso botão de pagar (o do Brick está escondido).
   *
   * ⚠️ As duas falhas são DIFERENTES e não podem virar a mesma mensagem:
   *  · `getFormData()` rejeitar = campo inválido/incompleto. O Brick JÁ pinta o
   *    campo e diz o que falta — uma mensagem nossa por cima só competiria com a
   *    dele, e apontando pra lugar nenhum.
   *  · `onPagar` lançar = o pagamento foi tentado e não passou (recusa do
   *    emissor, provedor fora do ar). Aí a pessoa PRECISA ler o motivo, senão o
   *    botão só gira e ela não sabe se pagou.
   */
  async function pagarDaqui() {
    if (pagando) return;
    setErroPagamento(null);
    setPagando(true);

    let dados: any;
    try {
      dados = await controller.current?.getFormData?.();
    } catch {
      setPagando(false);
      return;   // o Brick já sinalizou o campo
    }
    if (!dados) { setPagando(false); return; }

    try {
      await onPagarRef.current(dados);
    } catch (e: any) {
      setErroPagamento(e?.message || 'Não conseguimos concluir o pagamento. Tente de novo.');
    } finally {
      setPagando(false);
    }
  }

  useEffect(() => {
    let vivo = true;

    (async () => {
      try {
        await carregarSdk();
        if (!vivo) return;

        const mp = new window.MercadoPago(publicKey, { locale: 'pt-BR' });
        const bricks = mp.bricks();

        // Remonta limpo: Brick criado duas vezes no mesmo container duplica o
        // formulário (acontece em StrictMode e em re-render).
        if (controller.current?.unmount) {
          try { controller.current.unmount(); } catch { /* já desmontado */ }
        }

        controller.current = await bricks.create('cardPayment', CONTAINER_ID, {
          initialization: {
            // Em reais — é o que o SDK usa pra montar as opções de parcela.
            amount: Math.round(valorCentavos) / 100,
          },
          customization: {
            paymentMethods: { minInstallments: 1, maxInstallments: teto },
            visual: {
              // ⚠️ `hideFormTitle`: a nossa página JÁ tem título ("Pagar com
              // cartão"). Sem isto aparecem dois títulos, e é o que faz o
              // formulário parecer um bloco colado de fora.
              hideFormTitle: true,
              // ⚠️ O botão de pagar passa a ser NOSSO (`getFormData()` abaixo).
              // Motivo: o espaço entre o último campo e o botão é interno ao
              // Brick e não tem variável que o controle — o e-mail ficava colado
              // no botão. E a doc do MP diz explicitamente pra NÃO estilizar por
              // classe/id deles ("são gerados no build e mudam regularmente"),
              // então mexer por CSS quebraria sozinho num dia qualquer.
              // De quebra, o botão fica igual ao resto da página.
              hidePaymentButton: true,
              style: {
                theme: escuro ? 'dark' : 'default',
                customVariables: {
                  baseColor: VERDE_CBRIO,
                  buttonTextColor: '#ffffff',
                  textPrimaryColor: corTexto,
                  textSecondaryColor: corTextoFraco,
                  ...(corFundoInput ? { inputBackgroundColor: corFundoInput } : {}),
                  ...(corBorda ? { outlineSecondaryColor: corBorda } : {}),
                  // Raio e espaçamento da casa (os botões da página são 999).
                  borderRadiusSmall: '8px',
                  borderRadiusMedium: '10px',
                  borderRadiusLarge: '12px',
                  borderRadiusFull: '999px',
                  // Campo mais alto = alvo de toque maior no celular, que é onde
                  // a maioria se inscreve.
                  inputVerticalPadding: '14px',
                  inputHorizontalPadding: '14px',
                  // ⚠️ Era `0px`, e no celular isso fazia os campos encostarem na
                  // borda do cartão branco da página (o `.pgto-card` só tem 14px
                  // de folga lateral ali). Uma folga própria do formulário é o
                  // que separa "formulário dentro do cartão" de "formulário
                  // espremido contra a borda".
                  formPadding: '4px',
                  fontSizeMedium: '16px',   // 16px evita o zoom automático do iOS
                },
              },
            },
          },
          callbacks: {
            onReady: () => { if (vivo) setEstado('pronto'); },
            // Dispara a cada tecla no campo do número. ⚠️ Só guardamos DÍGITO:
            // o SDK manda string, e um `slice` defensivo garante que nada além
            // do BIN entre no estado nem que ele cresça se o contrato mudar.
            onBinChange: (b: any) => {
              if (!vivo) return;
              const d = String(b || '').replace(/\D/g, '').slice(0, 8);
              setBin(d || null);
            },
            onSubmit: (formData: any) => onPagarRef.current(formData),
            onError: (e: any) => {
              // Erro de validação do próprio formulário (campo inválido) já é
              // mostrado pelo Brick — aqui só o que impede usar.
              if (!vivo) return;
              console.warn('[CartaoBrick]', e?.message || e);
            },
          },
        });
      } catch (e: any) {
        if (!vivo) return;
        setErro(e?.message || 'Não foi possível carregar o formulário de cartão.');
        setEstado('erro');
      }
    })();

    return () => {
      vivo = false;
      if (controller.current?.unmount) {
        try { controller.current.unmount(); } catch { /* já desmontado */ }
      }
      controller.current = null;
    };
    // Recria quando o valor ou o teto mudam — as parcelas exibidas dependem dos dois.
  }, [publicKey, valorCentavos, teto, escuro, corTexto, corTextoFraco, corFundoInput, corBorda]);

  if (estado === 'erro') {
    return (
      <div style={{ marginTop: 14 }}>
        <p style={{ fontSize: 13, color: '#b45309' }}>{erro}</p>
        {checkoutUrl && (
          <>
            <p style={{ fontSize: 12.5, color: corTextoFraco, marginTop: 6 }}>
              Você ainda pode concluir na página do provedor de pagamento.
            </p>
            <a href={checkoutUrl} style={{ textDecoration: 'none' }}>
              <button style={{
                width: '100%', marginTop: 10, padding: '13px 18px', borderRadius: 999,
                border: 'none', background: '#00B39D', color: '#fff',
                fontSize: 15, fontWeight: 700, cursor: 'pointer',
              }}>
                Pagar com cartão
              </button>
            </a>
          </>
        )}
      </div>
    );
  }

  return (
    <div style={{ marginTop: 14 }}>
      {/* Desenho do cartão. Some enquanto o formulário não está de pé — cartão
          bonito sobre um formulário que não carregou é promessa que a tela não
          cumpre. */}
      {estado === 'pronto' && (
        <CartaoVisual bin={bin} valorCentavos={valorCentavos} escuro={escuro} />
      )}
      {estado === 'carregando' && (
        <p style={{ fontSize: 13, color: corTextoFraco }}>Carregando o formulário seguro…</p>
      )}
      {/* `pgto-cartao` (definido no CSS da página) impede o iframe do SDK de
          empurrar a página no celular — iframe não encolhe sozinho. */}
      <div className="pgto-cartao" id={CONTAINER_ID} />

      {estado === 'pronto' && (
        <>
          {erroPagamento && (
            <p role="alert" style={{
              fontSize: 13, color: '#ef4444', marginTop: 14, lineHeight: 1.5,
            }}>
              {erroPagamento}
            </p>
          )}
          {/* ⚠️ 20px de respiro do último campo: era o botão do Brick colado no
              e-mail que fazia a tela parecer apertada. Botão da casa (raio 999,
              48px de alvo), igual ao resto da página. */}
          <button
            type="button"
            className="pgto-acao"
            onClick={pagarDaqui}
            disabled={pagando}
            style={{
              width: '100%', marginTop: 20, padding: '14px 18px', borderRadius: 999,
              border: 'none', background: pagando ? '#0d8d7d' : VERDE_CBRIO, color: '#fff',
              fontSize: 16, fontWeight: 700,
              cursor: pagando ? 'progress' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
              <rect x="4" y="10" width="16" height="11" rx="2.5" />
              <path d="M8 10V7a4 4 0 018 0v3" />
            </svg>
            {pagando ? 'Processando…' : 'Pagar'}
          </button>
        </>
      )}

      <p style={{ fontSize: 12.5, color: corTexto, marginTop: 10 }}>
        Você paga aqui mesmo, sem sair desta página.
      </p>
      <p style={{ fontSize: 11.5, color: corTextoFraco, marginTop: 4 }}>
        Os dados do cartão vão criptografados direto ao provedor de pagamento.
        A igreja não recebe nem guarda o número do seu cartão.
      </p>
    </div>
  );
}
