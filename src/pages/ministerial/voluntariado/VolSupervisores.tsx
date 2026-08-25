import { useCallback, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { voluntariado } from '@/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ShieldCheck, Search, Trash2, Loader2, UserPlus, Pencil, Check, X } from 'lucide-react';

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

/**
 * Busca SEM ACENTO e sem caixa.
 *
 * ⚠️⚠️ ISTO ERA UM BUG DE VERDADE (25/08/2026). Relato do Matheus: *"a Mônica
 * não está aparecendo na lista de voluntários para eu colocar como
 * supervisora"*. Ela TINHA cadastro vinculado e não estava arquivada — o filtro
 * fazia `full_name.toLowerCase().includes(q)`, e digitar "monica" NÃO casa com
 * "M**ô**nica". A lista de voluntários (`/voluntariado/lista`) normaliza e
 * achava; este seletor não, então a tela parecia dizer que a pessoa não existe.
 *
 * A conclusão natural de quem usa é "falta gente na lista" — e foi o que ele
 * concluiu, duas vezes no mesmo dia (antes com o Palladino, por outro motivo).
 */
const norm = (v?: string | null) => String(v || '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().trim();

/** Quantos candidatos a lista mostra antes de declarar que truncou. */
const TETO_SUGESTOES = 20;

type Escopo = { area: string; posId: string; dia: string; periodo: string; semana: string };
type SubArea = { v: string; label: string };

/**
 * Os seletores de ESCOPO (área → subárea → dia → período → semana).
 *
 * ⚠️⚠️ COMPONENTE ÚNICO, usado por CONCEDER e por EDITAR. A régra não é
 * cosmética — "quarta é culto único, não tem manhã/noite" e "subárea depende da
 * área escolhida" moram aqui. Duas cópias do JSX divergiriam no primeiro
 * ajuste, e uma delas passaria a mandar pro servidor uma combinação que o
 * `validarEscopoSupervisao` recusa com 400.
 */
function SeletoresEscopo({
  valor, onChange, areas, subareasDe, compacto = false,
}: {
  valor: Escopo;
  onChange: (e: Escopo) => void;
  areas: { v: string; label: string }[];
  subareasDe: (area: string) => SubArea[];
  compacto?: boolean;
}) {
  const subs = subareasDe(valor.area);
  const set = (patch: Partial<Escopo>) => onChange({ ...valor, ...patch });
  const w = compacto ? 'w-full sm:w-36' : 'sm:w-44';
  return (
    <>
      <Select
        value={valor.area}
        onValueChange={(v) => set({ area: v, posId: '' })}   /* trocar de área zera a subárea */
      >
        <SelectTrigger className={w}><SelectValue placeholder="Escolher área" /></SelectTrigger>
        <SelectContent>{areas.map(a => <SelectItem key={a.v} value={a.v}>{a.label}</SelectItem>)}</SelectContent>
      </Select>

      {subs.length > 0 && (
        <Select value={valor.posId || '__todas'} onValueChange={(v) => set({ posId: v === '__todas' ? '' : v })}>
          <SelectTrigger className={compacto ? 'w-full sm:w-40' : 'sm:w-52'}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__todas">Toda a área ({subs.length} subáreas)</SelectItem>
            {subs.map(x => <SelectItem key={x.v} value={x.v}>{x.label}</SelectItem>)}
          </SelectContent>
        </Select>
      )}

      <Select
        value={valor.dia || '__qualquer'}
        onValueChange={(v) => {
          const d = v === '__qualquer' ? '' : v;
          /* Quarta é culto ÚNICO: sair do domingo zera o período. */
          set({ dia: d, periodo: d === 'domingo' ? valor.periodo : '' });
        }}
      >
        <SelectTrigger className={w}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__qualquer">Qualquer culto</SelectItem>
          <SelectItem value="domingo">Domingo</SelectItem>
          <SelectItem value="quarta">Quarta</SelectItem>
        </SelectContent>
      </Select>

      {valor.dia === 'domingo' && (
        <Select value={valor.periodo || '__ambos'} onValueChange={(v) => set({ periodo: v === '__ambos' ? '' : v })}>
          <SelectTrigger className={compacto ? 'w-full sm:w-32' : 'sm:w-40'}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__ambos">Manhã e noite</SelectItem>
            <SelectItem value="manha">Manhã</SelectItem>
            <SelectItem value="noite">Noite</SelectItem>
          </SelectContent>
        </Select>
      )}

      {valor.dia && (
        <Select value={valor.semana || '__todas'} onValueChange={(v) => set({ semana: v === '__todas' ? '' : v })}>
          <SelectTrigger className={compacto ? 'w-full sm:w-44' : 'sm:w-52'}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__todas">Todas as semanas</SelectItem>
            <SelectItem value="1">1ª semana do mês</SelectItem>
            <SelectItem value="2">2ª semana</SelectItem>
            <SelectItem value="3">3ª semana</SelectItem>
            <SelectItem value="4">4ª semana</SelectItem>
          </SelectContent>
        </Select>
      )}
    </>
  );
}

/**
 * O turno da concessão em texto ("1ª sem · Dom manhã").
 *
 * ⚠️ Sem isto, duas linhas com PERMISSÕES diferentes ficam idênticas na tela —
 * e a diferença entre "supervisiona todo domingo" e "supervisiona só o 1º" é
 * exatamente o que a pessoa vem aqui conferir.
 */
function rotuloRodizio(s: { culto_dia?: string | null; culto_periodo?: string | null; culto_semana?: number | null }): string | null {
  const partes: string[] = [];
  if (s.culto_semana) partes.push(`${s.culto_semana}ª sem`);
  if (s.culto_dia) {
    const dia = s.culto_dia === 'domingo' ? 'Dom' : 'Qua';
    const per = s.culto_periodo === 'manha' ? ' manhã' : s.culto_periodo === 'noite' ? ' noite' : '';
    partes.push(dia + per);
  }
  return partes.length ? partes.join(' · ') : null;
}

export default function VolSupervisores() {
  const qc = useQueryClient();
  const [busca, setBusca] = useState('');
  const [area, setArea] = useState('');

  const [posId, setPosId] = useState('');   // subárea (vol_positions.id) · '' = área inteira
  // ⚠️ RODÍZIO (25/08) · a lista real da Ariel é "1 Dom manhã / 2 Dom Noite /
  // 1ª 4ª feira …": semana do mês × dia × período. NÃO é horário de culto —
  // medido no PCO, 102 dos 110 escalados têm só horário de ensaio e os 8 com
  // horário de culto têm as QUATRO horas, então aquela dimensão não separa
  // ninguém. '' em cada eixo = curinga ("qualquer").
  const [cultoDia, setCultoDia] = useState('');
  const [cultoPeriodo, setCultoPeriodo] = useState('');
  const [cultoSemana, setCultoSemana] = useState('');
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
  const subareasDe = useCallback((areaAlvo: string): { v: string; label: string }[] => {
    if (!areaAlvo || areaAlvo === CURINGA.v) return [];
    const vistas = new Map<string, string>();
    for (const t of teams) {
      if (t.is_active === false) continue;
      if (norm(t.area) !== norm(areaAlvo)) continue;
      for (const pos of t.positions || []) {
        if (pos.is_active === false) continue;
        if (pos?.id && pos?.name) vistas.set(pos.id, pos.name);
      }
    }
    return [...vistas.entries()]
      .map(([v, label]) => ({ v, label }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [teams]);
  const SUBAREAS = useMemo(() => subareasDe(area), [subareasDe, area]);

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
  /**
   * ⚠️ `slice` movido pra DEPOIS da contagem, e o total vai pra tela.
   * O teto antigo era 8 e **silencioso**: com 596 perfis vinculados, digitar um
   * primeiro nome comum cortava gente sem dizer — a mesma doença do acento
   * (a tela some com linha e deixa o usuário concluir que o dado não existe).
   */
  const achados = useMemo(() => {
    const q = norm(busca);
    if (!q) return [];
    return (pool || []).filter(p => p.membresia_id && norm(p.full_name).includes(q));
  }, [pool, busca]);
  const candidatos = useMemo(() => achados.slice(0, TETO_SUGESTOES), [achados]);

  /**
   * ⚠️⚠️ QUEM BATEU NA BUSCA MAS ESTÁ SEM CADASTRO DE MEMBRO (25/08/2026).
   *
   * Relato do Matheus: *"o Luiz Felipe Palladino está na minha lista de
   * voluntários mas na lista suspensa para colocar ele como supervisor ele não
   * aparece."* A tela ficava MUDA: o nome existia no pool, o filtro
   * `p.membresia_id` o descartava, e nada explicava. Ele foi procurar no banco.
   *
   * Medido: **339 dos 936 perfis de voluntário (36%) estão sem `membresia_id`**
   * — então isto não é um caso isolado, é mais de um terço da lista.
   *
   * O filtro está CERTO e não pode cair: o app identifica o supervisor pelo
   * cadastro de membro, então conceder a um perfil sem membro criaria uma
   * supervisão que nunca funciona. O que estava errado era o SILÊNCIO — a tela
   * escondia sem dizer, que é a mesma classe do painel que esconde o próprio
   * buraco.
   */
  const semCadastro = useMemo(() => {
    const q = norm(busca);
    if (!q) return [];
    return (pool || []).filter(p => !p.membresia_id && norm(p.full_name).includes(q)).slice(0, 4);
  }, [pool, busca]);

  const grantMut = useMutation({
    mutationFn: () => voluntariado.supervisores.grant(selMembro!.id, area, posId || null, {
      culto_dia: cultoDia || null,
      // Quarta é culto ÚNICO (decisão do Matheus): nunca manda período nela.
      culto_periodo: cultoDia === 'domingo' ? (cultoPeriodo || null) : null,
      culto_semana: cultoSemana ? Number(cultoSemana) : null,
    }),
    onSuccess: () => {
      const alvo = posId
        ? `${SUBAREAS.find(p => p.v === posId)?.label || 'subárea'} (${areaLabel(area)})`
        : areaLabel(area);
      toast.success(`${selMembro!.nome} agora é supervisor de ${alvo}`);
      setSelMembro(null); setBusca(''); setPosId('');
      setCultoDia(''); setCultoPeriodo(''); setCultoSemana('');
      qc.invalidateQueries({ queryKey: ['vol', 'supervisores'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao conceder'),
  });
  // ⚠️ Edição (25/08 · pedido do Matheus: "preciso conseguir editar os
  // supervisores também, o horário deles, área e etc"). Antes só havia conceder
  // e revogar, então trocar o turno de alguém exigia apagar e recriar — o que
  // perdia `concedido_por` e `created_at`, a trilha de quem deu o acesso.
  const [editId, setEditId] = useState<string | null>(null);
  const [editEsc, setEditEsc] = useState<Escopo>({ area: '', posId: '', dia: '', periodo: '', semana: '' });

  const updateMut = useMutation({
    mutationFn: () => voluntariado.supervisores.update(editId!, {
      area: editEsc.area,
      position_id: editEsc.posId || null,
      culto_dia: editEsc.dia || null,
      // Quarta é culto ÚNICO — nunca manda período nela (o servidor recusa com 400).
      culto_periodo: editEsc.dia === 'domingo' ? (editEsc.periodo || null) : null,
      culto_semana: editEsc.semana ? Number(editEsc.semana) : null,
    }),
    onSuccess: () => {
      toast.success('Supervisão atualizada');
      setEditId(null);
      qc.invalidateQueries({ queryKey: ['vol', 'supervisores'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao editar'),
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
              {!selMembro && candidatos.length === 0 && semCadastro.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border border-amber-500/50 bg-card p-3 shadow-lg">
                  <p className="text-xs font-semibold text-amber-600">
                    {semCadastro.length === 1 ? 'Encontrado, mas sem cadastro de membro:' : 'Encontrados, mas sem cadastro de membro:'}
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {semCadastro.map(c => (
                      <li key={c.id} className="text-[13px] text-foreground">{c.full_name}</li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                    O app identifica o supervisor pelo cadastro de membro, então a concessão só
                    funciona depois de vincular. Resolva em <b>Entradas → Identidade</b> e a pessoa
                    passa a aparecer aqui.
                  </p>
                </div>
              )}
              {!selMembro && candidatos.length > 0 && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border bg-card shadow-lg max-h-56 overflow-y-auto">
                  {achados.length > candidatos.length && (
                    <p className="border-b bg-muted/40 px-3 py-1.5 text-[11px] text-muted-foreground">
                      Mostrando {candidatos.length} de {achados.length} — refine a busca.
                    </p>
                  )}
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
            <SeletoresEscopo
              valor={{ area, posId, dia: cultoDia, periodo: cultoPeriodo, semana: cultoSemana }}
              onChange={(e) => { setArea(e.area); setPosId(e.posId); setCultoDia(e.dia); setCultoPeriodo(e.periodo); setCultoSemana(e.semana); }}
              areas={AREAS}
              subareasDe={subareasDe}
            />
            {/* ⚠️ Declara a régua do 5º: a lista da Ariel só vai até 4, e culto
                sem supervisor é pior que supervisor repetido. */}
            {cultoSemana === '1' && (
              <p className="self-center text-[11px] text-muted-foreground">
                O 5º {cultoDia === 'quarta' ? 'da quarta' : 'domingo'} do mês, quando existe, também cai aqui.
              </p>
            )}
            <Button onClick={() => grantMut.mutate()} disabled={!selMembro || !area || grantMut.isPending} className="bg-[#00B39D] hover:bg-[#00B39D]/90 sm:ml-auto">
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
                      <div key={s.id} className="rounded-lg border p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">
                          {s.membro?.nome || '—'}
                          {/* Sem subárea = área inteira. O rótulo diz qual das
                              duas coisas é, porque as duas linhas são idênticas
                              de resto e a diferença é de PERMISSÃO. */}
                          {s.position?.name
                            ? <span className="ml-2 rounded-full border px-2 py-0.5 text-[11px] font-normal text-muted-foreground">{s.position.name}</span>
                            : <span className="ml-2 text-[11px] font-normal text-muted-foreground">· toda a área</span>}
                          {rotuloRodizio(s)
                            ? <span className="ml-1.5 rounded-full border border-[#00B39D]/40 bg-[#00B39D]/5 px-2 py-0.5 text-[11px] font-normal text-[#00806f]">{rotuloRodizio(s)}</span>
                            : <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">· todo culto</span>}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              setEditId(s.id);
                              setEditEsc({
                                area: s.area || '',
                                posId: s.position_id || '',
                                dia: s.culto_dia || '',
                                periodo: s.culto_periodo || '',
                                semana: s.culto_semana ? String(s.culto_semana) : '',
                              });
                            }}
                            className="text-muted-foreground hover:text-[#00B39D]"
                            title="Editar área, subárea e turno"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button onClick={() => revokeMut.mutate(s.id)} className="text-muted-foreground hover:text-red-600" title="Remover supervisão">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>

                      {/* ⚠️ Edição INLINE, não modal: o supervisor está sendo
                          comparado com os vizinhos da mesma área, e um modal
                          esconde justamente o contexto que faz a pessoa decidir
                          qual turno mexer. */}
                      {editId === s.id && (
                        <div className="mt-2.5 border-t pt-2.5">
                          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                            <SeletoresEscopo
                              valor={editEsc}
                              onChange={setEditEsc}
                              areas={AREAS}
                              subareasDe={subareasDe}
                              compacto
                            />
                            <div className="flex items-center gap-1.5 sm:ml-auto">
                              <Button
                                size="sm"
                                onClick={() => updateMut.mutate()}
                                disabled={!editEsc.area || updateMut.isPending}
                                className="bg-[#00B39D] hover:bg-[#00B39D]/90 gap-1.5"
                              >
                                {updateMut.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                                Salvar
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => setEditId(null)} className="gap-1.5">
                                <X className="h-3.5 w-3.5" /> Cancelar
                              </Button>
                            </div>
                          </div>
                          {editEsc.semana === '1' && (
                            <p className="mt-1.5 text-[11px] text-muted-foreground">
                              O 5º {editEsc.dia === 'quarta' ? 'da quarta' : 'domingo'} do mês, quando existe, também cai aqui.
                            </p>
                          )}
                        </div>
                      )}
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
