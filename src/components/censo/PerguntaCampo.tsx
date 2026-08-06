// Uma pergunta do censo → um campo. Todos os tipos que o motor conhece.
//
// Renderer PRÓPRIO do censo, não o NpsForm: aquele espera
// { pergunta_nps, perguntas_extras } e exige uma pergunta NPS. O censo é um
// array plano de 93 campos. O NPS está em produção e fica intocado.
//
// Estilo inline com a paleta pública (mesmo padrão de NpsForm/CadastroMembresia):
// a página é aberta por gente de fora, no celular, e não carrega o tema do ERP.
import type { CSSProperties } from 'react';
import type { Pergunta } from '@/lib/censoForm';
import { NAO_SE_APLICA, alternarOpcao, ehNeutra } from '@/lib/censoForm';
import { usePublicPalette } from '@/pages/public/publicTheme';

type Props = {
  pergunta: Pergunta;
  valor: unknown;
  onChange: (valor: unknown) => void;
  faltando?: boolean;
};

const TEAL = '#00B39D';

export default function PerguntaCampo({ pergunta: p, valor, onChange, faltando }: Props) {
  const c = usePublicPalette();

  const base: CSSProperties = {
    width: '100%', padding: '11px 12px', borderRadius: 10, fontSize: 15,
    border: `1px solid ${faltando ? '#ef4444' : c.inputBorder}`,
    background: c.optionBg, color: c.text, boxSizing: 'border-box', fontFamily: 'inherit',
  };

  const opcaoBtn = (ativo: boolean, neutra = false): CSSProperties => ({
    padding: '11px 14px', borderRadius: 10, fontSize: 15, textAlign: 'left', width: '100%',
    cursor: 'pointer', fontFamily: 'inherit', transition: 'border-color .12s, background .12s',
    border: `1px solid ${ativo ? TEAL : c.inputBorder}`,
    background: ativo ? `color-mix(in srgb, ${TEAL} 14%, ${c.optionBg})` : c.optionBg,
    color: ativo ? c.text : (neutra ? c.text3 : c.text2),
    fontStyle: neutra ? 'italic' : 'normal',
  });

  // ── escalas 1–5 ──
  if (p.tipo === 'escala_5' || p.tipo === 'estrelas_5') {
    const n = typeof valor === 'number' ? valor : null;
    const nsa = valor === NAO_SE_APLICA;
    const estrelas = p.tipo === 'estrelas_5';
    return (
      <div>
        <div style={{ display: 'flex', gap: 8 }}>
          {[1, 2, 3, 4, 5].map((v) => {
            const ativo = estrelas ? n !== null && v <= n : n === v;
            return (
              <button
                key={v} type="button" onClick={() => onChange(v)}
                aria-label={estrelas ? `${v} de 5` : String(v)}
                style={{
                  flex: 1, padding: '13px 0', borderRadius: 10, fontSize: estrelas ? 20 : 16,
                  cursor: 'pointer', fontFamily: 'inherit',
                  border: `1px solid ${ativo ? TEAL : (faltando ? '#ef4444' : c.inputBorder)}`,
                  background: ativo && !estrelas ? `color-mix(in srgb, ${TEAL} 16%, ${c.optionBg})` : c.optionBg,
                  color: ativo ? (estrelas ? '#f59e0b' : c.text) : c.text3,
                }}
              >
                {estrelas ? (ativo ? '★' : '☆') : v}
              </button>
            );
          })}
        </div>
        {(p.rotulos?.min || p.rotulos?.max) && (
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 12, color: c.textDim }}>
            <span>{p.rotulos?.min}</span><span>{p.rotulos?.max}</span>
          </div>
        )}
        {/* Saída para quem a pergunta não alcança. Sem ela, quem nunca serviu
            seria obrigado a dar nota em "me sinto valorizado como voluntário" —
            e essa nota entraria na média dos voluntários. */}
        {p.permite_nao_se_aplica && (
          <button type="button" onClick={() => onChange(nsa ? null : NAO_SE_APLICA)}
            style={{ ...opcaoBtn(nsa, true), marginTop: 8 }}>
            {NAO_SE_APLICA}
          </button>
        )}
      </div>
    );
  }

  // ── NPS 0–10 ──
  if (p.tipo === 'nps') {
    const max = p.max ?? 10;
    const n = typeof valor === 'number' ? valor : null;
    const cor = (v: number) => (v <= 6 ? '#ef4444' : v <= 8 ? '#f59e0b' : '#10b981');
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(38px, 1fr))', gap: 6 }}>
        {Array.from({ length: max + 1 }, (_, v) => (
          <button key={v} type="button" onClick={() => onChange(v)}
            style={{
              padding: '12px 0', borderRadius: 8, fontSize: 15, cursor: 'pointer', fontFamily: 'inherit',
              border: `1px solid ${n === v ? cor(v) : (faltando ? '#ef4444' : c.inputBorder)}`,
              background: n === v ? cor(v) : c.optionBg,
              color: n === v ? '#fff' : c.text3, fontWeight: n === v ? 600 : 400,
            }}>
            {v}
          </button>
        ))}
      </div>
    );
  }

  // ── Sim/Não e escolha única ──
  if (p.tipo === 'sim_nao' || p.tipo === 'opcao_unica') {
    const opcoes = p.tipo === 'sim_nao' ? ['Sim', 'Não'] : (p.opcoes || []);
    const emLinha = p.tipo === 'sim_nao';
    return (
      <div style={{ display: emLinha ? 'flex' : 'grid', gap: 8 }}>
        {opcoes.map((o) => (
          <button key={o} type="button" onClick={() => onChange(o)}
            style={{ ...opcaoBtn(valor === o, ehNeutra(p, o)), flex: emLinha ? 1 : undefined, textAlign: emLinha ? 'center' : 'left' }}>
            {o}
          </button>
        ))}
      </div>
    );
  }

  // ── múltipla escolha ──
  if (p.tipo === 'multipla') {
    const marcadas = Array.isArray(valor) ? valor.map(String) : [];
    return (
      <div style={{ display: 'grid', gap: 8 }}>
        {(p.opcoes || []).map((o) => {
          const ativo = marcadas.includes(o);
          return (
            <button key={o} type="button" onClick={() => onChange(alternarOpcao(p, marcadas, o))}
              style={{ ...opcaoBtn(ativo, ehNeutra(p, o)), display: 'flex', alignItems: 'center', gap: 10 }}>
              <span aria-hidden style={{
                width: 18, height: 18, borderRadius: 5, flexShrink: 0,
                border: `1px solid ${ativo ? TEAL : c.inputBorder}`,
                background: ativo ? TEAL : 'transparent', color: '#fff',
                fontSize: 12, lineHeight: '17px', textAlign: 'center',
              }}>{ativo ? '✓' : ''}</span>
              {o}
            </button>
          );
        })}
      </div>
    );
  }

  if (p.tipo === 'texto_longo') {
    return (
      <textarea rows={4} style={{ ...base, resize: 'vertical' }}
        value={typeof valor === 'string' ? valor : ''}
        onChange={(e) => onChange(e.target.value)} />
    );
  }

  if (p.tipo === 'data') {
    return (
      <input type="date" style={base} max={new Date().toISOString().slice(0, 10)}
        value={typeof valor === 'string' ? valor : ''}
        onChange={(e) => onChange(e.target.value)} />
    );
  }

  if (p.tipo === 'numero') {
    return (
      <input type="number" inputMode="numeric" style={base}
        min={p.min_num ?? 0} max={p.max_num ?? 99}
        value={valor === null || valor === undefined ? '' : String(valor)}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} />
    );
  }

  // ── texto curto, com máscara por formato ──
  const formato = p.formato || 'texto';
  return (
    <input
      style={base}
      type={formato === 'email' ? 'email' : 'text'}
      inputMode={formato === 'telefone' ? 'tel' : formato === 'email' ? 'email' : 'text'}
      autoComplete={formato === 'email' ? 'email' : formato === 'telefone' ? 'tel' : 'off'}
      placeholder={formato === 'instagram' ? '@seuperfil' : formato === 'telefone' ? '(21) 99999-9999' : ''}
      value={typeof valor === 'string' ? valor : ''}
      onChange={(e) => {
        let v = e.target.value;
        // Máscara de telefone digitando: o backend normaliza de novo, isto é só
        // para a pessoa conferir o número que digitou.
        if (formato === 'telefone') {
          const d = v.replace(/\D/g, '').slice(0, 11);
          v = d.length <= 2 ? d
            : d.length <= 6 ? `(${d.slice(0, 2)}) ${d.slice(2)}`
            : d.length <= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
            : `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
        }
        if (formato === 'instagram') v = v.replace(/\s/g, '');
        onChange(v);
      }}
    />
  );
}
