// ============================================================================
// Totem Kids · Painel ao vivo
// ============================================================================
// Visão consolidada por sala da sessão atual. Atualiza a cada 15s.
// Coordenadora pode encerrar a sessão daqui (consolida cultos.presencial_kids).
// ============================================================================

import { useEffect, useState } from 'react';
import { Baby, Users, Loader2, CheckCircle2, ShieldAlert, RefreshCw, PowerOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { totemKids } from '@/api';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '@/contexts/AuthContext';

type PainelSala = {
  sessao_id: string;
  culto_id: string;
  data_culto: string;
  culto_nome: string;
  status: string;
  sala_id: string | null;
  sala_nome: string | null;
  sala_cor: string | null;
  capacidade: number | null;
  total_checkins: number;
  criancas_presentes: number;
  criancas_saidas: number;
  decisoes_jesus: number;
  overrides: number;
  ocupacao_pct: number | null;
};

export default function TotemKidsPainel() {
  const { isAdmin, modulePerms } = useAuth();
  const [dados, setDados] = useState<PainelSala[]>([]);
  const [sessao, setSessao] = useState<{ id: string; culto?: { id: string; nome: string; data: string } | null } | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [encerrando, setEncerrando] = useState(false);

  const podeEncerrar = isAdmin || (modulePerms?.kids?.escrita ?? 0) >= 3;

  async function carregar(silent = false) {
    if (!silent) setRefreshing(true);
    try {
      const s = await totemKids.sessoes.atual();
      setSessao(s);
      if (s?.id) {
        const d = await totemKids.painel.aoVivo(s.id);
        setDados(d);
      } else {
        setDados([]);
      }
    } finally {
      setCarregando(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    carregar();
    const interval = setInterval(() => carregar(true), 15000);
    return () => clearInterval(interval);
  }, []);

  async function encerrarSessao() {
    if (!sessao || !confirm(`Encerrar a sessão atual? Vai consolidar ${totalPresentes()} criança(s) no culto.`)) return;
    setEncerrando(true);
    try {
      await totemKids.sessoes.encerrar(sessao.id);
      toast.success('Sessão encerrada · KPIs consolidados');
      carregar();
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || 'Erro ao encerrar');
    } finally {
      setEncerrando(false);
    }
  }

  function totalPresentes() {
    return dados.reduce((s, d) => s + (d.criancas_presentes || 0), 0);
  }
  function totalSaidas() {
    return dados.reduce((s, d) => s + (d.criancas_saidas || 0), 0);
  }
  function totalDecisoes() {
    return dados.reduce((s, d) => s + (d.decisoes_jesus || 0), 0);
  }
  function totalOverrides() {
    return dados.reduce((s, d) => s + (d.overrides || 0), 0);
  }

  if (carregando) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-pink-500" />
      </div>
    );
  }

  if (!sessao) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <h1 className="text-2xl font-bold text-pink-700 dark:text-pink-300">Totem Kids · Painel</h1>
        <Card className="mt-4">
          <CardContent className="p-8 text-center">
            <Baby className="h-12 w-12 text-pink-500 mx-auto mb-3" />
            <p>Nenhuma sessão aberta no momento.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-bold text-pink-700 dark:text-pink-300">Totem Kids · Painel ao vivo</h1>
          <p className="text-sm text-muted-foreground">
            {sessao.culto?.nome} ·{' '}
            {sessao.culto?.data && format(new Date(sessao.culto.data + 'T00:00:00'), "EEEE, dd 'de' MMMM", { locale: ptBR })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => carregar()}>
            <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          </Button>
          {podeEncerrar && (
            <Button
              variant="destructive"
              size="sm"
              onClick={encerrarSessao}
              disabled={encerrando}
            >
              {encerrando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <PowerOff className="h-4 w-4 mr-1" />}
              Encerrar sessão
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Presentes</div>
            <div className="text-3xl font-bold text-pink-600">{totalPresentes()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Saíram</div>
            <div className="text-3xl font-bold">{totalSaidas()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Decisões Jesus</div>
            <div className="text-3xl font-bold text-emerald-600 flex items-center gap-1">
              {totalDecisoes()} {totalDecisoes() > 0 && <CheckCircle2 className="h-5 w-5" />}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Overrides</div>
            <div className={`text-3xl font-bold flex items-center gap-1 ${totalOverrides() > 0 ? 'text-amber-600' : ''}`}>
              {totalOverrides()} {totalOverrides() > 0 && <ShieldAlert className="h-5 w-5" />}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-2">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Users className="h-5 w-5" /> Por sala
        </h2>
        {dados.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              Ainda sem check-ins.
            </CardContent>
          </Card>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {dados.map(d => (
              <Card key={d.sala_id || 'sem-sala'}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 rounded-full" style={{ background: d.sala_cor || '#888' }} />
                      <span className="font-semibold">{d.sala_nome || '(sem sala)'}</span>
                    </div>
                    {d.capacidade && (
                      <Badge variant={d.ocupacao_pct && d.ocupacao_pct > 90 ? 'destructive' : 'secondary'}>
                        {d.criancas_presentes}/{d.capacidade}
                      </Badge>
                    )}
                  </div>
                  <div className="flex gap-4 text-sm text-muted-foreground">
                    <span>Saíram: <b className="text-foreground">{d.criancas_saidas}</b></span>
                    {d.decisoes_jesus > 0 && (
                      <span className="text-emerald-600">Decisões: {d.decisoes_jesus}</span>
                    )}
                    {d.overrides > 0 && (
                      <span className="text-amber-600">Override: {d.overrides}</span>
                    )}
                  </div>
                  {/* Barra de ocupação */}
                  {d.capacidade && d.ocupacao_pct != null && (
                    <div className="h-2 bg-muted rounded-full overflow-hidden mt-3">
                      <div
                        className="h-full transition-all"
                        style={{
                          width: `${Math.min(d.ocupacao_pct, 100)}%`,
                          background: d.sala_cor || '#EC4899',
                        }}
                      />
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
