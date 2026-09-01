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
  ArrowLeft, Play, Pause, AlertTriangle, Copy, Heart, Pencil, Users,
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
      <Ritmo d={d} />
    </div>
  );
}

/**
 * Quem responde pela tarefa, em texto.
 *
 * ⚠️ "sem responsável" e "a área toda" são coisas DIFERENTES: a primeira é
 * trabalho que ninguém pegou (cobrança), a segunda é decisão registrada.
 * Colapsar as duas num traço faz a coordenação cobrar quem já está atribuído.
 */
function rotuloDono(m: any) {
  const nomes = (m?.responsaveis || []).map((r: any) => r.nome).filter(Boolean);
  if (!nomes.length && !m?.area_nome) return { texto: 'sem responsável', tem_dono: false };
  if (!nomes.length) return { texto: `${m.area_nome} (área toda)`, tem_dono: true };
  // Até 2 nomes na linha; daí "+N" — 12 nomes numa linha de tabela é parede de
  // texto e ninguém lê nenhum.
  const visiveis = nomes.slice(0, 2).join(', ');
  const resto = nomes.length - 2;
  const pessoas = resto > 0 ? `${visiveis} +${resto}` : visiveis;
  return { texto: m.area_nome ? `${pessoas} · ${m.area_nome}` : pessoas, tem_dono: true };
}

/**
 * O ritmo necessário — por DOMINGO primeiro.
 *
 * ⚠️ Pedido do Matheus (27/08): é no CULTO que a oferta entra, então "R$ 62 mil
 * por domingo" é a frase que a liderança usa. "R$ 7.692 por dia" não descreve
 * nenhum momento real da igreja — fica como contexto, em letra menor.
 *
 * ⚠️ Atualiza sozinho: `falta_centavos` vem da view, então cada doação que entra
 * derruba o número. Não há nada a recalcular à mão.
 */
function Ritmo({ d }: { d: any }) {
  if (d?.falta_centavos === 0) {
    return (
      <div className="mt-3 text-sm text-emerald-600">
        Meta alcançada — não falta mais nada.
      </div>
    );
  }
  // ⚠️ Sem domingo restante NÃO é "R$ 0 por domingo": é uma frase própria. Zerar
  // ou dividir por zero aqui daria "Infinity" ou um número que engana.
  if (d?.por_domingo_centavos == null && d?.por_dia_centavos == null) return null;

  const antesDeComecar = !!d.parte_do_inicio;

  return (
    <div className="mt-3 space-y-1">
      {d.por_domingo_centavos != null ? (
        <div className="text-sm">
          Faltam <strong>{d.domingos_restantes} domingos</strong> — o ritmo para bater a meta é{' '}
          <strong className="text-base">{brl(d.por_domingo_centavos)} por domingo</strong>.
        </div>
      ) : (
        <div className="text-sm text-amber-600">
          Não há mais domingo até o fim da campanha ({dataBr(d.data_fim)}) —
          faltam <strong>{brl(d.falta_centavos)}</strong>.
        </div>
      )}
      {d.por_dia_centavos != null && (
        <div className="text-xs text-muted-foreground">
          {d.dias_restantes} dias de campanha · equivale a {brl(d.por_dia_centavos)}/dia
          {/* ⚠️ Declara quando a conta parte do INÍCIO e não de hoje: sem isso o
              número parece errado pra quem soma os dias no calendário. */}
          {antesDeComecar ? ` · contado a partir de ${dataBr(d.inicio_efetivo)}, quando a arrecadação abre` : ''}
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
        <ConfigIdentidade det={det} podeEditar={podeAtivar} onMudou={onMudou} />
        <ConfigDigito det={det} podeAtivar={podeAtivar} onMudou={onMudou} />

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

/**
 * Configuração do DÍGITO VERIFICADOR.
 *
 * ⚠️⚠️ Trocar o dígito não é editar um campo de texto: a barrinha casa o caixa por
 * `identificador_centavo = digito`, então sem tratamento toda doação já
 * identificada com o dígito antigo DESAPARECERIA do total, em silêncio. O
 * servidor FIXA o passado antes de trocar e devolve quantos lançamentos fixou —
 * e é isso que esta tela declara. Por isso é rota própria e nível 4.
 */
/**
 * Nome e descrição curta da campanha.
 *
 * Pedido do Matheus (01/09/2026): *"preciso que dê para editar o nome da campanha
 * na tela de configurações, e isso deve refletir em todos os locais."*
 *
 * ⚠️⚠️ O "reflete em todos os locais" JÁ é verdade, e foi MEDIDO: nenhuma tabela
 * guarda cópia do nome, e `camp_digitos_ativos()` lê `c.nome` ao vivo. Renomear
 * aparece sozinho na barrinha, no dígito, no seletor do /doar e no app.
 *
 * ⚠️ As DUAS exceções estão escritas na tela, porque as duas são desejadas e
 * ninguém adivinharia: o link público (slug) não muda, e o recibo de quem já
 * doou mantém o nome de quando doou.
 */
function ConfigIdentidade({ det, podeEditar, onMudou }: any) {
  const c = det?.campanha || det || {};
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState('');
  const [desc, setDesc] = useState('');
  const [salvando, setSalvando] = useState(false);

  const abrir = () => {
    setNome(c.nome || '');
    setDesc(c.descricao_curta || '');
    setEditando(true);
  };

  const salvar = async () => {
    const n = nome.replace(/\s+/g, ' ').trim();
    // ⚠️ A tela evita a ida ao servidor, mas quem DECIDE é o backend — este bloco
    // é conveniência, não a trava (a régua está em `utils/campanhaIdentidade`).
    if (!n) return toast.error('Dê um nome à campanha.');
    if (n.length > 80) return toast.error('O nome cabe em até 80 caracteres.');
    setSalvando(true);
    try {
      await campanhas.atualizar(c.id, { nome: n, descricao_curta: desc.trim() });
      toast.success('Campanha atualizada');
      setEditando(false);
      onMudou();
    } catch (e: any) { toast.error(e?.message || 'Erro ao salvar'); }
    finally { setSalvando(false); }
  };

  return (
    <Card><CardContent className="p-5 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium text-sm">Nome e descrição</div>
        {podeEditar && !editando && (
          <Button variant="ghost" size="sm" onClick={abrir}>
            <Pencil className="h-4 w-4 mr-1" /> Editar
          </Button>
        )}
      </div>

      {!editando ? (
        <div className="text-sm space-y-1">
          <div className="font-medium">{c.nome}</div>
          {c.descricao_curta
            ? <div className="text-xs text-muted-foreground">{c.descricao_curta}</div>
            : <div className="text-xs text-muted-foreground">Sem descrição curta.</div>}
          <div className="text-xs text-muted-foreground pt-1">
            A descrição curta aparece embaixo do seletor de campanha na tela de doar.
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">Nome da campanha</label>
            <Input value={nome} maxLength={80} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Descrição curta <span className="text-muted-foreground">(opcional)</span>
            </label>
            <Input value={desc} maxLength={160} onChange={(e) => setDesc(e.target.value)}
              placeholder="transformar o espaço onde as crianças são cuidadas" />
          </div>

          {/* ⚠️⚠️ As duas consequências que ninguém adivinharia, DITAS antes de salvar. */}
          <div className="text-xs rounded-md p-3 space-y-1" style={{ background: 'var(--surface)' }}>
            <div>
              O nome novo aparece <strong>em todos os lugares</strong>: barrinha, telas do culto,
              seletor de campanha na tela de doar e no app.
            </div>
            <div className="text-muted-foreground">
              ⚠️ O <strong>link público não muda</strong> — cartaz e QR já impressos continuam
              funcionando.
            </div>
            <div className="text-muted-foreground">
              ⚠️ Quem <strong>já doou</strong> mantém no recibo o nome de quando doou. O valor
              continua somando nesta campanha.
            </div>
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={salvar} disabled={salvando}>
              {salvando ? 'Salvando…' : 'Salvar'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditando(false)} disabled={salvando}>
              Cancelar
            </Button>
          </div>
        </div>
      )}
    </CardContent></Card>
  );
}

function ConfigDigito({ det, podeAtivar, onMudou }: any) {
  const c = det.campanha;
  const [editando, setEditando] = useState(false);
  const [valor, setValor] = useState(c.digito || '');
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [ocupados, setOcupados] = useState<any[] | null>(null);
  const [historico, setHistorico] = useState<any[] | null>(null);

  useEffect(() => {
    if (!editando) return;
    campanhas.digitos().then((d: any) => setOcupados(d.ocupados || [])).catch(() => setOcupados([]));
    campanhas.digitoHistorico(c.id).then(setHistorico).catch(() => setHistorico([]));
  }, [editando, c.id]);

  const jaTemDinheiro = (det.total_centavos || 0) > 0;

  const salvar = async () => {
    const novo = String(valor || '').trim();
    if (novo && novo === c.digito) { setEditando(false); return; }
    if (jaTemDinheiro && !confirm(
      `Esta campanha já tem ${brl(det.total_centavos)} identificados pelo dígito ${c.digito}.\n\n` +
      `Ao trocar, o sistema vai FIXAR esses lançamentos na campanha para que o total não caia — ` +
      `e as doações novas passam a ser reconhecidas pelo dígito ${novo || '(nenhum)'}.\n\nConfirma?`
    )) return;

    setSalvando(true);
    try {
      const r = await campanhas.definirDigito(c.id, novo || null, motivo || null);
      if (r?.sem_mudanca) toast.info('O dígito já era esse.');
      else if (r?.fixados) toast.success(`Dígito alterado. ${r.fixados} lançamento(s) foram fixados na campanha para o total não cair.`);
      else toast.success('Dígito configurado.');
      setEditando(false); setMotivo(''); onMudou();
    } catch (e: any) { toast.error(e?.message || 'Erro ao configurar o dígito'); }
    finally { setSalvando(false); }
  };

  return (
    <Card><CardContent className="p-5 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium text-sm">Como o dinheiro é identificado</div>
        {podeAtivar && !editando && (
          <Button variant="ghost" size="sm" onClick={() => { setValor(c.digito || ''); setEditando(true); }}>
            <Pencil className="h-4 w-4 mr-1" /> Configurar
          </Button>
        )}
      </div>

      {!editando && (c.digito ? (
        <div className="text-sm space-y-1">
          <div>Dígito <strong className="text-lg">{c.digito}</strong></div>
          <div className="text-muted-foreground text-xs">
            Quem transferir pelo banco põe esses centavos no valor.
            Doar R$ 500 = transferir <strong>R$ 500,{c.digito}</strong>.
          </div>
          {/* ⚠️ Em rascunho o dígito NÃO classifica nada: `camp_digitos_ativos()`
              só devolve campanha ativa ou pausada. Sem dizer isso, dinheiro que
              chegar antes do lançamento não é reconhecido e ninguém entende. */}
          {c.status === 'rascunho' && (
            <div className="text-xs text-amber-600 flex gap-1.5 mt-1">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
              Enquanto a campanha está em rascunho, este dígito ainda NÃO identifica
              doação nenhuma. Ative a campanha para ele começar a valer.
            </div>
          )}
        </div>
      ) : (
        <div className="text-sm text-amber-600 flex gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          Sem dígito configurado — quem transferir pelo banco não vai ser reconhecido nesta campanha.
        </div>
      ))}

      {editando && (
        <div className="space-y-3">
          <div className="flex items-end gap-2">
            <div>
              <label className="block text-xs mb-1 text-muted-foreground">Centavos (01 a 99)</label>
              <Input value={valor} maxLength={2} className="w-20 text-center text-lg"
                onChange={(e) => setValor(e.target.value.replace(/\D/g, ''))} placeholder="07" />
            </div>
            <div className="text-xs text-muted-foreground pb-2">
              Doar R$ 500 = transferir <strong>R$ 500,{valor || '__'}</strong>
            </div>
          </div>

          {ocupados === null ? (
            <div className="text-xs text-muted-foreground">Conferindo os dígitos em uso…</div>
          ) : ocupados.length ? (
            <div className="text-xs text-muted-foreground space-y-0.5">
              <div>Já em uso (o sistema recusa repetir):</div>
              {ocupados.map((o: any) => (
                <div key={o.digito}><strong>{o.digito}</strong> — {o.descricao}</div>
              ))}
            </div>
          ) : null}

          {jaTemDinheiro && (
            <div className="text-xs rounded-md p-3 text-amber-700 dark:text-amber-400"
              style={{ background: 'var(--surface)' }}>
              <strong>Atenção:</strong> já há {brl(det.total_centavos)} identificados pelo
              dígito {c.digito}. Ao trocar, esses lançamentos são <strong>fixados</strong> nesta
              campanha para o total não cair — e as doações novas passam a usar o dígito novo.
            </div>
          )}

          <Input value={motivo} onChange={(e) => setMotivo(e.target.value)}
            placeholder="Por que está trocando? (fica registrado)" />

          <div className="flex gap-2">
            <Button size="sm" onClick={salvar} disabled={salvando}>
              {salvando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Salvar dígito
            </Button>
            {c.digito && (
              <Button size="sm" variant="outline" disabled={salvando}
                onClick={() => { setValor(''); }}>
                Tirar o dígito
              </Button>
            )}
            <Button size="sm" variant="ghost" onClick={() => { setEditando(false); setMotivo(''); }}>
              Cancelar
            </Button>
          </div>

          {historico && historico.length > 0 && (
            <div className="text-xs text-muted-foreground space-y-0.5 pt-2 border-t">
              <div>Trocas anteriores:</div>
              {historico.map((h: any) => (
                <div key={h.id}>
                  {dataBr(h.created_at)} · {h.digito_anterior || '(nenhum)'} → {h.digito_novo || '(nenhum)'}
                  {h.lancamentos_fixados ? ` · ${h.lancamentos_fixados} fixado(s)` : ''}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="text-xs text-muted-foreground">
        {c.aceita_online
          ? 'Quem doa pelo link/QR é contado com atribuição exata, sem depender dos centavos.'
          : 'Doação online está desligada nesta campanha.'}
      </div>
    </CardContent></Card>
  );
}

// ── Aba · Cronograma ───────────────────────────────────────────────────────


/**
 * Seletor de pessoas · multi.
 *
 * ⚠️ DOIS grupos, e é decisão: `vw_colaboradores` (a definição de equipe da casa)
 * exclui 7 contas com login do ERP — uma delas é o Pr. Juninho. Esconder faria a
 * tela afirmar que uma pessoa real não existe, que é a conclusão a que o Matheus
 * chegou 3× em 25/08 quando um seletor omitia alguém em silêncio.
 */
function SeletorPessoas({ aux, valor, onChange, max }: any) {
  const [busca, setBusca] = useState('');
  const sel: string[] = Array.isArray(valor) ? valor : [];

  // ⚠️ Normaliza acento nos DOIS lados: `monica` não casa com `Mônica` num
  // `includes()` cru, e foi assim que a Mônica "não existia" no seletor de
  // supervisor em 25/08.
  const norm = (t: string) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const q = norm(busca);

  const filtrar = (lista: any[]) => (lista || []).filter((p: any) =>
    !q || norm(p.nome).includes(q) || norm(p.email).includes(q) || norm(p.area).includes(q));

  const alternar = (id: string) => {
    if (sel.includes(id)) return onChange(sel.filter((x) => x !== id));
    if (max && sel.length >= max) {
      toast.error(`Máximo de ${max} responsáveis. Para mais gente que isso, atribua a uma ÁREA.`);
      return;
    }
    onChange([...sel, id]);
  };

  const nomeDe = (id: string) => {
    const t = [...(aux?.equipe || []), ...(aux?.fora_da_equipe || [])].find((p: any) => p.id === id);
    return t?.nome || 'pessoa';
  };

  const equipe = filtrar(aux?.equipe);
  const fora = filtrar(aux?.fora_da_equipe);

  return (
    <div className="space-y-2">
      {sel.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {sel.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-primary/15 text-primary">
              {nomeDe(id)}
              <button type="button" onClick={() => alternar(id)} className="opacity-60 hover:opacity-100">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <Input value={busca} onChange={(e) => setBusca(e.target.value)}
        placeholder="Buscar pessoa por nome, e-mail ou área…" />
      <div className="max-h-52 overflow-y-auto rounded-md border divide-y">
        {!equipe.length && !fora.length && (
          <div className="p-3 text-xs text-muted-foreground">Ninguém encontrado com esse termo.</div>
        )}
        {equipe.map((p: any) => (
          <button type="button" key={p.id} onClick={() => alternar(p.id)}
            className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 hover:bg-foreground/5 ${
              sel.includes(p.id) ? 'bg-primary/10' : ''}`}>
            <span>
              {p.nome}
              <span className="text-xs text-muted-foreground">
                {p.cargo ? ` · ${p.cargo}` : ''}{p.area ? ` · ${p.area}` : ''}
              </span>
            </span>
            {sel.includes(p.id) && <Check className="h-4 w-4 text-primary shrink-0" />}
          </button>
        ))}
        {fora.length > 0 && (
          <div className="px-3 py-1.5 text-[11px] uppercase tracking-wide text-muted-foreground bg-foreground/5">
            Fora da definição de equipe
          </div>
        )}
        {fora.map((p: any) => (
          <button type="button" key={p.id} onClick={() => alternar(p.id)}
            className={`w-full text-left px-3 py-2 text-sm flex items-center justify-between gap-2 hover:bg-foreground/5 ${
              sel.includes(p.id) ? 'bg-primary/10' : ''}`}>
            <span>{p.nome}<span className="text-xs text-muted-foreground"> · {p.email}</span></span>
            {sel.includes(p.id) && <Check className="h-4 w-4 text-primary shrink-0" />}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted-foreground">
        Quem for adicionado recebe um aviso. Atribuir a uma <strong>área</strong> avisa
        quem cuida dela — mas só quando ninguém é nomeado.
      </p>
    </div>
  );
}

/** Formulário de tarefa · serve para criar e para EDITAR (mesma régua). */
function FormMarco({ aux, inicial, onSalvar, onCancelar, salvando }: any) {
  const [f, setF] = useState<any>(() => ({
    titulo: inicial?.titulo || '',
    descricao: inicial?.descricao || '',
    tipo: inicial?.tipo || 'tarefa',
    status: inicial?.status || 'pendente',
    data_prevista: inicial?.data_prevista || '',
    area_id: inicial?.area_id ? String(inicial.area_id) : '',
    responsaveis: (inicial?.responsaveis || []).map((r: any) => r.profile_id),
  }));

  return (
    <Card className="glass-solid"><CardContent className="p-5 space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="md:col-span-2">
          <label className="block text-sm mb-1">Tarefa</label>
          <Input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })}
            placeholder="O que precisa ser feito" />
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm mb-1">Detalhe (opcional)</label>
          <Textarea rows={2} value={f.descricao}
            onChange={(e) => setF({ ...f, descricao: e.target.value })} />
        </div>
        <div>
          <label className="block text-sm mb-1">Tipo</label>
          <Select value={f.tipo} onValueChange={(v) => setF({ ...f, tipo: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="z-[1200]">
              {Object.entries(MARCO_TIPO).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="block text-sm mb-1">Situação</label>
          <Select value={f.status} onValueChange={(v) => setF({ ...f, status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="z-[1200]">
              {Object.entries(MARCO_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="block text-sm mb-1">Prazo</label>
          <DatePicker value={f.data_prevista}
            onChange={(v: any) => setF({ ...f, data_prevista: v })} placeholder="Prazo" />
        </div>
        <div>
          <label className="block text-sm mb-1">Área responsável</label>
          {/* ⚠️ `__nenhuma` como valor: o Select do shadcn não aceita `value=""`
              (ele o trata como "sem valor" e o placeholder volta), então "tirar a
              área" precisa de um item de verdade. */}
          <Select value={f.area_id || '__nenhuma'}
            onValueChange={(v) => setF({ ...f, area_id: v === '__nenhuma' ? '' : v })}>
            <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
            <SelectContent className="z-[1200]">
              <SelectItem value="__nenhuma">Nenhuma</SelectItem>
              {(aux?.areas || []).map((a: any) => (
                <SelectItem key={a.id} value={String(a.id)}>{a.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="md:col-span-2">
          <label className="block text-sm mb-1">Responsáveis</label>
          <SeletorPessoas aux={aux} valor={f.responsaveis} max={aux?.max_responsaveis}
            onChange={(v: string[]) => setF({ ...f, responsaveis: v })} />
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={salvando} onClick={() => onSalvar(f)}>
          {salvando ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Salvar
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancelar}>Cancelar</Button>
      </div>
    </CardContent></Card>
  );
}

function AbaCronograma({ det, podeEditar, onMudou }: any) {
  const [novo, setNovo] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [aux, setAux] = useState<any | null>(null);
  const [auxErro, setAuxErro] = useState<string | null>(null);
  const marcos = det.marcos || [];

  useEffect(() => {
    campanhas.aux()
      .then((a: any) => { setAux(a); setAuxErro(null); })
      // ⚠️ Erro NÃO vira lista vazia de pessoas: "não há ninguém pra atribuir" é a
      // leitura errada de uma consulta que falhou, e faria a equipe achar que o
      // cadastro se perdeu.
      .catch((e: any) => setAuxErro(e?.message || 'Erro ao carregar pessoas e áreas'));
  }, []);

  const declararResultado = (r: any) => {
    if (r?.truncados) toast.warning(`${r.truncados} responsável(is) não entrou: o máximo é ${r.max_responsaveis}. Para mais gente, atribua a uma área.`);
    if (r?.invalidos?.length) toast.warning(`${r.invalidos.length} responsável(is) não foi reconhecido e ficou de fora.`);
    if (r?.avisados) toast.success(`Salvo · ${r.avisados} pessoa(s) avisada(s).`);
    else if (r?.avisados_area) toast.success(`Salvo · ${r.avisados_area} pessoa(s) da área avisada(s).`);
    else toast.success('Salvo.');
  };

  const criar = async (f: any) => {
    if (!f.titulo?.trim()) return toast.error('Dê um título à tarefa.');
    setSalvando(true);
    try {
      const r = await campanhas.marcos.criar(det.campanha.id, {
        titulo: f.titulo.trim(), descricao: f.descricao || null, tipo: f.tipo,
        status: f.status, data_prevista: f.data_prevista || null,
        area_id: f.area_id ? Number(f.area_id) : null,
        responsaveis: f.responsaveis,
        ordem: (marcos.at(-1)?.ordem || 0) + 10,
      });
      declararResultado(r); setNovo(false); onMudou();
    } catch (e: any) { toast.error(e?.message || 'Erro ao criar a tarefa'); }
    finally { setSalvando(false); }
  };

  const salvarEdicao = async (marcoId: string, f: any) => {
    if (!f.titulo?.trim()) return toast.error('O título não pode ficar vazio.');
    setSalvando(true);
    try {
      const r = await campanhas.marcos.atualizar(marcoId, {
        titulo: f.titulo.trim(), descricao: f.descricao || null, tipo: f.tipo,
        status: f.status, data_prevista: f.data_prevista || null,
        area_id: f.area_id ? Number(f.area_id) : null,
        responsaveis: f.responsaveis,
      });
      declararResultado(r); setEditando(null); onMudou();
    } catch (e: any) { toast.error(e?.message || 'Erro ao salvar'); }
    finally { setSalvando(false); }
  };

  const alternarConcluido = async (m: any) => {
    try {
      await campanhas.marcos.atualizar(m.id, { status: m.status === 'concluido' ? 'pendente' : 'concluido' });
      onMudou();
    } catch (e: any) { toast.error(e?.message || 'Erro ao atualizar'); }
  };

  const remover = async (m: any) => {
    if (!confirm(`Excluir a tarefa "${m.titulo}"?`)) return;
    try { await campanhas.marcos.remover(m.id); toast.success('Tarefa excluída.'); onMudou(); }
    catch (e: any) { toast.error(e?.message || 'Erro ao excluir'); }
  };

  const hoje = det.hoje;
  const semDono = marcos.filter((m: any) => !m.responsaveis?.length && !m.area_id
    && !['concluido', 'cancelado'].includes(m.status)).length;

  return (
    <div className="space-y-4">
      {auxErro && (
        <Card className="border-amber-500/40"><CardContent className="p-4 text-sm text-amber-600 flex gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>Não foi possível carregar as pessoas e áreas: {auxErro}. Sem isso não dá para atribuir responsável.</div>
        </CardContent></Card>
      )}
      {det.atribuicao_incompleta && (
        <Card className="border-amber-500/40"><CardContent className="p-4 text-sm text-amber-600 flex gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          {/* ⚠️ "sem responsável" e "não deu pra saber" são coisas diferentes —
              a primeira é cobrança, a segunda é falha de leitura. */}
          <div>Os responsáveis não carregaram ({det.atribuicao_incompleta}). As tarefas
          abaixo podem aparecer como "sem responsável" sem estar.</div>
        </CardContent></Card>
      )}
      {semDono > 0 && !det.atribuicao_incompleta && (
        <Card><CardContent className="p-4 text-sm flex gap-2 text-muted-foreground">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
          <div><strong>{semDono}</strong> tarefa(s) em aberto sem responsável nem área.
          Tarefa sem dono é trabalho que ninguém pegou.</div>
        </CardContent></Card>
      )}

      {podeEditar && (
        novo ? (
          <FormMarco aux={aux} inicial={null} salvando={salvando}
            onSalvar={criar} onCancelar={() => setNovo(false)} />
        ) : (
          <Button size="sm" onClick={() => setNovo(true)} disabled={!aux}>
            <Plus className="h-4 w-4 mr-1" /> Nova tarefa
          </Button>
        )
      )}

      {!marcos.length && (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
          Nenhuma tarefa no cronograma.
        </CardContent></Card>
      )}

      <div className="space-y-2">
        {marcos.map((m: any) => {
          const atrasado = m.status !== 'concluido' && m.status !== 'cancelado'
            && m.data_prevista && String(m.data_prevista) < hoje;
          const atrib = rotuloDono(m);
          if (editando === m.id) {
            return (
              <FormMarco key={m.id} aux={aux} inicial={m} salvando={salvando}
                onSalvar={(f: any) => salvarEdicao(m.id, f)} onCancelar={() => setEditando(null)} />
            );
          }
          return (
            <Card key={m.id} className={atrasado ? 'border-red-500/40' : ''}>
              <CardContent className="p-4 flex flex-wrap items-start gap-3">
                <button type="button" title={m.status === 'concluido' ? 'Reabrir' : 'Concluir'}
                  disabled={!podeEditar}
                  onClick={() => podeEditar && alternarConcluido(m)}
                  className={`h-6 w-6 shrink-0 rounded-full border flex items-center justify-center ${
                    m.status === 'concluido' ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-600' : 'border-foreground/25'}`}>
                  {m.status === 'concluido' ? <Check className="h-3.5 w-3.5" /> : null}
                </button>
                <div className="flex-1 min-w-[220px]">
                  <div className={`font-medium text-sm ${m.status === 'concluido' ? 'line-through text-muted-foreground' : ''}`}>
                    {m.titulo}
                  </div>
                  {m.descricao && <div className="text-xs text-muted-foreground mt-0.5">{m.descricao}</div>}
                  <div className="flex flex-wrap items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                    <Chip cor="bg-foreground/10 text-foreground">{MARCO_TIPO[m.tipo] || m.tipo}</Chip>
                    {m.data_prevista && (
                      <span className={atrasado ? 'text-red-600 font-medium' : ''}>
                        prazo {dataBr(m.data_prevista)}{atrasado ? ' · atrasado' : ''}
                      </span>
                    )}
                    {m.data_conclusao && <span>concluído em {dataBr(m.data_conclusao)}</span>}
                    <span className={atrib.tem_dono ? '' : 'text-amber-600'}>· {atrib.texto}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Chip cor={m.status === 'concluido' ? 'bg-emerald-500/15 text-emerald-600'
                    : m.status === 'bloqueado' ? 'bg-red-500/15 text-red-600'
                    : m.status === 'em_andamento' ? 'bg-sky-500/15 text-sky-600' : 'bg-foreground/10 text-muted-foreground'}>
                    {MARCO_STATUS[m.status] || m.status}
                  </Chip>
                  {podeEditar && (
                    <>
                      <Button variant="ghost" size="icon" title="Editar"
                        disabled={!aux} onClick={() => setEditando(m.id)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" title="Excluir" onClick={() => remover(m)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
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
