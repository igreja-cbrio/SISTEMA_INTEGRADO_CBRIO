// ============================================================================
// Totem do Next (in-app · tablet) · 2026-07-22
//   Aberto por um botão na aba Next. O operador escolhe a TURMA + a SEMANA
//   (encontro), entra em tela cheia (PIN pra sair) e deixa o tablet com as
//   pessoas. Duas abas:
//   · Presença — a pessoa acha o nome e marca presença NO ENCONTRO escolhido
//     (grava next_presencas · conta por semana) + "Cheguei agora" (walk-in).
//   · Direcionamento — no fim, a pessoa marca Batismo / Servir (com áreas) /
//     Grupo (mesmo motor do direcionamento · POST /matriculas/:id/direcionar).
// Nomes só (sem PII na lista), igual ao self-service público.
// ============================================================================
import { useEffect, useRef, useState } from 'react';
import { next as nextApi, publicVoluntariado } from '../../../api';
import {
  Loader2, Search, UserPlus, Users, HandHeart, Droplets, Check, ArrowLeft, Monitor, X,
} from 'lucide-react';
import { toast } from 'sonner';

const PIN_KEY = 'cbrio-next-totem-pin';
const MAX_AREAS = 3;

const DESTINOS = [
  { v: 'batismo',     l: 'Quero me batizar', Icon: Droplets,  desc: 'Dar esse passo',        color: '#3b82f6' },
  { v: 'voluntarios', l: 'Quero servir',     Icon: HandHeart, desc: 'Servir num ministério', color: '#f59e0b' },
  { v: 'grupos',      l: 'Grupo',            Icon: Users,     desc: 'Fazer parte de um grupo', color: '#0ea5e9' },
] as const;

type Enc = { id: string; numero: number; data?: string | null };
type Mat = { id: string; nome: string; sobrenome?: string | null; indicou_grupo?: boolean; indicou_servir?: boolean; indicou_batismo?: boolean };
type Opcao = { label: string };

function nomeCompleto(m: Mat) { return `${m.nome || ''}${m.sobrenome ? ' ' + m.sobrenome : ''}`.trim(); }
function ymd(d?: string | null) {
  if (!d) return '';
  try { return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }); } catch { return ''; }
}
function computePresentes(det: any, encId: string): Set<string> {
  const s = new Set<string>();
  (det?.presencas || []).forEach((p: any) => { if (p.presente && p.encontro_id === encId) s.add(p.matricula_id); });
  return s;
}

export default function TotemNext({ onClose }: { onClose: () => void }) {
  const [stage, setStage] = useState<'select' | 'kiosk'>('select');

  // seleção
  const [turmas, setTurmas] = useState<any[]>([]);
  const [loadingTurmas, setLoadingTurmas] = useState(true);
  const [turmaSel, setTurmaSel] = useState<any | null>(null);
  const [encSel, setEncSel] = useState<Enc | null>(null);
  const [loadingDet, setLoadingDet] = useState(false);

  // dados do quiosque
  const [det, setDet] = useState<any | null>(null);
  const [presentes, setPresentes] = useState<Set<string>>(new Set());
  const [aba, setAba] = useState<'presenca' | 'direc'>('presenca');
  const [opcoes, setOpcoes] = useState<Opcao[]>([]);

  // pin
  const [pinModal, setPinModal] = useState<null | 'setup' | 'exit'>(null);

  useEffect(() => {
    nextApi.turmas.list()
      .then((r: any) => setTurmas((Array.isArray(r) ? r : []).filter((t: any) => t.status === 'aberta')))
      .catch(() => setTurmas([]))
      .finally(() => setLoadingTurmas(false));
    publicVoluntariado.formOpcoes().then((o: any) => setOpcoes(Array.isArray(o) ? o : [])).catch(() => setOpcoes([]));
  }, []);

  async function escolherTurma(t: any) {
    setTurmaSel(t); setEncSel(null); setLoadingDet(true);
    try {
      const d = await nextApi.turmas.get(t.id);
      setDet(d);
      const encs = [...(d.encontros || [])].sort((a: Enc, b: Enc) => (a.numero || 0) - (b.numero || 0));
      if (encs.length === 1) setEncSel(encs[0]);
    } catch (e: any) { toast.error(e?.message || 'Erro ao carregar a turma'); setTurmaSel(null); }
    finally { setLoadingDet(false); }
  }

  async function refresh() {
    if (!turmaSel || !encSel) return;
    try {
      const d = await nextApi.turmas.get(turmaSel.id);
      setDet(d);
      setPresentes(computePresentes(d, encSel.id));
    } catch { /* mantém o que tem */ }
  }

  function entrarKiosk() {
    if (!encSel) { toast.error('Escolha a semana'); return; }
    setPresentes(computePresentes(det, encSel.id));
    let stored = '';
    try { stored = localStorage.getItem(PIN_KEY) || ''; } catch { stored = ''; }
    if (!stored) { setPinModal('setup'); return; }
    ativar();
  }
  function ativar() {
    setAba('presenca');
    try { document.documentElement.requestFullscreen?.().catch(() => {}); } catch { /* alguns browsers bloqueiam */ }
    setStage('kiosk');
  }
  function sairDeFato() {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    onClose();
  }

  // ── seleção de turma + semana ──────────────────────────────────────────────
  if (stage === 'select') {
    return (
      <div className="fixed inset-0 z-[60] bg-slate-50 text-slate-900 flex flex-col items-center justify-center p-6" data-theme="light">
        <button onClick={onClose} className="absolute top-4 right-4 h-10 w-10 rounded-full border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:text-slate-800">
          <X className="h-5 w-5" />
        </button>
        <div className="w-full max-w-lg rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
          <div className="flex items-center gap-2 mb-1">
            <Monitor className="h-5 w-5" style={{ color: '#00B39D' }} />
            <h1 className="text-xl font-bold">Totem do Next</h1>
          </div>
          <p className="text-sm text-slate-500 mb-5">Escolha a turma e a semana antes de entrar no modo tela cheia.</p>

          {loadingTurmas ? (
            <Loader2 className="h-6 w-6 animate-spin text-slate-400 mx-auto my-8" />
          ) : turmas.length === 0 ? (
            <p className="text-center text-sm text-slate-500 py-8">Nenhuma turma aberta no momento.</p>
          ) : !turmaSel ? (
            <>
              <p className="text-xs font-medium text-slate-500 mb-2">Turma</p>
              <div className="space-y-2 max-h-[46vh] overflow-y-auto">
                {turmas.map(t => (
                  <button key={t.id} onClick={() => escolherTurma(t)}
                    className="w-full text-left rounded-xl border border-slate-200 px-4 py-3.5 hover:border-[#00B39D] transition-colors">
                    <span className="font-semibold">{t.nome}</span>
                    <span className="block text-xs text-slate-500">{t.contagem?.total || 0} inscritos · {t.contagem?.encontros || 0} encontros</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <button onClick={() => { setTurmaSel(null); setEncSel(null); }} className="text-xs text-slate-500 mb-3 hover:underline inline-flex items-center gap-1">
                <ArrowLeft className="h-3.5 w-3.5" /> outra turma
              </button>
              <p className="font-semibold mb-1">{turmaSel.nome}</p>
              <p className="text-xs font-medium text-slate-500 mb-2">Qual semana (encontro)?</p>
              {loadingDet ? (
                <Loader2 className="h-5 w-5 animate-spin text-slate-400 mx-auto my-6" />
              ) : (
                <div className="grid grid-cols-2 gap-2 mb-5">
                  {[...(det?.encontros || [])].sort((a: Enc, b: Enc) => (a.numero || 0) - (b.numero || 0)).map((e: Enc) => (
                    <button key={e.id} onClick={() => setEncSel(e)}
                      className={`rounded-xl border-2 px-4 py-3 text-left transition-colors ${encSel?.id === e.id ? 'border-[#00B39D] bg-[#00B39D]/10' : 'border-slate-200 hover:border-slate-300'}`}>
                      <span className="font-semibold">Semana {e.numero}</span>
                      <span className="block text-xs text-slate-500">{e.data ? ymd(e.data) : 'sem data'}</span>
                    </button>
                  ))}
                </div>
              )}
              <button onClick={entrarKiosk} disabled={!encSel}
                className="w-full rounded-xl bg-[#00B39D] px-4 py-3.5 text-base font-semibold text-white disabled:opacity-50">
                Entrar no totem
              </button>
            </>
          )}
        </div>
        {pinModal && <PinModal modo={pinModal} onClose={() => setPinModal(null)}
          onOk={() => { setPinModal(null); ativar(); }} />}
      </div>
    );
  }

  // ── quiosque (tela cheia) ──────────────────────────────────────────────────
  const mats: Mat[] = det?.matriculas || [];
  const nPres = mats.filter(m => presentes.has(m.id)).length;

  return (
    <div className="fixed inset-0 z-[60] bg-slate-50 text-slate-900 flex flex-col" data-theme="light">
      {/* Cabeçalho */}
      <div className="shrink-0 border-b border-slate-200 bg-white px-5 py-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-slate-400">{turmaSel?.nome} · Semana {encSel?.numero}</p>
          <p className="text-sm font-semibold">{aba === 'presenca' ? `${nPres} presente${nPres !== 1 ? 's' : ''} de ${mats.length}` : 'Direcionamento'}</p>
        </div>
        <button onClick={() => setPinModal('exit')}
          className="text-xs text-slate-500 hover:text-slate-800 border border-slate-200 rounded-full px-3 py-1.5 bg-white">
          Sair
        </button>
      </div>

      {/* Abas */}
      <div className="shrink-0 flex justify-center py-3 bg-white border-b border-slate-200">
        <div className="relative flex bg-slate-100 rounded-full p-1 w-72">
          <div className="absolute top-1 left-1 h-[calc(100%-8px)] w-[calc(50%-4px)] rounded-full bg-[#00B39D] shadow transition-transform duration-300"
            style={{ transform: aba === 'direc' ? 'translateX(100%)' : 'translateX(0)' }} />
          <button onClick={() => setAba('presenca')} className={`relative z-10 flex-1 py-2 text-sm font-bold rounded-full ${aba === 'presenca' ? 'text-white' : 'text-slate-500'}`}>Presença</button>
          <button onClick={() => setAba('direc')} className={`relative z-10 flex-1 py-2 text-sm font-bold rounded-full ${aba === 'direc' ? 'text-white' : 'text-slate-500'}`}>Direcionamento</button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-xl px-5 py-5">
          {aba === 'presenca'
            ? <AbaPresenca mats={mats} presentes={presentes} encId={encSel!.id} turmaId={turmaSel.id}
                onToggle={(m, isPres) => {
                  setPresentes(prev => { const n = new Set(prev); if (isPres) n.delete(m.id); else n.add(m.id); return n; });
                }}
                onRefresh={refresh} />
            : <AbaDirec mats={mats} opcoes={opcoes} onRefresh={refresh} />}
        </div>
      </div>

      {pinModal && <PinModal modo={pinModal} onClose={() => setPinModal(null)}
        onOk={() => { setPinModal(null); if (pinModal === 'exit') sairDeFato(); }} />}
    </div>
  );
}

// ── Aba Presença ─────────────────────────────────────────────────────────────
function AbaPresenca({ mats, presentes, encId, turmaId, onToggle, onRefresh }: {
  mats: Mat[]; presentes: Set<string>; encId: string; turmaId: string;
  onToggle: (m: Mat, isPres: boolean) => void; onRefresh: () => Promise<void>;
}) {
  const [busca, setBusca] = useState('');
  const [novo, setNovo] = useState(false);

  async function toggle(m: Mat) {
    const isPres = presentes.has(m.id);
    onToggle(m, isPres); // otimista
    try { await nextApi.encontros.setPresenca(encId, m.id, !isPres); }
    catch (e: any) { toast.error(e?.message || 'Erro ao marcar'); onToggle(m, !isPres); }
  }

  const filtradas = busca.trim()
    ? mats.filter(m => nomeCompleto(m).toLowerCase().includes(busca.trim().toLowerCase()))
    : mats;

  if (novo) {
    return <WalkinForm onCancel={() => setNovo(false)} onDone={async (novaId) => {
      setNovo(false);
      try { await nextApi.encontros.setPresenca(encId, novaId, true); } catch { /* ignore */ }
      await onRefresh();
    }} turmaId={turmaId} />;
  }

  return (
    <>
      <div className="flex gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Ache seu nome"
            className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-3 text-base" />
        </div>
        <button onClick={() => setNovo(true)} className="rounded-xl bg-[#00B39D] px-4 py-3 text-sm font-semibold text-white inline-flex items-center gap-1.5 whitespace-nowrap">
          <UserPlus className="h-4 w-4" /> Cheguei agora
        </button>
      </div>
      <div className="space-y-2">
        {filtradas.length === 0 ? (
          <p className="text-center text-sm text-slate-500 py-8">
            {mats.length === 0 ? 'Ninguém na turma ainda. Use "Cheguei agora".' : 'Ninguém encontrado. Use "Cheguei agora".'}
          </p>
        ) : filtradas.map(m => {
          const on = presentes.has(m.id);
          return (
            <button key={m.id} onClick={() => toggle(m)}
              className={`w-full flex items-center gap-3 rounded-xl border-2 px-4 py-4 text-left transition-colors ${on ? 'border-[#00B39D] bg-[#00B39D]/10' : 'border-slate-200 bg-white'}`}>
              <span className={`h-7 w-7 rounded-md flex items-center justify-center ${on ? 'bg-[#00B39D] text-white' : 'border border-slate-300'}`}>
                {on && <Check className="h-4 w-4" />}
              </span>
              <span className="flex-1 text-base">{nomeCompleto(m)}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

function WalkinForm({ turmaId, onCancel, onDone }: { turmaId: string; onCancel: () => void; onDone: (novaId: string) => void }) {
  const [f, setF] = useState({ nome: '', sobrenome: '', telefone: '', cpf: '' });
  const [salvando, setSalvando] = useState(false);
  const set = (k: string, v: string) => setF(s => ({ ...s, [k]: v }));

  async function salvar() {
    if (f.nome.trim().length < 2) { toast.error('Informe o nome'); return; }
    setSalvando(true);
    try {
      const nova: any = await nextApi.matriculas.create({ ...f, turma_id: turmaId });
      if (!nova?.id) throw new Error('Não deu pra inscrever');
      onDone(nova.id);
    } catch (e: any) { toast.error(e?.message || 'Não deu pra salvar'); }
    finally { setSalvando(false); }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
      <p className="text-sm text-slate-500">Cadastro rápido (cruzamos com a base pra não duplicar):</p>
      <div className="grid grid-cols-2 gap-2">
        <input value={f.nome} onChange={e => set('nome', e.target.value)} placeholder="Nome" autoFocus
          className="rounded-xl border border-slate-200 px-4 py-3 text-base" />
        <input value={f.sobrenome} onChange={e => set('sobrenome', e.target.value)} placeholder="Sobrenome"
          className="rounded-xl border border-slate-200 px-4 py-3 text-base" />
      </div>
      <input value={f.telefone} onChange={e => set('telefone', e.target.value)} placeholder="Telefone (WhatsApp)" inputMode="tel"
        className="w-full rounded-xl border border-slate-200 px-4 py-3 text-base" />
      <input value={f.cpf} onChange={e => set('cpf', e.target.value)} placeholder="CPF (opcional)" inputMode="numeric"
        className="w-full rounded-xl border border-slate-200 px-4 py-3 text-base" />
      <div className="flex gap-2 pt-1">
        <button onClick={onCancel} className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-medium">Cancelar</button>
        <button onClick={salvar} disabled={salvando} className="flex-1 rounded-xl bg-[#00B39D] px-4 py-3 text-sm font-semibold text-white disabled:opacity-60 inline-flex items-center justify-center gap-2">
          {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Inscrever e marcar presença
        </button>
      </div>
    </div>
  );
}

// ── Aba Direcionamento ───────────────────────────────────────────────────────
function AbaDirec({ mats, opcoes, onRefresh }: { mats: Mat[]; opcoes: Opcao[]; onRefresh: () => Promise<void> }) {
  const [busca, setBusca] = useState('');
  const [sel, setSel] = useState<Mat | null>(null);
  const [destinos, setDestinos] = useState<Record<string, boolean>>({});
  const [areas, setAreas] = useState<string[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [pronto, setPronto] = useState(false);

  const jaFeito = (m: Mat, v: string) => (v === 'grupos' && m.indicou_grupo) || (v === 'voluntarios' && m.indicou_servir) || (v === 'batismo' && m.indicou_batismo);

  function voltar() { setSel(null); setDestinos({}); setAreas([]); setPronto(false); }
  function toggleArea(label: string) {
    setAreas(a => a.includes(label) ? a.filter(x => x !== label) : (a.length >= MAX_AREAS ? a : [...a, label]));
  }

  async function enviar() {
    if (!sel) return;
    const escolhidos = DESTINOS.filter(d => destinos[d.v] && !jaFeito(sel, d.v)).map(d => d.v);
    if (escolhidos.length === 0) { toast.error('Escolha pra onde você quer ir'); return; }
    if (escolhidos.includes('voluntarios') && areas.length === 0) { toast.error('Escolha ao menos uma área pra servir'); return; }
    setSalvando(true);
    try {
      await nextApi.matriculas.direcionar(sel.id, escolhidos, areas);
      setPronto(true);
      await onRefresh();
    } catch (e: any) { toast.error(e?.message || 'Não deu pra enviar'); }
    finally { setSalvando(false); }
  }

  const filtradas = busca.trim()
    ? mats.filter(m => nomeCompleto(m).toLowerCase().includes(busca.trim().toLowerCase()))
    : mats;

  if (pronto && sel) {
    return (
      <div className="text-center py-10 space-y-3">
        <div className="text-5xl">🎉</div>
        <h2 className="text-xl font-semibold">Tudo certo, {sel.nome.split(' ')[0]}!</h2>
        <p className="text-sm text-slate-500">Anotamos seu próximo passo. Logo a gente fala com você. 💚</p>
        <button onClick={voltar} className="mt-2 rounded-xl border border-slate-200 px-6 py-3 text-sm font-medium">Próxima pessoa</button>
      </div>
    );
  }

  if (!sel) {
    return (
      <>
        <p className="text-sm text-slate-500 mb-3 text-center">Ache seu nome pra marcar seu próximo passo:</p>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Digite seu nome"
            className="w-full rounded-xl border border-slate-200 bg-white pl-9 pr-4 py-3 text-base" autoFocus />
        </div>
        <div className="space-y-2">
          {filtradas.length === 0 ? (
            <p className="text-center text-sm text-slate-500 py-8">Ninguém encontrado.</p>
          ) : filtradas.map(m => (
            <button key={m.id} onClick={() => setSel(m)}
              className="w-full text-left rounded-xl border border-slate-200 bg-white px-4 py-4 text-base hover:border-[#00B39D] transition-colors">
              {nomeCompleto(m)}
            </button>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <button onClick={voltar} className="text-xs text-slate-500 mb-3 hover:underline inline-flex items-center gap-1">
        <ArrowLeft className="h-3.5 w-3.5" /> não sou eu
      </button>
      <p className="text-sm mb-1">Oi, <strong>{sel.nome.split(' ')[0]}</strong>! Pra onde você quer ir?</p>
      <p className="text-xs text-slate-500 mb-3">Pode marcar mais de um.</p>
      <div className="space-y-2">
        {DESTINOS.map(d => {
          const feito = jaFeito(sel, d.v);
          const on = feito || !!destinos[d.v];
          const Icon = d.Icon;
          return (
            <div key={d.v}>
              <button disabled={feito} onClick={() => setDestinos(s => ({ ...s, [d.v]: !s[d.v] }))}
                className={`w-full flex items-center gap-3 rounded-2xl border-2 px-4 py-4 text-left transition-colors ${on ? 'border-[#00B39D] bg-[#00B39D]/10' : 'border-slate-200 bg-white'} ${feito ? 'opacity-60' : ''}`}>
                <span className="h-11 w-11 rounded-2xl flex items-center justify-center shrink-0" style={{ background: d.color + '1f', color: d.color }}>
                  <Icon className="h-5 w-5" />
                </span>
                <span className="flex-1">
                  <span className="block font-semibold">{d.l}</span>
                  <span className="block text-xs text-slate-500">{feito ? 'já escolhido' : d.desc}</span>
                </span>
                {on && <Check className="h-5 w-5 text-[#00B39D]" />}
              </button>

              {d.v === 'voluntarios' && !feito && destinos.voluntarios && (
                <div className="mt-2 rounded-2xl border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs text-slate-500 mb-2">Em qual área você quer servir? (até {MAX_AREAS})</p>
                  <div className="flex flex-wrap gap-1.5">
                    {opcoes.map(o => {
                      const chk = areas.includes(o.label);
                      const cheio = !chk && areas.length >= MAX_AREAS;
                      return (
                        <button key={o.label} disabled={cheio} onClick={() => toggleArea(o.label)}
                          className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${chk ? 'border-[#00B39D] bg-[#00B39D]/15' : 'border-slate-200 bg-white text-slate-500'} ${cheio ? 'opacity-40' : ''}`}>
                          {o.label}
                        </button>
                      );
                    })}
                    {opcoes.length === 0 && <span className="text-xs text-slate-400">Carregando áreas…</span>}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <button onClick={enviar} disabled={salvando}
        className="mt-5 w-full rounded-xl bg-[#00B39D] px-4 py-3.5 text-base font-semibold text-white disabled:opacity-60 inline-flex items-center justify-center gap-2">
        {salvando && <Loader2 className="h-4 w-4 animate-spin" />} Confirmar
      </button>
    </>
  );
}

// ── PIN (cria na 1ª vez · igual aos outros totens) ───────────────────────────
function PinModal({ modo, onOk, onClose }: { modo: 'setup' | 'exit'; onOk: () => void; onClose: () => void }) {
  const existente = (() => { try { return localStorage.getItem(PIN_KEY) || ''; } catch { return ''; } })();
  const criando = modo === 'setup' || !existente;
  const [pin, setPin] = useState('');
  const [erro, setErro] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);

  function confirmar() {
    if (criando) {
      if (pin.length < 4) { setErro('Crie um PIN de ao menos 4 dígitos'); return; }
      try { localStorage.setItem(PIN_KEY, pin); } catch { /* storage indisponível · segue */ }
      onOk(); return;
    }
    if (pin === existente) onOk();
    else { setErro('PIN incorreto'); setPin(''); }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 px-6" onClick={onClose}>
      <div className="w-full max-w-xs rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-center text-slate-900">{criando ? 'Criar PIN da equipe' : 'PIN da equipe'}</h2>
        <p className="text-xs text-slate-500 text-center mt-1 mb-4">
          {criando ? 'Defina um PIN pra proteger o totem (sair da tela cheia).' : 'Digite o PIN pra sair do totem.'}
        </p>
        <input ref={ref} type="password" inputMode="numeric" value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
          onKeyDown={e => { if (e.key === 'Enter') confirmar(); }}
          className="w-full rounded-xl border border-slate-200 px-4 py-3 text-center text-2xl tracking-widest text-slate-900" />
        {erro && <p className="text-sm text-red-600 text-center mt-2">{erro}</p>}
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm">Cancelar</button>
          <button onClick={confirmar} className="flex-1 rounded-xl bg-[#00B39D] px-4 py-2.5 text-sm font-semibold text-white">OK</button>
        </div>
      </div>
    </div>
  );
}
