import { useCallback, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { voluntariado } from '@/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ShieldCheck, Search, Trash2, Loader2, UserPlus } from 'lucide-react';

/**
 * ⚠️ A lista era FIXA no código e guardava dimensão de CULTO — kids, sede,
 * quarta, ami, bridge, online. A área que a escala usa é outra: a de
 * VOLUNTARIADO, em `vol_teams.area` (Louvor, Produção, Integração, Cuidados…).
 * Os dois campos se chamavam "área" e nunca se cruzaram, então conceder
 * supervisão de "sede" não dava supervisão de equipe nenhuma.
 *
 * Agora vem do banco: quem manda é a área cadastrada nas equipes ativas.
 * 'geral' continua existindo como curinga — é o que preserva quem já tinha
 * acesso amplo.
 */
const CURINGA = { v: 'geral', label: 'Geral (todas as áreas)' };

export default function VolSupervisores() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState('');
  const [area, setArea] = useState('');

  const [posId, setPosId] = useState('');   // subárea (vol_positions.id) · '' = área inteira
  const { data: teams = [] } = useQuery<{
    id: string; area?: string | null; is_active?: boolean;
    positions?: { id: string; name: string; is_active?: boolean }[];
  }[]>({
    queryKey: ['vol-teams-manage'],
    queryFn: () => voluntariado.teamsManage.list(),
  });
  const AREAS = useMemo(() => {
    const vistas = new Map<string, string>();
    for (const t of teams) {
      if (t.is_active === false) continue;
      const a = (t.area || '').trim();
      if (a) vistas.set(a.toLowerCase(), a);
    }
    const lista = [...vistas.values()]
      .sort((x, y) => x.localeCompare(y, 'pt-BR'))
      .map(a => ({ v: a, label: a }));
    return [...lista, CURINGA];
  }, [teams]);
  // ⚠️ `useCallback`: ela entra na lista de dependências do agrupamento abaixo,
  // e recriada a cada render faria o memo nunca memorizar nada.
  const areaLabel = useCallback(
    (v: string) => AREAS.find(a => a.v.toLowerCase() === String(v).toLowerCase())?.label || v,
    [AREAS],
  );
  const [selMembro, setSelMembro] = useState<{ id: string; nome: string } | null>(null);

  /**
   * As SUBÁREAS da área escolhida = `vol_positions` das equipes daquela área.
   * Ex.: Integração → Assistência Médica, Batismo, Ceia, Estacionamento,
   * Intercessão, Ofertório, Recepção.
   *
   * ⚠️ Vocabulário: no app a árvore é "área → equipe → posição", e o comentário
   * de lá chama a EQUIPE de "subárea". O que o Matheus chama de subárea é a
   * POSIÇÃO (ofertório, estacionamento) — e é ela que o banco guarda aqui.
   *
   * ⚠️ O `value` é o ID, nunca o nome: "Recepção" existe em Integração E em
   * KIDS, "Cuidados" em AMI/Bridge/Voluntariado. Nome faria a concessão vazar.
   */
  const SUBAREAS = useMemo(() => {
    if (!area || area === CURINGA.v) return [];
    const norm = (v?: string | null) => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const vistas = new Map<string, string>();
    for (const t of teams) {
      if (t.is_active === false) continue;
      if (norm(t.area) !== norm(area)) continue;
      for (const p of t.positions || []) {
        if (p.is_active === false) continue;
        if (p?.id && p?.name) vistas.set(p.id, p.name);
      }
    }
    return [...vistas.entries()]
      .map(([v, label]) => ({ v, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [teams, area]);

  const { data: supers = [], isLoading } = useQuery<any[]>({
    queryKey: ['vol', 'supervisores'],
    queryFn: () => voluntariado.supervisores.list(),
  });
  const { data: pool = [] } = useQuery<any[]>({
    queryKey: ['vol', 'pool-supervisores'],
    queryFn: () => voluntariado.volunteersPool(false),
  });

  // Só quem tem vínculo de membro (membresia_id) pode ser supervisor (o app loga
  // como membro). Filtra pela busca.
  const candidatos = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return [];
    return (pool || [])
      .filter(p => p.membresia_id && (p.full_name || '').toLowerCase().includes(q))
      .slice(0, 8);
  }, [pool, busca]);

  const grantMut = useMutation({
    mutationFn: () => voluntariado.supervisores.grant(selMembro!.id, area, posId || null),
    onSuccess: () => {
      const alvo = posId
        ? `${SUBAREAS.find(p => p.v === posId)?.label || 'subárea'} (${areaLabel(area)})`
        : areaLabel(area);
      toast.success(`${selMembro!.nome} agora é supervisor de ${alvo}`);
      setSelMembro(null); setBusca(''); setPosId('');
      qc.invalidateQueries({ queryKey: ['vol', 'supervisores'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao conceder'),
  });
  const revokeMut = useMutation({
    mutationFn: (id: string) => voluntariado.supervisores.revoke(id),
    onSuccess: () => { toast.success('Supervisão removida'); qc.invalidateQueries({ queryKey: ['vol', 'supervisores'] }); },
    onError: (e: any) => toast.error(e?.message || 'Erro ao remover'),
  });

  const porArea = useMemo(() => {
    const m = new Map<string, any[]>();
    for (const s of supers) {
      const arr = m.get(s.area) || [];
      arr.push(s); m.set(s.area, arr);
    }
    return [...m.entries()].sort((a, b) => areaLabel(a[0]).localeCompare(areaLabel(b[0]), 'pt-BR'));
  }, [supers, areaLabel]);

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <ShieldCheck className="h-6 w-6" style={{ color: '#00B39D' }} /> Supervisores de área
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Quem pode montar e ver as escalas da área pelo <b>aplicativo</b>. A concessão é feita aqui; o supervisor opera pelo app.
        </p>
      </div>

      {/* Conceder */}
      {/* ⚠️⚠️ `relative z-20` NÃO é enfeite: sem ele a lista de sugestões de
          voluntário é COBERTA pelo card "Supervisores atuais" (reportado pelo
          Matheus em 25/08 — "a lista suspensa dos voluntários está cortada").

          A causa não é overflow: `.glass-surface` (a base do <Card>) declara no
          index.css que NÃO tem overflow justamente pra não cortar menu. O que
          acontece é STACKING CONTEXT — `.glass-surface` tem `backdrop-filter`, e
          qualquer valor diferente de `none` cria contexto próprio. Aí os dois
          cards viram contextos irmãos com `z-index: auto` e pintam na ordem do
          DOM: o de baixo cobre o que transborda do de cima. O `z-10` do dropdown
          é inerte — ele só ordena DENTRO do card dele, nunca entre cards.

          ⚠️ `z-20` e não mais: o header do AppShell é `sticky z-30`. Subir acima
          disso faria a lista passar POR CIMA do menu ao rolar a página. */}
      <Card className="relative z-20">
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><UserPlus className="h-4 w-4" /> Conceder supervisão</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar voluntário (membro)…"
                value={selMembro ? selMembro.nome : busca}
                onChange={(e) => { setSelMembro(null); setBusca(e.target.value); }}
              />
              {!selMembro && candidatos.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border bg-card shadow-lg max-h-56 overflow-y-auto">
                  {candidatos.map(c => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setSelMembro({ id: c.membresia_id, nome: c.full_name })}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-accent/50"
                    >
                      {c.full_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <Select value={area} onValueChange={(v) => { setArea(v); setPosId(''); }}>
              <SelectTrigger className="sm:w-44"><SelectValue placeholder="Escolher área" /></SelectTrigger>
              <SelectContent>{AREAS.map(a => <SelectItem key={a.v} value={a.v}>{a.label}</SelectItem>)}</SelectContent>
            </Select>
            {/* ⚠️ Só aparece quando a área ESCOLHIDA tem subárea cadastrada.
                Mostrar um seletor vazio (ou com "toda a área" sozinho) sugeriria
                que falta escolher algo que não existe. */}
            {SUBAREAS.length > 0 && (
              <Select value={posId || '__todas'} onValueChange={(v) => setPosId(v === '__todas' ? '' : v)}>
                <SelectTrigger className="sm:w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__todas">Toda a área ({SUBAREAS.length} subáreas)</SelectItem>
                  {SUBAREAS.map(p => <SelectItem key={p.v} value={p.v}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            <Button onClick={() => grantMut.mutate()} disabled={!selMembro || !area || grantMut.isPending} className="bg-[#00B39D] hover:bg-[#00B39D]/90">
              {grantMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Conceder'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Só aparecem voluntários com cadastro de membro (é por ele que o app identifica a pessoa).
          </p>
        </CardContent>
      </Card>

      {/* Lista por área */}
      <Card>
        <CardHeader><CardTitle className="text-base">Supervisores atuais</CardTitle></CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : supers.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Nenhum supervisor cadastrado ainda.</p>
          ) : (
            <div className="space-y-4">
              {porArea.map(([a, lista]) => (
                <div key={a}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{areaLabel(a)}</p>
                  <div className="space-y-1.5">
                    {lista.map(s => (
                      <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border p-2.5">
                        <span className="text-sm font-medium">
                          {s.membro?.nome || '—'}
                          {/* Sem subárea = área inteira. O rótulo diz qual das
                              duas coisas é, porque as duas linhas são idênticas
                              de resto e a diferença é de PERMISSÃO. */}
                          {s.position?.name
                            ? <span className="ml-2 rounded-full border px-2 py-0.5 text-[11px] font-normal text-muted-foreground">{s.position.name}</span>
                            : <span className="ml-2 text-[11px] font-normal text-muted-foreground">· toda a área</span>}
                        </span>
                        <button onClick={() => revokeMut.mutate(s.id)} className="text-muted-foreground hover:text-red-600" title="Remover supervisão">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
