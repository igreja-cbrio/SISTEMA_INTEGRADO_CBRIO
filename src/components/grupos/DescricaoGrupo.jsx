import { useEffect, useRef, useState } from 'react';

// Descrição do grupo com corte por LINHAS e "Conheça mais o grupo" (pedido do
// Marcos 2026-07-31: a pessoa quer saber do que o grupo trata antes de entrar).
//
// Por que cortar por linha (CSS line-clamp) e não por caractere: o corte segue a
// largura real da tela — no celular 3 linhas são ~120 caracteres, no desktop
// ~330. Cortar em N caracteres deixaria o celular com 6 linhas e o desktop com
// uma linha e meia.
//
// O botão só aparece quando o texto REALMENTE transborda (medido no DOM). Metade
// das 50 descrições passa de 200 caracteres, mas há várias de 6 ("Bíblia") — nelas
// um "Conheça mais" que não revela nada é ruído.
export default function DescricaoGrupo({
  texto,
  linhas = 3,
  cor = 'var(--cbrio-text2)',
  corBotao = '#00B39D',
  // Cartão de lista é um <button>: botão dentro de botão é HTML inválido e o
  // clique selecionaria o grupo. Lá passa expansivel={false} — o texto completo
  // aparece na confirmação, depois de escolher.
  expansivel = true,
  fontSize = 12.5,
}) {
  const limpo = (texto || '').trim();
  const ref = useRef(null);
  const [aberto, setAberto] = useState(false);
  const [transborda, setTransborda] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !limpo) { setTransborda(false); return; }
    const medir = () => {
      // Com o texto aberto não há corte pra medir; mantém o botão visível
      // (senão "Ver menos" desaparece e a pessoa fica sem como fechar).
      if (aberto) return;
      setTransborda(el.scrollHeight > el.clientHeight + 1);
    };
    medir();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, [limpo, linhas, aberto]);

  if (!limpo) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      <div
        ref={ref}
        style={{
          fontSize,
          lineHeight: 1.45,
          color: cor,
          whiteSpace: 'pre-line',
          overflowWrap: 'anywhere',
          ...(aberto ? {} : {
            display: '-webkit-box',
            WebkitBoxOrient: 'vertical',
            WebkitLineClamp: linhas,
            overflow: 'hidden',
          }),
        }}
      >
        {limpo}
      </div>
      {expansivel && transborda && (
        <button
          type="button"
          onClick={() => setAberto(v => !v)}
          style={{
            alignSelf: 'flex-start', background: 'none', border: 'none', padding: '4px 0',
            color: corBotao, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            minHeight: 32, // alvo de toque no celular
          }}
        >
          {aberto ? 'Ver menos' : 'Conheça mais o grupo'}
        </button>
      )}
    </div>
  );
}
