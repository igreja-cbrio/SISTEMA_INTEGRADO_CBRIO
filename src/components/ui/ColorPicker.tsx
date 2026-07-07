// Seletor de cor completo (sem dependência externa): paleta nativa do SO
// (<input type="color">) + campo HEX manual + presets rápidos. Reusável.
import { useState, useEffect } from 'react';

const PRESETS = [
  '#EF4444', '#F97316', '#F59E0B', '#EAB308', '#84CC16', '#22C55E',
  '#10B981', '#14B8A6', '#06B6D4', '#3B82F6', '#6366F1', '#8B5CF6',
  '#A855F7', '#D946EF', '#EC4899', '#F43F5E', '#64748B', '#111827',
];

function normalizarHex(v: string): string | null {
  let s = String(v || '').trim();
  if (!s) return null;
  if (s[0] !== '#') s = '#' + s;
  // #rgb -> #rrggbb
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    s = '#' + s.slice(1).split('').map(c => c + c).join('');
  }
  return /^#[0-9a-fA-F]{6}$/.test(s) ? s.toUpperCase() : null;
}

export function ColorPicker({
  value,
  onChange,
  presets = PRESETS,
}: {
  value?: string;
  onChange: (hex: string) => void;
  presets?: string[];
}) {
  const atual = normalizarHex(value || '') || '#EC4899';
  const [texto, setTexto] = useState(value || atual);

  // Mantém o campo de texto em sincronia quando a cor muda por fora (swatch/preset)
  useEffect(() => { setTexto(value || atual); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  function commitTexto(v: string) {
    setTexto(v);
    const hex = normalizarHex(v);
    if (hex) onChange(hex);
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {/* Swatch que abre a paleta nativa completa */}
        <label
          className="relative h-9 w-11 shrink-0 rounded-md border border-border overflow-hidden cursor-pointer"
          style={{ background: atual }}
          title="Escolher cor"
        >
          <input
            type="color"
            value={atual}
            onChange={e => { commitTexto(e.target.value); }}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
        {/* HEX manual */}
        <div className="relative flex-1">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">#</span>
          <input
            value={texto.replace(/^#/, '')}
            onChange={e => commitTexto(e.target.value)}
            onBlur={e => { const h = normalizarHex(e.target.value); if (h) { setTexto(h); onChange(h); } }}
            placeholder="EC4899"
            maxLength={7}
            spellCheck={false}
            className="w-full rounded-md border border-border bg-background pl-6 pr-2 py-2 text-sm uppercase tracking-wide"
          />
        </div>
      </div>
      {/* Presets rápidos */}
      <div className="flex flex-wrap gap-1.5">
        {presets.map(c => (
          <button
            key={c}
            type="button"
            onClick={() => { onChange(c); setTexto(c); }}
            title={c}
            className={`h-6 w-6 rounded-full border transition-transform hover:scale-110 ${atual.toUpperCase() === c.toUpperCase() ? 'border-foreground ring-2 ring-offset-1 ring-foreground/40' : 'border-border'}`}
            style={{ background: c }}
          />
        ))}
      </div>
    </div>
  );
}

export default ColorPicker;
