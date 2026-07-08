import { useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { SlidersHorizontal } from 'lucide-react';
import { voluntariado } from '@/api';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

interface ThermometerEntry {
  planningCenterId: string;
  name: string;
  team: string | null;
  scheduled: number;
  checkedIn: number;
  rate: number;
  level: 'very_active' | 'regular' | 'low' | 'inactive';
}

interface VolConfig {
  muito_ativo_min: number;
  regular_min: number;
  pouco_ativo_min: number;
  sobrecarga_limite: number;
}

const CONFIG_DEFAULT: VolConfig = { muito_ativo_min: 8, regular_min: 4, pouco_ativo_min: 1, sobrecarga_limite: 8 };

const levelConfig = {
  very_active: { label: 'Muito Ativo', color: '#3b82f6', bgClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  regular: { label: 'Regular', color: '#22c55e', bgClass: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  low: { label: 'Pouco Ativo', color: '#eab308', bgClass: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' },
  inactive: { label: 'Inativo', color: '#ef4444', bgClass: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
};

type Level = keyof typeof levelConfig;

// Classificação por CONTAGEM de check-ins no período (alimentada pelos check-ins).
function classificar(checkedIn: number, cfg: VolConfig): Level {
  if (checkedIn >= cfg.muito_ativo_min) return 'very_active';
  if (checkedIn >= cfg.regular_min) return 'regular';
  if (checkedIn >= cfg.pouco_ativo_min) return 'low';
  return 'inactive';
}

// Descrição legível da faixa de cada categoria (memória de cálculo).
function faixaTexto(level: Level, cfg: VolConfig): string {
  const suf = 'check-ins';
  switch (level) {
    case 'very_active': return `${cfg.muito_ativo_min}+ ${suf}`;
    case 'regular': return cfg.regular_min === cfg.muito_ativo_min - 1
      ? `${cfg.regular_min} ${suf}` : `${cfg.regular_min}–${cfg.muito_ativo_min - 1} ${suf}`;
    case 'low': return cfg.pouco_ativo_min === cfg.regular_min - 1
      ? `${cfg.pouco_ativo_min} ${suf}` : `${cfg.pouco_ativo_min}–${cfg.regular_min - 1} ${suf}`;
    case 'inactive': return cfg.pouco_ativo_min <= 1 ? `0 ${suf}` : `menos de ${cfg.pouco_ativo_min} ${suf}`;
  }
}

export default function VolunteerThermometer({ data, period = 'month' }: { data: ThermometerEntry[]; period?: string }) {
  const { getAccessLevel } = useAuth();
  const podeEditar = getAccessLevel(['voluntariado']) >= 3;
  const qc = useQueryClient();

  const { data: cfgRaw } = useQuery({
    queryKey: ['vol', 'config'],
    queryFn: () => voluntariado.config.get() as Promise<VolConfig>,
    staleTime: 5 * 60_000,
  });
  const cfg: VolConfig = { ...CONFIG_DEFAULT, ...(cfgRaw || {}) };

  const [editOpen, setEditOpen] = useState(false);

  // Reclassifica pela contagem de check-ins + config (ordena por volume).
  const entries = [...data]
    .map(v => ({ ...v, servidos: v.checkedIn, level: classificar(v.checkedIn, cfg) }))
    .sort((a, b) => b.servidos - a.servidos);

  const counts = { very_active: 0, regular: 0, low: 0, inactive: 0 };
  entries.forEach(v => counts[v.level]++);
  const total = entries.length;

  const limite = cfg.sobrecarga_limite;
  const sobrecarga = entries.filter(v => v.servidos > limite).sort((a, b) => b.servidos - a.servidos);

  return (
    <div className="space-y-4 md:space-y-6">
      {/* Memória de cálculo (régua editável) */}
      <div className="p-3 md:p-4 rounded-lg border bg-card">
        <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
          <h4 className="font-semibold text-sm md:text-base">Memória de cálculo</h4>
          {podeEditar && (
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setEditOpen(true)}>
              <SlidersHorizontal className="h-3.5 w-3.5 mr-1.5" /> Editar régua
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          As categorias são calculadas pela quantidade de <strong>check-ins no período</strong> selecionado — alimentado automaticamente pelos check-ins dos cultos.
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {(Object.keys(levelConfig) as Level[]).map(level => (
            <div key={level} className="flex items-center gap-2 text-xs">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: levelConfig[level].color }} />
              <span className="text-muted-foreground"><strong className="text-foreground">{levelConfig[level].label}:</strong> {faixaTexto(level, cfg)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {(Object.entries(counts) as [Level, number][]).map(([level, count]) => {
          const c = levelConfig[level];
          return (
            <div key={level} className="p-4 rounded-lg border bg-card text-center">
              <div className="h-8 w-8 mx-auto mb-2 rounded-full flex items-center justify-center" style={{ backgroundColor: `${c.color}20` }}>
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: c.color }} />
              </div>
              <p className="text-3xl font-bold">{count}</p>
              <p className="text-sm text-muted-foreground">{c.label}</p>
              <p className="text-[10px] text-muted-foreground/70 mt-0.5">{faixaTexto(level, cfg)}</p>
            </div>
          );
        })}
      </div>

      {/* Servindo demais (risco de sobrecarga) */}
      <div className="p-3 md:p-4 rounded-lg border bg-card space-y-3" style={{ borderColor: sobrecarga.length ? '#f59e0b66' : undefined }}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h4 className="font-semibold text-sm md:text-base flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: '#f59e0b' }} />
            Servindo demais
            <span className="text-xs font-normal text-muted-foreground">· risco de sobrecarga</span>
          </h4>
          <span className="text-xs text-muted-foreground">{sobrecarga.length} acima de {limite} no período</span>
        </div>
        {sobrecarga.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2">Ninguém servindo acima do limite ({limite}) no período. 👍</p>
        ) : (
          <div className="space-y-2 max-h-[320px] overflow-y-auto">
            {sobrecarga.map(v => (
              <div key={v.planningCenterId} className="flex items-center gap-2 md:gap-3 p-2.5 rounded-lg border bg-amber-50/60 dark:bg-amber-950/20 min-h-[48px]">
                <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 shrink-0 text-[10px] md:text-xs">
                  {v.servidos} serviços
                </Badge>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-xs md:text-sm truncate">{v.name}</p>
                  {v.team && <p className="text-[10px] md:text-xs text-muted-foreground truncate">{v.team}</p>}
                </div>
                <span className="text-[10px] md:text-xs text-muted-foreground shrink-0">{v.checkedIn}/{v.scheduled} presença</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Distribution bar */}
      {total > 0 && (
        <div className="p-4 rounded-lg border bg-card space-y-3">
          <h4 className="font-semibold">Distribuição</h4>
          <div className="flex h-8 rounded-lg overflow-hidden">
            {(Object.entries(counts) as [Level, number][]).map(([level, count]) => {
              if (count === 0) return null;
              const pct = (count / total) * 100;
              return (
                <div
                  key={level}
                  style={{ width: `${pct}%`, backgroundColor: levelConfig[level].color }}
                  className="transition-all"
                />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-4 justify-center text-sm">
            {(Object.entries(counts) as [Level, number][]).map(([level, count]) => (
              <div key={level} className="flex items-center gap-1.5">
                <div className="h-3 w-3 rounded-full" style={{ backgroundColor: levelConfig[level].color }} />
                <span className="text-muted-foreground">{levelConfig[level].label}: {count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Volunteer list */}
      <div className="p-3 md:p-4 rounded-lg border bg-card space-y-3">
        <h4 className="font-semibold text-sm md:text-base">Voluntarios ({total})</h4>
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
          {entries.map(v => {
            const c = levelConfig[v.level];
            return (
              <div key={v.planningCenterId} className="flex items-center gap-2 md:gap-3 p-2.5 md:p-3 rounded-lg border bg-card hover:bg-muted/30 min-h-[52px]">
                <Badge variant="outline" className={`${c.bgClass} shrink-0 text-[10px] md:text-xs`}>
                  {c.label}
                </Badge>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-xs md:text-sm truncate">{v.name}</p>
                  {v.team && <p className="text-[10px] md:text-xs text-muted-foreground truncate">{v.team}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0 text-right">
                  <span className="text-sm md:text-base font-bold tabular-nums" style={{ color: c.color }}>{v.checkedIn}</span>
                  <span className="text-[10px] md:text-xs text-muted-foreground">check-ins<br />{v.checkedIn}/{v.scheduled} presença</span>
                </div>
              </div>
            );
          })}
          {total === 0 && (
            <p className="text-center text-muted-foreground py-8">Nenhum voluntário encontrado no período</p>
          )}
        </div>
      </div>

      {podeEditar && (
        <EditarReguaDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          cfg={cfg}
          onSaved={() => qc.invalidateQueries({ queryKey: ['vol', 'config'] })}
        />
      )}
    </div>
  );
}

function EditarReguaDialog({ open, onOpenChange, cfg, onSaved }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  cfg: VolConfig;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<VolConfig>(cfg);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { if (open) setForm(cfg); }, [open, cfg]);

  const set = (k: keyof VolConfig) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: Math.max(0, Math.round(Number(e.target.value) || 0)) }));

  const ordemOk = form.muito_ativo_min >= form.regular_min
    && form.regular_min >= form.pouco_ativo_min
    && form.pouco_ativo_min >= 1;

  async function salvar() {
    if (!ordemOk) { toast.error('Os limites devem ser decrescentes: Muito Ativo ≥ Regular ≥ Pouco Ativo ≥ 1.'); return; }
    setSalvando(true);
    try {
      await voluntariado.config.update(form);
      toast.success('Régua do termômetro atualizada.');
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar a régua.');
    } finally {
      setSalvando(false);
    }
  }

  const campos: { k: keyof VolConfig; label: string; hint: string }[] = [
    { k: 'muito_ativo_min', label: 'Muito Ativo · a partir de', hint: 'check-ins no período' },
    { k: 'regular_min', label: 'Regular · a partir de', hint: 'até o mínimo de Muito Ativo − 1' },
    { k: 'pouco_ativo_min', label: 'Pouco Ativo · a partir de', hint: 'até o mínimo de Regular − 1' },
    { k: 'sobrecarga_limite', label: 'Sobrecarga · acima de', hint: '"servindo demais" no período' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Editar régua do termômetro</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-xs text-muted-foreground">
            Defina quantos <strong>check-ins no período</strong> cada categoria exige. Quem fica abaixo de "Pouco Ativo" é <strong>Inativo</strong>.
          </p>
          {campos.map(c => (
            <div key={c.k} className="grid grid-cols-[1fr_auto] items-center gap-3">
              <div>
                <Label className="text-sm">{c.label}</Label>
                <p className="text-[11px] text-muted-foreground">{c.hint}</p>
              </div>
              <Input
                type="number"
                min={c.k === 'pouco_ativo_min' ? 1 : 0}
                value={form[c.k]}
                onChange={set(c.k)}
                className="w-20 text-center"
              />
            </div>
          ))}
          {!ordemOk && (
            <p className="text-xs text-rose-600">Os limites devem ser decrescentes: Muito Ativo ≥ Regular ≥ Pouco Ativo ≥ 1.</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={salvando}>Cancelar</Button>
          <Button onClick={salvar} disabled={salvando || !ordemOk}>{salvando ? 'Salvando…' : 'Salvar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
