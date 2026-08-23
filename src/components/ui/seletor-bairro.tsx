// Campo de bairro com lista suspensa e validação.
//
// Pedido do Matheus (24/08/2026): "nos formularios, o bairro da pessoa deve
// aparecer automaticamente quando ela colocar o cep, deve existir um sistema de
// validacao, com lista suspensa dos bairros."
//
// ⚠️⚠️ NÃO TRAVA quem mora fora do catálogo, e isso é decisão, não descuido.
// A lista que existia antes era um `<select>` de 11 apelidos + "Outro": quem
// morava em Copacabana caía no "Outro" e digitava texto livre, e era daí que
// vinham as variações. Um select FECHADO seria pior — impediria o cadastro. O
// desenho é: sugerir forte, aceitar o resto, e DECLARAR quando é bairro novo.
//
// ⚠️ Sem `<datalist>`: ele não deixa mostrar o estado da validação nem quantas
// pessoas moram no bairro, e a aparência muda de navegador para navegador — no
// totem, onde o preenchimento é em pé e com fila atrás, isso não serve.
//
// ⚠️ Estilo por variáveis do sistema (`--cbrio-*`), não por classes: este campo
// vive no ERP (glass), na porta pública e no totem, que têm folhas diferentes.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cadastroPublico } from '../../api';
import { avaliarBairro, sugerirBairros, type BairroCatalogo } from '../../lib/bairros';

// Cache de módulo: o catálogo muda quando alguém cadastra bairro novo, e vários
// formulários montam o campo na mesma sessão. Sem isto, cada montagem é uma
// requisição — no culto isso multiplica por centenas.
let _cache: { em: number; itens: BairroCatalogo[] } | null = null;
const CACHE_MS = 10 * 60 * 1000;

export function useCatalogoBairros() {
  const [catalogo, setCatalogo] = useState<BairroCatalogo[]>(() => _cache?.itens ?? []);

  useEffect(() => {
    let vivo = true;
    if (_cache && Date.now() - _cache.em < CACHE_MS) {
      setCatalogo(_cache.itens);
      return;
    }
    cadastroPublico.bairros().then((r: { bairros?: BairroCatalogo[] }) => {
      const itens = Array.isArray(r?.bairros) ? r.bairros : [];
      _cache = { em: Date.now(), itens };
      if (vivo) setCatalogo(itens);
    });
    return () => { vivo = false; };
  }, []);

  return catalogo;
}

type Props = {
  value: string;
  onChange: (valor: string) => void;
  /** Chips de toque rápido com os bairros mais comuns. Liga no totem e na porta
   *  pública, onde a pessoa preenche em pé. */
  atalhos?: number;
  placeholder?: string;
  id?: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  /** Marca o campo como preenchido pelo CEP — some quando a pessoa edita. */
  doCep?: boolean;
};

export default function SeletorBairro({
  value,
  onChange,
  atalhos = 0,
  placeholder = 'Comece a digitar o bairro',
  id,
  disabled,
  className,
  style,
  doCep = false,
}: Props) {
  const catalogo = useCatalogoBairros();
  const [aberto, setAberto] = useState(false);
  const [marcado, setMarcado] = useState(-1);
  const caixa = useRef<HTMLDivElement | null>(null);

  const sugestoes = useMemo(
    () => (catalogo.length ? sugerirBairros(value, catalogo) : []),
    [value, catalogo],
  );
  const estado = useMemo(
    () => avaliarBairro(value, catalogo),
    [value, catalogo],
  );
  const topo = useMemo(
    () => (atalhos > 0 ? [...catalogo].sort((a, b) => b.pessoas - a.pessoas).slice(0, atalhos) : []),
    [catalogo, atalhos],
  );

  // Fechar ao clicar fora — sem isto o dropdown fica por cima do resto do
  // formulário e a pessoa não consegue tocar no campo seguinte.
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener('mousedown', fora);
    return () => document.removeEventListener('mousedown', fora);
  }, [aberto]);

  const escolher = useCallback((b: BairroCatalogo) => {
    onChange(b.nome);
    setAberto(false);
    setMarcado(-1);
  }, [onChange]);

  const teclado = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!aberto || sugestoes.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setMarcado((i) => Math.min(i + 1, sugestoes.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setMarcado((i) => Math.max(i - 1, -1)); }
    else if (e.key === 'Enter' && marcado >= 0) { e.preventDefault(); escolher(sugestoes[marcado]); }
    else if (e.key === 'Escape') { setAberto(false); setMarcado(-1); }
  };

  const inputBase: React.CSSProperties = {
    width: '100%',
    padding: '9px 12px',
    borderRadius: 10,
    border: '1px solid var(--cbrio-border, #e5e7eb)',
    background: 'var(--cbrio-input-bg, #fff)',
    color: 'var(--cbrio-text, #111)',
    fontSize: 14,
    outline: 'none',
  };

  return (
    <div ref={caixa} style={{ position: 'relative' }}>
      {topo.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
          {topo.map((b) => {
            const ativo = estado.tipo === 'conhecido' && estado.bairro.norm === b.norm;
            return (
              <button
                key={b.norm}
                type="button"
                disabled={disabled}
                onClick={() => escolher(b)}
                style={{
                  padding: '5px 11px',
                  borderRadius: 999,
                  fontSize: 12.5,
                  fontWeight: 500,
                  cursor: 'pointer',
                  border: `1px solid ${ativo ? '#00B39D' : 'var(--cbrio-border, #e5e7eb)'}`,
                  background: ativo ? '#00B39D' : 'transparent',
                  color: ativo ? '#fff' : 'var(--cbrio-text2, #555)',
                }}
              >
                {b.nome}
              </button>
            );
          })}
        </div>
      )}

      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={aberto}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        value={value}
        placeholder={placeholder}
        className={className}
        style={className ? style : { ...inputBase, ...style }}
        onChange={(e) => { onChange(e.target.value); setAberto(true); setMarcado(-1); }}
        onFocus={() => setAberto(true)}
        onKeyDown={teclado}
      />

      {aberto && sugestoes.length > 0 && (
        <ul
          role="listbox"
          style={{
            position: 'absolute', zIndex: 60, top: '100%', left: 0, right: 0, marginTop: 4,
            maxHeight: 240, overflowY: 'auto', listStyle: 'none', padding: 4, margin: 0,
            borderRadius: 10,
            border: '1px solid var(--cbrio-border, #e5e7eb)',
            background: 'var(--cbrio-modal-bg, var(--cbrio-card, #fff))',
            boxShadow: '0 12px 32px rgba(0,0,0,0.18)',
          }}
        >
          {sugestoes.map((b, i) => (
            <li key={b.norm}>
              <button
                type="button"
                role="option"
                aria-selected={i === marcado}
                onMouseEnter={() => setMarcado(i)}
                onClick={() => escolher(b)}
                style={{
                  width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8,
                  border: 'none', cursor: 'pointer', fontSize: 14,
                  display: 'flex', justifyContent: 'space-between', gap: 10,
                  background: i === marcado ? 'var(--cbrio-table-header, rgba(0,179,157,0.10))' : 'transparent',
                  color: 'var(--cbrio-text, #111)',
                }}
              >
                <span>{b.nome}</span>
                {b.pessoas > 0 && (
                  <span style={{ fontSize: 12, color: 'var(--cbrio-text3, #888)' }}>
                    {b.pessoas}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* ⚠️ A validação AVISA, nunca bloqueia. */}
      {estado.tipo === 'apelido' && (
        <p style={{ fontSize: 11.5, marginTop: 5, color: 'var(--cbrio-text3, #888)' }}>
          Vamos registrar como <strong style={{ color: '#00B39D' }}>{estado.bairro.nome}</strong>,
          que é o nome oficial deste bairro.
        </p>
      )}
      {estado.tipo === 'novo' && catalogo.length > 0 && (
        <p style={{ fontSize: 11.5, marginTop: 5, color: 'var(--cbrio-text3, #888)' }}>
          Bairro novo para o nosso cadastro — pode seguir assim se estiver certo.
        </p>
      )}
      {estado.tipo === 'conhecido' && doCep && (
        <p style={{ fontSize: 11.5, marginTop: 5, color: 'var(--cbrio-text3, #888)' }}>
          Preenchido pelo CEP.
        </p>
      )}
    </div>
  );
}
