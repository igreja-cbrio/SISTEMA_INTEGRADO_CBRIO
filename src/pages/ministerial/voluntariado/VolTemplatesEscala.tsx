import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Trash2, Pin, X, LayoutTemplate, CalendarPlus, Users, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { voluntariado } from '../../../api';

const TEAL = '#00B39D';

type Pessoa = { volunteer_id: string; full_name?: string };
type Item = {
  key: string;
  team_id: string;
  position_id: string | null;
  quantidade: number;
  fixo: boolean;
  pessoas: Pessoa[];
};
type Draft = { id?: string; nome: string; service_type_ids: string[]; itens: Item[] };

let _k = 0;
const novaKey = () => `it-${Date.now()}-${_k++}`;

export default function VolTemplatesEscala() {
  const qc = useQueryClient();
  const [selId, setSelId] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [aplicarPara, setAplicarPara] = useState<Draft | null>(null);

  const { data: templates = [] } = useQuery<any[]>({ queryKey: ['vol-esc-templates'], queryFn: () => voluntariado.scheduleTemplates.list() });
  const { data: teams = [] } = useQuery<any[]>({ queryKey: ['vol-teams-manage'], queryFn: () => voluntariado.teamsManage.list() });
  const { data: positions = [] } = useQuery<any[]>({ queryKey: ['vol-positions-all'], queryFn: () => voluntariado.positions.list() });
  const { data: serviceTypes = [] } = useQuery<any[]>({ queryKey: ['vol-service-types'], queryFn: () => voluntariado.serviceTypes.list() });
  const { data: profiles = [] } = useQuery<any[]>({ queryKey: ['vol-profiles'], queryFn: () => voluntariado.profiles.list() });

  const teamsById = useMemo(() => Object.fromEntries(teams.map(t => [t.id, t])), [teams]);
  const posById = useMemo(() => Object.fromEntries(positions.map(p => [p.id, p])), [positions]);
  const posByTeam = useMemo(() => {
    const m: Record<string, any[]> = {};
    for (const p of positions) (m[p.team_id] ||= []).push(p);
    return m;
  }, [positions]);
  const profById = useMemo(() => Object.fromEntries(profiles.map(p => [p.id, p])), [profiles]);

  async function abrir(id: string | 'new') {
    setSelId(id);
    if (id === 'new') { setDraft({ nome: '', service_type_ids: [], itens: [] }); return; }
    const full: any = await voluntariado.scheduleTemplates.get(id);
    setDraft({
      id: full.id, nome: full.nome || '', service_type_ids: full.service_type_ids || [],
      itens: (full.itens || []).map((i: any) => ({
        key: novaKey(), team_id: i.team_id, position_id: i.position_id || null,
        quantidade: i.quantidade || 1, fixo: !!i.fixo,
        pessoas: (i.pessoas || []).map((p: any) => ({ volunteer_id: p.volunteer_id, full_name: p.volunteer?.full_name })),
      })),
    });
  }

  const salvar = useMutation({
    mutationFn: async () => {
      if (!draft) return;
      const body = {
        nome: draft.nome.trim(),
        service_type_ids: draft.service_type_ids,
        itens: draft.itens.map((i, idx) => ({
          team_id: i.team_id, position_id: i.position_id, quantidade: i.quantidade,
          fixo: i.fixo, sort_order: idx, pessoas: i.pessoas.map(p => p.volunteer_id),
        })),
      };
      if (draft.id) return voluntariado.scheduleTemplates.update(draft.id, body);
      return voluntariado.scheduleTemplates.create(body);
    },
    onSuccess: () => { toast.success('Template salvo'); qc.invalidateQueries({ queryKey: ['vol-esc-templates'] }); setSelId(null); setDraft(null); },
    onError: (e: any) => toast.error(e?.message || 'Erro ao salvar'),
  });

  const remover = useMutation({
    mutationFn: (id: string) => voluntariado.scheduleTemplates.remove(id),
    onSuccess: () => { toast.success('Template removido'); qc.invalidateQueries({ queryKey: ['vol-esc-templates'] }); setSelId(null); setDraft(null); },
    onError: (e: any) => toast.error(e?.message || 'Erro ao remover'),
  });

  // ── Editor ────────────────────────────────────────────────────────────────
  if (draft) {
    const itensPorEquipe = draft.itens.reduce((acc: Record<string, Item[]>, it) => {
      (acc[it.team_id] ||= []).push(it); return acc;
    }, {});
    const upd = (key: string, patch: Partial<Item>) =>
      setDraft(d => d && ({ ...d, itens: d.itens.map(i => i.key === key ? { ...i, ...patch } : i) }));

    return (
      <div className="space-y-5 max-w-4xl">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <button onClick={() => { setSelId(null); setDraft(null); }} className="hover:text-foreground">Templates</button>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground">{draft.id ? draft.nome : 'Novo template'}</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Nome do template</Label>
            <Input value={draft.nome} onChange={e => setDraft(d => d && ({ ...d, nome: e.target.value }))} placeholder="Ex.: Domingo manhã" />
          </div>
          <div>
            <Label>Tipos de culto que sugerem este template</Label>
            <div className="flex flex-wrap gap-1.5 mt-1.5">
              {serviceTypes.map(st => {
                const on = draft.service_type_ids.includes(st.id);
                return (
                  <button key={st.id}
                    onClick={() => setDraft(d => d && ({ ...d, service_type_ids: on ? d.service_type_ids.filter(x => x !== st.id) : [...d.service_type_ids, st.id] }))}
                    className={`rounded-full border px-2.5 py-1 text-xs ${on ? 'text-white' : 'text-muted-foreground'}`}
                    style={on ? { background: TEAL, borderColor: TEAL } : {}}>
                    {st.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Itens agrupados por equipe */}
        <div className="space-y-3">
          {Object.entries(itensPorEquipe).map(([teamId, itens]) => (
            <Card key={teamId}>
              <CardContent className="p-4 space-y-2.5">
                <div className="font-semibold text-sm">{teamsById[teamId]?.name || 'Equipe'}</div>
                {itens.map(it => (
                  <ItemRow key={it.key} it={it} posById={posById} profById={profById} profiles={profiles}
                    onUpd={patch => upd(it.key, patch)}
                    onDel={() => setDraft(d => d && ({ ...d, itens: d.itens.filter(i => i.key !== it.key) }))} />
                ))}
              </CardContent>
            </Card>
          ))}
        </div>

        <AddItem teams={teams} posByTeam={posByTeam}
          onAdd={(team_id, position_id) => setDraft(d => d && ({ ...d, itens: [...d.itens, { key: novaKey(), team_id, position_id, quantidade: 1, fixo: false, pessoas: [] }] }))} />

        <div className="flex items-center justify-between border-t pt-4">
          <div>
            {draft.id && (
              <Button variant="ghost" className="text-red-600 gap-1.5" onClick={() => { if (confirm('Remover este template?')) remover.mutate(draft.id!); }}>
                <Trash2 className="h-4 w-4" /> Remover
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => { setSelId(null); setDraft(null); }}>Cancelar</Button>
            <Button className="gap-1.5" style={{ background: TEAL }}
              disabled={!draft.nome.trim() || !draft.itens.length || salvar.isPending}
              onClick={() => salvar.mutate()}>Salvar template</Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Lista ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><LayoutTemplate className="h-6 w-6" style={{ color: TEAL }} /> Templates de escala</h1>
          <p className="text-sm text-muted-foreground">Monte a composição esperada de cada culto e aplique com um clique.</p>
        </div>
        <Button className="gap-1.5" style={{ background: TEAL }} onClick={() => abrir('new')}><Plus className="h-4 w-4" /> Novo template</Button>
      </div>

      {templates.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">Nenhum template ainda. Crie o primeiro.</CardContent></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map(t => (
            <Card key={t.id} className="cursor-pointer hover:border-[#00B39D]/50" onClick={() => abrir(t.id)}>
              <CardContent className="p-4 space-y-2">
                <div className="font-semibold">{t.nome}</div>
                <div className="flex flex-wrap gap-1">
                  {(t.service_type_ids || []).map((id: string) => {
                    const st = serviceTypes.find(s => s.id === id);
                    return st ? <Badge key={id} variant="secondary" className="text-[10px]">{st.name}</Badge> : null;
                  })}
                </div>
                <div className="text-xs text-muted-foreground">{t.itens_count} vagas</div>
                <div className="flex gap-2 pt-1" onClick={e => e.stopPropagation()}>
                  <Button size="sm" variant="outline" className="gap-1 h-7 text-xs" onClick={() => abrir(t.id)}>Editar</Button>
                  <Button size="sm" className="gap-1 h-7 text-xs" style={{ background: TEAL }}
                    onClick={async () => { const full: any = await voluntariado.scheduleTemplates.get(t.id); setAplicarPara({ id: full.id, nome: full.nome, service_type_ids: full.service_type_ids || [], itens: [] }); }}>
                    <CalendarPlus className="h-3.5 w-3.5" /> Aplicar
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {aplicarPara && <AplicarDialog tpl={aplicarPara} onClose={() => setAplicarPara(null)} />}
    </div>
  );
}

// ── Linha de item (função) ─────────────────────────────────────────────────
function ItemRow({ it, posById, profById, profiles, onUpd, onDel }: any) {
  const [busca, setBusca] = useState('');
  const pos = it.position_id ? posById[it.position_id] : null;
  const encontrados = busca.trim().length >= 2
    ? profiles.filter((p: any) => p.full_name?.toLowerCase().includes(busca.toLowerCase()) && !it.pessoas.some((x: any) => x.volunteer_id === p.id)).slice(0, 6)
    : [];
  return (
    <div className="rounded-md border p-2.5 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm flex-1 min-w-[120px]">{pos ? pos.name : <span className="italic text-muted-foreground">Equipe toda</span>}</span>
        <button onClick={() => onUpd({ fixo: !it.fixo })}
          className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${it.fixo ? 'text-white' : 'text-muted-foreground'}`}
          style={it.fixo ? { background: TEAL, borderColor: TEAL } : {}}>
          <Pin className="h-3 w-3" /> {it.fixo ? 'Fixo' : 'Móvel'}
        </button>
        <div className="flex items-center gap-1 text-xs">
          <span className="text-muted-foreground">vagas</span>
          <Input type="number" min={1} value={it.quantidade} onChange={e => onUpd({ quantidade: Math.max(1, parseInt(e.target.value, 10) || 1) })} className="h-7 w-14" />
        </div>
        <button onClick={onDel} className="text-muted-foreground hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
      </div>
      {/* pessoas-padrão */}
      <div className="flex flex-wrap items-center gap-1.5">
        {it.pessoas.map((p: any) => (
          <span key={p.volunteer_id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px]">
            {p.full_name || profById[p.volunteer_id]?.full_name || 'Voluntário'}
            <button onClick={() => onUpd({ pessoas: it.pessoas.filter((x: any) => x.volunteer_id !== p.volunteer_id) })}><X className="h-3 w-3" /></button>
          </span>
        ))}
        <div className="relative">
          <Input value={busca} onChange={e => setBusca(e.target.value)} placeholder="+ pessoa-padrão" className="h-7 w-40 text-xs" />
          {encontrados.length > 0 && (
            <div className="absolute z-10 mt-1 w-52 rounded-md border bg-popover shadow-md">
              {encontrados.map((p: any) => (
                <button key={p.id} className="block w-full px-2.5 py-1.5 text-left text-xs hover:bg-muted"
                  onClick={() => { onUpd({ pessoas: [...it.pessoas, { volunteer_id: p.id, full_name: p.full_name }] }); setBusca(''); }}>
                  {p.full_name}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Adicionar item ──────────────────────────────────────────────────────────
function AddItem({ teams, posByTeam, onAdd }: any) {
  const [teamId, setTeamId] = useState('');
  const [posId, setPosId] = useState('__all__');
  const posOpts = teamId ? (posByTeam[teamId] || []) : [];
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-md border border-dashed p-3">
      <div>
        <Label className="text-xs">Equipe</Label>
        <Select value={teamId} onValueChange={v => { setTeamId(v); setPosId('__all__'); }}>
          <SelectTrigger className="h-9 w-48"><SelectValue placeholder="Escolher equipe" /></SelectTrigger>
          {/* ⚠️ Só equipes ATIVAS. Depois do remapeamento de 16/08 as 113
              equipes-espelho do Planning Center ficaram inativas (não foram
              apagadas, pra não cascatear em item de template) — oferecê-las
              aqui montaria composição em cima de equipe que não recebe mais
              ninguém, e a vaga nunca teria candidato. */}
          <SelectContent>{teams.filter((t) => t.is_active).map((t: any) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div>
        <Label className="text-xs">Função</Label>
        <Select value={posId} onValueChange={setPosId} disabled={!teamId}>
          <SelectTrigger className="h-9 w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">Equipe toda</SelectItem>
            {posOpts.map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <Button variant="outline" className="gap-1.5" disabled={!teamId}
        onClick={() => { onAdd(teamId, posId === '__all__' ? null : posId); }}>
        <Plus className="h-4 w-4" /> Adicionar função
      </Button>
    </div>
  );
}

// ── Aplicar template a um culto ───────────────────────────────────────────────
function AplicarDialog({ tpl, onClose }: { tpl: Draft; onClose: () => void }) {
  const qc = useQueryClient();
  const [serviceId, setServiceId] = useState('');
  const { data: services = [] } = useQuery<any[]>({ queryKey: ['vol-services-upcoming'], queryFn: () => voluntariado.services.upcoming() });
  const aplicar = useMutation({
    mutationFn: () => voluntariado.scheduleTemplates.apply(tpl.id!, serviceId),
    onSuccess: (r: any) => {
      toast.success(`Aplicado: ${r?.vagas ?? 0} vagas, ${r?.preenchidas ?? 0} já preenchidas`);
      qc.invalidateQueries({ queryKey: ['vol-services-upcoming'] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao aplicar'),
  });
  const fmt = (s: any) => {
    const d = s.scheduled_at ? new Date(s.scheduled_at) : null;
    return `${s.name || s.service_type?.name || 'Culto'}${d ? ' · ' + d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : ''}`;
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Aplicar "{tpl.nome}" a um culto</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">As vagas do template aparecem no culto e as pessoas-padrão já entram preenchidas.</p>
          <Select value={serviceId} onValueChange={setServiceId}>
            <SelectTrigger><SelectValue placeholder="Escolher o culto" /></SelectTrigger>
            <SelectContent>{services.map(s => <SelectItem key={s.id} value={s.id}>{fmt(s)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button style={{ background: TEAL }} disabled={!serviceId || aplicar.isPending} onClick={() => aplicar.mutate()}>
            <Users className="h-4 w-4 mr-1.5" /> Aplicar ao culto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
