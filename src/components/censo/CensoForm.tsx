// Formulário do censo: um bloco por tela, com progresso e validação por bloco.
//
// A decisão de UI que mais importa aqui é NÃO pôr 93 campos numa rolagem única.
// Bloco por tela dá três coisas de graça: a pessoa vê o fim se aproximando,
// erra menos (valida 6 campos por vez em vez de 93 no final) e a condicional
// encurta o formulário de verdade — bloco cujo conteúdo todo ficou invisível
// simplesmente não existe.
import { useMemo, useState } from 'react';
import type { Pergunta, Respostas } from '@/lib/censoForm';
import { blocosVisiveis, faltando, progresso } from '@/lib/censoForm';
import PerguntaCampo from './PerguntaCampo';
import { usePublicPalette } from '@/pages/public/publicTheme';

type Props = {
  perguntas: Pergunta[];
  respostas: Respostas;
  onChange: (respostas: Respostas) => void;
  /** Chamado quando a pessoa CONCLUI um bloco. É o checkpoint do salvar-e-retomar:
   *  salvar por bloco em vez de a cada 4s de digitação corta a carga em 9x num
   *  culto de 2.500 pessoas (300 mil requisições viram 32 mil). */
  onBlocoConcluido?: (respostas: Respostas) => void;
  onEnviar: () => void;
  enviando?: boolean;
  consentimentoTexto?: string | null;
  consentimento: boolean;
  onConsentimento: (v: boolean) => void;
};

const TEAL = '#00B39D';

export default function CensoForm({
  perguntas, respostas, onChange, onBlocoConcluido, onEnviar, enviando,
  consentimentoTexto, consentimento, onConsentimento,
}: Props) {
  const c = usePublicPalette();
  const [passo, setPasso] = useState(0);
  const [mostrarErros, setMostrarErros] = useState(false);

  const blocos = useMemo(() => blocosVisiveis(perguntas, respostas), [perguntas, respostas]);
  const prog = useMemo(() => progresso(perguntas, respostas), [perguntas, respostas]);

  // O passo pode passar do fim quando uma condicional some e o bloco desaparece.
  const idx = Math.min(passo, Math.max(0, blocos.length - 1));
  const bloco = blocos[idx];
  const ultimo = idx >= blocos.length - 1;

  const faltandoNoBloco = useMemo(
    () => (bloco ? faltando(bloco.perguntas, respostas) : []),
    [bloco, respostas],
  );
  const faltandoIds = new Set(faltandoNoBloco.map((p) => p.id));

  function setResposta(id: string, valor: unknown) {
    const proximas = { ...respostas };
    if (valor === null || valor === undefined || valor === '') delete proximas[id];
    else proximas[id] = valor;
    onChange(proximas);
  }

  function avancar() {
    if (faltandoNoBloco.length) { setMostrarErros(true); return; }
    setMostrarErros(false);
    if (!ultimo) {
      onBlocoConcluido?.(respostas);       // checkpoint do rascunho
      setPasso(idx + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    // Última rede antes de enviar: o formulário pode ter mudado de forma no
    // caminho (a pessoa voltou e trocou uma condicional).
    const tudo = faltando(perguntas, respostas);
    if (tudo.length) {
      const primeiro = blocos.findIndex((b) => b.perguntas.some((p) => p.id === tudo[0].id));
      setMostrarErros(true);
      if (primeiro >= 0) { setPasso(primeiro); window.scrollTo({ top: 0, behavior: 'smooth' }); }
      return;
    }
    if (!consentimento) { setMostrarErros(true); return; }
    onEnviar();
  }

  if (!bloco) return null;

  const btn = (primario: boolean): React.CSSProperties => ({
    padding: '13px 20px', borderRadius: 10, fontSize: 15, fontWeight: primario ? 600 : 400,
    cursor: enviando ? 'wait' : 'pointer', fontFamily: 'inherit',
    border: primario ? 'none' : `1px solid ${c.inputBorder}`,
    background: primario ? TEAL : 'transparent',
    color: primario ? '#062b26' : c.text3,
  });

  return (
    <div>
      {/* progresso */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: c.textDim, marginBottom: 6 }}>
          <span>Parte {idx + 1} de {blocos.length}</span>
          <span>{prog.feitas} de {prog.total} respondidas</span>
        </div>
        <div style={{ height: 5, borderRadius: 3, background: c.inputBorder, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${prog.pct}%`, background: TEAL, transition: 'width .25s' }} />
        </div>
      </div>

      <h2 style={{ fontSize: 17, fontWeight: 600, color: c.text, margin: '0 0 18px' }}>{bloco.titulo}</h2>

      <div style={{ display: 'grid', gap: 22 }}>
        {bloco.perguntas.map((p) => (
          <div key={p.id}>
            <label style={{ display: 'block', fontSize: 15, color: c.text, marginBottom: 4, lineHeight: 1.4 }}>
              {p.texto}
              {p.obrigatoria && <span style={{ color: c.textDim }}> *</span>}
            </label>
            {p.descricao && (
              <p style={{ fontSize: 13, color: c.text3, margin: '0 0 8px', lineHeight: 1.4 }}>{p.descricao}</p>
            )}
            {!p.descricao && <div style={{ height: 6 }} />}
            <PerguntaCampo
              pergunta={p}
              valor={respostas[p.id]}
              onChange={(v) => setResposta(p.id, v)}
              faltando={mostrarErros && faltandoIds.has(p.id)}
            />
          </div>
        ))}
      </div>

      {/* consentimento · só no último passo */}
      {ultimo && consentimentoTexto && (
        <div style={{
          marginTop: 26, padding: 14, borderRadius: 10,
          border: `1px solid ${mostrarErros && !consentimento ? '#ef4444' : c.cardBorder}`,
          background: c.optionBg,
        }}>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', cursor: 'pointer' }}>
            <input type="checkbox" checked={consentimento} style={{ marginTop: 3, width: 17, height: 17, accentColor: TEAL }}
              onChange={(e) => onConsentimento(e.target.checked)} />
            <span style={{ fontSize: 13, color: c.text3, lineHeight: 1.5 }}>{consentimentoTexto}</span>
          </label>
        </div>
      )}

      {mostrarErros && faltandoNoBloco.length > 0 && (
        <p style={{ marginTop: 16, fontSize: 13, color: '#ef4444' }}>
          {faltandoNoBloco.length === 1
            ? 'Falta responder 1 pergunta desta parte.'
            : `Faltam responder ${faltandoNoBloco.length} perguntas desta parte.`}
        </p>
      )}

      <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
        {idx > 0 && (
          <button type="button" onClick={() => { setMostrarErros(false); setPasso(idx - 1); window.scrollTo({ top: 0 }); }}
            style={btn(false)} disabled={enviando}>
            Voltar
          </button>
        )}
        <button type="button" onClick={avancar} style={{ ...btn(true), flex: 1 }} disabled={enviando}>
          {enviando ? 'Enviando…' : ultimo ? 'Enviar respostas' : 'Continuar'}
        </button>
      </div>
    </div>
  );
}
