import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { dashboardSemanal as api } from '../../api';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../ui/dialog';
import { Loader2, Plus, Trash2, Target, Edit2 } from 'lucide-react';
import { INDICADORES } from '../../pages/DashboardSemanal';

const PERIODICIDADES = [
  { value: 'semanal', label: 'Semanal' },
  { value: 'mensal',  label: 'Mensal' },
  { value: 'anual',   label: 'Anual' },
];

export default function DashMetasAba() {
  const qc = useQueryClient();
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const { data: metas, isLoading } = useQuery({
    queryKey: ['dash-sem', 'metas'],
    queryFn: () => api.metasList(),
    staleTime: 60_000,
  });

  // Pega valor "atual" da semana anterior pra cada meta (somente semanal por ora)
  const hoje = new Date();
  const anoAtual = hoje.getUTCFullYear();
  const semanaAnterior = Math.max(1, isoWeekOf(hoje).semana - 1);

  const createOrUpdate = useMutation({
    mutationFn: async (payload) => {
      if (payload.id) return api.metaUpdate(payload.id, payload);
      return api.metaCreate(payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['dash-sem', 'metas'] });
      setEditOpen(false);
      setEditing(null);
    },
  });

  const remover = useMutation({
    mutationFn: (id) => api.metaRemove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dash-sem', 'metas'] }),
  });

  const abrirNovo = () => {
    setEditing({
      indicador: 'frequencia',
      rotulo: 'Frequência (semanal)',
      meta_valor: 1200,
      periodicidade: 'semanal',
      ativa: true,
    });
    setEditOpen(true);
  };

  const abrirEdit = (m) => {
    setEditing({ ...m });
    setEditOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Metas configuráveis</h3>
          <p className="text-xs text-muted-foreground">
            Defina alvos numéricos por indicador. O gauge anima até o valor atingido na semana atual.
          </p>
        </div>
        <Button onClick={abrirNovo} size="sm">
          <Plus className="h-4 w-4 mr-1.5" />Nova meta
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : !metas?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Target className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-sm text-muted-foreground">Ainda não há metas configuradas.</p>
            <Button onClick={abrirNovo} size="sm" className="mt-3">
              <Plus className="h-4 w-4 mr-1.5" />Criar a primeira
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {metas.map(m => (
            <MetaCard
              key={m.id}
              meta={m}
              ano={anoAtual}
              semana={semanaAnterior}
              onEdit={() => abrirEdit(m)}
              onDelete={() => remover.mutate(m.id)}
            />
          ))}
        </div>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Editar meta' : 'Nova meta'}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Indicador</label>
                <Select
                  value={editing.indicador}
                  onValueChange={v => {
                    const ind = INDICADORES.find(i => i.key === v);
                    setEditing({
                      ...editing,
                      indicador: v,
                      rotulo: editing.rotulo === '' || !editing.rotulo ? `${ind?.label} (${editing.periodicidade})` : editing.rotulo,
                    });
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INDICADORES.map(i => (
                      <SelectItem key={i.key} value={i.key}>{i.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground block mb-1">Rótulo</label>
                <Input
                  value={editing.rotulo}
                  onChange={e => setEditing({ ...editing, rotulo: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Meta (valor)</label>
                  <Input
                    type="number"
                    min={1}
                    value={editing.meta_valor}
                    onChange={e => setEditing({ ...editing, meta_valor: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground block mb-1">Periodicidade</label>
                  <Select
                    value={editing.periodicidade}
                    onValueChange={v => setEditing({ ...editing, periodicidade: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PERIODICIDADES.map(p => (
                        <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-between pt-2">
                <label className="text-xs font-medium">Ativa</label>
                <Switch
                  checked={editing.ativa}
                  onCheckedChange={v => setEditing({ ...editing, ativa: v })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => createOrUpdate.mutate(editing)}
              disabled={createOrUpdate.isPending}
            >
              {createOrUpdate.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MetaCard({ meta, ano, semana, onEdit, onDelete }) {
  // Carrega o valor atual da semana anterior pra esse indicador
  const { data } = useQuery({
    queryKey: ['dash-sem', 'meta-atual', meta.indicador, ano, semana],
    queryFn: () => api.semanal({ ano, semana, indicador: meta.indicador, culto: 'todos' }),
    enabled: meta.periodicidade === 'semanal' && meta.ativa,
    staleTime: 60_000,
  });

  const atual = data?.resumo.total || 0;
  const metaValor = Number(meta.meta_valor);
  const pct = Math.min(200, Math.round((atual / metaValor) * 100));
  const cor = pct >= 100 ? '#10b981' : pct >= 70 ? '#f59e0b' : '#ef4444';

  return (
    <Card className={!meta.ativa ? 'opacity-60' : ''}>
      <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2 space-y-0">
        <div>
          <CardTitle className="text-sm font-medium">{meta.rotulo}</CardTitle>
          <p className="text-[11px] text-muted-foreground capitalize mt-0.5">{meta.periodicidade}</p>
        </div>
        <div className="flex gap-1">
          <button
            onClick={onEdit}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            title="Editar"
          >
            <Edit2 className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => {
              if (confirm('Remover esta meta?')) onDelete();
            }}
            className="p-1.5 rounded hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors"
            title="Remover"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {meta.periodicidade !== 'semanal' ? (
          <div className="py-4 text-center text-sm text-muted-foreground">
            <div className="text-3xl font-bold text-foreground">
              {metaValor.toLocaleString('pt-BR')}
            </div>
            <div className="text-xs mt-1">meta {meta.periodicidade}</div>
          </div>
        ) : (
          <div>
            <div className="flex items-baseline justify-between mb-2">
              <motion.div
                key={atual}
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                className="text-3xl font-bold tabular-nums"
                style={{ color: cor }}
              >
                {atual.toLocaleString('pt-BR')}
              </motion.div>
              <div className="text-sm text-muted-foreground tabular-nums">
                / {metaValor.toLocaleString('pt-BR')}
              </div>
            </div>
            <div className="h-3 rounded-full bg-muted overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ background: cor }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, pct)}%` }}
                transition={{ duration: 0.9, ease: 'easeOut' }}
              />
            </div>
            <div className="flex items-baseline justify-between mt-1 text-xs">
              <span className="font-semibold" style={{ color: cor }}>{pct}%</span>
              <span className="text-muted-foreground">semana {semana}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function isoWeekOf(date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
  return { ano: d.getUTCFullYear(), semana: week };
}
