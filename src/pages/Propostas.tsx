// Módulo Propostas · ciclo anual de projetos/eventos/rotinas.
// FASE 1A: tela de Configuração (ciclos, faixas de custo, áreas→diretores,
// critérios). O formulário de proposta e as filas chegam na Fase 1B.
import { useEffect, useState, useCallback } from 'react';
import { propostas } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DatePicker } from '@/components/ui/date-picker';
import { toast } from 'sonner';
import { Plus, Trash2, Save, ClipboardCheck, Settings2, Loader2 } from 'lucide-react';

type Ciclo = { id: string; ano: number; data_abertura_submissao: string | null; data_corte_submissao: string | null; prazo_avaliacao: string | null; orcamento_disponivel: number; estado: string };
type AreaCfg = { id: string; area_id: string; diretor_usuario_id: string | null; ativa: boolean; area?: { id: string; nome: string }; diretor?: { id: string; name: string } };
type Criterio = { id: string; nome: string; descricao: string | null; peso: number; ordem: number; ativo: boolean };

const money = (v: number) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function Propostas() {
  const { getAccessLevel } = useAuth() as any;
  const nivel = typeof getAccessLevel === 'function' ? getAccessLevel(['propostas']) : 5;
  const isAdmin = nivel >= 5;

  const [ciclos, setCiclos] = useState<Ciclo[]>([]);
  const [selId, setSelId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const sel = ciclos.find(c => c.id === selId) || null;

  const carregarCiclos = useCallback(async () => {
    setLoading(true);
    try {
      const cs = await propostas.config.ciclos();
      setCiclos(cs || []);
      setSelId(prev => prev || (cs?.[0]?.id ?? ''));
    } catch (e: any) { toast.error(e?.message || 'Erro ao carregar ciclos'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { carregarCiclos(); }, [carregarCiclos]);

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <ClipboardCheck className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Propostas</h1>
          <p className="text-sm text-muted-foreground">Ciclo anual de projetos, eventos e rotinas · configuração</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold"><Settings2 className="h-4 w-4 text-primary" /> Configuração do ciclo</div>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
          ) : (
            <>
              <CiclosBar ciclos={ciclos} selId={selId} onSel={setSelId} isAdmin={isAdmin} onCreated={carregarCiclos} />
              {sel ? (
                <div className="space-y-6 pt-2">
                  <CicloDatas ciclo={sel} isAdmin={isAdmin} onSaved={carregarCiclos} />
                  <ParametrosPanel cicloId={sel.id} isAdmin={isAdmin} />
                  <CriteriosPanel cicloId={sel.id} isAdmin={isAdmin} />
                  <AreasPanel isAdmin={isAdmin} />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nenhum ciclo cadastrado ainda.{isAdmin ? ' Crie o ciclo do ano acima.' : ' Peça ao administrador para abrir o ciclo.'}</p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card className="opacity-70">
        <CardContent className="pt-5">
          <div className="text-sm font-semibold mb-1">Formulário de proposta, filas e mural</div>
          <p className="text-sm text-muted-foreground">Próxima entrega (Fase 1B/2): submissão de propostas, fila do líder e do diretor, pontuação e mural da reunião. Esta fase deixa a configuração do ciclo pronta.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function CiclosBar({ ciclos, selId, onSel, isAdmin, onCreated }: { ciclos: Ciclo[]; selId: string; onSel: (id: string) => void; isAdmin: boolean; onCreated: () => void }) {
  const [novoAno, setNovoAno] = useState<string>(String(new Date().getFullYear() + 1));
  const [saving, setSaving] = useState(false);
  const criar = async () => {
    setSaving(true);
    try { const c = await propostas.config.criarCiclo({ ano: Number(novoAno) }); toast.success(`Ciclo ${c.ano} criado`); onCreated(); onSel(c.id); }
    catch (e: any) { toast.error(e?.message || 'Erro ao criar ciclo'); }
    finally { setSaving(false); }
  };
  return (
    <div className="flex items-end gap-3 flex-wrap">
      <div className="min-w-[180px]">
        <label className="text-xs text-muted-foreground">Ciclo</label>
        <Select value={selId} onValueChange={onSel}>
          <SelectTrigger><SelectValue placeholder="Selecione o ciclo" /></SelectTrigger>
          <SelectContent className="z-[1001]">
            {ciclos.map(c => <SelectItem key={c.id} value={c.id}>{c.ano} · {c.estado}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {isAdmin && (
        <div className="flex items-end gap-2">
          <div className="w-28">
            <label className="text-xs text-muted-foreground">Novo ciclo (ano)</label>
            <Input value={novoAno} onChange={e => setNovoAno(e.target.value.replace(/\D/g, '').slice(0, 4))} />
          </div>
          <Button size="sm" onClick={criar} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Plus className="h-4 w-4 mr-1" /> Criar</>}</Button>
        </div>
      )}
    </div>
  );
}

function CicloDatas({ ciclo, isAdmin, onSaved }: { ciclo: Ciclo; isAdmin: boolean; onSaved: () => void }) {
  const [f, setF] = useState({ ...ciclo });
  useEffect(() => { setF({ ...ciclo }); }, [ciclo.id]); // eslint-disable-line
  const [saving, setSaving] = useState(false);
  const salvar = async () => {
    setSaving(true);
    try {
      await propostas.config.atualizarCiclo(ciclo.id, {
        data_abertura_submissao: f.data_abertura_submissao, data_corte_submissao: f.data_corte_submissao,
        prazo_avaliacao: f.prazo_avaliacao, orcamento_disponivel: f.orcamento_disponivel, estado: f.estado,
      });
      toast.success('Ciclo salvo'); onSaved();
    } catch (e: any) { toast.error(e?.message || 'Erro ao salvar'); } finally { setSaving(false); }
  };
  const fld = 'flex-1 min-w-[150px]';
  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Janela e orçamento</div>
      <div className="flex gap-3 flex-wrap">
        <div className={fld}><label className="text-xs text-muted-foreground">Abertura da submissão</label><DatePicker value={f.data_abertura_submissao || ''} onChange={(v: string) => setF({ ...f, data_abertura_submissao: v })} disabled={!isAdmin} /></div>
        <div className={fld}><label className="text-xs text-muted-foreground">Corte da submissão</label><DatePicker value={f.data_corte_submissao || ''} onChange={(v: string) => setF({ ...f, data_corte_submissao: v })} disabled={!isAdmin} /></div>
        <div className={fld}><label className="text-xs text-muted-foreground">Prazo de avaliação</label><DatePicker value={f.prazo_avaliacao || ''} onChange={(v: string) => setF({ ...f, prazo_avaliacao: v })} disabled={!isAdmin} /></div>
      </div>
      <div className="flex gap-3 flex-wrap items-end">
        <div className={fld}><label className="text-xs text-muted-foreground">Orçamento disponível (R$)</label><Input type="number" value={f.orcamento_disponivel} onChange={e => setF({ ...f, orcamento_disponivel: Number(e.target.value) })} disabled={!isAdmin} /><span className="text-[11px] text-muted-foreground">{money(f.orcamento_disponivel)}</span></div>
        <div className="min-w-[180px]">
          <label className="text-xs text-muted-foreground">Estado do ciclo</label>
          <Select value={f.estado} onValueChange={v => setF({ ...f, estado: v })} disabled={!isAdmin}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent className="z-[1001]">
              {['configuracao', 'submissao_aberta', 'em_avaliacao', 'em_deliberacao', 'encerrado'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {isAdmin && <Button size="sm" onClick={salvar} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" /> Salvar</>}</Button>}
      </div>
    </div>
  );
}

function ParametrosPanel({ cicloId, isAdmin }: { cicloId: string; isAdmin: boolean }) {
  const [p, setP] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  useEffect(() => { propostas.config.parametros(cicloId).then(setP).catch(() => {}); }, [cicloId]);
  const salvar = async () => {
    setSaving(true);
    try { await propostas.config.salvarParametros(cicloId, p); toast.success('Parâmetros salvos'); }
    catch (e: any) { toast.error(e?.message || 'Erro'); } finally { setSaving(false); }
  };
  const campo = (chave: string, label: string, dica?: string) => (
    <div className="flex-1 min-w-[160px]">
      <label className="text-xs text-muted-foreground">{label}</label>
      <Input value={p[chave] ?? ''} onChange={e => setP({ ...p, [chave]: e.target.value })} disabled={!isAdmin} />
      {dica && <span className="text-[11px] text-muted-foreground">{dica}</span>}
    </div>
  );
  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Faixas de custo e parâmetros</div>
      <div className="flex gap-3 flex-wrap">
        {campo('faixa_custo_baixo_ate', 'Custo Baixo até (R$)', 'classifica automaticamente')}
        {campo('faixa_custo_medio_ate', 'Custo Médio até (R$)', 'acima disso = Alto')}
        {campo('min_avaliadores', 'Mín. avaliadores (quórum)')}
        {campo('prazo_recurso_dias', 'Prazo de recurso (dias)')}
      </div>
      {isAdmin && <Button size="sm" onClick={salvar} disabled={saving}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Save className="h-4 w-4 mr-1" /> Salvar parâmetros</>}</Button>}
    </div>
  );
}

function CriteriosPanel({ cicloId, isAdmin }: { cicloId: string; isAdmin: boolean }) {
  const [lista, setLista] = useState<Criterio[]>([]);
  const [novo, setNovo] = useState({ nome: '', peso: '1' });
  const carregar = useCallback(() => { propostas.config.criterios(cicloId).then(setLista).catch(() => {}); }, [cicloId]);
  useEffect(() => { carregar(); }, [carregar]);
  const add = async () => {
    if (!novo.nome.trim()) return;
    try { await propostas.config.criarCriterio(cicloId, { nome: novo.nome.trim(), peso: Number(novo.peso || 1), ordem: lista.length }); setNovo({ nome: '', peso: '1' }); carregar(); }
    catch (e: any) { toast.error(e?.message || 'Erro'); }
  };
  const remover = async (id: string) => { try { await propostas.config.removerCriterio(id); carregar(); } catch (e: any) { toast.error(e?.message || 'Erro'); } };
  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Critérios de avaliação (0–5, média ponderada pelo peso)</div>
      {lista.filter(c => c.ativo).length === 0 && <p className="text-sm text-muted-foreground">Nenhum critério — o ciclo funciona com N critérios (inclusive um só).</p>}
      {lista.filter(c => c.ativo).map(c => (
        <div key={c.id} className="flex items-center justify-between gap-2 text-sm border-b border-border/50 py-1.5">
          <span className="flex-1 min-w-0 truncate">{c.nome} <span className="text-muted-foreground">· peso {c.peso}</span></span>
          {isAdmin && <button onClick={() => remover(c.id)} className="text-red-500 shrink-0 p-1" title="Remover"><Trash2 className="h-4 w-4" /></button>}
        </div>
      ))}
      {isAdmin && (
        <div className="flex items-end gap-2 pt-1">
          <div className="flex-1"><label className="text-xs text-muted-foreground">Novo critério</label><Input value={novo.nome} onChange={e => setNovo({ ...novo, nome: e.target.value })} placeholder="Ex.: Alinhamento com o Plano de Expansão" /></div>
          <div className="w-20"><label className="text-xs text-muted-foreground">Peso</label><Input value={novo.peso} onChange={e => setNovo({ ...novo, peso: e.target.value })} /></div>
          <Button size="sm" onClick={add}><Plus className="h-4 w-4" /></Button>
        </div>
      )}
    </div>
  );
}

function AreasPanel({ isAdmin }: { isAdmin: boolean }) {
  const [areas, setAreas] = useState<AreaCfg[]>([]);
  const [aux, setAux] = useState<{ areas: { id: string; nome: string }[]; diretores: { id: string; name: string }[] }>({ areas: [], diretores: [] });
  const carregar = useCallback(() => {
    propostas.config.areas().then(setAreas).catch(() => {});
    propostas.config.aux().then(setAux).catch(() => {});
  }, []);
  useEffect(() => { carregar(); }, [carregar]);
  const mapaCfg = new Map(areas.map(a => [a.area_id, a]));
  const salvar = async (areaId: string, diretor_usuario_id: string | null, ativa: boolean) => {
    try { await propostas.config.salvarArea(areaId, { diretor_usuario_id, ativa }); toast.success('Área salva'); carregar(); }
    catch (e: any) { toast.error(e?.message || 'Erro'); }
  };
  return (
    <div className="rounded-lg border border-border p-4 space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Áreas participantes e diretor de cada uma</div>
      <p className="text-[11px] text-muted-foreground">O diretor da área faz o 1º filtro das propostas dela. Marque as áreas que participam do ciclo.</p>
      <div className="space-y-1.5">
        {aux.areas.map(area => {
          const cfg = mapaCfg.get(area.id);
          const diretorId = cfg?.diretor_usuario_id || '';
          const ativa = cfg ? cfg.ativa : false;
          return (
            <div key={area.id} className="flex items-center gap-2 flex-wrap border-b border-border/50 py-1.5">
              <span className="w-40 text-sm font-medium truncate">{area.nome}</span>
              <div className="min-w-[200px] flex-1">
                <Select value={diretorId || '__none__'} onValueChange={v => isAdmin && salvar(area.id, v === '__none__' ? null : v, ativa || true)} disabled={!isAdmin}>
                  <SelectTrigger className="h-8"><SelectValue placeholder="Diretor da área" /></SelectTrigger>
                  <SelectContent className="z-[1001]">
                    <SelectItem value="__none__">— sem diretor —</SelectItem>
                    {aux.diretores.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {isAdmin && (
                <label className="flex items-center gap-1.5 text-xs shrink-0">
                  <input type="checkbox" checked={ativa} onChange={e => salvar(area.id, diretorId || null, e.target.checked)} /> participa
                </label>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
