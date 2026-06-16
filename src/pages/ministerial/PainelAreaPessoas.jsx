// ============================================================================
// Aba "Pessoas" do AMI / Bridge
// ============================================================================
// Lista quem declarou frequentar o ministério (mem_membros.frequenta_area),
// com a faixa etária. Clicar abre o detalhamento da pessoa — SEM a parte de
// contribuições (o backend nem retorna; líder de área não vê doação).
// ============================================================================

import { useState, useEffect, useMemo, useCallback } from 'react';
import { painelArea as api } from '../../api';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Input } from '../../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '../../components/ui/dialog';
import { Loader2, Search, User, Baby, Phone, Mail, Users, HeartHandshake, Route as RouteIcon, ShieldCheck, Check } from 'lucide-react';
import { toast } from 'sonner';

const FAIXA = {
  crianca:     { label: 'Criança',     cls: 'bg-pink-100 text-pink-700 border-pink-300 dark:bg-pink-950/40 dark:text-pink-300' },
  adolescente: { label: 'Adolescente', cls: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300' },
  jovem:       { label: 'Jovem',       cls: 'bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-950/40 dark:text-sky-300' },
  adulto:      { label: 'Adulto',      cls: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-800 dark:text-slate-300' },
  sem_data:    { label: 'Sem data',    cls: 'bg-muted text-muted-foreground' },
};

function FaixaBadge({ faixa }) {
  const f = FAIXA[faixa] || FAIXA.sem_data;
  return <Badge variant="outline" className={`text-xs ${f.cls}`}>{f.label}</Badge>;
}

function idadeLabel(dataNasc) {
  if (!dataNasc) return null;
  const n = new Date(dataNasc);
  if (isNaN(n.getTime())) return null;
  const h = new Date();
  let i = h.getFullYear() - n.getFullYear();
  const m = h.getMonth() - n.getMonth();
  if (m < 0 || (m === 0 && h.getDate() < n.getDate())) i--;
  return `${i} anos`;
}

export default function PainelAreaPessoas({ area, accent = '#00B39D' }) {
  const areaLabel = area === 'ami' ? 'AMI' : 'Bridge';
  const outraLabel = area === 'ami' ? 'Bridge' : 'AMI';
  const [lista, setLista] = useState([]);
  const [porFaixa, setPorFaixa] = useState({});
  const [resumo, setResumo] = useState({ confirmados: 0, potenciais: 0 });
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroFaixa, setFiltroFaixa] = useState('todas');
  const [filtroTipo, setFiltroTipo] = useState('todos'); // todos | confirmados | potenciais
  const [sel, setSel] = useState(null);          // detalhe carregado
  const [carregandoDet, setCarregandoDet] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const r = await api.pessoas(area);
      setLista(r.pessoas || []);
      setPorFaixa(r.por_faixa || {});
      setResumo({ confirmados: r.confirmados || 0, potenciais: r.potenciais || 0 });
    } catch (e) {
      toast.error(e?.message || 'Erro ao carregar pessoas');
    } finally {
      setCarregando(false);
    }
  }, [area]);

  useEffect(() => { carregar(); }, [carregar]);

  async function abrir(id) {
    setCarregandoDet(true);
    try {
      const d = await api.pessoa(area, id);
      setSel(d);
    } catch (e) {
      toast.error(e?.message || 'Erro ao abrir pessoa');
    } finally {
      setCarregandoDet(false);
    }
  }

  const filtrada = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return lista.filter((p) => {
      if (filtroTipo === 'confirmados' && !p.frequenta_declarado) return false;
      if (filtroTipo === 'potenciais' && p.frequenta_declarado) return false;
      if (filtroFaixa !== 'todas' && (p.faixa_etaria || 'sem_data') !== filtroFaixa) return false;
      if (q && !String(p.nome || '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [lista, busca, filtroFaixa, filtroTipo]);

  if (carregando) {
    return <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin" style={{ color: accent }} /></div>;
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Quem <b>confirmou</b> frequentar o {areaLabel} no cadastro do app + todos os <b>jovens e adolescentes</b> (potenciais). Clique pra ver o detalhamento (contribuições não aparecem aqui).
      </p>

      {/* Confirmaram x Potenciais */}
      <div className="flex flex-wrap gap-2">
        {[
          { v: 'todos', label: 'Todos', n: lista.length },
          { v: 'confirmados', label: `Frequentam o ${areaLabel}`, n: resumo.confirmados },
          { v: 'potenciais', label: 'Potenciais (jovem/adolescente)', n: resumo.potenciais },
        ].map((t) => {
          const ativo = filtroTipo === t.v;
          return (
            <button
              key={t.v}
              onClick={() => setFiltroTipo(t.v)}
              className={`px-3 py-1.5 rounded-full text-sm border font-medium transition ${ativo ? 'text-white' : 'bg-card hover:bg-accent'}`}
              style={ativo ? { backgroundColor: accent, borderColor: accent } : undefined}
            >
              {t.label} <span className="opacity-70">({t.n})</span>
            </button>
          );
        })}
      </div>

      {/* Resumo por faixa · botões-filtro */}
      <div className="flex flex-wrap gap-2">
        {['todas', 'adolescente', 'jovem', 'adulto', 'crianca', 'sem_data'].map((f) => {
          const n = f === 'todas' ? lista.length : (porFaixa[f] || 0);
          if (f !== 'todas' && n === 0) return null;
          const ativo = filtroFaixa === f;
          return (
            <button
              key={f}
              onClick={() => setFiltroFaixa(f)}
              className={`px-3 py-1.5 rounded-full text-sm border transition ${ativo ? 'text-white' : 'bg-card hover:bg-accent'}`}
              style={ativo ? { backgroundColor: accent, borderColor: accent } : undefined}
            >
              {f === 'todas' ? 'Todas' : (FAIXA[f]?.label || f)} <span className="opacity-70">({n})</span>
            </button>
          );
        })}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Buscar por nome..." value={busca} onChange={(e) => setBusca(e.target.value)} className="pl-9" />
      </div>

      {filtrada.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          {lista.length === 0
            ? 'Ninguém marcou este ministério no cadastro ainda. Conforme as pessoas se cadastram pelo app escolhendo este ministério, elas aparecem aqui.'
            : 'Nenhuma pessoa no filtro atual.'}
        </Card>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {filtrada.map((p) => (
            <button
              key={p.id}
              onClick={() => abrir(p.id)}
              className="text-left flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-accent transition"
            >
              {p.foto_url ? (
                <img src={p.foto_url} alt="" className="h-11 w-11 rounded-full object-cover" />
              ) : (
                <div className="h-11 w-11 rounded-full bg-muted flex items-center justify-center">
                  <User className="h-5 w-5 text-muted-foreground" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{p.nome}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {idadeLabel(p.data_nascimento) || 'idade —'}{p.status ? ` · ${p.status}` : ''}
                  {!p.frequenta_declarado && p.frequenta_area ? ` · frequenta o ${outraLabel}` : ''}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {p.frequenta_declarado && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 border border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300">
                    <Check className="h-3 w-3" /> Frequenta
                  </span>
                )}
                <FaixaBadge faixa={p.faixa_etaria} />
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Modal de detalhe (sem contribuições) */}
      <Dialog open={!!sel || carregandoDet} onOpenChange={(o) => { if (!o) setSel(null); }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes da pessoa</DialogTitle>
            <DialogDescription className="flex items-center gap-1 text-xs">
              <ShieldCheck className="h-3 w-3" /> Contribuições não são exibidas para líderes de área.
            </DialogDescription>
          </DialogHeader>

          {carregandoDet || !sel ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" style={{ color: accent }} /></div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                {sel.membro.foto_url ? (
                  <img src={sel.membro.foto_url} alt="" className="h-14 w-14 rounded-full object-cover" />
                ) : (
                  <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center"><User className="h-6 w-6 text-muted-foreground" /></div>
                )}
                <div>
                  <div className="text-lg font-bold">{sel.membro.nome}</div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <FaixaBadge faixa={sel.membro.faixa_etaria} />
                    {sel.membro.status && <Badge variant="secondary" className="text-xs">{sel.membro.status}</Badge>}
                    {sel.membro.frequenta_area === area ? (
                      <Badge variant="outline" className="text-xs bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300">Frequenta o {areaLabel}</Badge>
                    ) : sel.membro.frequenta_area ? (
                      <Badge variant="outline" className="text-xs">Frequenta o {outraLabel}</Badge>
                    ) : (
                      <Badge variant="outline" className="text-xs text-muted-foreground">Potencial</Badge>
                    )}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-1.5 text-sm">
                {sel.membro.telefone && <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /> {sel.membro.telefone}</div>}
                {sel.membro.email && <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /> {sel.membro.email}</div>}
                {sel.membro.data_nascimento && <div className="flex items-center gap-2"><Baby className="h-4 w-4 text-muted-foreground" /> {new Date(sel.membro.data_nascimento + 'T00:00:00').toLocaleDateString('pt-BR')} ({idadeLabel(sel.membro.data_nascimento)})</div>}
                {sel.familia?.nome && <div className="flex items-center gap-2"><Users className="h-4 w-4 text-muted-foreground" /> Família {sel.familia.nome}</div>}
              </div>

              {/* Grupo de conexão */}
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1">Grupo de conexão</div>
                {sel.grupo ? (
                  <Badge variant="outline">{sel.grupo.nome}{sel.grupo.funcao ? ` · ${sel.grupo.funcao}` : ''}</Badge>
                ) : <span className="text-sm text-muted-foreground">Não está em um grupo.</span>}
              </div>

              {/* Ministérios */}
              <div>
                <div className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1"><HeartHandshake className="h-3 w-3" /> Servindo em</div>
                {sel.ministerios?.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {sel.ministerios.map((m, i) => <Badge key={i} variant="secondary" className="text-xs">{m.ministerio || m.area || 'Voluntário'}</Badge>)}
                  </div>
                ) : <span className="text-sm text-muted-foreground">Ainda não serve em nenhum ministério.</span>}
              </div>

              {/* Trilha */}
              {sel.trilha?.some((t) => t.concluida) && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1"><RouteIcon className="h-3 w-3" /> Trilha</div>
                  <div className="flex flex-wrap gap-1.5">
                    {sel.trilha.filter((t) => t.concluida).map((t, i) => <Badge key={i} variant="outline" className="text-xs">{t.etapa}</Badge>)}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
