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
};

export default function CartaoBrick({
  publicKey, valorCentavos, parcelasMax, onPagar, checkoutUrl,
  corTexto = '#111', corTextoFraco = '#666',
}: CartaoBrickProps) {
  const [estado, setEstado] = useState<'carregando' | 'pronto' | 'erro'>('carregando');
  const [erro, setErro] = useState<string | null>(null);
  const controller = useRef<any>(null);
  // ⚠️ `onPagar` numa ref: o Brick é criado UMA vez e guarda o callback que
  // recebeu. Sem a ref, a versão capturada envelheceria e o submit mandaria
  // estado velho — e em pagamento isso significa cobrar com dado desatualizado.
  const onPagarRef = useRef(onPagar);
  onPagarRef.current = onPagar;

  const teto = Math.max(1, Math.min(Number(parcelasMax) > 0 ? Number(parcelasMax) : 1, 12));

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
            visual: { style: { theme: 'default' } },
          },
          callbacks: {
            onReady: () => { if (vivo) setEstado('pronto'); },
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
  }, [publicKey, valorCentavos, teto]);

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
      {estado === 'carregando' && (
        <p style={{ fontSize: 13, color: corTextoFraco }}>Carregando o formulário seguro…</p>
      )}
      <div id={CONTAINER_ID} />
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
