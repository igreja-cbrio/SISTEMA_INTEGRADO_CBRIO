// "Deseja baixar as instruções gerais?" — aparece quando a inscrição CONCLUI
// (tela de sucesso do formulário gratuito/isento e página de pagamento quando o
// Pix confirma). Usado nas duas telas de propósito: duas cópias divergiriam no
// primeiro ajuste de texto.
//
// ⚠️ O e-mail de confirmação leva o MESMO arquivo anexado, sempre — por isso o
// "Não" é honesto: recusar aqui não deixa ninguém sem as instruções. E o botão
// de baixar é um <a> de verdade (não window.open): o navegador mostra o destino
// no toque longo e bloqueador de pop-up não engole o download.
import { useState } from 'react';

export default function BaixarInstrucoes({ instrucoes, C }: {
  instrucoes: { url: string; nome?: string | null } | null | undefined;
  C: any;
}) {
  const [recusou, setRecusou] = useState(false);
  if (!instrucoes?.url) return null;

  if (recusou) {
    return (
      <p style={{ fontSize: 12.5, color: C.text3, marginTop: 16, lineHeight: 1.5 }}>
        Tudo bem — as instruções gerais também vão anexadas no seu e-mail de confirmação.
      </p>
    );
  }

  return (
    <div style={{
      marginTop: 18, padding: '14px 16px', borderRadius: 12, textAlign: 'left',
      border: '1px solid rgba(0,179,157,0.35)', background: 'rgba(0,179,157,0.07)',
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
        Deseja baixar as instruções gerais?
      </div>
      <p style={{ fontSize: 12.5, color: C.text3, margin: '4px 0 10px', lineHeight: 1.5 }}>
        {instrucoes.nome || 'Instruções gerais do evento'} — horários, o que levar e as regras.
        Elas também vão no seu e-mail de confirmação.
      </p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <a href={instrucoes.url} target="_blank" rel="noopener noreferrer" style={{
          flex: 1, minWidth: 160, textAlign: 'center', textDecoration: 'none',
          padding: '12px 16px', borderRadius: 999, background: '#00B39D', color: '#fff',
          fontSize: 14, fontWeight: 700,
        }}>
          Sim, baixar agora
        </a>
        <button type="button" onClick={() => setRecusou(true)} style={{
          flex: 1, minWidth: 160, padding: '12px 16px', borderRadius: 999, cursor: 'pointer',
          border: `1px solid ${C.cardBorder}`, background: 'transparent',
          color: C.text2, fontSize: 14, fontWeight: 600,
        }}>
          Não, recebo por e-mail
        </button>
      </div>
    </div>
  );
}
