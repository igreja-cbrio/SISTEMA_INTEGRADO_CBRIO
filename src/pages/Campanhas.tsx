// Módulo Campanhas · arrecadação com dígito verificador, cronograma e disparos.
// Primeira campanha: Reforma do Espaço Kids (lançamento 06/09/2026).
//
// ⚠️ NENHUM número de dinheiro é calculado aqui. Tudo vem do servidor
// (`vw_camp_arrecadacao` → services/campanhaArrecadacao). Recalcular no cliente
// criaria uma segunda verdade sobre quanto a igreja arrecadou.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { campanhas } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { toast } from 'sonner';
import {
  Loader2, Plus, Target, CalendarDays, Send, Wallet, Check, X, Trash2,
  ArrowLeft, Play, Pause, AlertTriangle, Copy, Heart,
} from 'lucide-react';

const brl = (c: number) => (Number(c || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBr = (d?: string | null) => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');

const STATUS_LABEL: Record<string, string> = {
  rascunho: 'Rascunho', ativa: 'Ativa', pausada: 'Pausada',
  encerrada: 'Encerrada', cancelada: 'Cancelada',
};
const statusCor = (s: string) => s === 'ativa' ? 'bg-emerald-500/15 text-emerald-600'
  : s === 'pausada' ? 'bg-amber-500/15 text-amber-600'
  : ['encerrada', 'cancelada'].includes(s) ? 'bg-foreground/10 text-muted-foreground'
  : 'bg-sky-500/15 text-sky-600';

const MARCO_TIPO: Record<string, string> = {
  marco: 'Marco', tarefa: 'Tarefa', obra: 'Obra',
  comunicacao: 'Comunicação', financeiro: 'Financeiro',
};
const MARCO_STATUS: Record<string, string> = {
  pendente: 'Pendente', em_andamento: 'Em andamento', concluido: 'Concluído',
  bloqueado: 'Bloqueado', cancelado: 'Cancelado',
};

const TABS = [
  { id: 'geral', label: 'Visão geral', icon: Target },
  { id: 'cronograma', label: 'Cronograma', icon: CalendarDays },
  { id: 'disparos', label: 'Disparos', icon: Send },
  { id: 'doacoes', label: 'Doações', icon: Wallet },
];

/**
 * A barrinha.
 *
 * ⚠️ Duas fatias: o que já é lançamento contábil e o que está no banco esperando
 * a fila de classificação. As duas SOMAM no total — o dinheiro chegou nas duas.
 * Separar visualmente é o que impede o financeiro achar que o número está errado
 * quando ele não bate com o DRE ainda.
 */
function Barrinha({ d }: { d: any }) {
  const pctConf = d.total_centavos > 0 ? (d.caixa_confirmado_centavos / d.total_centavos) * d.pct_barra : 0;
  const pctOnline = d.total_centavos > 0 ? (d.online_pago_centavos / d.total_centavos) * d.pct_barra : 0;
  const pctConcil = Math.max(0, d.pct_barra - pctConf - pctOnline);
  return (
    <div>
      <div className="flex items-end justify-between gap-3 mb-2">
        <div>
          <div className="text-3xl font-semibold tabular-nums">{brl(d.total_centavos)}</div>
          <div className="text-sm text-muted-foreground">de {brl(d.meta_centavos)}</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-semibold tabular-nums">{d.pct}%</div>
          {d.falta_centavos > 0 && (
            <div className="text-xs text-muted-foreground">faltam {brl(d.falta_centavos)}</div>
          )}
        </div>
      </div>
      <div className="h-3 w-full rounded-full overflow-hidden flex" style={{ background: 'var(--track)' }}>
        <div style={{ width: `${pctConf}%`, background: '#00B39D' }} title="Já classificado no financeiro" />
        <div style={{ width: `${pctOnline}%`, background: '#0891b2' }} title="Doação online" />
        <div style={{ width: `${pctConcil}%`, background: '#00B39D', opacity: 0.42 }} title="No banco, aguardando a fila de classificação" />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
        <span><span className="inline-block h-2 w-2 rounded-full mr-1" style={{ background: '#00B39D' }} />
          Classificado {brl(d.caixa_confirmado_centavos)}</span>
        {d.online_pago_centavos > 0 && (
          <span><span className="inline-block h-2 w-2 rounded-full mr-1" style={{ background: '#0891b2' }} />
            Online {brl(d.online_pago_centavos)}</span>
        )}
        {d.caixa_conciliando_centavos > 0 && (
          <span><span className="inline-block h-2 w-2 rounded-full mr-1" style={{ background: '#00B39D', opacity: 0.42 }} />
            Aguardando conciliação {brl(d.caixa_conciliando_centavos)}</span>
        )}
      </div>
      {d.dias_restantes != null && d.por_dia_centavos != null && (
        <div className="mt-3 text-sm">
          Faltam <strong>{d.dias_restantes} dias</strong> — o ritmo para bater a meta é{' '}
          <strong>{brl(d.por_dia_centavos)}/dia</strong>.
        </div>
      )}
    </div>
  );
}

function Chip({ children, cor }: { children: any; cor: string }) {
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cor}`}>{children}</span>;
}

export default function Campanhas() {
  const { getAccessLevel } = useAuth() as any;
  const nivel = typeof getAccessLevel === 'function' ? getAccessLevel(['campanhas']) : 5;
  const podeEditar = nivel >= 3;
  const podeAtivar = nivel >= 4;

  const [lista, setLista] = useState<any[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [det, setDet] = useState<any | null>(null);
  const [tab, setTab] = useState('geral');
  const [criando, setCriando] = useState(false);

  const carregar = useCallback(async () => {
    try { setErro(null); setLista(await campanhas.list()); }
    catch (e: any) {
      // ⚠️ Erro NUNCA vira lista vazia: "não há campanha" e "a consulta falhou"
      // levam a decisões opostas (a primeira faz criar de novo).
      setErro(e?.message || 'Erro ao carregar as campanhas');
      setLista([]);
    }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const abrir = useCallback(async (id: string) => {
    setSel(id); setDet(null); setTab('geral');
    try { setDet(await campanhas.get(id)); }
    catch (e: any) { toast.error(e?.message || 'Erro ao abrir a campanha'); setSel(null); }
  }, []);

  const recarregarDet = useCallback(async () => {
    if (!sel) return;
    try { setDet(await campanhas.get(sel)); } catch { /* mantém o que está na tela */ }
    carregar();
  }, [sel, carregar]);

  if (lista === null) {
    return <div className="p-6 flex items-center gap-2 text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
    </div>;
  }

  // ── Detalhe ──────────────────────────────────────────────────────────────
  if (sel) {
    if (!det) {
      return <div className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Carregando a campanha…
      </div>;
    }
    const c = det.campanha;
    return (
      <div className="p-4 md:p-6 space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => { setSel(null); setDet(null); carregar(); }}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Campanhas
          </Button>
          <h1 className="text-xl font-semibold">{c.nome}</h1>
          <Chip cor={statusCor(c.status)}>{STATUS_LABEL[c.status] || c.status}</Chip>
          {c.digito && <Chip cor="bg-foreground/10 text-foreground">dígito {c.digito}</Chip>}
          {!det.no_ar && c.status === 'ativa' && (
            <Chip cor="bg-amber-500/15 text-amber-600">fora da janela de datas</Chip>
          )}
        </div>

        <div className="flex gap-1 border-b overflow-x-auto">
          {TABS.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px flex items-center gap-1.5 ${
                tab === t.id ? 'border-primary text-foreground font-medium' : 'border-transparent text-muted-foreground'}`}>
              <t.icon className="h-4 w-4" /> {t.label}
            </button>
          ))}
        </div>

        {tab === 'geral' && (
          <AbaGeral det={det} podeEditar={podeEditar} podeAtivar={podeAtivar} onMudou={recarregarDet} />
        )}
        {tab === 'cronograma' && (
          <AbaCronograma det={det} podeEditar={podeEditar} onMudou={recarregarDet} />
        )}
        {tab === 'disparos' && (
          <AbaDisparos det={det} podeEditar={podeEditar} podeAtivar={podeAtivar} onMudou={recarregarDet} />
        )}
        {tab === 'doacoes' && (
          <AbaDoacoes det={det} podeEditar={podeEditar} onMudou={recarregarDet} />
        )}
      </div>
    );
  }

  // ── Lista ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Campanhas</h1>
          <p className="text-sm text-muted-foreground">
            Meta, dígito verificador, cronograma e disparos de cada campanha de arrecadação.
          </p>
        </div>
        {podeEditar && (
          <Button onClick={() => setCriando(true)}><Plus className="h-4 w-4 mr-1" /> Nova campanha</Button>
        )}
      </div>

      {erro && (
        <Card className="border-amber-500/40">
          <CardContent className="p-4 flex gap-2 text-sm text-amber-600">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>Não foi possível carregar as campanhas: {erro}. O que aparece abaixo pode estar incompleto.</div>
          </CardContent>
        </Card>
      )}

      {criando && (
        <FormCampanha onFechar={() => setCriando(false)}
          onCriada={(id) => { setCriando(false); carregar(); abrir(id); }} />
      )}

      {!lista.length && !erro && (
        <Card><CardContent className="p-8 text-center text-muted-foreground text-sm">
          Nenhuma campanha cadastrada ainda.
        </CardContent></Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {lista.map((c) => (
          <Card key={c.campanha_id} className="cursor-pointer hover:shadow-lg transition-shadow"
            onClick={() => abrir(c.campanha_id)}>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{c.nome}</div>
                  <div className="text-xs text-muted-foreground">
                    {dataBr(c.data_lancamento)} → {dataBr(c.data_fim)}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Chip cor={statusCor(c.status)}>{STATUS_LABEL[c.status] || c.status}</Chip>
                  {c.digito && <span className="text-xs text-muted-foreground">dígito {c.digito}</span>}
                </div>
              </div>
              <Barrinha d={c} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ── Formulário de criação ──────────────────────────────────────────────────

function FormCampanha({ onFechar, onCriada }: { onFechar: () => void; onCriada: (id: string) => void }) {
  const [f, setF] = useState<any>({ nome: '', meta: '', digito: '', data_inicio: '', data_lancamento: '', data_fim: '' });
  const [digitos, setDigitos] = useState<any | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    campanhas.digitos().then((d: any) => {
      setDigitos(d);
      setF((p: any) => ({ ...p, digito: p.digito || d.sugestao || '' }));
    }).catch(() => setDigitos({ ocupados: [], sugestao: null }));
  }, []);

  const salvar = async () => {
    const meta = Math.round(Number(String(f.meta).replace(/\./g, '').replace(',', '.')) * 100);
    if (!f.nome.trim()) return toast.error('Dê um nome à campanha.');
    if (!(meta > 0)) return toast.error('Informe a meta em reais.');
    setSalvando(true);
    try {
      const c = await campanhas.criar({
        nome: f.nome.trim(),
        meta_centavos: meta,
        digito: f.digito || null,
        descricao_curta: f.descricao_curta || null,
        data_inicio: f.data_inicio || null,
        data_lancamento: f.data_lancamento || null,
        data_fim: f.data_fim || null,
      });
      toast.success('Campanha criada como rascunho.');
      onCriada(c.id);
    } catch (e: any) { toast.error(e?.message || 'Erro ao criar a campanha'); }
    finally { setSalvando(false); }
  };

  return (
    <Card className="glass-solid">
      <CardContent className="p-5 space-y-4">
        <div className="font-medium">Nova campanha</div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="block text-sm mb-1">Nome</label>
            <Input value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })}
              placeholder="Reforma do Espaço Kids" />
          </div>
          <div>
            <label className="block text-sm mb-1">Meta (R$)</label>
            <Input value={f.meta} onChange={(e) => setF({ ...f, meta: e.target.value })} placeholder="500000" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm mb-1">Frase curta (aparece no agradecimento e na página)</label>
            <Input value={f.descricao_curta || ''} onChange={(e) => setF({ ...f, descricao_curta: e.target.value })}
              placeholder="transformar o espaço onde as nossas crianças são cuidadas" />
          </div>
          <div>
            <label className="block text-sm mb-1">Dígito verificador</label>
            <Input value={f.digito} maxLength={2} onChange={(e) => setF({ ...f, digito: e.target.value.replace(/\D/g, '') })}
              placeholder="07" className="w-24" />
            {/* ⚠️ A tela DIZ quem já usa cada dígito. Só "indisponível" faria a
                pessoa tentar outro no escuro — e colisão de dígito é irrecuperável. */}
            {digitos?.ocupados?.length ? (
              <div className="text-xs text-muted-foreground mt-1.5 space-y-0.5">
                <div>Já em uso:</div>
                {digitos.ocupados.map((o: any) => (
                  <div key={o.digito}><strong>{o.digito}</strong> — {o.descricao}</div>
                ))}
              </div>
            ) : null}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><label className="block text-sm mb-1">Início</label>
              <DatePicker value={f.data_inicio} onChange={(v: any) => setF({ ...f, data_inicio: v })} placeholder="Início" /></div>
            <div><label className="block text-sm mb-1">Lançamento</label>
              <DatePicker value={f.data_lancamento} onChange={(v: any) => setF({ ...f, data_lancamento: v })} placeholder="Lançamento" /></div>
            <div><label className="block text-sm mb-1">Fim</label>
              <DatePicker value={f.data_fim} onChange={(v: any) => setF({ ...f, data_fim: v })} placeholder="Fim" /></div>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          O <strong>dígito verificador</strong> são os centavos que identificam a doação: com o dígito 07,
          quem quiser doar R$ 500 transfere <strong>R$ 500,07</strong> e o sistema reconhece sozinho que é desta campanha.
          Quem doar pelo link também é contado, sem precisar dos centavos.
        </p>
        <div className="flex gap-2">
          <Button onClick={salvar} disabled={salvando}>
            {salvando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Criar como rascunho
          </Button>
          <Button variant="ghost" onClick={onFechar}>Cancelar</Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Aba · Visão geral ──────────────────────────────────────────────────────

function AbaGeral({ det, podeEditar, podeAtivar, onMudou }: any) {
  const c = det.campanha;
  const [salvando, setSalvando] = useState(false);

  const mudarStatus = async (status: string) => {
    setSalvando(true);
    try {
      await campanhas.status(c.id, status);
      toast.success(`Campanha ${STATUS_LABEL[status]?.toLowerCase()}.`);
      onMudou();
    } catch (e: any) { toast.error(e?.message || 'Erro ao mudar o status'); }
    finally { setSalvando(false); }
  };

  const togglePublica = async () => {
    setSalvando(true);
    try {
      await campanhas.atualizar(c.id, { publica: !c.publica });
      toast.success(c.publica ? 'A barrinha saiu do ar.' : 'A barrinha está no ar.');
      onMudou();
    } catch (e: any) { toast.error(e?.message || 'Erro ao atualizar'); }
    finally { setSalvando(false); }
  };

  const linkPublico = `${window.location.origin}/campanha/${c.slug}`;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2 glass-solid">
        <CardContent className="p-5 space-y-4">
          <Barrinha d={det} />
          {det.lancamentos_em_conciliacao > 0 && (
            <div className="text-xs flex gap-2 rounded-md p-3" style={{ background: 'var(--surface)' }}>
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
              <div>
                <strong>{det.lancamentos_em_conciliacao} crédito(s)</strong> já estão na conta da igreja com o
                dígito {c.digito}, mas ainda não passaram pela fila de classificação do financeiro — por isso
                o total daqui pode estar à frente do DRE. A aba <strong>Doações</strong> lista quais são.
              </div>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><div className="text-muted-foreground text-xs">Lançamentos</div>
              <div className="font-medium tabular-nums">{det.total_lancamentos}</div></div>
            <div><div className="text-muted-foreground text-xs">Doadores (aprox.)</div>
              <div className="font-medium tabular-nums">{det.doadores_aprox}</div></div>
            <div><div className="text-muted-foreground text-xs">Lançamento</div>
              <div className="font-medium">{dataBr(c.data_lancamento)}</div></div>
            <div><div className="text-muted-foreground text-xs">Encerra</div>
              <div className="font-medium">{dataBr(c.data_fim)}</div></div>
          </div>
          {c.descricao && <p className="text-sm text-muted-foreground whitespace-pre-line">{c.descricao}</p>}
          {c.observacao && (
            <div className="text-xs rounded-md p-3" style={{ background: 'var(--surface)' }}>
              <strong>Observação interna:</strong> {c.observacao}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card><CardContent className="p-5 space-y-3">
          <div className="font-medium text-sm">Como o dinheiro é identificado</div>
          {c.digito ? (
            <div className="text-sm space-y-1">
              <div>Dígito <strong className="text-lg">{c.digito}</strong></div>
              <div className="text-muted-foreground text-xs">
                Quem transferir pelo banco põe esses centavos no valor.
                Doar R$ 500 = transferir <strong>R$ 500,{c.digito}</strong>.
              </div>
            </div>
          ) : (
            <div className="text-sm text-amber-600 flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              Sem dígito configurado — quem transferir pelo banco não vai ser reconhecido nesta campanha.
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            {c.aceita_online
              ? 'Quem doa pelo link/QR é contado com atribuição exata, sem depender dos centavos.'
              : 'Doação online está desligada nesta campanha.'}
          </div>
        </CardContent></Card>

        <Card><CardContent className="p-5 space-y-3">
          <div className="font-medium text-sm">Barrinha pública</div>
          <div className="text-xs text-muted-foreground">
            É o que aparece nas telas do culto e na página que a igreja compartilha.
          </div>
          {c.publica && (
            <div className="flex items-center gap-2">
              <Input readOnly value={linkPublico} className="text-xs" />
              <Button variant="ghost" size="icon" title="Copiar"
                onClick={() => { navigator.clipboard?.writeText(linkPublico); toast.success('Link copiado.'); }}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          )}
          {podeEditar && (
            <Button variant={c.publica ? 'outline' : 'default'} size="sm" disabled={salvando} onClick={togglePublica}>
              {c.publica ? 'Tirar do ar' : 'Publicar a barrinha'}
            </Button>
          )}
          {/* ⚠️ Barrinha pública com a campanha em rascunho não aparece pra
              ninguém — a régua da rota pública exige status ativa E dentro da
              janela de datas. Dizer isso evita o "publiquei e não apareceu". */}
          {c.publica && c.status !== 'ativa' && (
            <div className="text-xs text-amber-600">
              A barrinha só aparece de verdade com a campanha <strong>ativa</strong> e dentro da janela de datas.
            </div>
          )}
        </CardContent></Card>

        {podeAtivar && (
          <Card><CardContent className="p-5 space-y-3">
            <div className="font-medium text-sm">Status da campanha</div>
            <div className="flex flex-wrap gap-2">
              {c.status !== 'ativa' && (
                <Button size="sm" disabled={salvando} onClick={() => mudarStatus('ativa')}>
                  <Play className="h-4 w-4 mr-1" /> Ativar
                </Button>
              )}
              {c.status === 'ativa' && (
                <Button size="sm" variant="outline" disabled={salvando} onClick={() => mudarStatus('pausada')}>
                  <Pause className="h-4 w-4 mr-1" /> Pausar
                </Button>
              )}
              {!['encerrada', 'cancelada'].includes(c.status) && (
                <Button size="sm" variant="outline" disabled={salvando} onClick={() => mudarStatus('encerrada')}>
                  Encerrar
                </Button>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              Ativar é o que faz o dígito começar a classificar as doações e libera os disparos.
            </div>
          </CardContent></Card>
        )}
      </div>
    </div>
  );
}

// ── Aba · Cronograma ───────────────────────────────────────────────────────

function AbaCronograma({ det, podeEditar, onMudou }: any) {
  const [novo, setNovo] = useState<any | null>(null);
  const marcos = det.marcos || [];

  const salvarNovo = async () => {
    if (!novo?.titulo?.trim()) return toast.error('Dê um título ao marco.');
    try {
      await campanhas.marcos.criar(det.campanha.id, {
        titulo: novo.titulo.trim(), descricao: novo.descricao || null,
        tipo: novo.tipo || 'tarefa', data_prevista: novo.data_prevista || null,
        responsavel_nome: novo.responsavel_nome || null,
        ordem: (marcos.at(-1)?.ordem || 0) + 10,
      });
      toast.success('Marco criado.'); setNovo(null); onMudou();
    } catch (e: any) { toast.error(e?.message || 'Erro ao criar o marco'); }
  };

  const mudar = async (m: any, patch: any) => {
    try { await campanhas.marcos.atualizar(m.id, patch); onMudou(); }
    catch (e: any) { toast.error(e?.message || 'Erro ao atualizar'); }
  };

  const remover = async (m: any) => {
    if (!confirm(`Excluir o marco "${m.titulo}"?`)) return;
    try { await campanhas.marcos.remover(m.id); toast.success('Marco excluído.'); onMudou(); }
    catch (e: any) { toast.error(e?.message || 'Erro ao excluir'); }
  };

  const hoje = det.hoje;
  return (
    <div className="space-y-4">
      {podeEditar && (
        novo ? (
          <Card className="glass-solid"><CardContent className="p-5 space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Input placeholder="Título do marco" value={novo.titulo || ''}
                onChange={(e) => setNovo({ ...novo, titulo: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <Select value={novo.tipo || 'tarefa'} onValueChange={(v) => setNovo({ ...novo, tipo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="z-[1200]">
                    {Object.entries(MARCO_TIPO).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
                <DatePicker value={novo.data_prevista} onChange={(v: any) => setNovo({ ...novo, data_prevista: v })}
                  placeholder="Prazo" />
              </div>
              <Input placeholder="Responsável (nome)" value={novo.responsavel_nome || ''}
                onChange={(e) => setNovo({ ...novo, responsavel_nome: e.target.value })} />
              <Textarea placeholder="Descrição (opcional)" rows={2} value={novo.descricao || ''}
                onChange={(e) => setNovo({ ...novo, descricao: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" onClick={salvarNovo}>Salvar marco</Button>
              <Button size="sm" variant="ghost" onClick={() => setNovo(null)}>Cancelar</Button>
            </div>
          </CardContent></Card>
        ) : (
          <Button size="sm" onClick={() => setNovo({})}><Plus className="h-4 w-4 mr-1" /> Novo marco</Button>
        )
      )}

      {!marcos.length && (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          Nenhum marco no cronograma.
        </CardContent></Card>
      )}

      <div className="space-y-2">
        {marcos.map((m: any) => {
          const atrasado = m.status !== 'concluido' && m.status !== 'cancelado'
            && m.data_prevista && String(m.data_prevista) < hoje;
          return (
            <Card key={m.id} className={atrasado ? 'border-red-500/40' : ''}>
              <CardContent className="p-4 flex flex-wrap items-start gap-3">
                {podeEditar ? (
                  <button title={m.status === 'concluido' ? 'Reabrir' : 'Concluir'}
                    onClick={() => mudar(m, { status: m.status === 'concluido' ? 'pendente' : 'concluido' })}
                    className={`h-6 w-6 shrink-0 rounded-full border flex items-center justify-center ${
                      m.status === 'concluido' ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-600' : 'border-foreground/25'}`}>
                    {m.status === 'concluido' ? <Check className="h-3.5 w-3.5" /> : null}
                  </button>
                ) : (
                  <div className={`h-6 w-6 shrink-0 rounded-full border flex items-center justify-center ${
                    m.status === 'concluido' ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-600' : 'border-foreground/25'}`}>
                    {m.status === 'concluido' ? <Check className="h-3.5 w-3.5" /> : null}
                  </div>
                )}
                <div className="flex-1 min-w-[200px]">
                  <div className={`font-medium text-sm ${m.status === 'concluido' ? 'line-through text-muted-foreground' : ''}`}>
                    {m.titulo}
                  </div>
                  {m.descricao && <div className="text-xs text-muted-foreground mt-0.5">{m.descricao}</div>}
                  <div className="flex flex-wrap gap-2 mt-1.5 text-xs text-muted-foreground">
                    <Chip cor="bg-foreground/10 text-foreground">{MARCO_TIPO[m.tipo] || m.tipo}</Chip>
                    {m.data_prevista && (
                      <span className={atrasado ? 'text-red-600 font-medium' : ''}>
                        prazo {dataBr(m.data_prevista)}{atrasado ? ' · atrasado' : ''}
                      </span>
                    )}
                    {m.data_conclusao && <span>concluído em {dataBr(m.data_conclusao)}</span>}
                    {m.responsavel_nome && <span>· {m.responsavel_nome}</span>}
                    {!m.responsavel_nome && (
                      <span className="text-amber-600">· sem responsável</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Chip cor={m.status === 'concluido' ? 'bg-emerald-500/15 text-emerald-600'
                    : m.status === 'bloqueado' ? 'bg-red-500/15 text-red-600'
                    : m.status === 'em_andamento' ? 'bg-sky-500/15 text-sky-600' : 'bg-foreground/10 text-muted-foreground'}>
                    {MARCO_STATUS[m.status] || m.status}
                  </Chip>
                  {podeEditar && (
                    <Button variant="ghost" size="icon" onClick={() => remover(m)} title="Excluir">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ── Aba · Disparos ─────────────────────────────────────────────────────────

function AbaDisparos({ det, podeEditar, podeAtivar, onMudou }: any) {
  const [novo, setNovo] = useState<any | null>(null);
  const [previa, setPrevia] = useState<any | null>(null);
  const [carregandoPrevia, setCarregandoPrevia] = useState(false);
  const [segmentos, setSegmentos] = useState<any>({ segmentos: {}, canais: [] });
  const disparos = det.disparos || [];

  useEffect(() => { campanhas.segmentos().then(setSegmentos).catch(() => {}); }, []);

  const verPrevia = async () => {
    setCarregandoPrevia(true); setPrevia(null);
    try {
      setPrevia(await campanhas.disparos.previa(det.campanha.id, {
        canal: novo?.canal || 'email', segmento: novo?.segmento || 'todos',
      }));
    } catch (e: any) { toast.error(e?.message || 'Erro ao calcular a prévia'); }
    finally { setCarregandoPrevia(false); }
  };

  const salvarNovo = async () => {
    if (!novo?.nome?.trim()) return toast.error('Dê um nome ao disparo.');
    if (!novo?.corpo_texto?.trim() && !novo?.wa_template) return toast.error('Escreva a mensagem.');
    try {
      await campanhas.disparos.criar(det.campanha.id, {
        nome: novo.nome.trim(), canal: novo.canal || 'email', segmento: novo.segmento || 'todos',
        assunto: novo.assunto || null, corpo_texto: novo.corpo_texto || null,
        wa_template: novo.wa_template || null, recorrencia: novo.recorrencia || 'unico',
      });
      toast.success('Disparo criado como rascunho.'); setNovo(null); setPrevia(null); onMudou();
    } catch (e: any) { toast.error(e?.message || 'Erro ao criar o disparo'); }
  };

  const agendar = async (d: any) => {
    if (!confirm(`Enviar "${d.nome}" agora? A mensagem vai para o público do segmento escolhido.`)) return;
    try { await campanhas.disparos.agendar(d.id); toast.success('Disparo agendado — sai na próxima rodada do envio.'); onMudou(); }
    catch (e: any) { toast.error(e?.message || 'Erro ao agendar'); }
  };

  const cancelar = async (d: any) => {
    try { await campanhas.disparos.cancelar(d.id); toast.success('Disparo cancelado.'); onMudou(); }
    catch (e: any) { toast.error(e?.message || 'Erro ao cancelar'); }
  };

  return (
    <div className="space-y-4">
      <Card><CardContent className="p-4 text-xs text-muted-foreground flex gap-2">
        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
        <div>
          O e-mail é o canal principal desta campanha. O WhatsApp só alcança quem deu
          <strong> opt-in</strong> (é exigência da Meta para mensagem de campanha) e depende de um
          template aprovado. Para desligar tudo de uma vez, use o interruptor em
          <strong> Comunicação → Disparos → Automáticas</strong>.
        </div>
      </CardContent></Card>

      {podeEditar && (
        novo ? (
          <Card className="glass-solid"><CardContent className="p-5 space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <Input placeholder="Nome do disparo (só aparece no histórico)" value={novo.nome || ''}
                onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <Select value={novo.canal || 'email'} onValueChange={(v) => { setNovo({ ...novo, canal: v }); setPrevia(null); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="z-[1200]">
                    <SelectItem value="email">E-mail</SelectItem>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={novo.segmento || 'todos'} onValueChange={(v) => { setNovo({ ...novo, segmento: v }); setPrevia(null); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent className="z-[1200]">
                    {Object.entries(segmentos.segmentos || {}).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{String(v)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {(novo.canal || 'email') === 'email' && (
                <Input className="md:col-span-2" placeholder="Assunto do e-mail" value={novo.assunto || ''}
                  onChange={(e) => setNovo({ ...novo, assunto: e.target.value })} />
              )}
              {(novo.canal || 'email') === 'whatsapp' && (
                <Input className="md:col-span-2" placeholder="Nome do template aprovado na Meta"
                  value={novo.wa_template || ''} onChange={(e) => setNovo({ ...novo, wa_template: e.target.value })} />
              )}
              <Textarea className="md:col-span-2" rows={6} value={novo.corpo_texto || ''}
                onChange={(e) => setNovo({ ...novo, corpo_texto: e.target.value })}
                placeholder={'Mensagem…\n\nVocê pode usar: {{campanha}} {{meta}} {{arrecadado}} {{falta}} {{pct}} {{link}}'} />
              <Select value={novo.recorrencia || 'unico'} onValueChange={(v) => setNovo({ ...novo, recorrencia: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent className="z-[1200]">
                  <SelectItem value="unico">Enviar uma vez</SelectItem>
                  <SelectItem value="semanal_segunda">Modelo do pocket de toda segunda</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* ⚠️ A prévia é obrigatória de fato: é a tela que autoriza um pedido
                de dinheiro pra milhares de pessoas, e o número só é honesto com a
                repartição dos motivos ao lado. */}
            <div className="flex flex-wrap items-center gap-2">
              <Button size="sm" variant="outline" onClick={verPrevia} disabled={carregandoPrevia}>
                {carregandoPrevia ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Ver quem vai receber
              </Button>
              <Button size="sm" onClick={salvarNovo}>Salvar como rascunho</Button>
              <Button size="sm" variant="ghost" onClick={() => { setNovo(null); setPrevia(null); }}>Cancelar</Button>
            </div>

            {previa && (
              <div className="rounded-md p-3 text-sm space-y-2" style={{ background: 'var(--surface)' }}>
                <div>
                  <strong className="text-lg tabular-nums">{previa.total_alvo}</strong> pessoas recebem,
                  de {previa.total_base} na base do segmento.
                </div>
                {previa.exemplo?.length ? (
                  <div className="text-xs text-muted-foreground">Ex.: {previa.exemplo.join(' · ')}…</div>
                ) : null}
                {Object.keys(previa.motivos || {}).length ? (
                  <div className="text-xs space-y-0.5">
                    <div className="text-muted-foreground">Quem fica de fora, e por quê:</div>
                    {Object.entries(previa.motivos).map(([m, q]) => (
                      <div key={m}>{String(q)} — {m}</div>
                    ))}
                  </div>
                ) : null}
              </div>
            )}
          </CardContent></Card>
        ) : (
          <Button size="sm" onClick={() => setNovo({})}><Plus className="h-4 w-4 mr-1" /> Novo disparo</Button>
        )
      )}

      {!disparos.length && (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          Nenhum disparo criado.
        </CardContent></Card>
      )}

      <div className="space-y-2">
        {disparos.map((d: any) => (
          <Card key={d.id}><CardContent className="p-4 space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-medium text-sm">{d.nome}</div>
                <div className="text-xs text-muted-foreground">
                  {d.canal === 'email' ? 'E-mail' : d.canal === 'whatsapp' ? 'WhatsApp' : d.canal}
                  {' · '}{segmentos.segmentos?.[d.segmento] || d.segmento}
                  {d.recorrencia === 'semanal_segunda' ? ' · modelo semanal' : ''}
                  {d.agendado_para ? ` · agendado ${new Date(d.agendado_para).toLocaleString('pt-BR')}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Chip cor={d.status === 'enviado' ? 'bg-emerald-500/15 text-emerald-600'
                  : d.status === 'enviando' ? 'bg-sky-500/15 text-sky-600'
                  : d.status === 'falhou' ? 'bg-red-500/15 text-red-600'
                  : d.status === 'agendado' ? 'bg-amber-500/15 text-amber-600' : 'bg-foreground/10 text-muted-foreground'}>
                  {d.status}
                </Chip>
                {podeAtivar && ['rascunho', 'agendado'].includes(d.status) && (
                  <>
                    {d.status === 'rascunho' && (
                      <Button size="sm" onClick={() => agendar(d)}><Send className="h-4 w-4 mr-1" /> Enviar</Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => cancelar(d)} title="Cancelar">
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </div>
            </div>
            {(d.total_alvo > 0 || d.total_enviado > 0) && (
              <div className="text-xs text-muted-foreground">
                {d.total_enviado} de {d.total_alvo} enviados
                {d.total_falha > 0 ? ` · ${d.total_falha} falharam` : ''}
                {d.total_pulado > 0 ? ` · ${d.total_pulado} fora do público` : ''}
              </div>
            )}
            {d.motivos_fora && Object.keys(d.motivos_fora).length > 0 && (
              <div className="text-xs text-muted-foreground">
                Fora: {Object.entries(d.motivos_fora).map(([m, q]) => `${q} ${m}`).join(' · ')}
              </div>
            )}
            {d.erro && <div className="text-xs text-red-600">{d.erro}</div>}
          </CardContent></Card>
        ))}
      </div>
    </div>
  );
}

// ── Aba · Doações ──────────────────────────────────────────────────────────

function AbaDoacoes({ det, podeEditar, onMudou }: any) {
  const [linhas, setLinhas] = useState<any[] | null>(null);
  const [agrads, setAgrads] = useState<any[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    campanhas.lancamentos(det.campanha.id)
      .then(setLinhas)
      .catch((e: any) => { setErro(e?.message || 'Erro ao carregar'); setLinhas([]); });
    campanhas.agradecimentos.list(det.campanha.id).then(setAgrads).catch(() => setAgrads([]));
  }, [det.campanha.id]);

  const vetar = async (l: any) => {
    const motivo = prompt('Por que este crédito NÃO é desta campanha? (fica registrado)');
    if (motivo === null) return;
    try {
      await campanhas.vincular(det.campanha.id, {
        lancamento_bruto_id: l.lancamento_bruto_id || null,
        transacao_id: l.transacao_id || null,
        incluir: false, motivo,
      });
      toast.success('Crédito tirado da campanha.');
      setLinhas(null);
      campanhas.lancamentos(det.campanha.id).then(setLinhas).catch(() => setLinhas([]));
      onMudou();
    } catch (e: any) { toast.error(e?.message || 'Erro ao vetar'); }
  };

  const enviados = (agrads || []).filter((a) => a.status === 'enviado').length;
  const pulados = (agrads || []).filter((a) => a.status === 'pulado').length;

  return (
    <div className="space-y-4">
      <Card><CardContent className="p-4 text-xs text-muted-foreground flex gap-2">
        <Heart className="h-4 w-4 shrink-0 mt-0.5 text-primary" />
        <div>
          O agradecimento ao doador é automático, por e-mail, e a mensagem é
          <strong> genérica de propósito</strong>: não cita nome nem valor, porque telefone e e-mail
          nesta base estão cadastrados em nome de familiares e filhos.
          {agrads !== null && (
            <> Até agora: <strong>{enviados} enviados</strong>
              {pulados > 0 ? `, ${pulados} sem para onde mandar (doação anônima ou sem contato)` : ''}.</>
          )}
        </div>
      </CardContent></Card>

      {erro && (
        <Card className="border-amber-500/40"><CardContent className="p-4 text-sm text-amber-600 flex gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" /> Não foi possível carregar os lançamentos: {erro}
        </CardContent></Card>
      )}

      {linhas === null ? (
        <div className="p-6 flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando os lançamentos…
        </div>
      ) : !linhas.length ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          Nenhum lançamento identificado nesta campanha ainda.
        </CardContent></Card>
      ) : (
        <Card className="glass-solid"><CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-muted-foreground border-b">
              <th className="p-3">Data</th>
              <th className="p-3">Descrição</th>
              <th className="p-3">Situação</th>
              <th className="p-3 text-right">Valor</th>
              {podeEditar && <th className="p-3" />}
            </tr></thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={l.transacao_id || l.lancamento_bruto_id || l.cobranca_id || i} className="border-b last:border-0">
                  <td className="p-3 whitespace-nowrap">{dataBr(l.data)}</td>
                  <td className="p-3">{l.descricao}</td>
                  <td className="p-3">
                    <Chip cor={l.situacao === 'confirmado' ? 'bg-emerald-500/15 text-emerald-600' : 'bg-amber-500/15 text-amber-600'}>
                      {l.situacao === 'confirmado'
                        ? (l.origem === 'online' ? 'online' : 'classificado')
                        : 'aguardando o financeiro'}
                    </Chip>
                  </td>
                  <td className="p-3 text-right tabular-nums">{brl(l.valor_centavos)}</td>
                  {podeEditar && (
                    <td className="p-3 text-right">
                      {/* ⚠️ O veto existe porque o dígito é DECLARAÇÃO, não prova:
                          um dízimo de R$ 1.000,07 cai aqui por coincidência. */}
                      {l.origem === 'caixa' && (
                        <Button variant="ghost" size="sm" onClick={() => vetar(l)}
                          title="Este crédito não é desta campanha">
                          Não é daqui
                        </Button>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent></Card>
      )}
    </div>
  );
}
