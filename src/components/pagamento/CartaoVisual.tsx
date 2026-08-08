// ============================================================================
// Cartão DESENHADO acima do formulário de pagamento — 2026-08-07
//
// Pedido do Matheus: "queria que reconhecesse automaticamente a bandeira do
// cartão" e que a aba de cartão fosse pensada pro celular, "que é onde a maioria
// das pessoas vão se inscrever".
//
// ⚠️⚠️ ESTE COMPONENTE NÃO TEM CAMPO NENHUM, E ISSO É O DESENHO, NÃO FALTA DE
// ACABAMENTO. Os campos de cartão vivem dentro dos iframes do provedor (lei nº 5
// do núcleo de pagamentos: o PAN não toca o nosso DOM, senão a igreja entra em
// escopo PCI SAQ-D). O único dado que chega aqui é o **BIN** — os 6 primeiros
// dígitos, que identificam o EMISSOR e que o PCI trata como parte da forma
// truncada exibível — entregue pelo callback `onBinChange` do SDK.
//
// ⚠️ Por isso o cartão NÃO espelha titular, validade nem CVV: esses campos são
// do iframe e o SDK não os expõe. Desenhar linhas vazias esperando que preencham
// deixaria a tela parecendo quebrada — o rodapé mostra o que a gente SABE (o
// valor da cobrança).
//
// ⚠️ NÃO acrescentar `<input>` de cartão aqui "pra completar o desenho". É
// exatamente a mudança que troca a responsabilidade legal da igreja num
// vazamento.
// ============================================================================
import { bandeiraDoBin, formatoDoCartao, NOME_BANDEIRA, type Bandeira } from '../../lib/bandeiraCartao';

type Props = {
  /** BIN vindo do `onBinChange` do SDK. Vazio = ninguém digitou ainda. */
  bin?: string | null;
  valorCentavos: number;
  escuro?: boolean;
};

const brl = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Marca da bandeira. Tudo inline (SVG/texto) — sem asset externo, sem CDN. */
function MarcaBandeira({ bandeira }: { bandeira: Bandeira }) {
  if (!bandeira) {
    return <span style={{ fontSize: 11, letterSpacing: 1.4, opacity: 0.55, fontWeight: 700 }}>CARTÃO</span>;
  }
  const rotulo = NOME_BANDEIRA[bandeira];

  if (bandeira === 'mastercard') {
    return (
      <svg width="46" height="30" viewBox="0 0 46 30" role="img" aria-label={rotulo}>
        <circle cx="17" cy="15" r="10.5" fill="#EB001B" />
        <circle cx="29" cy="15" r="10.5" fill="#F79E1B" opacity="0.9" />
        <path
          d="M23 6.8a10.5 10.5 0 000 16.4 10.5 10.5 0 000-16.4z"
          fill="#FF5F00"
        />
      </svg>
    );
  }

  const wordmark: Record<string, { texto: string; cor: string; estilo?: React.CSSProperties }> = {
    visa: { texto: 'VISA', cor: '#F7F9FF', estilo: { fontStyle: 'italic', letterSpacing: 2 } },
    elo: { texto: 'elo', cor: '#FFF', estilo: { textTransform: 'lowercase', letterSpacing: 0.5 } },
    hipercard: { texto: 'Hipercard', cor: '#FF6B6B', estilo: { letterSpacing: 0.2, fontSize: 13 } },
    amex: { texto: 'AMEX', cor: '#6FC5FF', estilo: { letterSpacing: 1.5 } },
    diners: { texto: 'Diners', cor: '#E8EEF7', estilo: { letterSpacing: 0.4, fontSize: 13 } },
    discover: { texto: 'Discover', cor: '#FFB05C', estilo: { letterSpacing: 0.3, fontSize: 13 } },
    jcb: { texto: 'JCB', cor: '#E8EEF7', estilo: { letterSpacing: 1.5 } },
    aura: { texto: 'Aura', cor: '#E8EEF7', estilo: { letterSpacing: 0.4, fontSize: 13 } },
  };
  const m = wordmark[bandeira];
  return (
    <span role="img" aria-label={rotulo} style={{
      fontSize: 17, fontWeight: 800, color: m.cor, lineHeight: 1, ...m.estilo,
    }}>
      {m.texto}
      {bandeira === 'elo' && (
        <span style={{ display: 'inline-flex', gap: 2, marginLeft: 3, verticalAlign: 'middle' }}>
          <i style={{ width: 5, height: 5, borderRadius: 5, background: '#FFCB05', display: 'block' }} />
          <i style={{ width: 5, height: 5, borderRadius: 5, background: '#00A4E0', display: 'block' }} />
          <i style={{ width: 5, height: 5, borderRadius: 5, background: '#EF4123', display: 'block' }} />
        </span>
      )}
    </span>
  );
}

export default function CartaoVisual({ bin, valorCentavos, escuro = true }: Props) {
  const digitos = String(bin || '').replace(/\D/g, '');
  const bandeira = bandeiraDoBin(digitos);
  const { grupos } = formatoDoCartao(bandeira);

  // Monta os grupos: dígito real onde o BIN alcança, ponto onde não alcança.
  // ⚠️ O BIN tem 6 (às vezes 8) dígitos — o resto do número NUNCA chega aqui.
  let consumidos = 0;
  const blocos = grupos.map((tam) => {
    const chars: Array<string | null> = [];
    for (let i = 0; i < tam; i += 1) {
      chars.push(consumidos < digitos.length ? digitos[consumidos] : null);
      consumidos += 1;
    }
    return chars;
  });

  return (
    <div className="cc-visual" aria-hidden="true">
      <div className="cc-visual__brilho" />
      <div className="cc-visual__topo">
        <span className="cc-visual__marca">CBRio</span>
        <MarcaBandeira bandeira={bandeira} />
      </div>

      <div className="cc-visual__chip">
        <span /><span /><span />
      </div>

      <div className="cc-visual__numero">
        {blocos.map((bloco, gi) => (
          <span className="cc-visual__grupo" key={gi}>
            {bloco.map((ch, i) => (
              <span key={i} className={`cc-visual__dig ${ch ? 'preenchido' : ''}`}>
                {ch ?? '•'}
              </span>
            ))}
          </span>
        ))}
      </div>

      <div className="cc-visual__rodape">
        <div>
          <div className="cc-visual__rotulo">Valor</div>
          <div className="cc-visual__valor">{brl(valorCentavos)}</div>
        </div>
        <div className="cc-visual__seguro">
          {/* Cadeado: o mesmo sinal do botão de pagar. */}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
            <rect x="4" y="10" width="16" height="11" rx="2.5" />
            <path d="M8 10V7a4 4 0 018 0v3" />
          </svg>
          <span>Protegido</span>
        </div>
      </div>

      <style>{`
        .cc-visual {
          position: relative;
          width: 100%;
          max-width: 380px;
          margin: 0 auto 18px;
          aspect-ratio: 1.586;      /* proporção real de um cartão (ISO/IEC 7810 ID-1) */
          border-radius: 16px;
          padding: clamp(14px, 4.6vw, 20px);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          overflow: hidden;
          color: #fff;
          background: linear-gradient(140deg, #0f2f2b 0%, #0a1c22 55%, #05090c 100%);
          box-shadow: 0 18px 38px -18px rgba(0,0,0,.75), inset 0 1px 0 rgba(255,255,255,.08);
          border: 1px solid ${escuro ? 'rgba(255,255,255,.09)' : 'rgba(255,255,255,.14)'};
        }
        /* Halo do acento da casa. Fica em ::before pra não custar um nó a mais. */
        .cc-visual::before {
          content: '';
          position: absolute;
          width: 260px; height: 260px;
          border-radius: 50%;
          background: radial-gradient(circle, rgba(0,179,157,.55) 0%, rgba(0,179,157,0) 68%);
          top: -120px; right: -90px;
          pointer-events: none;
        }
        .cc-visual__brilho {
          position: absolute; inset: 0;
          background: linear-gradient(115deg, rgba(255,255,255,.10) 0%, rgba(255,255,255,0) 42%);
          pointer-events: none;
        }
        .cc-visual__topo {
          position: relative; z-index: 1;
          display: flex; align-items: center; justify-content: space-between;
          min-height: 30px;
        }
        .cc-visual__marca {
          font-size: clamp(13px, 3.6vw, 15px); font-weight: 800; letter-spacing: .3px;
        }
        .cc-visual__chip {
          position: relative; z-index: 1;
          width: 38px; height: 28px; border-radius: 6px;
          background: linear-gradient(150deg, #e6c877, #b8912f 55%, #f0dfa4);
          display: flex; flex-direction: column; justify-content: center; gap: 3px;
          padding: 0 5px;
        }
        .cc-visual__chip span { display:block; height: 1.5px; background: rgba(0,0,0,.28); border-radius: 2px; }
        .cc-visual__chip span:nth-child(2) { width: 70%; }

        .cc-visual__numero {
          position: relative; z-index: 1;
          display: flex; flex-wrap: nowrap; gap: clamp(8px, 2.6vw, 14px);
          font-variant-numeric: tabular-nums;
          font-size: clamp(15px, 5.1vw, 21px);
          font-weight: 600;
          letter-spacing: .5px;
        }
        .cc-visual__grupo { display: inline-flex; gap: 1px; }
        .cc-visual__dig {
          display: inline-block;
          min-width: .62em;
          text-align: center;
          color: rgba(255,255,255,.34);
          transition: color .18s ease, transform .18s ease;
        }
        .cc-visual__dig.preenchido {
          color: #fff;
          transform: translateY(-1px);
        }

        .cc-visual__rodape {
          position: relative; z-index: 1;
          display: flex; align-items: flex-end; justify-content: space-between; gap: 10px;
        }
        .cc-visual__rotulo {
          font-size: 9.5px; letter-spacing: 1.3px; text-transform: uppercase;
          color: rgba(255,255,255,.55); font-weight: 700;
        }
        .cc-visual__valor { font-size: clamp(15px, 4.4vw, 18px); font-weight: 800; }
        .cc-visual__seguro {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 10.5px; font-weight: 700; letter-spacing: .3px;
          color: rgba(255,255,255,.62);
        }

        /* Telas muito estreitas: o número não pode quebrar linha nem transbordar. */
        @media (max-width: 360px) {
          .cc-visual__numero { gap: 6px; font-size: 14px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .cc-visual__dig { transition: none; }
        }
      `}</style>
    </div>
  );
}
