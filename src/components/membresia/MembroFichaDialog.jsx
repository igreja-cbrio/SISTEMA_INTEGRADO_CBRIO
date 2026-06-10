import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Loader2, ExternalLink, X, Users, HandCoins, Star, Calendar,
  Sparkles, ArrowRightLeft, Mail, Phone, MapPin, Heart, Home,
  CheckCircle2, AlertCircle, Award,
} from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '../ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../ui/tabs';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { membresia, financeiroV2 } from '../../api';

const fmtMoney = (v) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '—';

const STATUS_LABEL = {
  visitante: 'Visitante',
  membro_em_processo: 'Em processo',
  membro_ativo: 'Membro ativo',
  membro_inativo: 'Inativo',
  desligado: 'Desligado',
};

/**
 * Drawer reusável com a "ficha 360" da pessoa.
 *
 * Props:
 * - open · bool · controla visibilidade
 * - onClose · fn
 * - membroId · uuid (opcional) · se presente, busca /membresia/membros/:id e mostra ficha completa
 * - nomeFallback · string (opcional) · se sem membroId, mostra modo "doador não-vinculado"
 *                  e busca /financeiro-v2/doador/transacoes pra exibir histórico de doação
 * - ano · int · ano de referência pra histórico financeiro do doador não-vinculado (default: ano corrente)
 */
export default function MembroFichaDialog({ open, onClose, membroId, nomeFallback, ano }) {
  const [data, setData] = useState(null);
  const [transacoesDoador, setTransacoesDoador] = useState(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState(null);
  const [tab, setTab] = useState('info');

  useEffect(() => {
    if (!open) return;
    if (membroId) {
      let cancelled = false;
      setLoading(true);
      setErro(null);
      setTab('info');
      membresia.membros.get(membroId)
        .then(r => { if (!cancelled) setData(r); })
        .catch(e => { if (!cancelled) setErro(e?.message || 'Erro ao carregar ficha'); })
        .finally(() => { if (!cancelled) setLoading(false); });
      return () => { cancelled = true; };
    }
    if (nomeFallback) {
      let cancelled = false;
      setLoading(true);
      setErro(null);
      setTab('generosidade');
      financeiroV2.doadorTransacoes({ nome: nomeFallback, ano: ano || new Date().getFullYear() })
        .then(r => { if (!cancelled) setTransacoesDoador(r); })
        .catch(e => { if (!cancelled) setErro(e?.message || 'Erro ao carregar histórico'); })
        .finally(() => { if (!cancelled) setLoading(false); });
      return () => { cancelled = true; };
    }
  }, [open, membroId, nomeFallback, ano]);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose?.()}>
      <SheetContent side="right" className="w-full sm:max-w-2xl p-0 overflow-y-auto">
        <SheetHeader className="px-6 pt-6 pb-3 border-b">
          <SheetTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            Ficha da pessoa
          </SheetTitle>
        </SheetHeader>

        {loading && (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" /> Carregando ficha…
          </div>
        )}
        {erro && !loading && (
          <div className="m-6 p-4 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/30 text-rose-700 dark:text-rose-300 text-sm flex items-start gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>{erro}</div>
          </div>
        )}

        {/* Modo: doador NÃO vinculado a membresia */}
        {!loading && !erro && !membroId && nomeFallback && transacoesDoador && (
          <DoadorNaoVinculado
            nome={nomeFallback}
            ano={ano || new Date().getFullYear()}
            dados={transacoesDoador}
            onClose={onClose}
          />
        )}

        {/* Modo: membro completo */}
        {!loading && !erro && data && (
          <FichaCompleta data={data} tab={tab} setTab={setTab} onClose={onClose} />
        )}
      </SheetContent>
    </Sheet>
  );
}

function HeaderMembro({ membro }) {
  const iniciais = membro.nome?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="px-6 py-5 flex items-start gap-4 border-b">
      <div className="w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center font-bold text-lg overflow-hidden shrink-0">
        {membro.foto_url ? (
          <img data-foto-avatar="" src={membro.foto_url} alt={membro.nome} className="w-full h-full object-cover" />
        ) : iniciais}
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-lg font-semibold truncate">{membro.nome}</h3>
        <div className="flex flex-wrap gap-1.5 mt-1.5">
          <Badge variant="outline" className="text-[10px]">
            {STATUS_LABEL[membro.status] || membro.status || '—'}
          </Badge>
          {membro.papeis?.is_voluntario && <span className="text-[9px] px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-500/20 text-violet-700 dark:text-violet-300 font-bold">VOL</span>}
          {membro.papeis?.in_grupo_ativo && <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300 font-bold">GRP</span>}
          {membro.papeis?.is_contribuinte && <span className="text-[9px] px-1.5 py-0.5 rounded bg-pink-100 dark:bg-pink-500/20 text-pink-700 dark:text-pink-300 font-bold">CTB</span>}
          {membro.papeis?.is_inscrito_next && <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 font-bold">NXT</span>}
        </div>
      </div>
      <Link to={`/ministerial/membresia?id=${membro.id}`} target="_blank">
        <Button variant="ghost" size="sm" className="text-[11px] h-8">
          Abrir em Membresia <ExternalLink className="h-3 w-3 ml-1" />
        </Button>
      </Link>
    </div>
  );
}

function FichaCompleta({ data, tab, setTab, onClose }) {
  const TABS = [
    { key: 'info', label: 'Info', icon: Users },
    { key: 'generosidade', label: 'Generosidade', icon: HandCoins },
    { key: 'grupo', label: 'Grupo', icon: Star },
    { key: 'servico', label: 'Serviço', icon: Sparkles },
    { key: 'next', label: 'NEXT', icon: ArrowRightLeft },
    { key: 'trilha', label: 'Trilha', icon: Award },
  ];

  return (
    <>
      <HeaderMembro membro={data} />

      <Tabs value={tab} onValueChange={setTab} className="px-6 py-4">
        <TabsList className="inline-flex h-auto w-auto bg-transparent p-0 gap-1 border-b border-border rounded-none mb-4">
          {TABS.map(t => {
            const Icon = t.icon;
            return (
              <TabsTrigger key={t.key} value={t.key}
                className="relative rounded-none border-b-2 border-transparent px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground data-[state=active]:border-b-primary data-[state=active]:text-primary data-[state=active]:bg-transparent data-[state=active]:shadow-none bg-transparent">
                <Icon className="size-3.5 mr-1.5 hidden sm:inline-block" />
                {t.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="info" className="mt-2">
          <InfoBlock data={data} />
        </TabsContent>
        <TabsContent value="generosidade" className="mt-2">
          <GenerosidadeBlock data={data} />
        </TabsContent>
        <TabsContent value="grupo" className="mt-2">
          <GrupoBlock data={data} />
        </TabsContent>
        <TabsContent value="servico" className="mt-2">
          <ServicoBlock data={data} />
        </TabsContent>
        <TabsContent value="next" className="mt-2">
          <NextBlock data={data} />
        </TabsContent>
        <TabsContent value="trilha" className="mt-2">
          <TrilhaBlock data={data} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function Field({ icon: Icon, label, value }) {
  return (
    <div className="flex gap-2.5 items-start">
      <Icon className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
        <div className="text-sm">{value || <span className="text-muted-foreground">—</span>}</div>
      </div>
    </div>
  );
}

function InfoBlock({ data }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      <Field icon={Mail} label="Email" value={data.email} />
      <Field icon={Phone} label="Telefone" value={data.telefone} />
      <Field icon={Calendar} label="Nascimento" value={data.data_nascimento ? new Date(data.data_nascimento).toLocaleDateString('pt-BR') : null} />
      <Field icon={Heart} label="Estado civil" value={data.estado_civil} />
      <Field icon={MapPin} label="Endereço" value={[data.endereco, data.bairro, data.cidade].filter(Boolean).join(', ')} />
      <Field icon={Home} label="Família" value={data.familia?.nome} />
      <Field icon={Users} label="Área" value={data.area} />
      <Field icon={Sparkles} label="Ministério" value={data.ministerio} />
    </div>
  );
}

function GenerosidadeBlock({ data }) {
  const totais = data.totais_ano || { dizimo: 0, oferta: 0, campanha: 0, total: 0 };
  const contribs = data.contribuicoes || [];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <StatCard label="Dízimo (ano)" value={fmtMoney(totais.dizimo)} accent="#10b981" />
        <StatCard label="Oferta (ano)" value={fmtMoney(totais.oferta)} accent="#3b82f6" />
        <StatCard label="Campanha (ano)" value={fmtMoney(totais.campanha)} accent="#f59e0b" />
        <StatCard label="Total (ano)" value={fmtMoney(totais.total)} accent="#00B39D" />
      </div>
      <div className="text-[11px] text-muted-foreground">
        Última contribuição: <strong>{fmtDate(contribs[0]?.data)}</strong> · Nível:{' '}
        <strong>{data.nivel_generosidade || '—'}</strong>
      </div>
      <div className="border rounded-lg overflow-hidden">
        <div className="text-[11px] uppercase font-medium text-muted-foreground bg-muted px-3 py-1.5">
          Últimas {contribs.length} contribuições
        </div>
        {contribs.length === 0 ? (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">Sem contribuições registradas</div>
        ) : (
          <div className="max-h-60 overflow-y-auto divide-y">
            {contribs.map(c => (
              <div key={c.id} className="px-3 py-2 flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[9px] uppercase">{c.tipo}</Badge>
                  <span>{fmtDate(c.data)}</span>
                </div>
                <span className="font-semibold tabular-nums">{fmtMoney(c.valor)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function GrupoBlock({ data }) {
  const atual = data.grupo_atual;
  const historico = data.grupo_historico || [];
  return (
    <div className="space-y-4">
      {atual ? (
        <div className="rounded-lg border-l-4 border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10 p-3">
          <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300 text-xs font-medium mb-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" /> Em grupo ativo
          </div>
          <div className="text-sm font-semibold">{atual.grupo?.nome}</div>
          <div className="text-[11px] text-muted-foreground mt-1">
            {atual.grupo?.dia_semana} · {atual.grupo?.horario} · {atual.grupo?.local} ·
            Líder: <strong>{atual.grupo?.lider?.nome || '—'}</strong>
          </div>
          <div className="text-[11px] text-muted-foreground">Entrou em {fmtDate(atual.entrou_em)}</div>
        </div>
      ) : (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          Sem grupo ativo no momento
        </div>
      )}
      {historico.length > 0 && (
        <div>
          <div className="text-[11px] uppercase font-medium text-muted-foreground mb-2">Histórico de grupos</div>
          <div className="space-y-1">
            {historico.map(g => (
              <div key={g.id} className="text-sm flex justify-between border-b py-1.5">
                <span>{g.grupo?.nome || 'Grupo'}</span>
                <span className="text-[11px] text-muted-foreground">
                  {fmtDate(g.entrou_em)} – {fmtDate(g.saiu_em)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ServicoBlock({ data }) {
  const ministerios = data.ministerios_ativos || [];
  const checkins = data.checkins || [];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <StatCard label="Ministérios" value={ministerios.length} accent="#8b5cf6" />
        <StatCard label="Check-ins (90d)" value={data.total_checkins_90d || 0} accent="#10b981" />
      </div>
      {ministerios.length === 0 ? (
        <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          Não está vinculado a nenhum ministério como voluntário
        </div>
      ) : (
        <div>
          <div className="text-[11px] uppercase font-medium text-muted-foreground mb-2">Ministérios ativos</div>
          <div className="flex flex-wrap gap-1.5">
            {ministerios.map(m => (
              <Badge key={m.id} variant="outline" className="text-[11px]"
                style={{ borderLeft: `3px solid ${m.team?.color || '#8b5cf6'}` }}>
                {m.team?.name || 'Equipe'}
              </Badge>
            ))}
          </div>
        </div>
      )}
      {checkins.length > 0 && (
        <div>
          <div className="text-[11px] uppercase font-medium text-muted-foreground mb-2">Últimos check-ins</div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {checkins.slice(0, 10).map(c => (
              <div key={c.id} className="text-xs flex justify-between border-b py-1">
                <span>{c.service?.name || 'Serviço'}</span>
                <span className="text-muted-foreground">{fmtDate(c.checked_in_at)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function NextBlock({ data }) {
  const inscricoes = data.inscricoes_next || [];
  if (inscricoes.length === 0) {
    return (
      <div className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
        Nunca se inscreveu no NEXT
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {inscricoes.map(i => (
        <div key={i.id} className="border rounded-lg p-2.5 text-sm">
          <div className="flex justify-between items-center">
            <span className="font-medium">{i.evento?.titulo || 'NEXT'}</span>
            <span className="text-[11px] text-muted-foreground">{fmtDate(i.evento?.data)}</span>
          </div>
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {i.indicou_batismo && <Badge variant="outline" className="text-[9px]">Batismo</Badge>}
            {i.indicou_grupo && <Badge variant="outline" className="text-[9px]">Grupo</Badge>}
            {i.indicou_servir && <Badge variant="outline" className="text-[9px]">Servir</Badge>}
            {i.indicou_dizimo && <Badge variant="outline" className="text-[9px]">Dízimo</Badge>}
            {i.check_in_at && <Badge variant="outline" className="text-[9px] border-emerald-500 text-emerald-600">Compareceu</Badge>}
          </div>
        </div>
      ))}
    </div>
  );
}

function TrilhaBlock({ data }) {
  const trilha = data.trilha || [];
  const VALORES = [
    { key: 'seguir', label: 'Seguir Jesus', color: '#10b981' },
    { key: 'conectar', label: 'Conectar', color: '#3b82f6' },
    { key: 'investir', label: 'Investir Tempo com Deus', color: '#8b5cf6' },
    { key: 'servir', label: 'Servir', color: '#f59e0b' },
    { key: 'generosidade', label: 'Generosidade', color: '#ec4899' },
  ];

  return (
    <div className="space-y-2">
      {VALORES.map(v => {
        const itens = trilha.filter(t => t.valor === v.key);
        const concluidos = itens.filter(t => t.concluida).length;
        return (
          <div key={v.key} className="border rounded-lg p-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium" style={{ color: v.color }}>{v.label}</div>
              <span className="text-[11px] text-muted-foreground">{concluidos}/{itens.length} etapas</span>
            </div>
            {itens.length > 0 && (
              <div className="mt-2 space-y-1">
                {itens.map(t => (
                  <div key={t.id} className="text-xs flex items-center gap-1.5">
                    <CheckCircle2 className={`h-3 w-3 ${t.concluida ? 'text-emerald-500' : 'text-muted-foreground/40'}`} />
                    <span>{t.etapa}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DoadorNaoVinculado({ nome, ano, dados, onClose }) {
  return (
    <>
      <div className="px-6 py-5 flex items-start gap-4 border-b">
        <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-300 flex items-center justify-center font-bold text-lg shrink-0">
          {nome?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-semibold truncate">{nome}</h3>
          <Badge variant="outline" className="text-[10px] mt-1 border-amber-500 text-amber-700">
            Não vinculado à membresia
          </Badge>
        </div>
      </div>
      <div className="m-6 p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-800 dark:text-amber-200 text-xs flex items-start gap-2">
        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
        <div>
          Este doador ainda não está vinculado a um cadastro de membresia.
          Pra ver perfil completo (grupos, serviço, jornada), faça o vínculo
          em <strong>Membresia</strong>. Abaixo estão as doações registradas em {ano}.
        </div>
      </div>
      <div className="px-6 pb-6 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <StatCard label={`Total em ${ano}`} value={fmtMoney(dados.total)} accent="#00B39D" />
          <StatCard label="Lançamentos" value={dados.qtd} accent="#3b82f6" />
        </div>
        <div className="border rounded-lg overflow-hidden">
          <div className="text-[11px] uppercase font-medium text-muted-foreground bg-muted px-3 py-1.5">
            Lançamentos · {dados.items?.length || 0}
          </div>
          {(dados.items || []).length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">Sem doações em {ano}</div>
          ) : (
            <div className="max-h-80 overflow-y-auto divide-y">
              {(dados.items || []).map(t => (
                <div key={t.id} className="px-3 py-2 flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium">{fmtDate(t.data)}</div>
                    <div className="text-[11px] text-muted-foreground">
                      {t.pdc_codigo} · {t.pdc_nome}
                    </div>
                  </div>
                  <span className="font-semibold tabular-nums">{fmtMoney(t.valor)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function StatCard({ label, value, accent }) {
  return (
    <div className="rounded-lg border p-2.5" style={{ borderLeft: `3px solid ${accent}` }}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium">{label}</div>
      <div className="text-base font-bold tabular-nums" style={{ color: accent }}>{value}</div>
    </div>
  );
}
