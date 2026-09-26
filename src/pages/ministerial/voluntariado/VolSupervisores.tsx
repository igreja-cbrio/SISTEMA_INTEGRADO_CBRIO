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

/**
 * ESCOPO de uma concessão (24/09/2026: + papel, + time, + sábado).
 * `teamId` cheio = escopo por TIME (a área vem do time, só pra agrupar).
 * `area = 'geral'` + `dia` = escopo por CULTO (o dia da semana).
 * `area = 'geral'` sem nada = GERAL (é o que o admin tem).
 * `papel`: leitor (só lê) · lider (edita) · admin (geral, gerencia estruturas).
 */
type Escopo = { papel: string; teamId: string; area: string; posId: string; dia: string; periodo: string; semana: string };
type TimeOpcao = { v: string; label: string; area: string };
const PAPEIS = [
  { v: 'leitor', label: 'Leitor', ajuda: 'abre a Montar escala e só lê' },
  { v: 'lider', label: 'Líder', ajuda: 'monta e altera a escala' },
  { v: 'admin', label: 'Admin', ajuda: 'tudo, geral — gerencia pessoas e estruturas' },
];
const DIA_LABEL: Record<string, string> = { domingo: 'Domingo', quarta: 'Quarta', sabado: 'Sábado' };
const DIA_CURTO: Record<string, string> = { domingo: 'Dom', quarta: 'Qua', sabado: 'Sáb' };
type ConcessaoLinha = {
  papel?: string | null; area?: string | null; team_id?: string | null; position_id?: string | null;
  culto_dia?: string | null; culto_periodo?: string | null; culto_semana?: number | null;
};
function papelDaLinha(s: ConcessaoLinha | null | undefined): 'leitor' | 'lider' | 'admin' {
  if (s?.papel === 'admin') return 'admin';
  const semRecorte = !s?.team_id && !s?.position_id && !s?.culto_dia && !s?.culto_periodo && !s?.culto_semana;
  if (s?.area === CURINGA.v && semRecorte) return 'admin';   // o geral sem recorte É o admin
  return s?.papel === 'leitor' ? 'leitor' : 'lider';
}
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
  valor, onChange, areas, times, subareasDe, posicoesDoTime, compacto = false,
}: {
  valor: Escopo;
  onChange: (e: Escopo) => void;
  areas: { v: string; label: string }[];
  times: TimeOpcao[];
  subareasDe: (area: string) => SubArea[];
  posicoesDoTime: (teamId: string) => SubArea[];
  compacto?: boolean;
}) {
  const porTime = !!valor.teamId;
  const subs = porTime ? posicoesDoTime(valor.teamId) : subareasDe(valor.area);
  const set = (patch: Partial<Escopo>) => onChange({ ...valor, ...patch });
  const admin = valor.papel === 'admin';
  // O select de escopo codifica time como `t:<id>`; área e geral vão crus.
  const escopoValor = admin ? CURINGA.v : porTime ? `t:${valor.teamId}` : (valor.area || '');
  /**
   * ⚠️ Largura MÍNIMA + `flex-1`, não largura fixa (25/08). Com `sm:w-44` e
   * `sm:w-52` fixos, os cinco seletores somavam mais que o card e o navegador
   * apertava tudo — foi o que quebrou o layout. Agora eles dividem o espaço e
   * caem pra linha de baixo quando não cabem, sem nunca ficar ilegíveis.
   */
  const w = compacto ? 'w-full sm:w-auto sm:min-w-[8.5rem] sm:flex-1' : 'w-full sm:w-auto sm:min-w-[9.5rem] sm:flex-1';
  return (
    <>
      <Select
        value={valor.papel || 'lider'}
        onValueChange={(v) => {
          /* Admin é sempre GERAL sem recorte — o servidor recusa outra coisa. */
          if (v === 'admin') set({ papel: v, teamId: '', area: CURINGA.v, posId: '', dia: '', periodo: '', semana: '' });
          else set({ papel: v });
        }}
      >
        <SelectTrigger className={w}><SelectValue placeholder="Papel" /></SelectTrigger>
        <SelectContent>
          {PAPEIS.map(p => (
            <SelectItem key={p.v} value={p.v}>
              {p.label} <span className="text-muted-foreground">· {p.ajuda}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={escopoValor}
        disabled={admin}
        onValueChange={(v) => {
          /* trocar de escopo zera a subárea; time carrega a própria área */
          if (v.startsWith('t:')) {
            const id = v.slice(2);
            set({ teamId: id, area: times.find(t => t.v === id)?.area || '', posId: '' });
          } else {
            set({ teamId: '', area: v, posId: '' });
          }
        }}
      >
        <SelectTrigger className={w}><SelectValue placeholder="Escolher time, área ou geral" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={CURINGA.v}>Geral (todos os times, todos os cultos)</SelectItem>
          {times.map(t => <SelectItem key={t.v} value={`t:${t.v}`}>Time · {t.label}</SelectItem>)}
          {areas.filter(a => a.v !== CURINGA.v).map(a => <SelectItem key={a.v} value={a.v}>Área · {a.label}</SelectItem>)}
        </SelectContent>
      </Select>
      {!admin && subs.length > 0 && (
        <Select value={valor.posId || '__todas'} onValueChange={(v) => set({ posId: v === '__todas' ? '' : v })}>
          <SelectTrigger className={w}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__todas">{porTime ? `Todo o time (${subs.length} funções)` : `Toda a área (${subs.length} subáreas)`}</SelectItem>
            {subs.map(x => <SelectItem key={x.v} value={x.v}>{x.label}</SelectItem>)}
          </SelectContent>
        </Select>
      )}
      {admin ? (
        <span className="text-xs text-muted-foreground">Admin é geral, sem recorte de time ou culto.</span>
      ) : (<>

      <Select
        value={valor.dia || '__qualquer'}
        onValueChange={(v) => {
          const d = v === '__qualquer' ? '' : v;
          /* Quarta e sábado são culto ÚNICO: sair do domingo zera o período. */
          set({ dia: d, periodo: d === 'domingo' ? valor.periodo : '' });
        }}
      >
        <SelectTrigger className={w}><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__qualquer">Qualquer culto</SelectItem>
          <SelectItem value="domingo">Domingo</SelectItem>
          <SelectItem value="quarta">Quarta</SelectItem>
          <SelectItem value="sabado">Sábado (AMI, Bridge)</SelectItem>
        </SelectContent>
      </Select>

      {valor.dia === 'domingo' && (
        <Select value={valor.periodo || '__ambos'} onValueChange={(v) => set({ periodo: v === '__ambos' ? '' : v })}>
          <SelectTrigger className={w}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__ambos">Manhã e noite</SelectItem>
            <SelectItem value="manha">Manhã</SelectItem>
            <SelectItem value="noite">Noite</SelectItem>
          </SelectContent>
        </Select>
      )}

      {valor.dia && (
        <Select value={valor.semana || '__todas'} onValueChange={(v) => set({ semana: v === '__todas' ? '' : v })}>
          <SelectTrigger className={w}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__todas">Todas as semanas</SelectItem>
            <SelectItem value="1">1ª semana do mês</SelectItem>
            <SelectItem value="2">2ª semana</SelectItem>
            <SelectItem value="3">3ª semana</SelectItem>
            <SelectItem value="4">4ª semana</SelectItem>
          </SelectContent>
        </Select>
      )}
      </>)}
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
    const dia = DIA_CURTO[s.culto_dia] || s.culto_dia;
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
  // PAPEL + TIME (24/09/2026): leitor | lider | admin · teamId cheio = escopo por time.
  const [papel, setPapel] = useState('lider');
  const [teamId, setTeamId] = useState('');
  const { data: teams = [] } = useQuery<{
    id: string; name?: string | null; area?: string | null; is_active?: boolean;
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
  // Times ATIVOS, pro escopo por time. A área vai junto só pra agrupar a lista.
  const TIMES = useMemo<TimeOpcao[]>(() => teams
    .filter(t => t.is_active !== false && t.name)
    .map(t => ({ v: t.id, label: String(t.name), area: (t.area || '').trim().toLowerCase() }))
    .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR')), [teams]);
  const posicoesDoTime = useCallback((id: string): SubArea[] => {
    const t = teams.find(x => x.id === id);
    return (t?.positions || []).filter(p => p.is_active !== false && p.id && p.name)
      .map(p => ({ v: p.id, label: p.name }))
      .sort((a, b) => a.label.localeCompare(b.label, 'pt-BR'));
  }, [teams]);
  const timeLabel = useCallback((id?: string | null) => TIMES.find(t => t.v === id)?.label || null, [TIMES]);

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
    // Com time, `area` vai vazia: o servidor deriva do time (e recusa admin com recorte).
    mutationFn: () => voluntariado.supervisores.grant(selMembro!.id, teamId ? '' : area, posId || null, {
      culto_dia: cultoDia || null,
      culto_periodo: cultoDia === 'domingo' ? (cultoPeriodo || null) : null,
      culto_semana: cultoSemana ? Number(cultoSemana) : null,
      papel,
      team_id: teamId || null,
    }),
    onSuccess: () => {
      const base = teamId ? `o time ${timeLabel(teamId) || ''}` : areaLabel(area);
      const alvo = posId
        ? `${(teamId ? posicoesDoTime(teamId) : SUBAREAS).find(p => p.v === posId)?.label || 'subárea'} (${teamId ? timeLabel(teamId) : areaLabel(area)})`
        : base;
      const nomePapel = PAPEIS.find(p => p.v === papel)?.label || 'Líder';
      toast.success(`${selMembro!.nome} agora é ${nomePapel} de ${alvo}`);
      setSelMembro(null); setBusca(''); setPosId(''); setTeamId(''); setPapel('lider');
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
  const [editEsc, setEditEsc] = useState<Escopo>({ papel: 'lider', teamId: '', area: '', posId: '', dia: '', periodo: '', semana: '' });

  const updateMut = useMutation({
    mutationFn: () => voluntariado.supervisores.update(editId!, {
      area: editEsc.teamId ? '' : editEsc.area,
      team_id: editEsc.teamId || null,
      papel: editEsc.papel || 'lider',
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

  /**
   * POR QUE a pessoa não aparece — consultado sob demanda.
   *
   * ⚠️⚠️ A mensagem anterior MENTIA: dizia "resolva em Entradas → Identidade" e o
   * Matheus foi lá e não achou ninguém. A fila de `/entradas` é de INSCRIÇÃO
   * órfã, não de perfil de voluntário sem cadastro — e, medido em 26/08, dos 148
   * perfis ativos sem vínculo **101 (68%) não têm cadastro nenhum**. Mandar pra
   * uma tela que não resolve nem existe pro caso é pior que não dizer nada.
   */
  const [diagAberto, setDiagAberto] = useState<string | null>(null);
  const { data: diag, isLoading: diagCarregando } = useQuery<any>({
    queryKey: ['vol', 'supervisor-candidatos', diagAberto],
    queryFn: () => voluntariado.supervisores.candidatos(diagAberto!),
    enabled: !!diagAberto,
  });

  const vincularMut = useMutation({
    mutationFn: ({ volId, membroId }: { volId: string; membroId: string }) =>
      voluntariado.supervisores.vincular(volId, membroId),
    onSuccess: (r: any) => {
      toast.success(`Vinculado a ${r?.membro_nome || 'cadastro'} — agora a pessoa aparece na busca`);
      setDiagAberto(null);
      qc.invalidateQueries({ queryKey: ['vol', 'pool-supervisores'] });
    },
    onError: (e: any) => toast.error(e?.message || 'Erro ao vincular'),
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => voluntariado.supervisores.revoke(id),
    onSuccess: () => { toast.success('Supervisão removida'); qc.invalidateQueries({ queryKey: ['vol', 'supervisores'] }); },
    onError: (e: any) => toast.error(e?.message || 'Erro ao remover'),
  });

  /**
   * Agrupa por TURNO → ÁREA → pessoas (pedido do Matheus, 25/08: *"no card de
   * supervisores atuais quero a separação por culto: primeiro domingo, segundo
   * domingo… e aí dentro de cada dia ver as áreas e seus respectivos
   * supervisores"*).
   *
   * ⚠️ A ordem NÃO é alfabética e isso é o ponto: a pessoa lê esta tela pra
   * responder "quem cobre o 2º domingo de manhã?". Domingo antes de quarta,
   * semana crescente, manhã antes de noite — a ordem em que a escala acontece.
   *
   * ⚠️ Os grupos AMPLOS ("todas as semanas", "todo culto") vão pro FIM, não pro
   * começo: eles são a exceção, e no topo empurrariam os turnos reais pra baixo
   * da dobra. Ver também o aviso de `semTurno` — quem está em "todo culto"
   * provavelmente foi cadastrado antes do rodízio existir.
   */
  const porTurno = useMemo(() => {
    const DIA_ORDEM: Record<string, number> = { domingo: 1, quarta: 2, sabado: 3 };
    const PER_ORDEM: Record<string, number> = { manha: 1, noite: 2 };

    const chave = (x: any) => [x.culto_dia || '', x.culto_periodo || '', x.culto_semana || ''].join('|');
    const rotulo = (x: any) => {
      if (!x.culto_dia) return 'Todo culto (sem turno definido)';
      const dia = DIA_LABEL[x.culto_dia] || x.culto_dia;
      const per = x.culto_periodo === 'manha' ? ' · manhã' : x.culto_periodo === 'noite' ? ' · noite' : '';
      if (!x.culto_semana) return `${dia}${per} — todas as semanas`;
      const ord = x.culto_dia === 'domingo' ? `${x.culto_semana}º` : `${x.culto_semana}ª`;
      return `${ord} ${dia}${per}`;
    };
    // Peso: turnos específicos primeiro (na ordem da escala), amplos no fim.
    const peso = (x: any) => {
      if (!x.culto_dia) return 9000;                       // todo culto
      const base = (DIA_ORDEM[x.culto_dia] || 4) * 1000;
      if (!x.culto_semana) return base + 500;              // "todas as semanas"
      return base + Number(x.culto_semana) * 10 + (PER_ORDEM[x.culto_periodo] || 0);
    };

    const grupos = new Map<string, { rotulo: string; peso: number; areas: Map<string, any[]> }>();
    for (const sup of supers) {
      const k = chave(sup);
      if (!grupos.has(k)) grupos.set(k, { rotulo: rotulo(sup), peso: peso(sup), areas: new Map() });
      const g = grupos.get(k)!;
      const arr = g.areas.get(sup.area) || [];
      arr.push(sup);
      g.areas.set(sup.area, arr);
    }
    return [...grupos.values()]
      .sort((a, b) => a.peso - b.peso || a.rotulo.localeCompare(b.rotulo, 'pt-BR'))
      .map(g => ({
        rotulo: g.rotulo,
        amplo: g.peso >= 1500,
        areas: [...g.areas.entries()]
          .sort((a, b) => areaLabel(a[0]).localeCompare(areaLabel(b[0]), 'pt-BR')),
      }));
  }, [supers, areaLabel]);

  /**
   * Quem ficou SEM turno mas não é o curinga `geral`.
   *
   * ⚠️ Isto existe porque o print do Matheus mostrou 4 pessoas com "· todo
   * culto" que, pela lista da Ariel, TÊM turno — foram cadastradas antes do
   * rodízio subir. Hoje elas supervisionam TODOS os cultos, o que é mais acesso
   * do que a casa combinou. A tela declara em vez de deixar passar.
   */
  const semTurno = useMemo(
    // Time inteiro e admin cobrem todo culto DE PROPÓSITO — só a concessão por
    // ÁREA sem turno é a que a casa não combinou.
    () => supers.filter((x: any) => !x.culto_dia && !x.team_id && x.area !== CURINGA.v && papelDaLinha(x) !== 'admin'),
    [supers],
  );

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
          {/* ⚠️⚠️ LINHA PRÓPRIA PRA BUSCA (25/08 · "melhore o layout pq tá quebrado
              quando vou selecionando as áreas e os dias e turnos"). A primeira
              versão punha o input e os CINCO seletores no mesmo `flex-row`: o
              `flex-1` do input era esmagado até ~50px, o ícone da lupa quebrava
              pra baixo, a nota do 5º domingo virava uma coluna de uma palavra e o
              botão Conceder era empurrado fora. Seletor tem largura mínima; campo
              de busca precisa de espaço — os dois não cabem na mesma linha. */}
          <div className="relative">
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
                  <ul className="mt-1 space-y-1">
                    {semCadastro.map(c => (
                      <li key={c.id} className="text-[13px] text-foreground">
                        <div className="flex items-center gap-2">
                          <span>{c.full_name}</span>
                          <button
                            type="button"
                            onClick={() => setDiagAberto(diagAberto === c.id ? null : c.id)}
                            className="rounded border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                          >
                            {diagAberto === c.id ? 'fechar' : 'por quê?'}
                          </button>
                        </div>

                        {diagAberto === c.id && (
                          <div className="mt-1.5 rounded-md border bg-muted/30 p-2">
                            {diagCarregando ? (
                              <p className="text-[11px] text-muted-foreground">Procurando o cadastro dela…</p>
                            ) : (diag?.candidatos?.length ? (
                              <>
                                <p className="text-[11px] font-semibold text-foreground">
                                  Existe cadastro que parece ser dela:
                                </p>
                                {diag.candidatos.map((m: any) => (
                                  <div key={m.id} className="mt-1 flex flex-wrap items-center gap-2">
                                    <span className="text-[12px]">{m.nome}</span>
                                    {/* ⚠️ Mostra POR QUAL SINAL casou. E-mail é sinal que a
                                        FAMÍLIA compartilha — no caso Palladino o e-mail do
                                        perfil do filho era o do cadastro do pai. Quem decide
                                        é gente, e gente precisa ver isso. */}
                                    <span className="rounded-full border px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                      casou por {m.sinal === 'cpf' ? 'CPF' : m.sinal === 'email' ? 'e-mail' : 'nome'}
                                    </span>
                                    {m.tem_cpf && <span className="text-[10px] text-muted-foreground">tem CPF</span>}
                                    {m.data_nascimento && <span className="text-[10px] text-muted-foreground">nasc. {String(m.data_nascimento).split('-').reverse().join('/')}</span>}
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={vincularMut.isPending}
                                      onClick={() => vincularMut.mutate({ volId: c.id, membroId: m.id })}
                                      className="h-6 px-2 text-[11px]"
                                    >
                                      Vincular
                                    </Button>
                                  </div>
                                ))}
                                <p className="mt-1.5 text-[10px] leading-snug text-muted-foreground">
                                  Confira que é a mesma pessoa antes de vincular — e-mail e telefone
                                  são compartilhados dentro da família.
                                </p>
                              </>
                            ) : (
                              <p className="text-[11px] leading-snug text-muted-foreground">
                                <b>Não existe cadastro de membro pra ela.</b> Não é caso de vincular:
                                a pessoa precisa ser cadastrada primeiro (Membresia → novo cadastro,
                                ou o formulário público). Depois disso ela aparece nesta busca.
                              </p>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                    O app identifica o supervisor pelo cadastro de membro, então a concessão só
                    funciona depois que a pessoa tem cadastro vinculado.
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

          {/* Seletores em linha própria, com wrap: em tela estreita eles
              empilham em vez de encolher até ficar ilegível. */}
          <div className="flex flex-wrap items-center gap-2">
            <SeletoresEscopo
              valor={{ papel, teamId, area, posId, dia: cultoDia, periodo: cultoPeriodo, semana: cultoSemana }}
              onChange={(e) => { setPapel(e.papel); setTeamId(e.teamId); setArea(e.area); setPosId(e.posId); setCultoDia(e.dia); setCultoPeriodo(e.periodo); setCultoSemana(e.semana); }}
              areas={AREAS}
              times={TIMES}
              subareasDe={subareasDe}
              posicoesDoTime={posicoesDoTime}
            />
            <Button
              onClick={() => grantMut.mutate()}
              disabled={!selMembro || (!area && !teamId) || grantMut.isPending}
              className="bg-[#00B39D] hover:bg-[#00B39D]/90 ml-auto"
            >
              {grantMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Conceder'}
            </Button>
          </div>

          {/* ⚠️ Declara a régua do 5º · LINHA PRÓPRIA. Dentro do flex dos
              seletores esta frase virava uma coluna de uma palavra por linha
              (foi o que apareceu no print do Matheus). */}
          {cultoSemana === '1' && (
            <p className="text-[11px] text-muted-foreground">
              O 5º {cultoDia === 'quarta' ? 'da quarta' : 'domingo'} do mês, quando existe, também cai aqui.
            </p>
          )}
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
              {semTurno.length > 0 && (
                /* ⚠️ Declara em vez de deixar passar: sem turno, a pessoa
                   supervisiona TODOS os cultos — mais acesso do que a casa
                   combinou. Aparece antes da lista pra ser visto. */
                <div className="rounded-lg border border-amber-500/50 bg-amber-500/5 p-2.5">
                  <p className="text-xs font-semibold text-amber-600">
                    {semTurno.length} sem turno definido
                  </p>
                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                    {semTurno.map((x: any) => x.membro?.nome).filter(Boolean).join(', ')} — hoje supervisionam
                    <b> todos os cultos</b>. Use o lápis pra definir o turno de cada um.
                  </p>
                </div>
              )}

              {porTurno.map((g) => (
                <div key={g.rotulo} className="space-y-2">
                  <p className={`text-sm font-bold ${g.amplo ? 'text-muted-foreground' : 'text-foreground'}`}>
                    {g.rotulo}
                  </p>
                  {g.areas.map(([a, lista]) => (
                    <div key={a} className="pl-2 border-l-2 border-border">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{areaLabel(a)}</p>
                      <div className="space-y-1.5">
                    {lista.map(s => (
                      <div key={s.id} className="rounded-lg border p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium">
                          {s.membro?.nome || '—'}
                          {/* PAPEL (24/09): leitor só lê; líder edita; admin é o geral
                              sem recorte. Dito na linha porque é PERMISSÃO. */}
                          {papelDaLinha(s) === 'leitor'
                            ? <span className="ml-2 rounded-full border border-amber-500/50 bg-amber-500/5 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-400">Leitor</span>
                            : papelDaLinha(s) === 'admin'
                              ? <span className="ml-2 rounded-full border border-violet-500/50 bg-violet-500/5 px-2 py-0.5 text-[11px] font-semibold text-violet-700 dark:text-violet-300">Admin</span>
                              : <span className="ml-2 rounded-full border px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">Líder</span>}
                          {(s.team?.name || (s.team_id && timeLabel(s.team_id)))
                            && <span className="ml-1.5 rounded-full border border-[#00B39D]/40 px-2 py-0.5 text-[11px] font-normal text-[#00806f]">Time · {s.team?.name || timeLabel(s.team_id)}</span>}
                          {/* Sem subárea = área/time inteiro. O rótulo diz qual das
                              duas coisas é, porque as duas linhas são idênticas
                              de resto e a diferença é de PERMISSÃO. */}
                          {s.position?.name
                            ? <span className="ml-2 rounded-full border px-2 py-0.5 text-[11px] font-normal text-muted-foreground">{s.position.name}</span>
                            : <span className="ml-2 text-[11px] font-normal text-muted-foreground">{s.team_id ? '· todo o time' : papelDaLinha(s) === 'admin' ? '· tudo' : '· toda a área'}</span>}
                          {rotuloRodizio(s)
                            ? <span className="ml-1.5 rounded-full border border-[#00B39D]/40 bg-[#00B39D]/5 px-2 py-0.5 text-[11px] font-normal text-[#00806f]">{rotuloRodizio(s)}</span>
                            : <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">· todo culto</span>}
                        </span>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              setEditId(s.id);
                              setEditEsc({
                                papel: papelDaLinha(s),
                                teamId: s.team_id || '',
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
                              times={TIMES}
                              subareasDe={subareasDe}
                              posicoesDoTime={posicoesDoTime}
                              compacto
                            />
                            <div className="flex items-center gap-1.5 sm:ml-auto">
                              <Button
                                size="sm"
                                onClick={() => updateMut.mutate()}
                                disabled={(!editEsc.area && !editEsc.teamId) || updateMut.isPending}
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
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
