// Kids · Voluntários por sala — a Mari Gaia define os responsáveis de cada sala
// (salas por faixa etária). Atribui voluntários (do registro de voluntariado),
// vê a ficha de cada um (perfil + antecedentes) e remove.
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { totemKids as api } from '../../../api';
import { Card } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { toast } from 'sonner';
import { ArrowLeft, Baby, Plus, Loader2, Search, Phone, Trash2, UserCheck, ShieldCheck, ShieldAlert, X } from 'lucide-react';

const PAPEL_LABEL: Record<string, string> = { responsavel: 'Responsável', voluntario: 'Voluntário', auxiliar: 'Auxiliar' };
const PAPEL_COR: Record<string, string> = { responsavel: 'bg-primary/15 text-primary', voluntario: 'bg-blue-500/10 text-blue-600', auxiliar: 'bg-amber-500/10 text-amber-600' };

const meses = (m?: number | null) => (m == null ? null : Math.floor(m / 12));
const faixaLabel = (min?: number | null, max?: number | null) => {
  const a = meses(min), b = meses(max);
  if (a == null && b == null) return '';
  if (b == null) return `${a}+ anos`;
  return `${a ?? 0}–${b} anos`;
};

export default function VoluntariosKids() {
  const navigate = useNavigate();
  const [salas, setSalas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [addSala, setAddSala] = useState<any>(null);  // sala recebendo voluntário
  const [fichaId, setFichaId] = useState<string | null>(null);

  const carregar = useCallback(() => {
    setLoading(true);
    api.salasVoluntarios().then((d: any) => setSalas(Array.isArray(d) ? d : [])).catch(() => toast.error('Erro ao carregar')).finally(() => setLoading(false));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function remover(id: string) {
    if (!window.confirm('Remover este voluntário da sala?')) return;
    try { await api.voluntarios.remove(id); carregar(); } catch (e: any) { toast.error(e?.message || 'Erro'); }
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <button onClick={() => navigate('/ministerial/kids')} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5" /> Voltar ao hub do Kids</button>
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><UserCheck className="h-5 w-5 text-primary" /> Voluntários por sala</h1>
        <p className="text-sm text-muted-foreground">Responsáveis de cada sala (por faixa etária). Clique no voluntário pra ver a ficha.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : salas.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Nenhuma sala cadastrada. Crie salas em Configurações → Salas.</Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {salas.map((s) => (
            <Card key={s.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${s.cor || '#00B39D'}1a` }}>
                    <Baby className="h-5 w-5" style={{ color: s.cor || '#00B39D' }} />
                  </div>
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{s.nome}</div>
                    <div className="text-xs text-muted-foreground">{faixaLabel(s.faixa_etaria_min_meses, s.faixa_etaria_max_meses)}{s.capacidade ? ` · cap. ${s.capacidade}` : ''}</div>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setAddSala(s)}><Plus className="h-4 w-4 md:mr-1" /><span className="hidden md:inline">Voluntário</span></Button>
              </div>
              {(s.voluntarios || []).length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">Nenhum voluntário atribuído.</p>
              ) : (
                <div className="space-y-1.5">
                  {s.voluntarios.map((v: any) => (
                    <div key={v.id} className="flex items-center gap-2 rounded-md border border-border p-2">
                      <button onClick={() => setFichaId(v.id)} className="flex-1 min-w-0 text-left">
                        <div className="font-medium text-sm truncate">{v.nome}</div>
                        <span className={`inline-block text-[10px] px-1.5 py-0.5 rounded ${PAPEL_COR[v.papel] || ''}`}>{PAPEL_LABEL[v.papel] || v.papel}</span>
                      </button>
                      {v.telefone && <a href={`https://wa.me/55${String(v.telefone).replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-primary"><Phone className="h-4 w-4" /></a>}
                      <button onClick={() => remover(v.id)} className="text-muted-foreground hover:text-red-500"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {addSala && <AdicionarVoluntario sala={addSala} onClose={() => setAddSala(null)} onAdded={() => { setAddSala(null); carregar(); }} />}
      {fichaId && <FichaVoluntario id={fichaId} onClose={() => setFichaId(null)} />}
    </div>
  );
}

// ── Atribuir voluntário (busca no registro de voluntariado) ───────────────────
function AdicionarVoluntario({ sala, onClose, onAdded }: { sala: any; onClose: () => void; onAdded: () => void }) {
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<any[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [sel, setSel] = useState<any>(null);
  const [papel, setPapel] = useState('voluntario');
  const [salvando, setSalvando] = useState(false);
  const timer = useRef<any>(null);

  useEffect(() => {
    if (busca.trim().length < 2) { setResultados([]); return; }
    setBuscando(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      api.voluntarios.buscar(busca.trim()).then((d: any) => setResultados(Array.isArray(d) ? d : [])).finally(() => setBuscando(false));
    }, 250);
    return () => clearTimeout(timer.current);
  }, [busca]);

  async function salvar() {
    if (!sel) { toast.error('Escolha um voluntário'); return; }
    setSalvando(true);
    try {
      await api.voluntarios.add(sala.id, {
        vol_profile_id: sel.id, membro_id: sel.membresia_id || null,
        nome: sel.full_name, telefone: sel.phone || null, papel,
      });
      toast.success('Voluntário atribuído');
      onAdded();
    } catch (e: any) { toast.error(e?.message || 'Erro ao atribuir'); } finally { setSalvando(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Atribuir voluntário · {sala.nome}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {sel ? (
            <div className="flex items-center gap-2 rounded-lg border border-primary/40 p-2">
              <UserCheck className="h-4 w-4 text-primary" />
              <div className="flex-1 min-w-0"><div className="font-medium text-sm truncate">{sel.full_name}</div>{sel.phone && <div className="text-xs text-muted-foreground">{sel.phone}</div>}</div>
              <button onClick={() => setSel(null)} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
            </div>
          ) : (
            <div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Buscar voluntário pelo nome..." value={busca} onChange={(e) => setBusca(e.target.value)} autoFocus />
              </div>
              {buscando && <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-primary" /></div>}
              {!buscando && resultados.length > 0 && (
                <div className="mt-2 max-h-52 overflow-y-auto space-y-1">
                  {resultados.map((p) => (
                    <button key={p.id} onClick={() => setSel(p)} className="w-full flex items-center gap-2 rounded-md border border-border p-2 text-left hover:border-primary/40">
                      <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden shrink-0">
                        {p.avatar_url ? <img src={p.avatar_url} alt="" className="h-full w-full object-cover" /> : <span className="text-xs font-bold text-primary">{p.full_name?.charAt(0)}</span>}
                      </div>
                      <div className="flex-1 min-w-0"><div className="text-sm truncate">{p.full_name}</div>{p.phone && <div className="text-xs text-muted-foreground">{p.phone}</div>}</div>
                    </button>
                  ))}
                </div>
              )}
              {!buscando && busca.trim().length >= 2 && resultados.length === 0 && <p className="text-xs text-muted-foreground py-2 text-center">Nenhum voluntário encontrado.</p>}
            </div>
          )}
          <div>
            <label className="text-xs text-muted-foreground">Papel na sala</label>
            <Select value={papel} onValueChange={setPapel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="responsavel">Responsável</SelectItem>
                <SelectItem value="voluntario">Voluntário</SelectItem>
                <SelectItem value="auxiliar">Auxiliar</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={salvar} disabled={salvando || !sel} className="w-full">{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Atribuir à sala'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Ficha do voluntário ───────────────────────────────────────────────────────
function FichaVoluntario({ id, onClose }: { id: string; onClose: () => void }) {
  const [f, setF] = useState<any>(null);
  useEffect(() => { api.voluntarios.ficha(id).then(setF).catch(() => toast.error('Erro ao abrir ficha')); }, [id]);
  const reg = f?.registro, p = f?.perfil, ant = f?.antecedentes;
  const aprovado = ant && (ant.resultado === 'aprovado' || ant.status === 'aprovado' || ant.status === 'concluido');

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden shrink-0">
              {p?.avatar_url ? <img src={p.avatar_url} alt="" className="h-full w-full object-cover" /> : <UserCheck className="h-5 w-5 text-primary" />}
            </div>
            <div className="min-w-0"><div className="truncate">{reg?.nome || p?.full_name || '...'}</div><div className="text-xs font-normal text-muted-foreground">Ficha do voluntário</div></div>
          </DialogTitle>
        </DialogHeader>
        {!f ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div> : (
          <div className="space-y-3 text-sm">
            {(reg?.telefone || p?.phone) && (
              <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /> {reg?.telefone || p?.phone}
                <a href={`https://wa.me/55${String(reg?.telefone || p?.phone).replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-primary text-xs">WhatsApp</a>
              </div>
            )}
            {p?.email && <div className="text-muted-foreground text-xs">{p.email}</div>}
            {/* Antecedentes (background check do voluntariado) */}
            <div className={`rounded-md border p-2 flex items-center gap-2 ${aprovado ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
              {aprovado ? <ShieldCheck className="h-4 w-4 text-emerald-600" /> : <ShieldAlert className="h-4 w-4 text-amber-600" />}
              <div className="text-xs">
                <span className="font-semibold">Antecedentes: </span>
                {ant ? (ant.resultado || ant.status || 'em análise') : 'sem checagem registrada'}
              </div>
            </div>
            {/* Salas onde atua */}
            {(f.salas || []).length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Atua nas salas</div>
                <div className="flex flex-wrap gap-1">
                  {f.salas.map((s: any, i: number) => <Badge key={i} variant="secondary" className="text-[10px]">{s.nome} · {PAPEL_LABEL[s.papel] || s.papel}</Badge>)}
                </div>
              </div>
            )}
            {reg?.observacao && <div className="text-xs"><span className="text-muted-foreground">Obs.: </span>{reg.observacao}</div>}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
