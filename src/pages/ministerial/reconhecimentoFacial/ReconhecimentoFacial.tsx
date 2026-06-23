import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as faceapi from '@vladmandic/face-api';
import { Camera, Scan, SwitchCamera, Loader2, UserPlus, Link2, Trash2, ShieldAlert, Users, UserCheck, Repeat, Maximize2, Zap, ZapOff, ScanFace, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useFaceDetection } from '@/pages/ministerial/voluntariado/hooks/useVolFace';
import { face, membresia } from '@/api';

const PRIMARY = '#00B39D';
const MODEL_URL = '/models/face-api';
const COOLDOWN_MS = 2500; // evita recontar a mesma pessoa parada na frente

let modelosProntos = false;
async function garantirModelos() {
  if (modelosProntos) return;
  await Promise.all([
    faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
    faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
    faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
  ]);
  modelosProntos = true;
}
function carregarImagem(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('falha ao carregar imagem'));
    img.src = url;
  });
}
async function descritorDaFoto(url: string): Promise<number[] | null> {
  await garantirModelos();
  const img = await carregarImagem(url);
  const det = await faceapi.detectSingleFace(img).withFaceLandmarks().withFaceDescriptor();
  return det ? Array.from(det.descriptor) : null;
}
// Gera o vetor a partir da foto do membro, carregada via PROXY (mesmo domínio /
// blob) pra não esbarrar em CORS (foto do PCO/app é cross-origin).
async function descritorDoMembro(id: string): Promise<number[] | null> {
  const url = await face.fotoBlobUrl(id);
  try { return await descritorDaFoto(url); }
  finally { URL.revokeObjectURL(url); }
}

function capturarBestShot(video: HTMLVideoElement | null): string | null {
  if (!video || !video.videoWidth) return null;
  const canvas = document.createElement('canvas');
  const w = Math.min(video.videoWidth, 480);
  const scale = w / video.videoWidth;
  canvas.width = w; canvas.height = Math.round(video.videoHeight * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.7);
}

// Best-shot a partir de um arquivo de imagem (pra importar pasta de rostos).
function arquivoParaBestShot(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const w = Math.min(img.naturalWidth, 480);
      const scale = w / (img.naturalWidth || 1);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d');
      URL.revokeObjectURL(url);
      if (!ctx) return resolve(null);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    img.src = url;
  });
}

// ── Gate de qualidade · só reconhece ROSTO INTEIRO e DE FRENTE ──────────────
// Evita poluir as análises com rosto parcial/de lado/cabeça baixa.
function mean(pts: any[]) { const n = pts.length || 1; let x = 0, y = 0; for (const p of pts) { x += p.x; y += p.y; } return { x: x / n, y: y / n }; }
function rostoFrontalOk(det: any, video: HTMLVideoElement): boolean {
  const score = det?.detection?.score ?? 0;
  if (score < 0.9) return false;                                   // confiança alta
  const box = det.detection.box;
  if (box.width < video.videoWidth * 0.16) return false;          // rosto grande o suficiente
  const lm = det.landmarks;
  const le = mean(lm.getLeftEye()), re = mean(lm.getRightEye());
  const noseArr = lm.getNose(); const noseTip = noseArr[noseArr.length - 1] || mean(noseArr);
  const jaw = lm.getJawOutline(); if (!jaw || jaw.length < 9) return false;
  const chin = jaw[Math.floor(jaw.length / 2)];
  const eyeDist = Math.hypot(re.x - le.x, re.y - le.y); if (!eyeDist) return false;
  const roll = Math.abs(Math.atan2(re.y - le.y, re.x - le.x) * 180 / Math.PI);
  if (roll > 12) return false;                                     // cabeça inclinada
  const eyeMidX = (le.x + re.x) / 2;
  if (Math.abs(noseTip.x - eyeMidX) / eyeDist > 0.35) return false; // virada de lado (yaw)
  const eyeMidY = (le.y + re.y) / 2; const faceH = chin.y - eyeMidY; if (faceH <= 0) return false;
  const r = (noseTip.y - eyeMidY) / faceH;
  if (r < 0.28 || r > 0.62) return false;                          // cabeça baixa/erguida (pitch)
  const dl = Math.hypot(noseTip.x - jaw[0].x, noseTip.y - jaw[0].y);
  const dr = Math.hypot(noseTip.x - jaw[jaw.length - 1].x, noseTip.y - jaw[jaw.length - 1].y);
  const sym = dr ? dl / dr : 0;
  if (sym < 0.6 || sym > 1.66) return false;                       // assimetria (yaw)
  return true;
}
function desenharBox(canvas: HTMLCanvasElement | null, video: HTMLVideoElement, det: any, ok: boolean) {
  if (!canvas) return;
  try {
    const dims = faceapi.matchDimensions(canvas, video, true);
    const resized = faceapi.resizeResults(det, dims);
    const b = resized.detection.box; const ctx = canvas.getContext('2d'); if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = 3; ctx.strokeStyle = ok ? '#00B39D' : '#f59e0b';
    ctx.strokeRect(b.x, b.y, b.width, b.height);
  } catch { /* ignore */ }
}
function limparCanvas(canvas: HTMLCanvasElement | null) { if (!canvas) return; const ctx = canvas.getContext('2d'); if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height); }

function fmtData(s?: string) {
  if (!s) return '—';
  return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}
function fmtHora(s?: string) {
  if (!s) return '';
  return new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function irParaMembro(id: string) { window.location.href = `/ministerial/membresia?membro=${id}`; }

// ── Lightbox (expandir foto) ────────────────────────────────────────────────
function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg p-2">
        <img src={url} alt="rosto" className="w-full rounded-lg" />
      </DialogContent>
    </Dialog>
  );
}

// ── Aba 1 · Reconhecimento (automático ou manual) ───────────────────────────
type LogItem = { id: number; tipo: string; nome?: string; visitas?: number; confianca?: number; hora: string };
function AbaReconhecer() {
  const { videoRef, canvasRef, startCamera, stopCamera, switchCamera } = useFaceDetection();
  const [ativa, setAtiva] = useState(false);
  const [conectando, setConectando] = useState(false);
  const [auto, setAuto] = useState(true);
  const [autoCadastro, setAutoCadastro] = useState(true);
  const [status, setStatus] = useState('');
  const [log, setLog] = useState<LogItem[]>([]);
  const [cadastro, setCadastro] = useState({ feitos: 0, fila: 0 });
  const reconhecer = useMutation({ mutationFn: (data: any) => face.reconhecer(data) });
  const ultimoRef = useRef(0);
  const logIdRef = useRef(0);
  const filaRef = useRef<any[]>([]);
  const enrollRef = useRef(false);

  const ligar = useCallback(async () => {
    setConectando(true); setStatus('');
    try { await startCamera(); setAtiva(true); }
    catch (e: any) { setStatus(e?.message || 'Não consegui acessar a câmera. Permita o acesso no navegador.'); }
    finally { setConectando(false); }
  }, [startCamera]);
  const desligar = useCallback(() => { stopCamera(); setAtiva(false); }, [stopCamera]);

  const addLog = useCallback((r: any) => {
    const nome = r.tipo === 'membro' ? r.membro?.nome : (r.tipo === 'anonimo_recorrente' ? `Anônimo (${r.visitas}ª visita)` : 'Anônimo novo');
    setLog((l) => [{ id: ++logIdRef.current, tipo: r.tipo, nome, visitas: r.visitas, confianca: r.confianca, hora: new Date().toISOString() }, ...l].slice(0, 12));
  }, []);

  const passo = useCallback(async (entrada: string) => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return false;
    // Detecção própria com landmarks → gate de ROSTO INTEIRO e DE FRENTE.
    const det: any = await faceapi.detectSingleFace(video).withFaceLandmarks().withFaceDescriptor();
    if (!det) { limparCanvas(canvasRef.current); return false; }
    const ok = rostoFrontalOk(det, video);
    desenharBox(canvasRef.current, video, det, ok);
    if (!ok) { setStatus('Rosto parcial / de lado — mostre o rosto inteiro, de frente.'); return false; }
    setStatus('');
    const best_shot = capturarBestShot(video);
    const r = await reconhecer.mutateAsync({ descriptor: Array.from(det.descriptor), entrada, best_shot });
    addLog(r);
    return true;
  }, [reconhecer, videoRef, canvasRef, addLog]);

  // Loop automático: detecta continuamente; ao achar rosto (respeitando cooldown), reconhece.
  useEffect(() => {
    if (!ativa || !auto) return;
    let parar = false; let ocupado = false;
    const tick = async () => {
      if (parar || ocupado) return;
      if (Date.now() - ultimoRef.current < COOLDOWN_MS) return;
      ocupado = true;
      try { const ok = await passo('entrada-auto'); if (ok) ultimoRef.current = Date.now(); }
      catch { /* segue tentando */ }
      finally { ocupado = false; }
    };
    const id = setInterval(tick, 500);
    return () => { parar = true; clearInterval(id); };
  }, [ativa, auto, passo]);

  const escanearManual = useCallback(async () => {
    setStatus('Detectando...');
    try { const ok = await passo('teste-manual'); setStatus(ok ? '' : 'Nenhum rosto detectado.'); }
    catch (e: any) { setStatus(e?.message || 'Erro no reconhecimento'); }
  }, [passo]);

  // Em segundo plano, o device transforma as FOTOS de perfil (app/membresia) que
  // ainda não viraram vetor → assim quem tem foto passa a ser reconhecido na
  // entrada, sem etapa manual. Roda devagar e não compete com um reconhecimento.
  useEffect(() => {
    if (!ativa || !autoCadastro) return;
    let parar = false;
    const refil = async () => {
      try {
        const r: any = await face.galeria({ sem_rosto: '1', limit: '25' });
        filaRef.current = ((r?.itens) || []).filter((m: any) => m.foto_url);
        setCadastro((c) => ({ ...c, fila: filaRef.current.length }));
      } catch { /* segue */ }
    };
    const tick = async () => {
      if (parar || enrollRef.current) return;
      if (Date.now() - ultimoRef.current < 900) return; // não competir com reconhecimento recente
      if (!filaRef.current.length) { await refil(); return; }
      const m = filaRef.current.shift();
      setCadastro((c) => ({ ...c, fila: filaRef.current.length }));
      enrollRef.current = true;
      try {
        const desc = await descritorDoMembro(m.id);
        if (desc) { await face.enroll(m.id, desc, true); setCadastro((c) => ({ ...c, feitos: c.feitos + 1 })); }
      } catch { /* foto sem rosto / erro · ignora */ }
      finally { enrollRef.current = false; }
    };
    refil();
    const id = setInterval(tick, 3000);
    return () => { parar = true; clearInterval(id); };
  }, [ativa, autoCadastro]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={auto ? 'default' : 'outline'} onClick={() => setAuto(true)} style={auto ? { background: PRIMARY } : {}}>
          <Zap className="w-4 h-4 mr-1" /> Automático
        </Button>
        <Button size="sm" variant={!auto ? 'default' : 'outline'} onClick={() => setAuto(false)} style={!auto ? { background: PRIMARY } : {}}>
          <ZapOff className="w-4 h-4 mr-1" /> Manual
        </Button>
        <span className="text-xs text-muted-foreground">
          {auto ? 'A câmera reconhece sozinha, em tempo real (igual ao device da entrada).' : 'Clique em Escanear pra reconhecer.'}
        </span>
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={autoCadastro} onChange={(e) => setAutoCadastro(e.target.checked)} />
        Cadastrar rostos de quem tem foto (app/membresia) em segundo plano — assim já são reconhecidos na entrada
        {ativa && autoCadastro && (cadastro.feitos > 0 || cadastro.fila > 0) && (
          <span className="text-foreground">· {cadastro.feitos} cadastrados · {cadastro.fila} na fila</span>
        )}
      </label>
      <div className="rounded-xl overflow-hidden bg-black relative" style={{ aspectRatio: '4/3', maxWidth: 520 }}>
        <video ref={videoRef} className="w-full h-full object-cover" playsInline muted />
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
        {!ativa && <div className="absolute inset-0 flex items-center justify-center text-white/70 text-sm">Câmera desligada</div>}
        {ativa && auto && (
          <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/50 text-white text-xs px-2 py-1 rounded-full">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> ao vivo
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {!ativa ? (
          <Button onClick={ligar} disabled={conectando} style={{ background: PRIMARY }}>
            {conectando ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Camera className="w-4 h-4 mr-1" />} Ligar câmera
          </Button>
        ) : (
          <>
            {!auto && (
              <Button onClick={escanearManual} disabled={reconhecer.isPending} style={{ background: PRIMARY }}>
                {reconhecer.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Scan className="w-4 h-4 mr-1" />} Escanear
              </Button>
            )}
            <Button variant="outline" onClick={switchCamera}><SwitchCamera className="w-4 h-4 mr-1" /> Trocar</Button>
            <Button variant="ghost" onClick={desligar}>Desligar</Button>
          </>
        )}
      </div>
      {status && <p className="text-sm text-muted-foreground">{status}</p>}
      {log.length > 0 && (
        <Card><CardContent className="p-0">
          <div className="px-4 py-2 text-xs font-medium text-muted-foreground border-b">Reconhecimentos ao vivo</div>
          <div className="divide-y max-h-72 overflow-y-auto">
            {log.map((l) => (
              <div key={l.id} className="px-4 py-2 flex items-center gap-2 text-sm">
                {l.tipo === 'membro' ? <UserCheck className="w-4 h-4 text-green-600" /> : l.tipo === 'anonimo_recorrente' ? <Repeat className="w-4 h-4 text-amber-600" /> : <Users className="w-4 h-4 text-muted-foreground" />}
                <span className="flex-1">{l.nome}{l.tipo === 'membro' && l.confianca != null ? ` · ${Math.round(l.confianca * 100)}%` : ''}</span>
                <span className="text-xs text-muted-foreground">{fmtHora(l.hora)}</span>
              </div>
            ))}
          </div>
        </CardContent></Card>
      )}
    </div>
  );
}

// ── Diálogo · vincular a um membro existente ────────────────────────────────
function VincularDialog({ anon, onClose }: { anon: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [busca, setBusca] = useState('');
  const { data: membros, isFetching } = useQuery({
    queryKey: ['face-busca-membro', busca],
    queryFn: () => membresia.membros.list({ busca } as any),
    enabled: busca.trim().length >= 2,
  });
  const vincular = useMutation({
    mutationFn: (membro_id: string) => face.vincular(anon.id, membro_id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['face-anonimos'] }); onClose(); },
  });
  const lista = Array.isArray(membros) ? membros : (membros as any)?.membros || (membros as any)?.data || [];
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Vincular rosto a um membro</DialogTitle></DialogHeader>
        <Input placeholder="Buscar por nome..." value={busca} onChange={(e) => setBusca(e.target.value)} autoFocus />
        <div className="max-h-72 overflow-y-auto space-y-1 mt-2">
          {isFetching && <p className="text-sm text-muted-foreground p-2">Buscando...</p>}
          {!isFetching && busca.length >= 2 && lista.length === 0 && <p className="text-sm text-muted-foreground p-2">Nenhum membro encontrado.</p>}
          {lista.slice(0, 30).map((m: any) => (
            <button key={m.id} onClick={() => vincular.mutate(m.id)} disabled={vincular.isPending}
              className="w-full text-left px-3 py-2 rounded-lg hover:bg-muted flex items-center justify-between">
              <span>{m.nome}</span>
              <span className="text-xs text-muted-foreground">{m.telefone || m.email || ''}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Ao vincular, o rosto vira o reconhecimento desse membro (com consentimento) e o histórico de visitas migra pro cadastro.</p>
      </DialogContent>
    </Dialog>
  );
}

// ── Diálogo · cadastrar nova pessoa a partir do rosto ───────────────────────
function CadastrarDialog({ anon, onClose }: { anon: any; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ nome: '', telefone: '', email: '' });
  const cadastrar = useMutation({
    mutationFn: () => face.cadastrar(anon.id, form),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['face-anonimos'] }); onClose(); },
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Cadastrar nova pessoa</DialogTitle></DialogHeader>
        <div className="space-y-2">
          <Input placeholder="Nome *" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} autoFocus />
          <Input placeholder="Telefone" value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
          <Input placeholder="E-mail" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => cadastrar.mutate()} disabled={form.nome.trim().length < 2 || cadastrar.isPending} style={{ background: PRIMARY }}>
            {cadastrar.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <UserPlus className="w-4 h-4 mr-1" />} Cadastrar e vincular rosto
          </Button>
        </DialogFooter>
        <p className="text-xs text-muted-foreground">Cria a pessoa na Membresia (como visitante) já com o rosto e o histórico de visitas.</p>
      </DialogContent>
    </Dialog>
  );
}

// ── Aba 2 · Rostos a resolver ───────────────────────────────────────────────
function AbaResolver() {
  const qc = useQueryClient();
  const [soRecorrentes, setSoRecorrentes] = useState(true);
  const { data, isLoading } = useQuery({
    queryKey: ['face-anonimos', soRecorrentes],
    queryFn: () => face.anonimos({ min_visitas: soRecorrentes ? 2 : 1, limit: 200 }),
  });
  const [vincularAnon, setVincularAnon] = useState<any>(null);
  const [cadastrarAnon, setCadastrarAnon] = useState<any>(null);
  const [expandir, setExpandir] = useState<string | null>(null);
  const descartar = useMutation({
    mutationFn: (id: string) => face.descartar(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['face-anonimos'] }),
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const [imp, setImp] = useState<{ total: number; feitos: number; semRosto: number; erro: number } | null>(null);
  const lista = Array.isArray(data) ? data : [];

  const importar = useCallback(async (files: FileList) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (!arr.length) return;
    setImp({ total: arr.length, feitos: 0, semRosto: 0, erro: 0 });
    for (const f of arr) {
      try {
        const url = URL.createObjectURL(f);
        let desc: number[] | null = null;
        try { desc = await descritorDaFoto(url); } finally { URL.revokeObjectURL(url); }
        if (!desc) { setImp((p) => p && { ...p, feitos: p.feitos + 1, semRosto: p.semRosto + 1 }); continue; }
        const best_shot = await arquivoParaBestShot(f);
        const rotulo = f.name.replace(/\.[^.]+$/, '');
        await face.importarAnonimo({ descriptor: desc, best_shot, rotulo });
        setImp((p) => p && { ...p, feitos: p.feitos + 1 });
      } catch { setImp((p) => p && { ...p, feitos: p.feitos + 1, erro: p.erro + 1 }); }
    }
    setImp(null);
    setSoRecorrentes(false); // importados têm 1 visita → aparecem em "Todos"
    qc.invalidateQueries({ queryKey: ['face-anonimos'] });
  }, [qc]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={soRecorrentes ? 'default' : 'outline'} onClick={() => setSoRecorrentes(true)} style={soRecorrentes ? { background: PRIMARY } : {}}>Recorrentes (2+ visitas)</Button>
        <Button size="sm" variant={!soRecorrentes ? 'default' : 'outline'} onClick={() => setSoRecorrentes(false)} style={!soRecorrentes ? { background: PRIMARY } : {}}>Todos</Button>
        <span className="flex-1" />
        <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files) importar(e.target.files); e.currentTarget.value = ''; }} />
        <Button size="sm" variant="outline" disabled={!!imp} onClick={() => fileRef.current?.click()}>
          {imp ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <UserPlus className="w-3.5 h-3.5 mr-1" />}
          {imp ? `Importando ${imp.feitos}/${imp.total}…` : 'Importar rostos (fotos)'}
        </Button>
      </div>
      {imp && <p className="text-xs text-muted-foreground">{imp.feitos}/{imp.total} · {imp.semRosto} sem rosto · {imp.erro} erros</p>}
      {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
      {!isLoading && lista.length === 0 && (
        <Card><CardContent className="p-6 text-center text-muted-foreground">Nenhum rosto anônimo a resolver.</CardContent></Card>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {lista.map((a: any) => (
          <Card key={a.id}><CardContent className="p-3 space-y-2">
            <div className="flex gap-3">
              <button onClick={() => a.best_shot_url && setExpandir(a.best_shot_url)}
                className="w-20 h-20 rounded-lg overflow-hidden bg-muted flex items-center justify-center shrink-0 relative group">
                {a.best_shot_url ? <>
                  <img src={a.best_shot_url} alt="rosto" className="w-full h-full object-cover" />
                  <span className="absolute inset-0 bg-black/0 group-hover:bg-black/30 flex items-center justify-center transition"><Maximize2 className="w-4 h-4 text-white opacity-0 group-hover:opacity-100" /></span>
                </> : <Users className="w-8 h-8 text-muted-foreground" />}
              </button>
              <div className="text-sm space-y-1 min-w-0">
                {a.entrada && a.entrada !== 'importado' && !String(a.entrada).startsWith('entrada') && !String(a.entrada).startsWith('teste') && (
                  <p className="font-medium truncate" title={a.entrada}>{a.entrada}</p>
                )}
                <Badge variant="secondary">{a.visitas} {a.visitas > 1 ? 'visitas' : 'visita'}</Badge>
                <p className="text-muted-foreground text-xs">1ª vez: {fmtData(a.primeira_vez)}</p>
                <p className="text-muted-foreground text-xs">Última: {fmtData(a.ultima_vez)}</p>
              </div>
            </div>
            <div className="flex gap-1">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => setVincularAnon(a)}><Link2 className="w-3.5 h-3.5 mr-1" /> Vincular</Button>
              <Button size="sm" variant="outline" className="flex-1" onClick={() => setCadastrarAnon(a)}><UserPlus className="w-3.5 h-3.5 mr-1" /> Cadastrar</Button>
              <Button size="sm" variant="ghost" onClick={() => { if (confirm('Descartar este rosto? (passante/equipe)')) descartar.mutate(a.id); }}><Trash2 className="w-3.5 h-3.5" /></Button>
            </div>
          </CardContent></Card>
        ))}
      </div>
      {vincularAnon && <VincularDialog anon={vincularAnon} onClose={() => setVincularAnon(null)} />}
      {cadastrarAnon && <CadastrarDialog anon={cadastrarAnon} onClose={() => setCadastrarAnon(null)} />}
      {expandir && <Lightbox url={expandir} onClose={() => setExpandir(null)} />}
    </div>
  );
}

// ── Aba 3 · Cadastrar rostos (a partir das fotos dos membros) ───────────────
function AbaCadastrar() {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery({ queryKey: ['face-galeria'], queryFn: () => face.galeria({ limit: 2000 }) });
  const [consent, setConsent] = useState(false);
  const [rodando, setRodando] = useState(false);
  const [prog, setProg] = useState({ feitos: 0, ok: 0, semRosto: 0, erro: 0, total: 0 });
  const pararRef = useRef(false);

  const itens: any[] = (data as any)?.itens || [];
  const cadastrados = (data as any)?.cadastrados || 0;
  const faltam = itens.filter((m) => !m.ja);

  const processar = useCallback(async () => {
    const alvo = itens.filter((m) => !m.ja && m.foto_url);
    setRodando(true); pararRef.current = false;
    setProg({ feitos: 0, ok: 0, semRosto: 0, erro: 0, total: alvo.length });
    for (const m of alvo) {
      if (pararRef.current) break;
      try {
        const desc = await descritorDoMembro(m.id);
        if (!desc) { setProg((p) => ({ ...p, feitos: p.feitos + 1, semRosto: p.semRosto + 1 })); continue; }
        await face.enroll(m.id, desc, true);
        setProg((p) => ({ ...p, feitos: p.feitos + 1, ok: p.ok + 1 }));
      } catch { setProg((p) => ({ ...p, feitos: p.feitos + 1, erro: p.erro + 1 })); }
    }
    setRodando(false);
    qc.invalidateQueries({ queryKey: ['face-galeria'] });
    refetch();
  }, [itens, qc, refetch]);

  return (
    <div className="space-y-4">
      <Card><CardContent className="p-4 space-y-1">
        <div className="flex items-center gap-2"><ScanFace className="w-5 h-5" style={{ color: PRIMARY }} />
          <p className="text-sm">Gera o "vetor facial" a partir das <b>fotos que os membros já têm</b> (app/membresia). Depois disso eles são reconhecidos na entrada.</p>
        </div>
        <p className="text-xs text-muted-foreground">A foto sozinha não reconhece — o reconhecimento compara vetores. Por isso é preciso cadastrar o rosto uma vez.</p>
      </CardContent></Card>

      {isLoading ? <p className="text-sm text-muted-foreground">Carregando galeria...</p> : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Card><CardContent className="p-4"><p className="text-2xl font-semibold">{cadastrados}</p><p className="text-xs text-muted-foreground">Rostos cadastrados</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-2xl font-semibold">{itens.length}</p><p className="text-xs text-muted-foreground">Membros com foto</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-2xl font-semibold">{faltam.length}</p><p className="text-xs text-muted-foreground">Faltam cadastrar</p></CardContent></Card>
          </div>

          <label className="flex items-start gap-2 text-sm rounded-lg border p-3">
            <input type="checkbox" className="mt-0.5" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span className="text-muted-foreground">Confirmo que há <b>base legal/consentimento</b> dos membros para cadastrar o rosto (LGPD · dado biométrico sensível). Em produção, o consentimento vem do termo de membresia.</span>
          </label>

          {rodando ? (
            <Card><CardContent className="p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> Processando {prog.feitos}/{prog.total}...</div>
              <div className="h-2 rounded-full bg-muted overflow-hidden"><div className="h-full" style={{ width: `${prog.total ? (prog.feitos / prog.total) * 100 : 0}%`, background: PRIMARY }} /></div>
              <p className="text-xs text-muted-foreground">{prog.ok} cadastrados · {prog.semRosto} sem rosto detectado · {prog.erro} erros</p>
              <Button size="sm" variant="outline" onClick={() => { pararRef.current = true; }}>Parar</Button>
            </CardContent></Card>
          ) : (
            <div className="flex items-center gap-2">
              <Button onClick={processar} disabled={!consent || faltam.length === 0} style={{ background: PRIMARY }}>
                <ScanFace className="w-4 h-4 mr-1" /> Cadastrar {faltam.length} rostos faltantes
              </Button>
              {prog.total > 0 && <span className="text-xs text-muted-foreground">Última rodada: {prog.ok} ok · {prog.semRosto} sem rosto · {prog.erro} erros</span>}
            </div>
          )}
          <p className="text-xs text-muted-foreground">Roda no navegador (não envia a foto pra lugar nenhum — só o vetor matemático). Pode levar alguns segundos por pessoa.</p>
        </>
      )}
    </div>
  );
}

// ── Diálogo · lista de pessoas do card clicado ──────────────────────────────
function ListaPresencaDialog({ titulo, tipo, filtro, onClose }: { titulo: string; tipo: string; filtro: Record<string, string>; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['face-presenca-lista', tipo, filtro],
    queryFn: () => face.presencaLista({ ...filtro, tipo }),
  });
  const [expandir, setExpandir] = useState<string | null>(null);
  const itens: any[] = (data as any)?.itens || [];
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>{titulo} · {itens.length}</DialogTitle></DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto divide-y">
          {isLoading && <p className="text-sm text-muted-foreground p-3">Carregando...</p>}
          {!isLoading && itens.length === 0 && <p className="text-sm text-muted-foreground p-3">Ninguém no filtro.</p>}
          {itens.map((i) => (
            <div key={`${i.tipo}:${i.id}`} className="py-2 flex items-center gap-3">
              <button onClick={() => i.best_shot_url && setExpandir(i.best_shot_url)} className="w-10 h-10 rounded-full overflow-hidden bg-muted flex items-center justify-center shrink-0">
                {i.foto_url || i.best_shot_url ? <img src={i.foto_url || i.best_shot_url} alt="" className="w-full h-full object-cover" /> : <Users className="w-5 h-5 text-muted-foreground" />}
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate flex items-center gap-1">
                  {i.tipo === 'membro' ? <UserCheck className="w-3.5 h-3.5 text-green-600" /> : <Users className="w-3.5 h-3.5 text-muted-foreground" />}
                  {i.nome}{i.tipo === 'anonimo' && i.visitas ? ` · ${i.visitas} visitas` : ''}
                </p>
                <p className="text-xs text-muted-foreground">{i.n} reconhecimento{i.n > 1 ? 's' : ''} · última {fmtData(i.ultima)} {fmtHora(i.ultima)}</p>
              </div>
              {i.tipo === 'membro' && (
                <Button size="sm" variant="ghost" onClick={() => irParaMembro(i.id)}><ExternalLink className="w-3.5 h-3.5" /></Button>
              )}
            </div>
          ))}
        </div>
        {expandir && <Lightbox url={expandir} onClose={() => setExpandir(null)} />}
      </DialogContent>
    </Dialog>
  );
}

// ── Aba 4 · Presença ────────────────────────────────────────────────────────
function AbaPresenca() {
  const [dias, setDias] = useState(7);
  const [dia, setDia] = useState(''); // dia de culto específico (YYYY-MM-DD)
  const filtro = dia ? { dia } : { dias: String(dias) };
  const { data: cultos } = useQuery({ queryKey: ['face-cultos'], queryFn: () => face.cultos() });
  const { data, isLoading } = useQuery({ queryKey: ['face-resumo', filtro], queryFn: () => face.resumo(filtro) });
  const [card, setCard] = useState<{ titulo: string; tipo: string } | null>(null);
  const r: any = data || {};
  const cards = [
    { titulo: 'Reconhecimentos', tipo: 'todos', valor: r.total_reconhecimentos, icon: Scan },
    { titulo: 'Membros identificados', tipo: 'membros', valor: r.membros_identificados, icon: UserCheck },
    { titulo: 'Anônimos distintos', tipo: 'anonimos', valor: r.anonimos_distintos, icon: Users },
    { titulo: 'Anônimos recorrentes', tipo: 'recorrentes', valor: r.anonimos_recorrentes, icon: Repeat },
  ];
  const cultosArr = Array.isArray(cultos) ? cultos : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2 items-center">
        {[7, 30, 90].map((d) => (
          <Button key={d} size="sm" variant={!dia && dias === d ? 'default' : 'outline'} onClick={() => { setDia(''); setDias(d); }} style={!dia && dias === d ? { background: PRIMARY } : {}}>{d} dias</Button>
        ))}
        <span className="text-border">·</span>
        <select value={dia} onChange={(e) => setDia(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-sm">
          <option value="">Dia de culto específico…</option>
          {cultosArr.map((c: any) => (
            <option key={c.id} value={c.data}>{new Date(c.data + 'T12:00:00').toLocaleDateString('pt-BR')} · {c.nome}</option>
          ))}
        </select>
        <Input type="date" value={dia} onChange={(e) => setDia(e.target.value)} className="h-9 w-40" />
        {dia && <Button size="sm" variant="ghost" onClick={() => setDia('')}>Limpar</Button>}
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">Carregando...</p> : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {cards.map((c) => (
            <button key={c.titulo} onClick={() => setCard({ titulo: c.titulo, tipo: c.tipo })} className="text-left">
              <Card className="hover:ring-1 hover:ring-primary/40 transition"><CardContent className="p-4">
                <c.icon className="w-5 h-5 mb-2" style={{ color: PRIMARY }} />
                <p className="text-2xl font-semibold">{c.valor ?? 0}</p>
                <p className="text-xs text-muted-foreground">{c.titulo}</p>
              </CardContent></Card>
            </button>
          ))}
        </div>
      )}
      <p className="text-xs text-muted-foreground">Clique num card pra ver as pessoas. Anônimos recorrentes = prováveis frequentadores ainda não identificados — bons candidatos a acolher.</p>
      {card && <ListaPresencaDialog titulo={card.titulo} tipo={card.tipo} filtro={filtro} onClose={() => setCard(null)} />}
    </div>
  );
}

export default function ReconhecimentoFacial() {
  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Reconhecimento Facial</h1>
        <p className="text-muted-foreground text-sm">Presença na entrada · membros identificados + rostos anônimos a resolver.</p>
      </div>
      <div className="flex items-start gap-2 rounded-lg border border-amber-300/40 bg-amber-50/40 dark:bg-amber-500/10 p-3 text-sm">
        <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-muted-foreground">
          <b>LGPD:</b> rosto é dado biométrico sensível. Membros entram com consentimento; anônimos são pseudonimizados e expurgados por retenção. Go-live exige aviso na entrada + aval do jurídico/DPO.
        </p>
      </div>
      <Tabs defaultValue="resolver">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="resolver">Rostos a resolver</TabsTrigger>
          <TabsTrigger value="cadastrar">Cadastrar rostos</TabsTrigger>
          <TabsTrigger value="presenca">Presença</TabsTrigger>
          <TabsTrigger value="reconhecer">Reconhecimento</TabsTrigger>
        </TabsList>
        <TabsContent value="resolver" className="mt-4"><AbaResolver /></TabsContent>
        <TabsContent value="cadastrar" className="mt-4"><AbaCadastrar /></TabsContent>
        <TabsContent value="presenca" className="mt-4"><AbaPresenca /></TabsContent>
        <TabsContent value="reconhecer" className="mt-4"><AbaReconhecer /></TabsContent>
      </Tabs>
    </div>
  );
}
