import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { Search, UserMinus, History, Loader2, Stethoscope, ChevronDown, ChevronRight, PlugZap, UserCheck } from 'lucide-react';
import { useAllVolUsers, useAddVolRole, useRemoveVolRole, useSyncHistorical } from './hooks';
import { toast } from 'sonner';
import { voluntariado } from '@/api';
import FormOpcoesManager from './components/FormOpcoesManager';
import WhatsappAutoConfig from '@/components/WhatsappAutoConfig';

export default function VolAdmin() {
  const { data: users = [], isLoading } = useAllVolUsers();
  const addRole = useAddVolRole();
  const removeRole = useRemoveVolRole();
  const syncHistorical = useSyncHistorical();
  const [search, setSearch] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagData, setDiagData] = useState<any>(null);
  const [diagOpen, setDiagOpen] = useState<Record<string, boolean>>({});

  const filtered = users.filter(u => u.profile.full_name.toLowerCase().includes(search.toLowerCase()) || u.profile.email?.toLowerCase().includes(search.toLowerCase()));

  const handleAddRole = async (profileId: string, role: 'volunteer' | 'leader' | 'admin') => {
    try {
      await addRole.mutateAsync({ profileId, role });
      toast.success('Role adicionada');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleRemoveRole = async (profileId: string, role: 'volunteer' | 'leader' | 'admin') => {
    try {
      await removeRole.mutateAsync({ profileId, role });
      toast.success('Role removida');
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleHistoricalSync = async () => {
    if (!startDate || !endDate) { toast.error('Selecione datas de início e fim'); return; }
    try {
      const result = await syncHistorical.mutateAsync({ startDate, endDate });
      const escalas = (result as any).schedules ?? (result as any).newSchedules ?? 0;
      toast.success(`Sincronizado: ${result.services} cultos, ${escalas} escalas`);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const [nascLoading, setNascLoading] = useState(false);
  const handleBackfillNascimento = async () => {
    setNascLoading(true);
    try {
      const r: any = await voluntariado.backfillNascimento();
      toast.success(`Aniversários atualizados: ${r.updated || 0} preenchidos · ${r.skipped_existing || 0} já tinham · ${r.total_birthdays_pco || 0} no PCO`);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao puxar aniversários do PCO');
    } finally {
      setNascLoading(false);
    }
  };

  const handleDiagnostics = async () => {
    setDiagLoading(true);
    setDiagData(null);
    try {
      const result = await voluntariado.syncDiagnostics();
      setDiagData(result);
    } catch (err: any) {
      toast.error('Erro ao buscar diagnóstico: ' + err.message);
    } finally {
      setDiagLoading(false);
    }
  };

  const roleColor = (role: string) => {
    if (role === 'admin') return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
    if (role === 'leader') return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
    return '';
  };

  return (
    <div className="space-y-6">
      <WhatsappAutoConfig api={voluntariado.whatsappAuto} />
      <h1 className="text-2xl font-bold text-foreground">Administração</h1>

      <PlanningCenterSwitch />
      <VincularMembrosCard />

      {/* Opções do formulário público */}
      <FormOpcoesManager />

      {/* PC Diagnostics */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Stethoscope className="h-5 w-5" /> Diagnóstico Planning Center</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Verifica o que o Planning Center tem configurado (tipos de serviço, equipes e membros).</p>
          <Button variant="outline" onClick={handleDiagnostics} disabled={diagLoading}>
            {diagLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Stethoscope className="h-4 w-4 mr-2" />}
            Rodar Diagnóstico
          </Button>

          {diagData && (
            <div className="mt-3 space-y-2 text-sm">
              <p className="font-medium">{diagData.serviceTypeCount} tipo(s) de serviço encontrado(s) no Planning Center</p>
              {diagData.serviceTypeCount === 0 && (
                <p className="text-destructive">Nenhum tipo de serviço encontrado. Verifique as credenciais ou configure serviços no Planning Center.</p>
              )}
              {(diagData.serviceTypes || []).map((st: any) => (
                <div key={st.id} className="border rounded-lg overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-3 py-2 bg-muted/50 hover:bg-muted text-left font-medium"
                    onClick={() => setDiagOpen(p => ({ ...p, [st.id]: !p[st.id] }))}
                  >
                    <span>{st.name}</span>
                    <span className="flex items-center gap-3 text-muted-foreground text-xs">
                      <span>{st.plans} plano(s) futuro(s)</span>
                      <span>{st.teams.length} equipe(s)</span>
                      {diagOpen[st.id] ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </span>
                  </button>
                  {diagOpen[st.id] && (
                    <div className="px-3 py-2 space-y-1">
                      {st.teams.length === 0 && <p className="text-muted-foreground italic">Nenhuma equipe configurada neste tipo de serviço.</p>}
                      {st.teams.map((team: any) => (
                        <div key={team.id} className="py-1 border-b last:border-0">
                          <div className="flex items-center justify-between">
                            <span>{team.name}</span>
                            <Badge variant={team.memberCount > 0 ? 'default' : 'outline'} className="text-xs">
                              {team.memberCount} membro(s)
                            </Badge>
                          </div>
                          {team.sampleMembers?.length > 0 && (
                            <p className="text-[11px] text-muted-foreground mt-0.5 pl-2">
                              Ex: {team.sampleMembers.join(', ')}{team.memberCount > team.sampleMembers.length ? '...' : ''}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Historical Sync */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><History className="h-5 w-5" /> Sincronização Histórica</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Sincronize cultos e escalas de um período específico do Planning Center.</p>
          <div className="flex gap-2 flex-wrap">
            <DatePicker value={startDate} onChange={setStartDate} className="w-auto" />
            <DatePicker value={endDate} onChange={setEndDate} className="w-auto" />
            <Button onClick={handleHistoricalSync} disabled={syncHistorical.isPending}>
              {syncHistorical.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <History className="h-4 w-4 mr-2" />}
              Sincronizar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Backfill de aniversários do PCO */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><History className="h-5 w-5" /> Aniversários do Planning Center</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">Puxa a data de nascimento dos voluntários do Planning Center (People) e preenche quem está sem no cadastro — assim o aniversário no WhatsApp funciona. Não sobrescreve quem já tem data.</p>
          <Button onClick={handleBackfillNascimento} disabled={nascLoading}>
            {nascLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <History className="h-4 w-4 mr-2" />}
            Puxar aniversários do PCO
          </Button>
        </CardContent>
      </Card>

      {/* User Management */}
      <Card>
        <CardHeader><CardTitle>Usuários e Roles</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar usuário..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>

          <div className="space-y-3 max-h-[500px] overflow-y-auto">
            {filtered.map(u => (
              <div key={u.profile.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                <div>
                  <p className="font-medium">{u.profile.full_name}</p>
                  {u.profile.email && <p className="text-sm text-muted-foreground">{u.profile.email}</p>}
                  <div className="flex gap-1 mt-1">
                    {u.roles.map(r => (
                      <Badge key={r.id} variant="outline" className={`${roleColor(r.role)} cursor-pointer`} onClick={() => handleRemoveRole(u.profile.id, r.role)}>
                        {r.role} <UserMinus className="h-3 w-3 ml-1" />
                      </Badge>
                    ))}
                  </div>
                </div>
                <Select onValueChange={(v) => handleAddRole(u.profile.id, v as any)}>
                  <SelectTrigger className="w-[130px]"><SelectValue placeholder="+ Role" /></SelectTrigger>
                  <SelectContent>
                    {['volunteer', 'leader', 'admin']
                      .filter(r => !u.roles.some(ur => ur.role === r))
                      .map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>

          {isLoading && <p className="text-center text-muted-foreground">Carregando...</p>}
        </CardContent>
      </Card>
    </div>
  );
}


/**
 * A chave que decide se o Planning Center Services ainda é fonte.
 *
 * ⚠️ Ela não é um detalhe de configuração: com o PCO marcado como fonte, o sync
 * ARQUIVA todo perfil que sumiu do roster de lá — e 923 dos 931 perfis vieram
 * do Planning Center. Se a igreja parar de alimentar o Services sem desligar
 * isto aqui, uma rodada do sync contra um roster vazio arquiva a base inteira e
 * a tela de escalar fica vazia, sem erro nenhum aparecer.
 */
function PlanningCenterSwitch() {
  const qc = useQueryClient();
  const { data: cfg } = useQuery<{ pco_ativo?: boolean }>({
    queryKey: ['vol-config'],
    queryFn: () => voluntariado.config.get(),
  });
  const ativo = cfg?.pco_ativo !== false;

  const salvar = useMutation({
    mutationFn: (pco_ativo: boolean) => voluntariado.config.update({ ...cfg, pco_ativo }),
    onSuccess: (_d, pco_ativo) => {
      qc.invalidateQueries({ queryKey: ['vol-config'] });
      toast.success(pco_ativo
        ? 'Planning Center voltou a ser fonte do voluntariado'
        : 'Planning Center desligado como fonte — a reconciliação de perfis não roda mais');
    },
    onError: (e: Error) => toast.error(e?.message || 'Erro ao salvar'),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <PlugZap className="h-4 w-4" /> Planning Center Services
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <Badge variant={ativo ? 'default' : 'outline'}>
            {ativo ? 'É a fonte' : 'Desligado'}
          </Badge>
          <Button
            variant={ativo ? 'destructive' : 'default'}
            size="sm"
            disabled={salvar.isPending}
            onClick={() => {
              if (ativo && !confirm(
                'Desligar o Planning Center como fonte?\n\n' +
                'O sync para de arquivar voluntários que sumiram do roster de lá, e o ' +
                'gerador de cultos passa a criar cultos em dias que já têm culto do PCO.\n\n' +
                'É reversível a qualquer momento por este mesmo botão.',
              )) return;
              salvar.mutate(!ativo);
            }}
          >
            {salvar.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
            {ativo ? 'Desligar como fonte' : 'Voltar a usar como fonte'}
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {ativo
            ? 'Enquanto estiver ligado, quem sai do roster do Planning Center é arquivado aqui automaticamente — são 923 dos 931 perfis. Desligue ANTES de a equipe parar de alimentar o Services.'
            : 'O roster daqui é independente: ninguém é arquivado por sumir do Planning Center, e o gerador de cultos por recorrência não é mais bloqueado pelos cultos herdados de lá.'}
        </p>
      </CardContent>
    </Card>
  );
}

type RelatorioVinculo = {
  aplicado: boolean;
  analisados: number;
  sem_membro_total: number;
  ligados: number;
  por_chave: Record<string, number>;
  conflitos: number;
  sem_match: number;
  exemplos_ligados: { nome: string; por: string }[];
  exemplos_conflitos: { nome: string; disputa_com: string }[];
  exemplos_sem_match: { nome: string }[];
};

/**
 * Fase 1 da saída do Planning Center: cada voluntário vira uma pessoa do sistema.
 *
 * ⚠️ Simular vem ANTES de aplicar, e a tela não tem botão de aplicar enquanto
 * não houver uma simulação na frente. Ligar pessoa a cadastro é irreversível na
 * prática — o histórico passa a apontar pro membro —, então o número tem que ser
 * lido por alguém antes de virar escrita.
 */
function VincularMembrosCard() {
  const [rel, setRel] = useState<RelatorioVinculo | null>(null);

  const rodar = useMutation({
    mutationFn: (aplicar: boolean) => voluntariado.vincularMembros({ aplicar }) as Promise<RelatorioVinculo>,
    onSuccess: (r) => {
      setRel(r);
      if (r.aplicado) toast.success(`${r.ligados} voluntário(s) ligados ao cadastro de pessoa`);
      else toast.info(`Simulação: ${r.ligados} de ${r.analisados} teriam vínculo`);
    },
    onError: (e: Error) => toast.error(e?.message || 'Erro ao vincular'),
  });

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <UserCheck className="h-4 w-4" /> Voluntários sem cadastro de pessoa
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Liga cada voluntário ao cadastro dele na membresia usando o mesmo matcher
          das outras portas — CPF, depois e-mail + nome, telefone + nome, nascimento + nome.
          Quem não casa com ninguém fica como está, para decisão humana.
        </p>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={rodar.isPending}
            onClick={() => rodar.mutate(false)}>
            {rodar.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />}
            Simular
          </Button>
          {rel && !rel.aplicado && rel.ligados > 0 && (
            <Button size="sm" className="bg-[#00B39D] hover:bg-[#00B39D]/90" disabled={rodar.isPending}
              onClick={() => {
                if (!confirm(`Ligar ${rel.ligados} voluntário(s) ao cadastro de pessoa?\n\nOs ${rel.conflitos} conflito(s) e os ${rel.sem_match} sem correspondência NÃO são tocados.`)) return;
                rodar.mutate(true);
              }}>
              Aplicar nos {rel.ligados}
            </Button>
          )}
        </div>

        {rel && (
          <div className="space-y-3 pt-1">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{rel.sem_membro_total} sem cadastro</Badge>
              <Badge variant="default">{rel.ligados} com correspondência</Badge>
              <Badge variant="outline">{rel.conflitos} em conflito</Badge>
              <Badge variant="outline">{rel.sem_match} sem pista</Badge>
              {Object.entries(rel.por_chave).map(([k, n]) => (
                <Badge key={k} variant="secondary">{k}: {n}</Badge>
              ))}
            </div>

            {rel.exemplos_ligados.length > 0 && (
              <div>
                <p className="text-xs font-medium mb-1">Casaram (amostra)</p>
                <ul className="text-xs text-muted-foreground space-y-0.5">
                  {rel.exemplos_ligados.map((e, i) => (
                    <li key={i}>{e.nome} <span className="opacity-60">· por {e.por}</span></li>
                  ))}
                </ul>
              </div>
            )}

            {rel.exemplos_conflitos.length > 0 && (
              <div>
                {/* Conflito = dois voluntários apontando pro MESMO cadastro. Não é
                    erro do matcher: normalmente é a mesma pessoa duplicada no
                    Planning Center, e fundir isso é decisão de gente. */}
                <p className="text-xs font-medium mb-1">Disputando o mesmo cadastro (não foram tocados)</p>
                <ul className="text-xs text-muted-foreground space-y-0.5">
                  {rel.exemplos_conflitos.map((e, i) => (
                    <li key={i}>{e.nome} <span className="opacity-60">× {e.disputa_com}</span></li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
