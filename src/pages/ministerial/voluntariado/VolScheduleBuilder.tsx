import { useState, useMemo, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { voluntariado } from '../../../api';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  useUpcomingServices, useServiceSchedules, useVolTeamsManaged,
  useCreateSchedule, useDeleteSchedule, useUpdateSchedule, useBulkSchedule,
  useAutoFillSchedule, useDesfazerLote, useCopySchedule, useCreateService,
  useVolServiceTypes, useMontagemContexto,
} from './hooks';
import EquipeEscalaCard, { type AreaEscala, type GrupoFuncao } from './components/schedules/EquipeEscalaCard';
import PainelEscalar, { type Vaga } from './components/schedules/PainelEscalar';
import MatrizEscala from './components/schedules/MatrizEscala';
import VolunteerDetailDialog from './components/schedules/VolunteerDetailDialog';
import { Plus, Wand2, Copy, Calendar, Users, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { normalizarBusca } from '@/lib/busca';
import type { VolTeam, VolService } from './types';

// MIME types custom do drag & drop HTML5 (padrão usado no Planner do Marketing).
const MIME_VOL = 'application/x-cbrio-vol';
const MIME_SCHED = 'application/x-cbrio-sched';

const CHAVE_FIXADAS = 'cbrio_vol_areas_fixadas';

/**
 * Montar escala — reescrita em 13/08/2026 no formato do Planning Center
 * Services, a pedido do Matheus ("deixar no estilo do Service e mais prático
 * pros supervisores de área escalarem seus voluntários").
 *
 * O que mudou de estrutura, e por quê (tudo medido na ferramenta deles):
 *
 *  · **A vaga em aberto mora dentro da área.** Antes, quem estava escalado
 *    ficava num card e o que FALTAVA num card "Cobertura" separado — o buraco
 *    não estava onde se olha a equipe.
 *  · **Minhas áreas primeiro.** O Services separa "MY TEAMS" de "OTHER TEAMS";
 *    aqui a área é a do usuário (`vol_teams.area` × áreas do perfil) ou
 *    fixada na estrela. Sem isso o supervisor de Cuidados rolava a Banda toda.
 *  · **Painel lateral no contexto da vaga**, ordenado por rodízio, no lugar do
 *    modal com a igreja inteira em ordem alfabética.
 *  · **Auto-preencher que preenche as VAGAS** (e não a equipe toda, que era o
 *    que o endpoint fazia) — com desfazer.
 */
export default function VolScheduleBuilder() {
  const { userAreas } = useAuth() as any;
  const { data: services = [], isLoading: servicesLoading } = useUpcomingServices();
  const { data: teams = [] } = useVolTeamsManaged();
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const { data: schedules = [], isLoading: schedulesLoading } = useServiceSchedules(selectedServiceId || undefined);
  const [visao, setVisao] = useState<'culto' | 'matriz'>('culto');
  const [showCreateService, setShowCreateService] = useState(false);
  const [showCopyDialog, setShowCopyDialog] = useState(false);
  const { data: contexto, isLoading: contextoLoading } = useMontagemContexto(selectedServiceId || undefined) as any;
  const qc = useQueryClient();

  const selectedService = services.find(s => s.id === selectedServiceId);

  // Cultos agrupados por DIA (passo 1 do seletor). O domingo rende um dia com
  // vários horários; quarta/AMI/Bridge rendem dias de 1 horário só.
  const [diaSel, setDiaSel] = useState('');
  const dias = useMemo(() => {
    const mapa = new Map<string, { chave: string; rotulo: string; servicos: any[] }>();
    for (const s of services) {
      const d = new Date(s.scheduled_at);
      // Chave pelo dia LOCAL (o navegador do usuário está em BRT). Usar
      // toISOString aqui jogaria o culto de domingo 19h pra segunda.
      const chave = format(d, 'yyyy-MM-dd');
      if (!mapa.has(chave)) {
        mapa.set(chave, { chave, rotulo: format(d, 'EEE, dd/MM', { locale: ptBR }), servicos: [] });
      }
      mapa.get(chave)!.servicos.push(s);
    }
    const lista = [...mapa.values()];
    for (const d of lista) d.servicos.sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
    return lista.sort((a, b) => a.chave.localeCompare(b.chave));
  }, [services]);
  const diaAtual = dias.find(d => d.chave === diaSel);

  // Dia com UM horário só não tem passo 2 — seleciona o culto direto.
  useEffect(() => {
    if (!diaAtual) return;
    if (diaAtual.servicos.length === 1) setSelectedServiceId(diaAtual.servicos[0].id);
    else if (!diaAtual.servicos.some((s: any) => s.id === selectedServiceId)) setSelectedServiceId('');
  }, [diaSel, diaAtual, selectedServiceId]);

  // ── Composição esperada do culto (template aplicado) ──────────────────────
  const { data: coberturaRaw } = useQuery<any>({
    queryKey: ['vol-escala-cobertura', selectedServiceId],
    queryFn: () => voluntariado.escalaCobertura(selectedServiceId),
    enabled: !!selectedServiceId,
  });

  // Áreas fixadas pelo usuário (preferência de exibição, por navegador).
  const [fixadas, setFixadas] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(CHAVE_FIXADAS) || '[]'); } catch { return []; }
  });
  const alternarFixada = (teamId: string | null) => {
    if (!teamId) return;
    setFixadas(prev => {
      const n = prev.includes(teamId) ? prev.filter(t => t !== teamId) : [...prev, teamId];
      try { localStorage.setItem(CHAVE_FIXADAS, JSON.stringify(n)); } catch { /* preferência é best-effort */ }
      return n;
    });
  };

  // ⚠️ "Minha área" = a área do perfil casa com `vol_teams.area` OU a pessoa
  // fixou na estrela. A estrela existe porque `vol_teams.area` é texto livre e
  // pode estar vazio — sem ela, a separação simplesmente não apareceria pra
  // quem trabalha numa equipe sem área preenchida.
  const minhasNormalizadas = useMemo(
    () => new Set((userAreas || []).map((a: string) => normalizarBusca(a)).filter(Boolean)),
    [userAreas],
  );
  const ehMinha = (t?: VolTeam | null) => {
    if (!t) return false;
    if (fixadas.includes(t.id)) return true;
    const area = (t as any).area;
    return !!area && minhasNormalizadas.has(normalizarBusca(area));
  };
  // Versão por id — é o que a matriz consome (lá a linha carrega só o team_id).
  // ⚠️ Declarada DEPOIS de `ehMinha`: const usada antes da declaração é a
  // armadilha de TDZ que já mordeu neste repo.
  const ehMinhaArea = (teamId: string | null) => ehMinha(teams.find(t => t.id === teamId));

  // ── Monta as áreas: composição + quem já está escalado ────────────────────
  const areas: AreaEscala[] = useMemo(() => {
    const itens: any[] = coberturaRaw?.itens || [];
    const porTeam = new Map<string, AreaEscala>();
    const usados = new Set<string>();

    const teamDe = (id: string | null) => teams.find(t => t.id === id);
    const chaveTeam = (id: string | null, nome: string) => id || `nome:${nome}`;

    const garante = (teamId: string | null, nome: string): AreaEscala => {
      const k = chaveTeam(teamId, nome);
      if (!porTeam.has(k)) {
        const t = teamDe(teamId);
        porTeam.set(k, {
          team_id: teamId, team: nome, cor: (t as any)?.color || null,
          minha: ehMinha(t), grupos: [],
          stats: { total: 0, confirmados: 0, recusados: 0, pendentes: 0 },
        });
      }
      return porTeam.get(k)!;
    };

    // 1 · Os itens da composição viram os grupos (função por função).
    for (const it of itens) {
      const area = garante(it.team_id, it.team || 'Sem equipe');
      // ⚠️ Mesma régua de casamento do backend (`_coberturaDoCulto`): pelo
      // `escala_culto_item_id` quando existe, senão por (equipe, função).
      const escalados = (schedules as any[]).filter(s =>
        s.volunteer_id && (
          s.escala_culto_item_id === it.id ||
          (!s.escala_culto_item_id && s.team_id === it.team_id && (s.position_id || null) === (it.position_id || null))
        ));
      for (const s of escalados) usados.add(s.id);
      area.grupos.push({
        item_id: it.id, position_id: it.position_id, position: it.position,
        alvo: it.alvo, faltam: Math.max(0, it.alvo - escalados.length), escalados,
      });
    }

    // 2 · Quem está escalado fora de qualquer item ainda precisa aparecer —
    // some da tela quem foi escalado à mão numa área sem template seria o
    // pior tipo de erro: a pessoa acha que não escalou e escala outra.
    for (const s of schedules as any[]) {
      if (usados.has(s.id)) continue;
      const nome = s.team_name || 'Sem equipe';
      const area = garante(s.team_id || null, nome);
      let g = area.grupos.find(x => !x.item_id && (x.position_id || null) === (s.position_id || null));
      if (!g) {
        g = { item_id: null, position_id: s.position_id || null, position: s.position_name || null, alvo: 0, faltam: 0, escalados: [] };
        area.grupos.push(g);
      }
      g.escalados.push(s);
    }

    // 3 · Contadores por área (escalado ≠ confirmou).
    for (const area of porTeam.values()) {
      for (const g of area.grupos) {
        for (const s of g.escalados) {
          area.stats.total++;
          if (s.confirmation_status === 'confirmed') area.stats.confirmados++;
          else if (s.confirmation_status === 'declined') area.stats.recusados++;
          else area.stats.pendentes++;
        }
      }
    }

    return [...porTeam.values()].sort((a, b) => a.team.localeCompare(b.team, 'pt-BR'));
  }, [coberturaRaw, schedules, teams, fixadas, minhasNormalizadas]);

  const minhasAreas = areas.filter(a => a.minha);
  const outrasAreas = areas.filter(a => !a.minha);
  const totalVagas = areas.reduce((s, a) => s + a.grupos.reduce((x, g) => x + g.faltam, 0), 0);
  const totalEscalados = areas.reduce((s, a) => s + a.stats.total, 0);
  const totalConfirmados = areas.reduce((s, a) => s + a.stats.confirmados, 0);

  // Conflito (já serve em outro culto do mesmo dia) de quem já está escalado.
  const conflitoDe = (sch: any) => {
    const info = (contexto?.pool || []).find((v: any) =>
      (sch.volunteer_id && v.id === sch.volunteer_id) ||
      (sch.planning_center_person_id && v.planning_center_id === sch.planning_center_person_id));
    return (info?.escaladoEm || []) as any[];
  };

  // ── Ações ─────────────────────────────────────────────────────────────────
  const createSchedule = useCreateSchedule();
  const updateSchedule = useUpdateSchedule();
  const deleteSchedule = useDeleteSchedule();
  const bulkSchedule = useBulkSchedule();
  const [vagaAberta, setVagaAberta] = useState<Vaga | null>(null);
  // Detalhe da pessoa. ⚠️ Guarda o nome junto do id: quem veio do Planning
  // Center sem cadastro tem `volunteer_id` nulo, e o diálogo precisa do nome
  // pra dizer de quem se trata antes de explicar que não há perfil vinculado.
  const [detalhe, setDetalhe] = useState<{ id: string | null; nome: string } | null>(null);

  const abrirVaga = (area: AreaEscala, g: GrupoFuncao) => setVagaAberta({
    team_id: area.team_id, team: area.team,
    position_id: g.position_id, position: g.position,
    item_id: g.item_id, faltam: g.faltam,
  });

  const escalarMarcados = (pessoas: any[], vaga: Vaga) => {
    bulkSchedule.mutate({
      service_id: selectedServiceId,
      assignments: pessoas.map(p => ({
        volunteer_id: p.id,
        volunteer_name: p.full_name,
        team_id: vaga.team_id || undefined,
        team_name: vaga.team,
        position_id: vaga.position_id || undefined,
        position_name: vaga.position || undefined,
        escala_culto_item_id: vaga.item_id || undefined,
        planning_center_person_id: p.planning_center_id || undefined,
      })),
    } as any, {
      onSuccess: (r: any) => {
        toast.success(`${r.created} escalado(s) em ${vaga.team}`);
        // Pulado por indisponibilidade é DECLARADO — sumir em silêncio é o
        // que faz a coordenação descobrir a falta no domingo.
        if (r.pulados?.length) {
          toast.warning(`${r.pulados.length} não entrou por indisponibilidade: ${r.pulados.map((p: any) => p.nome).join(', ')}`, { duration: 10000 });
        }
        setVagaAberta(null);
      },
      onError: (e: any) => toast.error(e.message || 'Erro ao escalar'),
    });
  };

  const removerEscala = (sch: any) => {
    if (!confirm(`Tirar ${sch.volunteer_name} da escala?`)) return;
    deleteSchedule.mutate(sch.id, {
      onSuccess: () => toast.success('Removido da escala'),
      onError: () => toast.error('Erro ao remover'),
    });
  };

  // Drop numa área: (a) de um pool arrastável → cria; (b) de outra área → move.
  // ⚠️ O caminho (b) é o que a tela exercita hoje (mover a pessoa de área
  // arrastando a linha). O (a) sobrou do pool que saiu daqui em 13/08 e fica
  // por ser o contrato do drop — se voltar a existir uma lista arrastável,
  // funciona sem mexer aqui.
  const handleDropOnTeam = (e: React.DragEvent, teamId: string | null, teamName: string) => {
    e.preventDefault();
    const volRaw = e.dataTransfer.getData(MIME_VOL);
    if (volRaw) {
      const v = JSON.parse(volRaw);
      createSchedule.mutate({
        service_id: selectedServiceId, volunteer_id: v.volunteer_id, volunteer_name: v.volunteer_name,
        team_id: teamId || undefined, team_name: teamName,
        planning_center_person_id: v.planning_center_person_id || undefined,
      }, {
        onSuccess: () => toast.success(`${v.volunteer_name} escalado em ${teamName}`),
        onError: (err: any) => toast.error(err.message || 'Erro ao escalar'),
      });
      return;
    }
    const schedRaw = e.dataTransfer.getData(MIME_SCHED);
    if (schedRaw) {
      const s = JSON.parse(schedRaw);
      updateSchedule.mutate({ id: s.id, data: { team_id: teamId, team_name: teamName, position_id: null, position_name: null } }, {
        onSuccess: () => toast.success(`${s.volunteer_name} movido para ${teamName}`),
        onError: (err: any) => toast.error(err.message || 'Erro ao mover'),
      });
    }
  };

  // ── Template do tipo de culto ─────────────────────────────────────────────
  const { data: sugestoes = [] } = useQuery<any[]>({
    queryKey: ['vol-template-sugerido', selectedService?.service_type_id],
    queryFn: () => voluntariado.scheduleTemplates.porTipo(selectedService!.service_type_id),
    enabled: !!selectedService?.service_type_id,
  });
  const [aplicando, setAplicando] = useState(false);
  const aplicarTemplate = async (templateId: string, nome: string) => {
    setAplicando(true);
    try {
      const r: any = await voluntariado.scheduleTemplates.apply(templateId, selectedServiceId);
      qc.invalidateQueries({ queryKey: ['vol-escala-cobertura', selectedServiceId] });
      qc.invalidateQueries({ queryKey: ['vol', 'schedules', selectedServiceId] });
      qc.invalidateQueries({ queryKey: ['vol', 'montagem-contexto', selectedServiceId] });
      toast.success(`${nome}: ${r?.vagas || 0} vagas · ${r?.preenchidas || 0} já preenchidas`);
      // Quem o template QUERIA escalar mas não pôde (marcou ausência) é
      // DECLARADO — senão a vaga fica aberta sem ninguém entender por que a
      // "pessoa de sempre" não entrou.
      const pulados = r?.pulados || [];
      if (pulados.length) {
        toast.warning(
          `${pulados.length} pessoa(s) do template não entraram: ${pulados.slice(0, 3).map((p: any) => `${p.nome} (${p.motivo})`).join(' · ')}${pulados.length > 3 ? '…' : ''}`,
          { duration: 12000 },
        );
      }
    } catch (e: any) {
      toast.error(e.message || 'Erro ao aplicar o template');
    } finally { setAplicando(false); }
  };

  const semComposicao = (coberturaRaw?.itens || []).length === 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-foreground">Montar Escala</h1>
          {/* Um culto × matriz — o mesmo par de visões do Services (a tela do
              plano e o botão "Matrix"). A matriz responde "onde estão os
              buracos do mês?"; a de um culto, "como está este domingo?". */}
          <div className="flex rounded-lg border p-0.5">
            {([['culto', 'Um culto'], ['matriz', 'Matriz']] as const).map(([v, rotulo]) => (
              <button
                key={v} onClick={() => setVisao(v)}
                className={`h-7 px-3 rounded-md text-xs font-medium transition ${visao === v ? 'bg-[#00B39D] text-white' : 'text-muted-foreground hover:bg-muted/50'}`}
              >
                {rotulo}
              </button>
            ))}
          </div>
        </div>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowCreateService(true)}>
          <Plus className="h-4 w-4" /> Criar Culto
        </Button>
      </div>

      {visao === 'matriz' && (
        <MatrizEscala ehMinhaArea={ehMinhaArea} onFixar={alternarFixada} />
      )}

      {visao === 'culto' && (
      <>
      {/* Seleção do culto em DOIS passos: dia → horário. */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div>
            <Label className="mb-2 block text-sm">1 · Dia do culto</Label>
            <div className="flex flex-wrap gap-2">
              {dias.map(d => (
                <button
                  key={d.chave}
                  onClick={() => setDiaSel(d.chave)}
                  className={`rounded-lg border px-3 py-2 text-left transition ${d.chave === diaSel ? 'border-[#00B39D] bg-[#00B39D]/5' : 'border-border hover:bg-muted/50'}`}
                >
                  <span className="block text-sm font-medium capitalize">{d.rotulo}</span>
                  <span className="block text-xs text-muted-foreground">
                    {d.servicos.length === 1 ? d.servicos[0].name : `${d.servicos.length} horários`}
                  </span>
                </button>
              ))}
              {dias.length === 0 && !servicesLoading && (
                <p className="text-sm text-muted-foreground">Nenhum culto próximo. Use "Criar Culto".</p>
              )}
            </div>
          </div>

          {diaAtual && diaAtual.servicos.length > 1 && (
            <div>
              <Label className="mb-2 block text-sm">2 · Horário</Label>
              <div className="flex flex-wrap gap-2">
                {diaAtual.servicos.map(svc => (
                  <button
                    key={svc.id}
                    onClick={() => setSelectedServiceId(svc.id)}
                    className={`rounded-lg border px-3 py-2 transition ${svc.id === selectedServiceId ? 'border-[#00B39D] bg-[#00B39D]/5' : 'border-border hover:bg-muted/50'}`}
                  >
                    <span className="block text-sm font-medium">{format(new Date(svc.scheduled_at), 'HH:mm')}</span>
                    <span className="block text-xs text-muted-foreground">{svc.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedServiceId && selectedService && (
        <>
          {/* Resumo enxuto: o que importa é quanto FALTA. */}
          <div className="grid grid-cols-3 gap-3">
            <Card><CardContent className="p-3 text-center">
              <p className="text-xl font-bold">{totalEscalados}</p>
              <p className="text-xs text-muted-foreground">Escalados</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <p className="text-xl font-bold text-green-600">{totalConfirmados}</p>
              <p className="text-xs text-muted-foreground">Confirmados</p>
            </CardContent></Card>
            <Card><CardContent className="p-3 text-center">
              <p className={`text-xl font-bold ${totalVagas ? 'text-red-500' : 'text-green-600'}`}>{totalVagas}</p>
              <p className="text-xs text-muted-foreground">Vagas em aberto</p>
            </CardContent></Card>
          </div>

          <div className="flex flex-wrap gap-2">
            <AutoPreencherBotao
              serviceId={selectedServiceId}
              minhasAreas={minhasAreas}
              desabilitado={semComposicao}
            />
            {/* ⚠️ Caminho para escalar em área que NÃO está na composição —
                inclusive quando não há composição nenhuma. Sem ele, um culto
                sem template não teria como receber ninguém por esta tela. */}
            <EscalarEmAreaBotao teams={teams} onEscolher={(t) => setVagaAberta({
              team_id: t.id, team: t.name, position_id: null, position: null, item_id: null, faltam: 0,
            })} />
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setShowCopyDialog(true)}>
              <Copy className="h-4 w-4" /> Copiar de outro culto
            </Button>
          </div>

          {/* ⚠️ Sem composição E sem template pro tipo de culto, a pessoa
              ficaria sem saída: as vagas não existem, então o auto-preencher
              recusa e não há botão nenhum na tela explicando o porquê. */}
          {semComposicao && sugestoes.length === 0 && (
            <Card className="border-amber-300 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-900/60">
              <CardContent className="p-4">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                  Este tipo de culto ainda não tem um template de escala
                </p>
                <p className="text-xs text-amber-800/80 dark:text-amber-300/80 mt-0.5">
                  É o template que diz quais áreas servem e quantas vagas cada uma tem — sem ele não existe
                  "vaga em aberto" pra preencher, e o auto-preencher não tem como saber quantas pessoas chamar.
                  Crie um em Voluntariado › Templates de escala. Enquanto isso, use "Escalar em uma área"
                  aqui embaixo para montar na mão.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Template do tipo de culto · atalho pra montar a base da escala. */}
          {semComposicao && sugestoes.length > 0 && (
            <Card className="border-[#00B39D]/40 bg-[#00B39D]/5">
              <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">Este culto ainda não tem escala montada</p>
                  <p className="text-xs text-muted-foreground">
                    O template traz as áreas, o número de vagas e já escala quem costuma servir em cada uma.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {sugestoes.map((t: any) => (
                    <Button key={t.id} size="sm" className="gap-1.5" disabled={aplicando}
                      onClick={() => aplicarTemplate(t.id, t.nome)}>
                      <Wand2 className="h-4 w-4" /> Aplicar "{t.nome}"
                    </Button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {schedulesLoading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando escala...</div>
          ) : areas.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                <Users className="h-10 w-10 text-muted-foreground/30 mb-3" />
                <p className="text-muted-foreground">Nenhuma área na escala deste culto</p>
                <p className="text-sm text-muted-foreground/60">Aplique um template para trazer as áreas e as vagas</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {minhasAreas.length > 0 && (
                <section className="space-y-2">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Minhas áreas
                  </h2>
                  {minhasAreas.map(a => (
                    <EquipeEscalaCard
                      key={a.team_id || a.team} area={a} conflitoDe={conflitoDe}
                      onPreencher={g => abrirVaga(a, g)} onRemover={removerEscala}
                      onDropTeam={handleDropOnTeam} onFixar={alternarFixada}
                      onVerDetalhe={sch => setDetalhe({ id: sch.volunteer_id || null, nome: sch.volunteer_name })}
                    />
                  ))}
                </section>
              )}
              <section className="space-y-2">
                {minhasAreas.length > 0 && (
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground pt-2">
                    Outras áreas
                  </h2>
                )}
                {outrasAreas.map(a => (
                  <EquipeEscalaCard
                    key={a.team_id || a.team} area={a} conflitoDe={conflitoDe}
                    onPreencher={g => abrirVaga(a, g)} onRemover={removerEscala}
                    onDropTeam={handleDropOnTeam} onFixar={alternarFixada}
                      onVerDetalhe={sch => setDetalhe({ id: sch.volunteer_id || null, nome: sch.volunteer_name })}
                  />
                ))}
              </section>
              {minhasAreas.length === 0 && areas.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Nenhuma área marcada como sua. Use a estrela no cabeçalho da área para fixá-la aqui em cima.
                </p>
              )}
            </div>
          )}
        </>
      )}

      {!selectedServiceId && !servicesLoading && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <Calendar className="h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-lg font-medium text-muted-foreground">Selecione um culto</p>
            <p className="text-sm text-muted-foreground/60 mt-1">Escolha o dia e o horário para montar a escala</p>
          </CardContent>
        </Card>
      )}

      <PainelEscalar
        vaga={vagaAberta}
        pool={contexto?.pool || []}
        rodizio={contexto?.rodizio}
        carregando={contextoLoading}
        onClose={() => setVagaAberta(null)}
        onEscalar={escalarMarcados}
        escalando={bulkSchedule.isPending}
      />

      {showCopyDialog && selectedServiceId && (
        <CopyScheduleDialog
          targetServiceId={selectedServiceId}
          services={services}
          onClose={() => setShowCopyDialog(false)}
        />
      )}
      </>
      )}

      {/* Criar culto vale nas DUAS visões — quem está olhando a matriz e vê o
          domingo faltando precisa criar o culto sem trocar de tela. */}
      {showCreateService && <CreateServiceDialog onClose={() => setShowCreateService(false)} />}

      {/* Fora do bloco da visão "um culto" de propósito: fechar o diálogo não
          pode depender de qual visão está aberta. */}
      <VolunteerDetailDialog
        volunteerId={detalhe?.id ?? null}
        volunteerName={detalhe?.nome || ''}
        open={!!detalhe}
        onOpenChange={(v) => { if (!v) setDetalhe(null); }}
      />
    </div>
  );
}

/** Escolhe uma área e abre o painel de escalar nela (fora da composição). */
function EscalarEmAreaBotao({ teams, onEscolher }: { teams: VolTeam[]; onEscolher: (t: VolTeam) => void }) {
  const [aberto, setAberto] = useState(false);
  const ativas = teams.filter(t => t.is_active);
  if (!ativas.length) return null;
  return (
    <div className="relative">
      <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setAberto(!aberto)}>
        <Plus className="h-4 w-4" /> Escalar em uma área <ChevronDown className="h-3.5 w-3.5" />
      </Button>
      {aberto && (
        <div className="absolute top-full left-0 mt-1 bg-popover border rounded-lg shadow-lg z-20 min-w-52 max-h-72 overflow-y-auto p-1">
          {ativas.map(t => (
            <button
              key={t.id}
              className="w-full text-left px-3 py-2 rounded text-sm hover:bg-accent flex items-center gap-2"
              onClick={() => { setAberto(false); onEscolher(t); }}
            >
              {(t as any).color && <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: (t as any).color }} />}
              <span className="truncate">{t.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Auto-preencher · o equivalente do "Auto-schedule" do Services.
 *
 * ⚠️ O resultado é mostrado NOMEANDO quem entrou e por quê ("há 7 semanas"), e
 * com Desfazer. O botão antigo escalava a equipe inteira e dizia só
 * "N voluntário(s) escalado(s)" — ninguém tinha como conferir o que aconteceu
 * sem ir olhar a escala linha a linha, e não havia volta.
 */
function AutoPreencherBotao({ serviceId, minhasAreas, desabilitado }: {
  serviceId: string; minhasAreas: AreaEscala[]; desabilitado: boolean;
}) {
  const autoFill = useAutoFillSchedule();
  const desfazer = useDesfazerLote();
  const [menu, setMenu] = useState(false);
  const [resultado, setResultado] = useState<any>(null);

  const rodar = (teamIds?: string[]) => {
    setMenu(false);
    autoFill.mutate({ service_id: serviceId, team_ids: teamIds }, {
      onSuccess: (r: any) => {
        setResultado(r);
        if (!r.created) toast.info(r.mensagem || 'Nada a preencher');
      },
      onError: (e: any) => toast.error(e.message || 'Erro ao auto-preencher'),
    });
  };

  const idsMinhas = minhasAreas.map(a => a.team_id).filter(Boolean) as string[];

  return (
    <>
      <div className="relative">
        <Button
          size="sm" variant="outline" className="gap-1.5"
          disabled={desabilitado || autoFill.isPending}
          title={desabilitado ? 'Aplique um template primeiro — é ele que define quantas vagas cada área tem' : undefined}
          onClick={() => (idsMinhas.length ? setMenu(!menu) : rodar())}
        >
          <Wand2 className="h-4 w-4" />
          {autoFill.isPending ? 'Preenchendo…' : 'Auto-preencher vagas'}
          {idsMinhas.length > 0 && <ChevronDown className="h-3.5 w-3.5" />}
        </Button>
        {menu && (
          <div className="absolute top-full left-0 mt-1 bg-popover border rounded-lg shadow-lg z-20 min-w-56 p-1">
            <button className="w-full text-left px-3 py-2 rounded text-sm hover:bg-accent" onClick={() => rodar(idsMinhas)}>
              Só as minhas áreas ({minhasAreas.length})
            </button>
            <button className="w-full text-left px-3 py-2 rounded text-sm hover:bg-accent" onClick={() => rodar()}>
              Todas as áreas do culto
            </button>
          </div>
        )}
      </div>

      {resultado && (
        <Dialog open onOpenChange={() => setResultado(null)}>
          <DialogContent className="max-w-lg max-h-[85vh] flex flex-col p-0 gap-0">
            <DialogHeader className="px-5 pt-5 pb-3 border-b shrink-0">
              <DialogTitle>
                {resultado.created > 0
                  ? `${resultado.created} vaga(s) preenchida(s)`
                  : 'Nada foi preenchido'}
              </DialogTitle>
            </DialogHeader>
            <div className="flex-1 overflow-y-auto min-h-0 px-5 py-3 space-y-4">
              {resultado.detalhe?.length > 0 && (
                <div className="space-y-1">
                  {resultado.detalhe.map((d: any, i: number) => (
                    <div key={i} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0">
                        <span className="text-muted-foreground">{d.equipe}{d.funcao ? ` · ${d.funcao}` : ''} → </span>
                        <span className="font-medium">{d.nome}</span>
                      </span>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{d.rotulo}</span>
                    </div>
                  ))}
                </div>
              )}
              {/* Vaga que ficou sem ninguém é DECLARADA: preenchimento parcial
                  que se apresenta como sucesso é como a falta chega no
                  domingo sem ninguém saber. */}
              {resultado.sem_candidato?.length > 0 && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-900/10 dark:border-amber-900/60 p-3">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-1">
                    Sem candidato disponível
                  </p>
                  <ul className="text-xs text-amber-800/90 dark:text-amber-300/90 space-y-0.5">
                    {resultado.sem_candidato.map((v: any, i: number) => (
                      <li key={i}>{v.equipe}{v.funcao ? ` · ${v.funcao}` : ''} — {v.restantes} vaga(s)</li>
                    ))}
                  </ul>
                  <p className="text-[11px] text-amber-700/80 dark:text-amber-400/80 mt-1.5">
                    Quem está indisponível ou já serve em outro culto deste dia não entra automaticamente.
                    Use "preencher" na área para escalar mesmo assim.
                  </p>
                </div>
              )}
              {resultado.mensagem && !resultado.detalhe?.length && (
                <p className="text-sm text-muted-foreground">{resultado.mensagem}</p>
              )}
            </div>
            <DialogFooter className="border-t px-5 py-3 shrink-0">
              {resultado.schedule_ids?.length > 0 && (
                <Button
                  variant="outline" size="sm" disabled={desfazer.isPending}
                  onClick={() => desfazer.mutate({ service_id: serviceId, ids: resultado.schedule_ids }, {
                    onSuccess: (r: any) => { toast.success(`${r.removidas} escala(s) desfeita(s)`); setResultado(null); },
                    onError: (e: any) => toast.error(e.message || 'Erro ao desfazer'),
                  })}
                >
                  Desfazer
                </Button>
              )}
              <Button size="sm" onClick={() => setResultado(null)} className="bg-[#00B39D] hover:bg-[#00B39D]/90">
                Fechar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function CopyScheduleDialog({ targetServiceId, services, onClose }: {
  targetServiceId: string; services: VolService[]; onClose: () => void;
}) {
  const copySchedule = useCopySchedule();
  const [sourceId, setSourceId] = useState('');

  const handleCopy = () => {
    if (!sourceId) return toast.error('Selecione o culto de origem');
    copySchedule.mutate({ from_service_id: sourceId, to_service_id: targetServiceId }, {
      onSuccess: (data: any) => {
        toast.success(`${data.copied} escala(s) copiada(s)`);
        // Quem ficou de fora por ter avisado que não pode neste culto é
        // DECLARADO — senão a coordenação copia a escala e não percebe que
        // faltou gente até o domingo.
        const pulados = data.pulados || [];
        if (pulados.length) {
          toast.warning(
            `${pulados.length} não copiado(s) por indisponibilidade: ${pulados.slice(0, 4).join(', ')}${pulados.length > 4 ? '…' : ''}`,
            { duration: 12000 },
          );
        }
        onClose();
      },
      onError: (err: any) => toast.error(err.message || 'Erro ao copiar'),
    });
  };

  const availableServices = services.filter(s => s.id !== targetServiceId);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Copiar escala de outro culto</DialogTitle>
        </DialogHeader>
        <div className="py-4">
          <Label>Culto de origem</Label>
          <Select value={sourceId} onValueChange={setSourceId}>
            <SelectTrigger><SelectValue placeholder="Selecione o culto" /></SelectTrigger>
            <SelectContent>
              {availableServices.map(svc => (
                <SelectItem key={svc.id} value={svc.id}>
                  {svc.name} — {format(new Date(svc.scheduled_at), 'EEEE, dd/MM', { locale: ptBR })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleCopy} disabled={copySchedule.isPending} className="bg-[#00B39D] hover:bg-[#00B39D]/90">
            Copiar escala
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateServiceDialog({ onClose }: { onClose: () => void }) {
  const createService = useCreateService();
  const { data: serviceTypes = [] } = useVolServiceTypes();
  const [name, setName] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [serviceTypeId, setServiceTypeId] = useState('');

  const handleSelectType = (typeId: string) => {
    setServiceTypeId(typeId);
    const st = serviceTypes.find(t => t.id === typeId);
    if (st) setName(st.name);
  };

  const handleCreate = () => {
    if (!name.trim() || !scheduledAt) return toast.error('Nome e data obrigatórios');
    createService.mutate({
      name: name.trim(),
      service_type_name: name.trim(),
      service_type_id: serviceTypeId || undefined,
      scheduled_at: new Date(scheduledAt).toISOString(),
    }, {
      onSuccess: () => { toast.success('Culto criado'); onClose(); },
      onError: (err: any) => toast.error(err.message || 'Erro ao criar'),
    });
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar Culto</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {serviceTypes.length > 0 && (
            <div>
              <Label>Tipo de Culto</Label>
              <Select value={serviceTypeId} onValueChange={handleSelectType}>
                <SelectTrigger><SelectValue placeholder="Selecione (opcional)" /></SelectTrigger>
                <SelectContent>
                  {serviceTypes.filter(t => t.is_active).map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <Label>Nome</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: Culto Domingo Manhã" />
          </div>
          <div>
            <Label>Data e Horário</Label>
            <Input type="datetime-local" value={scheduledAt} onChange={e => setScheduledAt(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={createService.isPending} className="bg-[#00B39D] hover:bg-[#00B39D]/90">
            Criar Culto
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
