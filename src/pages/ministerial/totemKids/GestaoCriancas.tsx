// Kids · Gestão de crianças — lista com filtro por idade/status, cadastro manual,
// desativar, e ficha completa com aba de Atendimentos (histórico de contatos).
import { useState, useEffect, useMemo, useCallback } from 'react';
import { totemKids as api } from '../../../api';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Textarea } from '../../../components/ui/textarea';
import { Badge } from '../../../components/ui/badge';
import { Card, CardContent } from '../../../components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../../../components/ui/dialog';
import { toast } from 'sonner';
import { Baby, Search, Plus, Loader2, AlertCircle, Phone, Trash2, UserX, UserCheck, ArrowLeft } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from 'recharts';

const FAIXAS = [
  { key: 'todas', label: 'Todas as idades', min: 0, max: 9999 },
  { key: '0-2', label: '0–2 anos', min: 0, max: 35 },
  { key: '3-5', label: '3–5 anos', min: 36, max: 71 },
  { key: '6-8', label: '6–8 anos', min: 72, max: 107 },
  { key: '9-12', label: '9–12 anos', min: 108, max: 155 },
];
const TIPO_ATEND: Record<string, string> = {
  contato: 'Contato', ausencia: 'Ausência', saude: 'Saúde', observacao: 'Observação', outro: 'Outro',
};
const fmt = (d?: string | null) => { if (!d) return '—'; try { return new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('pt-BR'); } catch { return d; } };

export default function GestaoCriancas() {
  const [lista, setLista] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [faixa, setFaixa] = useState('todas');
  const [status, setStatus] = useState('ativos'); // ativos | inativos
  const [jornadaF, setJornadaF] = useState('todas'); // todas | convertidos | batizados
  const [sel, setSel] = useState<any>(null);     // criança aberta na ficha
  const [novoOpen, setNovoOpen] = useState(false);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const cid = searchParams.get('crianca');
    if (cid) setSel({ id: cid });
  }, [searchParams]);

  const carregar = useCallback(() => {
    setLoading(true);
    api.criancas.list({ ativo: status === 'ativos' })
      .then((d: any) => setLista(Array.isArray(d) ? d : []))
      .catch(() => toast.error('Erro ao carregar crianças'))
      .finally(() => setLoading(false));
  }, [status]);
  useEffect(() => { carregar(); }, [carregar]);

  const filtradas = useMemo(() => {
    const f = FAIXAS.find(x => x.key === faixa)!;
    const t = busca.trim().toLowerCase();
    return lista.filter(c => {
      const m = c.idade_meses;
      if (faixa !== 'todas' && (m == null || m < f.min || m > f.max)) return false;
      if (t) {
        const resp = (c.responsaveis || []).map((r: any) => r.membro?.nome || '').join(' ');
        if (!(`${c.nome} ${resp}`.toLowerCase().includes(t))) return false;
      }
      if (jornadaF === 'convertidos' && !c.data_conversao) return false;
      if (jornadaF === 'batizados' && !c.data_batismo) return false;
      return true;
    });
  }, [lista, faixa, busca, status, jornadaF]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      <button onClick={() => navigate('/ministerial/kids')} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="h-3.5 w-3.5" /> Voltar ao hub do Kids</button>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2"><Baby className="h-5 w-5 text-primary" /> Crianças do Kids</h1>
          <p className="text-sm text-muted-foreground">Gerencie cada criança · ficha, atendimentos, desativar.</p>
        </div>
        <Button onClick={() => setNovoOpen(true)}><Plus className="h-4 w-4 mr-1" /> Nova criança</Button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar por nome da criança ou responsável..." value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <Select value={faixa} onValueChange={setFaixa}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>{FAIXAS.map(f => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ativos">Ativos</SelectItem>
            <SelectItem value="inativos">Inativos</SelectItem>
          </SelectContent>
        </Select>
        <Select value={jornadaF} onValueChange={setJornadaF}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Toda a jornada</SelectItem>
            <SelectItem value="convertidos">Convertidos</SelectItem>
            <SelectItem value="batizados">Batizados</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Lista */}
      <Card>
        <CardContent className="p-3">
          <div className="text-xs text-muted-foreground mb-2">{filtradas.length} criança{filtradas.length !== 1 ? 's' : ''}</div>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : filtradas.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Nenhuma criança nesse filtro.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {filtradas.map(c => {
                const resp = (c.responsaveis || [])[0]?.membro;
                return (
                  <button key={c.id} onClick={() => setSel(c)} className="flex items-center gap-3 rounded-lg border border-border p-2.5 text-left hover:border-primary/40 transition-colors">
                    <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden shrink-0">
                      {c.foto_url ? <img src={c.foto_url} alt="" className="h-full w-full object-cover" /> : <span className="text-sm font-bold text-primary">{c.nome?.charAt(0) || '?'}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{c.nome}</div>
                      <div className="text-xs text-muted-foreground truncate">{c.idade_label || '—'}{resp ? ` · ${resp.nome}` : ''}</div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      {c.necessidades_especiais && <AlertCircle className="h-4 w-4 text-amber-500" />}
                      {c.visitante && <Badge variant="secondary" className="text-[10px]">visitante</Badge>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {sel && <FichaCrianca criancaId={sel.id} onClose={() => { setSel(null); if (searchParams.get('crianca')) setSearchParams({}, { replace: true }); }} onChanged={carregar} />}
      {novoOpen && <NovaCrianca onClose={() => setNovoOpen(false)} onCreated={() => { setNovoOpen(false); carregar(); }} />}
    </div>
  );
}

// ── Ficha da criança (Dados + Atendimentos) ──────────────────────────────────
function FichaCrianca({ criancaId, onClose, onChanged }: { criancaId: string; onClose: () => void; onChanged: () => void }) {
  const navigate = useNavigate();
  const [c, setC] = useState<any>(null);
  const [aba, setAba] = useState<'dados' | 'frequencia' | 'atendimentos'>('dados');
  const [atend, setAtend] = useState<any[]>([]);
  const [novoTipo, setNovoTipo] = useState('contato');
  const [novoDesc, setNovoDesc] = useState('');
  const [novoData, setNovoData] = useState(new Date().toISOString().slice(0, 10));
  const [salvando, setSalvando] = useState(false);

  const load = useCallback(() => {
    api.criancas.get(criancaId).then(setC).catch(() => toast.error('Erro ao abrir ficha'));
    api.criancas.atendimentos(criancaId).then((d: any) => setAtend(Array.isArray(d) ? d : [])).catch(() => {});
  }, [criancaId]);
  useEffect(() => { load(); }, [load]);

  async function addAtend() {
    if (!novoDesc.trim()) { toast.error('Descreva o atendimento'); return; }
    setSalvando(true);
    try { await api.criancas.addAtendimento(criancaId, { tipo: novoTipo, descricao: novoDesc, data: novoData }); setNovoDesc(''); load(); }
    catch (e: any) { toast.error(e?.message || 'Erro'); } finally { setSalvando(false); }
  }
  async function delAtend(id: string) {
    try { await api.criancas.removeAtendimento(id); load(); } catch (e: any) { toast.error(e?.message || 'Erro'); }
  }
  async function toggleAtivo() {
    const inativar = c.ativo;
    if (inativar && !window.confirm('Desativar o cadastro desta criança?')) return;
    try {
      await api.criancas.inativar(criancaId, inativar ? { motivo: 'Desativado manualmente' } : { ativo: true });
      toast.success(inativar ? 'Cadastro desativado' : 'Cadastro reativado');
      load(); onChanged();
    } catch (e: any) { toast.error(e?.message || 'Erro'); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center overflow-hidden shrink-0">
              {c?.foto_url ? <img src={c.foto_url} alt="" className="h-full w-full object-cover" /> : <Baby className="h-5 w-5 text-primary" />}
            </div>
            <div className="min-w-0">
              <div className="truncate">{c?.nome || '...'}</div>
              <div className="text-xs font-normal text-muted-foreground">{c?.idade_label || ''}{c?.sala_sugerida ? ` · ${c.sala_sugerida.nome || ''}` : ''}{c && !c.ativo ? ' · inativo' : ''}</div>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Abas */}
        <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/30 text-xs">
          {(['dados', 'frequencia', 'atendimentos'] as const).map(a => (
            <button key={a} onClick={() => setAba(a)} className={`px-3 py-1.5 rounded-md transition-colors ${aba === a ? 'bg-background shadow-sm font-medium' : 'text-muted-foreground'}`}>
              {a === 'dados' ? 'Dados' : a === 'frequencia' ? 'Frequência' : `Atendimentos (${atend.length})`}
            </button>
          ))}
        </div>

        {!c ? <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div> : aba === 'dados' ? (
          <div className="space-y-3 text-sm">
            <Campo label="Nascimento" v={`${fmt(c.data_nascimento)}${c.idade_label ? ` · ${c.idade_label}` : ''}`} />
            <Campo label="Série" v={c.serie} />
            <Campo label="Conversão" v={c.data_conversao ? fmt(c.data_conversao) : null} />
            <Campo label="Batismo" v={c.data_batismo ? fmt(c.data_batismo) : null} />
            {c.necessidades_especiais && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-md p-2">
                <span className="text-amber-700 dark:text-amber-400 text-xs font-semibold">⚠ Necessidade / alergia: </span>{c.necessidades_especiais}
              </div>
            )}
            {(c.tem_espectro || c.tem_alergia || c.tem_limitacao_fisica) && (
              <div className="bg-amber-500/10 border border-amber-500/30 rounded-md p-2 space-y-1">
                <div className="text-amber-700 dark:text-amber-400 text-xs font-semibold">⚠ Saúde da criança</div>
                {c.tem_alergia && <div className="text-sm"><b>Alergia:</b> {c.alergia_qual || 'sim'}</div>}
                {c.tem_espectro && <div className="text-sm"><b>Espectro autista:</b> {c.espectro_qual || 'sim'}</div>}
                {c.tem_limitacao_fisica && <div className="text-sm"><b>Limitação física:</b> {c.limitacao_fisica_qual || 'sim'}</div>}
              </div>
            )}
            {c.observacoes_medicas && <Campo label="Mais informações" v={c.observacoes_medicas} />}
            {c.consent_marketing != null && (
              <Campo label="Uso de imagem (marketing)" v={c.consent_marketing ? 'Autorizado' : 'Não autorizado'} />
            )}
            <div>
              <div className="text-xs text-muted-foreground mb-1">Responsáveis</div>
              <div className="space-y-1.5">
                {(c.responsaveis || []).length === 0 && <div className="text-xs text-muted-foreground">Nenhum responsável vinculado.</div>}
                {(c.responsaveis || []).map((r: any) => (
                  <div key={r.id} className="flex items-center gap-2 rounded-md border border-border p-2">
                    <div className="flex-1 min-w-0">
                      {r.membro?.id ? <button onClick={() => navigate(`/ministerial/membresia?membro=${r.membro.id}`)} className="font-medium truncate text-left text-primary hover:underline">{r.membro?.nome || '—'}</button> : <div className="font-medium truncate">{r.membro?.nome || '—'}</div>}
                      <div className="text-xs text-muted-foreground">{r.parentesco}{r.autorizado_buscar ? ' · autorizado a buscar' : ''}</div>
                    </div>
                    {r.membro?.telefone && <a href={`https://wa.me/55${String(r.membro.telefone).replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-primary"><Phone className="h-4 w-4" /></a>}
                  </div>
                ))}
              </div>
            </div>
            <div className="pt-1">
              <Button variant={c.ativo ? 'outline' : 'default'} size="sm" onClick={toggleAtivo}>
                {c.ativo ? <><UserX className="h-4 w-4 mr-1" /> Desativar cadastro</> : <><UserCheck className="h-4 w-4 mr-1" /> Reativar</>}
              </Button>
              {!c.ativo && c.motivo_inativacao && <p className="text-xs text-muted-foreground mt-1">Motivo: {c.motivo_inativacao}</p>}
            </div>
          </div>
        ) : aba === 'frequencia' ? (
          <JornadaTab criancaId={criancaId} c={c} onChanged={() => { load(); onChanged(); }} />
        ) : (
          <div className="space-y-3">
            {/* Novo atendimento */}
            <div className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex gap-2">
                <Select value={novoTipo} onValueChange={setNovoTipo}>
                  <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(TIPO_ATEND).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                </Select>
                <Input type="date" className="w-40 h-9" value={novoData} onChange={e => setNovoData(e.target.value)} />
              </div>
              <Textarea rows={2} placeholder="Ex.: ligamos para a mãe, criança está doente, volta semana que vem." value={novoDesc} onChange={e => setNovoDesc(e.target.value)} />
              <Button size="sm" onClick={addAtend} disabled={salvando}>{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Registrar atendimento'}</Button>
            </div>
            {/* Histórico */}
            {atend.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">Nenhum atendimento registrado.</p>
            ) : atend.map(a => (
              <div key={a.id} className="rounded-md border border-border p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="secondary">{TIPO_ATEND[a.tipo] || a.tipo}</Badge>
                    <span className="text-muted-foreground">{fmt(a.data)}</span>
                  </div>
                  <button onClick={() => delAtend(a.id)} className="text-muted-foreground hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
                <p className="text-sm mt-1 whitespace-pre-wrap">{a.descricao}</p>
                {a.registrado_por_nome && <p className="text-[11px] text-muted-foreground mt-1">por {a.registrado_por_nome}</p>}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Campo({ label, v }: { label: string; v?: string | null }) {
  if (!v) return null;
  return <div><span className="text-xs text-muted-foreground">{label}: </span><span>{v}</span></div>;
}

// ── Nova criança (cadastro manual) ───────────────────────────────────────────
function NovaCrianca({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [nome, setNome] = useState('');
  const [nascimento, setNascimento] = useState('');
  const [sexo, setSexo] = useState('');
  const [serie, setSerie] = useState('');
  const [necessidade, setNecessidade] = useState('');
  const [respNome, setRespNome] = useState('');
  const [respTel, setRespTel] = useState('');
  const [parentesco, setParentesco] = useState('mae');
  const [salvando, setSalvando] = useState(false);

  async function salvar() {
    if (!nome.trim()) { toast.error('Informe o nome da criança'); return; }
    if (!respNome.trim() || !respTel.trim()) { toast.error('Informe nome e telefone do responsável'); return; }
    setSalvando(true);
    try {
      await api.criancas.create({
        crianca: { nome: nome.trim(), data_nascimento: nascimento || null, sexo: sexo || null, serie: serie.trim() || null, necessidades_especiais: necessidade.trim() || null },
        responsavel: { nome: respNome.trim(), telefone: respTel.trim(), parentesco },
      });
      toast.success('Criança cadastrada');
      onCreated();
    } catch (e: any) { toast.error(e?.message || 'Erro ao cadastrar'); } finally { setSalvando(false); }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Nova criança</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">Nome da criança *</Label><Input value={nome} onChange={e => setNome(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><Label className="text-xs">Nascimento</Label><Input type="date" value={nascimento} onChange={e => setNascimento(e.target.value)} /></div>
            <div>
              <Label className="text-xs">Sexo</Label>
              <Select value={sexo} onValueChange={setSexo}>
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent><SelectItem value="M">Menino</SelectItem><SelectItem value="F">Menina</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div><Label className="text-xs">Série (opcional)</Label><Input value={serie} onChange={e => setSerie(e.target.value)} placeholder="Ex.: Maternal II" /></div>
          <div><Label className="text-xs">Necessidade / alergia (opcional)</Label><Textarea rows={2} value={necessidade} onChange={e => setNecessidade(e.target.value)} /></div>
          <div className="border-t border-border pt-2 space-y-3">
            <div className="text-xs font-semibold text-muted-foreground">Responsável</div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label className="text-xs">Nome *</Label><Input value={respNome} onChange={e => setRespNome(e.target.value)} /></div>
              <div><Label className="text-xs">Telefone *</Label><Input value={respTel} onChange={e => setRespTel(e.target.value)} placeholder="(21) 99999-9999" /></div>
            </div>
            <div>
              <Label className="text-xs">Parentesco</Label>
              <Select value={parentesco} onValueChange={setParentesco}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mae">Mãe</SelectItem><SelectItem value="pai">Pai</SelectItem>
                  <SelectItem value="avo_a">Avó/Avô</SelectItem><SelectItem value="tutor">Tutor</SelectItem><SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button onClick={salvar} disabled={salvando} className="w-full">{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Cadastrar criança'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}


// ── Aba Frequência e jornada (gráfico + conversão/batismo + família) ──────────
function JornadaTab({ criancaId, c, onChanged }: { criancaId: string; c: any; onChanged: () => void }) {
  const navigate = useNavigate();
  const [j, setJ] = useState<any>(null);
  const [conv, setConv] = useState<string>(c?.data_conversao || '');
  const [bat, setBat] = useState<string>(c?.data_batismo || '');
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { api.criancas.jornada(criancaId).then(setJ).catch(() => {}); }, [criancaId]);

  async function salvar() {
    setSalvando(true);
    try { await api.criancas.update(criancaId, { data_conversao: conv || null, data_batismo: bat || null }); toast.success('Jornada salva'); onChanged(); }
    catch (e: any) { toast.error(e?.message || 'Erro ao salvar'); } finally { setSalvando(false); }
  }

  const dados = (j?.frequencia?.porMes || []).map((p: any) => ({ mes: `${p.mes.slice(5)}/${p.mes.slice(2, 4)}`, total: p.total }));
  const freq = j?.frequencia;

  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Data de conversão</Label>
          <Input type="date" value={conv} onChange={e => setConv(e.target.value)} />
          {!conv && j?.conversao_sugerida && (
            <button className="text-[11px] text-primary mt-0.5" onClick={() => setConv(j.conversao_sugerida)}>usar 1ª decisão ({fmt(j.conversao_sugerida)})</button>
          )}
        </div>
        <div>
          <Label className="text-xs">Data de batismo</Label>
          <Input type="date" value={bat} onChange={e => setBat(e.target.value)} />
        </div>
      </div>
      <Button size="sm" onClick={salvar} disabled={salvando}>{salvando ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar jornada'}</Button>

      <div>
        <div className="text-xs text-muted-foreground mb-1">
          Frequência (check-ins){freq ? ` · total ${freq.total}${freq.ultima ? ` · último ${fmt(String(freq.ultima).slice(0, 10))}` : ''}` : ''}
        </div>
        {dados.length === 0 ? (
          <p className="text-xs text-muted-foreground py-4 text-center">Sem check-ins ainda. O gráfico liga quando o totem começar a registrar presença.</p>
        ) : (
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dados}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--cbrio-border)" />
                <XAxis dataKey="mes" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line type="monotone" dataKey="total" stroke="#00B39D" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div>
        <div className="text-xs text-muted-foreground mb-1">Família (membros)</div>
        {(j?.familia_membros || []).length === 0 ? (
          <div className="text-xs text-muted-foreground">Sem membros vinculados à família.</div>
        ) : (
          <div className="space-y-1">
            {j.familia_membros.map((m: any) => (
              <div key={m.id} className="flex items-center gap-2 rounded-md border border-border p-1.5 text-xs">
                <button onClick={() => navigate(`/ministerial/membresia?membro=${m.id}`)} className="flex-1 truncate text-left text-primary hover:underline">{m.nome}</button>
                {m.telefone && <a href={`https://wa.me/55${String(m.telefone).replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="text-primary"><Phone className="h-3.5 w-3.5" /></a>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
