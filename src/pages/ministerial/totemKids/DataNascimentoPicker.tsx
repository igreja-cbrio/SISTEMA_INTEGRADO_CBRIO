// ============================================================================
// DataNascimentoPicker — seletor de data de nascimento em listas (Dia/Mês/Ano)
// ----------------------------------------------------------------------------
// Substitui o <input type="date"> nativo (calendário ruim no totem/tablet, pedido
// do Marcos 2026-07-13). Três listas que abrem ao toque: Dia → Mês → Ano. Rápido,
// simples, touch-friendly. Emite value no formato YYYY-MM-DD (ou '' se incompleto).
// Faixa de ano default cobre 0–14 anos (Kids).
// ============================================================================

import { useEffect, useMemo, useState } from 'react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';

const MESES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

function partes(value?: string | null): { d: string; m: string; y: string } {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return { d: '', m: '', y: '' };
  const [y, m, d] = value.split('-');
  return { d: String(Number(d)), m: String(Number(m)), y };
}

export default function DataNascimentoPicker({
  value,
  onChange,
  anoMin,
  anoMax,
}: {
  value: string;
  onChange: (v: string) => void;
  anoMin?: number;
  anoMax?: number;
}) {
  const yMax = anoMax ?? new Date().getFullYear();
  const yMin = anoMin ?? yMax - 14;
  // Estado interno das 3 partes — persiste seleção PARCIAL. Antes as listas liam
  // direto de partes(value); como emit() mandava '' enquanto a data estava
  // incompleta, o value voltava vazio e a escolha do dia/mês/ano some ao clicar
  // (bug relatado 2026-07-15). Agora só sincroniza com o value externo.
  const [d, setD] = useState(() => partes(value).d);
  const [m, setM] = useState(() => partes(value).m);
  const [y, setY] = useState(() => partes(value).y);
  useEffect(() => {
    const p = partes(value);
    setD(p.d); setM(p.m); setY(p.y);
  }, [value]);

  const diasNoMes = useMemo(() => {
    const mm = Number(m), yy = Number(y);
    if (mm >= 1 && mm <= 12 && yy) return new Date(yy, mm, 0).getDate();
    return 31;
  }, [m, y]);

  function emit(nd: string, nm: string, ny: string) {
    // Se já dá pra fechar a data, clampa o dia ao máximo do mês (ex.: 31/Fev → 29)
    // ANTES de gravar no estado, pra a lista e o valor não divergirem por 1 frame.
    let dd = nd;
    if (nd && nm && ny) {
      const max = new Date(Number(ny), Number(nm), 0).getDate();
      dd = String(Math.min(Number(nd), max));
    }
    setD(dd); setM(nm); setY(ny);
    if (dd && nm && ny) {
      onChange(`${ny}-${String(Number(nm)).padStart(2, '0')}-${String(Number(dd)).padStart(2, '0')}`);
    } else {
      onChange('');
    }
  }

  const anos = useMemo(() => {
    const out: number[] = [];
    for (let a = yMax; a >= yMin; a--) out.push(a);
    return out;
  }, [yMax, yMin]);

  const dias = useMemo(() => {
    const out: number[] = [];
    for (let i = 1; i <= diasNoMes; i++) out.push(i);
    return out;
  }, [diasNoMes]);

  return (
    <div className="grid grid-cols-3 gap-2">
      <Select value={d} onValueChange={(v) => emit(v, m, y)}>
        <SelectTrigger><SelectValue placeholder="Dia" /></SelectTrigger>
        <SelectContent className="max-h-64">
          {dias.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={m} onValueChange={(v) => emit(d, v, y)}>
        <SelectTrigger><SelectValue placeholder="Mês" /></SelectTrigger>
        <SelectContent className="max-h-64">
          {MESES.map((nome, idx) => <SelectItem key={idx} value={String(idx + 1)}>{nome}</SelectItem>)}
        </SelectContent>
      </Select>
      <Select value={y} onValueChange={(v) => emit(d, m, v)}>
        <SelectTrigger><SelectValue placeholder="Ano" /></SelectTrigger>
        <SelectContent className="max-h-64">
          {anos.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
