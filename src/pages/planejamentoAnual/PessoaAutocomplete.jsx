// Campo de busca com sugestões para "Líder responsável" — substitui o
// <select> antigo, que listava as pessoas em ordem crua e exigia rolar a
// lista inteira pra achar alguém. Segue o padrão de SeletorBairro
// (src/components/ui/seletor-bairro.tsx): input livre + lista filtrada,
// sem travar em nenhum valor (a pessoa pode não estar sugerida ainda assim
// escolher pelo texto que já digitou, se um dia isso for necessário).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { input as inputStyle } from './comum';

function normalizar(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

export default function PessoaAutocomplete({
  pessoas,
  value,
  onChange,
  placeholder = 'Buscar pessoa por nome ou e-mail…',
  disabled,
}) {
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState(false);
  const [marcado, setMarcado] = useState(-1);
  const caixa = useRef(null);

  const selecionada = useMemo(
    () => (pessoas || []).find((p) => p.id === value) || null,
    [pessoas, value],
  );

  // O texto exibido é o da pessoa escolhida, exceto enquanto o campo está
  // em foco e a pessoa está digitando pra trocar — nesse instante `busca`
  // já assumiu o controle (ver onFocus).
  const textoExibido = aberto ? busca : (selecionada ? (selecionada.name || selecionada.email) : busca);

  const sugestoes = useMemo(() => {
    const termo = normalizar(busca);
    const lista = pessoas || [];
    if (!termo) return lista.slice(0, 8);
    return lista
      .filter((p) => normalizar(p.name).includes(termo) || normalizar(p.email).includes(termo))
      .slice(0, 8);
  }, [busca, pessoas]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e) => {
      if (caixa.current && !caixa.current.contains(e.target)) {
        setAberto(false);
        setBusca('');
      }
    };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  const escolher = useCallback((p) => {
    onChange(p.id);
    setAberto(false);
    setBusca('');
    setMarcado(-1);
  }, [onChange]);

  const teclado = (e) => {
    if (!aberto || sugestoes.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setMarcado((i) => Math.min(i + 1, sugestoes.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setMarcado((i) => Math.max(i - 1, -1)); }
    else if (e.key === 'Enter' && marcado >= 0) { e.preventDefault(); escolher(sugestoes[marcado]); }
    else if (e.key === 'Escape') { setAberto(false); setBusca(''); setMarcado(-1); }
  };

  return (
    <div ref={caixa} style={{ position: 'relative' }}>
      <input
        type="text"
        role="combobox"
        aria-expanded={aberto}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        value={textoExibido}
        placeholder={placeholder}
        style={inputStyle}
        onFocus={() => { setBusca(''); setAberto(true); }}
        onChange={(e) => { setBusca(e.target.value); setAberto(true); setMarcado(-1); }}
        onKeyDown={teclado}
      />
      {value && !aberto && (
        <button
          type="button"
          title="Limpar"
          onClick={() => onChange('')}
          style={{
            position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
            border: 'none', background: 'transparent', color: 'var(--cbrio-text3)',
            cursor: 'pointer', fontSize: 14, padding: 2, lineHeight: 1,
          }}
        >×</button>
      )}
      {aberto && sugestoes.length > 0 && (
        <ul
          role="listbox"
          style={{
            position: 'absolute', zIndex: 60, top: '100%', left: 0, right: 0, marginTop: 4,
            maxHeight: 240, overflowY: 'auto', listStyle: 'none', padding: 4, margin: 0,
            borderRadius: 10, border: '1px solid var(--cbrio-border)',
            background: 'var(--cbrio-modal-bg, var(--cbrio-card))',
            boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
          }}
        >
          {sugestoes.map((p, i) => (
            <li key={p.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === marcado}
                onMouseEnter={() => setMarcado(i)}
                onClick={() => escolher(p)}
                style={{
                  width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8,
                  border: 'none', cursor: 'pointer', fontSize: 13,
                  background: i === marcado ? 'var(--cbrio-table-header, rgba(0,179,157,0.10))' : 'transparent',
                  color: 'var(--cbrio-text)',
                }}
              >
                <div>{p.name || p.email}</div>
                {p.name && p.email && (
                  <div style={{ fontSize: 11, color: 'var(--cbrio-text3)' }}>{p.email}</div>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {aberto && busca && sugestoes.length === 0 && (
        <div style={{
          position: 'absolute', zIndex: 60, top: '100%', left: 0, right: 0, marginTop: 4,
          padding: '8px 10px', borderRadius: 10, border: '1px solid var(--cbrio-border)',
          background: 'var(--cbrio-modal-bg, var(--cbrio-card))', fontSize: 12.5, color: 'var(--cbrio-text3)',
        }}>
          Nenhuma pessoa encontrada.
        </div>
      )}
    </div>
  );
}
