// Kids · Equipe por posição — os responsáveis do Kids alocam os voluntários nas
// posições que JÁ existem no voluntariado (vol_teams "Kids" → vol_positions:
// Baby, Little 3-4, Recepção, Coordenação...). Grava em vol_team_members (mesma
// fonte do voluntariado). Cada voluntário tem ficha (perfil + antecedentes).
import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { totemKids as api } from '../../../api';
import { Card } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { toast } from 'sonner';
import { ArrowLeft, UserCheck, Plus, Loader2, Search, Phone, Trash2, ShieldCheck, ShieldAlert, X, Users } from 'lucide-react';

export default function VoluntariosKids() {
  const navigate = useNavigate();
  const [times, setTimes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [add, setAdd] = useState<any>(null);      // { team_id, team_nome, position_id, posicao_nome }
  const [fichaId, setFichaId] = useState<string | null>(null);

  const carregar = useCallback(() => {
    setLoading(true);
    api.kidsEquipe.list().then((d: any) => setTimes(Array.isArray(d) ? d : [])).catch(() => toast.error('Erro ao carregar')).finally(() => setLoading(false));
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function remover(id: string) {
    if (!window.confirm('Tirar este voluntário da posição?')) return;
    try { await api.kidsEquipe.remover(id); carregar(); } catch (e: any) { toast.error(e?.message || 'Erro'); }
  }

  const PosicaoCard = ({ team, position_id, nome, membros }: any) => (
    <Card className="p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="font-medium text-sm truncate">{nome}</div>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setAdd({ team_id: team.team_id, team_nome: team.team_nome, position_id, posicao_nome: nome })}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {(membros || []).length === 0 ? (
        <p className="text-xs text-muted-foreground">Ninguém alocado.</p>
      ) : (
        <div className="space-y-1">
          {membros.map((m: any) => (
            <div key={m.id} className="flex items-center gap-2 rounded-md border border-border p-1.5">
              <button onClick={() => setFichaId(m.volunteer_profile_id)} disabled={!m.volunteer_profile_id} className="flex-1 min-w-0 text-left text-sm truncate disabled:cursor-default">{m.volunteer_name}</button>
              <button onClick={() => remover(m.id)} className="text-muted-foreground hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
      <button onClick={() => navigate('/ministerial/kids')} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5" /> Voltar ao hub do Kids</button>
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2"><UserCheck className="h-5 w-5 text-primary" /> Equipe do Kids por posição</h1>
        <p className="text-sm text-muted-foreground">Aloque os voluntários nas posições do Kids (salas por idade, recepção, check-in, coordenação...). Integrado ao voluntariado. Clique no nome pra ver a ficha.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : times.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">Nenhum time do Kids encontrado no voluntariado.</Card>
      ) : (
        <div className="space-y-5">
          {times.map((t) => (
            <div key={t.team_id} className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: t.cor || '#00B39D' }} />
                <h2 className="font-semibold text-sm">{t.team_nome}</h2>
              </div>
              {t.posicoes.length === 0 && t.sem_posicao.length === 0 ? (
                <PosicaoCard team={t} position_id={null} nome="Equipe (sem posição)" membros={t.sem_posicao} />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {t.posicoes.map((p: any) => (
                    <PosicaoCard key={p.position_id} team={t} position_id={p.position_id} nome={p.nome} membros={p.membros} />
                  ))}
                  {t.sem_posicao.length > 0 && <PosicaoCard team={t} position_id={null} nome="Sem posição definida" membros={t.sem_posicao} />}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {add && <AlocarVoluntario alvo={add} onClose={() => setAdd(null)} onDone={() => { setAdd(null); carregar(); }} />}
      {fichaId && <FichaVoluntario volProfileId={fichaId} onClose={() => setFichaId(null)} />}
    </div>
  );
}

// ── Alocar voluntário numa posição ───────────────────────────────────────────
function AlocarVoluntario({ alvo, onClose, onDone }: { alvo: any; onClose: () => void; onDone: () => void }) {
  const [busca, setBusca] = useState('');
  const [resultados, setResultados] = useState<any[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const timer = useRef<any>(null);

  useEffect(() => {
    if (busca.trim().length < 2) { setResultados([]); return; }
    setBuscando(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      api.kidsEquipe.buscar(busca.trim()).then((d: any) => setResultados(Array.isArray(d) ? d : [])).finally(() => setBuscando(false));
    }, 250);
    return () => clearTimeout(timer.current);
  }, [busca]);

  async function alocar(p: any) {
    setSalvando(true);
    try {
      await api.kidsEquipe.alocar({ team_id: alvo.team_id, position_id: alvo.position_id, vol_profile_id: p.id, nome: p.full_name });
      toast.success('Voluntário alocado');
      onDone();
    } catch (e: any) { toast.error(e?.message || 'Erro ao alocar'); } finally { setSalvando(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Alocar em {alvo.posicao_nome} · {alvo.team_nome}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar voluntário pelo nome..." value={busca} onChange={(e) => setBusca(e.target.value)} autoFocus />
          </div>
          {buscando && <div className="flex justify-center py-3"><Loader2 className="h-4 w-4 animate-spin text-primary" /></div>}
          {!buscando && resultados.length > 0 && (
            <div className="max-h-60 overflow-y-auto space-y-1">
              {resultados.map((p) => (
                <button key={p.id} onClick={() => alocar(p)} disabled={salvando} className="w-full flex items-center gap-2 rounded-md border border-border p-2 text-left hover:border-primary/40 disabled:opacity-50">
                  <div className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden shrink-0">
                    {p.avatar_url ? <img src={p.avatar_url} alt="" className="h-full w-full object-cover" /> : <span className="text-xs font-bold text-primary">{p.full_name?.charAt(0)}</span>}
                  </div>
                  <div className="flex-1 min-w-0"><div className="text-sm truncate">{p.full_name}</div>{p.phone && <div className="text-xs text-muted-foreground">{p.phone}</div>}</div>
                  <Plus className="h-4 w-4 text-primary" />
                </button>
              ))}
            </div>
          )}
          {!buscando && busca.trim().length >= 2 && resultados.length === 0 && <p className="text-xs text-muted-foreground py-2 text-center">Nenhum voluntário encontrado.</p>}
          {busca.trim().length < 2 && <p className="text-xs text-muted-foreground py-2 text-center">Digite ao menos 2 letras do nome.</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Ficha do voluntário ───────────────────────────────────────────────────────
function FichaVoluntario({ volProfileId, onClose }: { volProfileId: string; onClose: () => void }) {
  const [f, setF] = useState<any>(null);
  useEffect(() => { api.kidsEquipe.ficha(volProfileId).then(setF).catch(() => toast.error('Erro ao abrir ficha')); }, [volProfileId]);
  const p = f?.perfil, ant = f?.antecedentes;
  const aprovado = ant && (ant.resultado === 'aprovado' || ant.status === 'aprovado' || ant.status === 'concluido');

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden shrink-0">
              {p?.avatar_url ? <img src={p.avatar_url} alt="" className="h-full w-full object-cover" /> : <UserCheck className="h-5 w-5 text-primary" />}
            </div>
            <div className="min-w-0"><div className="truncate">{p?.full_name || '...'}</div><div className="text-xs font-normal text-muted-foreground">Ficha do voluntário</div></div>
          </DialogTitle>
        </DialogHeader>
        {!f ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div> : (
          <div className="space-y-3 text-sm">
            {p?.phone && (
              <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /> {p.phone}
                <a href={`https://wa.me/55${String(p.phone).replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-primary text-xs">WhatsApp</a>
              </div>
            )}
            {p?.email && <div className="text-muted-foreground text-xs">{p.email}</div>}
            <div className={`rounded-md border p-2 flex items-center gap-2 ${aprovado ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-amber-500/30 bg-amber-500/10'}`}>
              {aprovado ? <ShieldCheck className="h-4 w-4 text-emerald-600" /> : <ShieldAlert className="h-4 w-4 text-amber-600" />}
              <div className="text-xs"><span className="font-semibold">Antecedentes: </span>{ant ? (ant.resultado || ant.status || 'em análise') : 'sem checagem registrada'}</div>
            </div>
            {(f.posicoes || []).length > 0 && (
              <div>
                <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1"><Users className="h-3.5 w-3.5" /> Posições no Kids</div>
                <div className="flex flex-wrap gap-1">
                  {f.posicoes.map((s: any, i: number) => <Badge key={i} variant="secondary" className="text-[10px]">{s.posicao ? `${s.posicao}` : s.time}{s.posicao && s.time ? ` · ${s.time}` : ''}</Badge>)}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
