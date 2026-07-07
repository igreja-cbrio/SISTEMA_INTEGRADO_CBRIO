import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { next as nextApi, publicVoluntariado } from '../../api';
import AnimatedBackground from './AnimatedBackground';
import { usePublicTheme, PublicThemeToggle } from './publicTheme';

// ============================================================================
// Totem do NEXT (tablet) · 2026-07-07
//   · Self-service (pessoa · ao final do NEXT): acha o nome (só quem fez check-in
//     hoje), escolhe Servir (com áreas do formulário) / Batismo / Grupo → cai no
//     módulo certo com tag "veio do NEXT" (dedup na base).
//   · Check-in (voluntário · na hora do NEXT · atrás de PIN): marca presença de
//     quem chegou + cadastra walk-in (quem veio sem inscrição, cruzando dados).
//   · Modo totem: tela cheia + PIN pra sair/entrar no check-in.
// ============================================================================

type Pessoa = { id: string; nome: string; ja: { grupos: boolean; voluntarios: boolean; batismo: boolean } };
type PresencaPessoa = { id: string; nome: string; presente: boolean; walk_in: boolean };
type Opcao = { id?: string; label: string; area_canonica?: string };

const DESTINOS = [
  { v: 'grupos',      l: 'Grupos',      emoji: '👥', desc: 'Fazer parte de um grupo' },
  { v: 'voluntarios', l: 'Quero servir', emoji: '🙌', desc: 'Servir num ministério' },
  { v: 'batismo',     l: 'Quero me batizar', emoji: '💧', desc: 'Dar esse passo' },
] as const;

const MAX_AREAS = 3;
const PIN_KEY = 'cbrio-next-totem-pin';

export default function NextDirecionar() {
  usePublicTheme();
  const { token } = useParams();

  // modo do totem
  const [modo, setModo] = useState<'self' | 'checkin'>('self');

  // ── self-service ──
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [turma, setTurma] = useState('');
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [busca, setBusca] = useState('');
  const [sel, setSel] = useState<Pessoa | null>(null);
  const [destinos, setDestinos] = useState<Record<string, boolean>>({});
  const [areas, setAreas] = useState<string[]>([]);
  const [opcoes, setOpcoes] = useState<Opcao[]>([]);
  const [salvando, setSalvando] = useState(false);
  const [pronto, setPronto] = useState(false);

  // ── fullscreen / PIN ──
  const [fs, setFs] = useState(false);
  const [pinAsk, setPinAsk] = useState<null | 'checkin' | 'sair'>(null);

  function carregarSelf() {
    if (!token) { setErro('Link inválido.'); setLoading(false); return; }
    setLoading(true);
    nextApi.publicDirecionarInfo(token)
      .then((r: any) => { setTurma(r.turma?.nome || 'NEXT'); setPessoas(r.pessoas || []); setErro(''); })
      .catch((e: any) => setErro(e?.message || 'Link inválido ou expirado.'))
      .finally(() => setLoading(false));
  }

  useEffect(() => { carregarSelf(); }, [token]);
  useEffect(() => {
    publicVoluntariado.formOpcoes().then((o: any) => setOpcoes(Array.isArray(o) ? o : [])).catch(() => setOpcoes([]));
  }, []);

  useEffect(() => {
    const onFs = () => setFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await document.documentElement.requestFullscreen();
    } catch { /* alguns navegadores bloqueiam · ignora */ }
  }

  const filtradas = busca.trim()
    ? pessoas.filter(p => p.nome.toLowerCase().includes(busca.trim().toLowerCase()))
    : pessoas;

  function toggleArea(label: string) {
    setAreas(a => a.includes(label) ? a.filter(x => x !== label) : (a.length >= MAX_AREAS ? a : [...a, label]));
  }

  function voltarLista() { setSel(null); setDestinos({}); setAreas([]); setErro(''); }

  async function enviar() {
    if (!sel) return;
    const escolhidos = DESTINOS.filter(d => destinos[d.v] && !sel.ja[d.v]).map(d => d.v);
    if (escolhidos.length === 0) { setErro('Escolha pra onde você quer ir.'); return; }
    if (escolhidos.includes('voluntarios') && areas.length === 0) {
      setErro('Escolha ao menos uma área pra servir.'); return;
    }
    setSalvando(true); setErro('');
    try {
      await nextApi.publicDirecionar(token!, { matricula_id: sel.id, destinos: escolhidos, areas });
      setPronto(true);
    } catch (e: any) { setErro(e?.message || 'Não deu pra enviar. Tente de novo.'); }
    finally { setSalvando(false); }
  }

  // Reinicia o self-service pra próxima pessoa
  function reiniciar() {
    setPronto(false); setSel(null); setDestinos({}); setAreas([]); setBusca(''); carregarSelf();
  }

  // ── PIN (entra no check-in / sai da tela cheia) ──
  function pedirPin(acao: 'checkin' | 'sair') { setPinAsk(acao); }
  function resolverPin(ok: boolean) {
    const acao = pinAsk; setPinAsk(null);
    if (!ok || !acao) return;
    if (acao === 'checkin') setModo('checkin');
    if (acao === 'sair') { setModo('self'); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      <AnimatedBackground />
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        <PublicThemeToggle />
        <button onClick={toggleFullscreen} title={fs ? 'Sair da tela cheia' : 'Tela cheia'}
          className="rounded-full border border-border bg-card/80 backdrop-blur h-9 w-9 flex items-center justify-center text-sm">
          {fs ? '🗕' : '⛶'}
        </button>
      </div>

      {/* Alterna check-in (staff) — canto inferior, discreto, atrás de PIN */}
      <div className="absolute bottom-3 left-3 z-20">
        {modo === 'self' ? (
          <button onClick={() => pedirPin('checkin')}
            className="text-[11px] text-muted-foreground/70 hover:text-foreground border border-border/60 rounded-full px-3 py-1.5 bg-card/60 backdrop-blur">
            🔒 Check-in (equipe)
          </button>
        ) : (
          <button onClick={() => { setModo('self'); reiniciar(); }}
            className="text-[11px] text-muted-foreground hover:text-foreground border border-border rounded-full px-3 py-1.5 bg-card/70 backdrop-blur">
            ← Voltar pro totem
          </button>
        )}
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-5 py-10">
        {modo === 'checkin'
          ? <CheckinPanel token={token!} onWalkinDone={() => {}} />
          : (
          <div className="w-full rounded-3xl border border-border bg-card/90 backdrop-blur p-6 shadow-xl">
            <div className="text-center mb-5">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">{turma || 'NEXT'}</p>
              <h1 className="text-2xl font-bold mt-1">Qual seu próximo passo?</h1>
            </div>

            {loading ? (
              <p className="text-center text-sm text-muted-foreground py-10">Carregando…</p>
            ) : erro && !pessoas.length ? (
              <p className="text-center text-sm text-destructive py-10">{erro}</p>
            ) : pronto ? (
              <div className="text-center py-8 space-y-3">
                <div className="text-5xl">🎉</div>
                <h2 className="text-xl font-semibold">Tudo certo, {sel?.nome?.split(' ')[0]}!</h2>
                <p className="text-sm text-muted-foreground">Anotamos seu próximo passo. Logo a gente fala com você. 💚</p>
                <button onClick={reiniciar} className="mt-2 w-full rounded-xl border border-border px-4 py-3 text-sm font-medium">
                  Próxima pessoa
                </button>
              </div>
            ) : !sel ? (
              <>
                <p className="text-sm text-muted-foreground mb-3 text-center">Ache seu nome na lista:</p>
                <input
                  value={busca} onChange={e => setBusca(e.target.value)} placeholder="Digite seu nome"
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base mb-3"
                  autoFocus
                />
                <div className="max-h-[46vh] overflow-y-auto space-y-1.5">
                  {filtradas.length === 0 ? (
                    <p className="text-center text-sm text-muted-foreground py-6">
                      {pessoas.length === 0 ? 'Faça seu check-in com a equipe primeiro. 🙂' : 'Ninguém encontrado.'}
                    </p>
                  ) : filtradas.map(p => (
                    <button key={p.id} onClick={() => { setSel(p); setErro(''); }}
                      className="w-full text-left rounded-xl border border-border bg-background px-4 py-3.5 text-base hover:border-primary transition-colors">
                      {p.nome}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <>
                <button onClick={voltarLista} className="text-xs text-muted-foreground mb-3 hover:underline">← não sou eu</button>
                <p className="text-sm mb-1">Oi, <strong>{sel.nome.split(' ')[0]}</strong>! Pra onde você quer ir?</p>
                <p className="text-xs text-muted-foreground mb-3">Pode marcar mais de um.</p>
                <div className="space-y-2">
                  {DESTINOS.map(d => {
                    const feito = sel.ja[d.v];
                    const on = feito || !!destinos[d.v];
                    return (
                      <div key={d.v}>
                        <button disabled={feito}
                          onClick={() => setDestinos(s => ({ ...s, [d.v]: !s[d.v] }))}
                          className={`w-full flex items-center gap-3 rounded-2xl border-2 px-4 py-3.5 text-left transition-colors ${on ? 'border-primary bg-primary/10' : 'border-border bg-background'} ${feito ? 'opacity-60' : ''}`}>
                          <span className="text-2xl">{d.emoji}</span>
                          <span className="flex-1">
                            <span className="block font-semibold">{d.l}</span>
                            <span className="block text-xs text-muted-foreground">{feito ? 'já escolhido' : d.desc}</span>
                          </span>
                          {on && <span className="text-primary text-lg">✓</span>}
                        </button>

                        {/* Áreas pra servir — aparecem ao escolher "Quero servir" */}
                        {d.v === 'voluntarios' && !feito && destinos.voluntarios && (
                          <div className="mt-2 rounded-2xl border border-border bg-background/60 p-3">
                            <p className="text-xs text-muted-foreground mb-2">Em qual área você quer servir? (até {MAX_AREAS})</p>
                            <div className="flex flex-wrap gap-1.5">
                              {opcoes.map(o => {
                                const chk = areas.includes(o.label);
                                const cheio = !chk && areas.length >= MAX_AREAS;
                                return (
                                  <button key={o.label} disabled={cheio} onClick={() => toggleArea(o.label)}
                                    className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${chk ? 'border-primary bg-primary/15 text-foreground' : 'border-border bg-background text-muted-foreground'} ${cheio ? 'opacity-40' : ''}`}>
                                    {o.label}
                                  </button>
                                );
                              })}
                              {opcoes.length === 0 && <span className="text-xs text-muted-foreground">Carregando áreas…</span>}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                {erro && <p className="text-sm text-destructive mt-3 text-center">{erro}</p>}
                <button onClick={enviar} disabled={salvando}
                  className="mt-5 w-full rounded-xl bg-primary px-4 py-3.5 text-base font-semibold text-primary-foreground disabled:opacity-60">
                  {salvando ? 'Enviando…' : 'Confirmar'}
                </button>
              </>
            )}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground mt-4 text-center">CBRio · NEXT</p>
      </div>

      {pinAsk && <PinModal onResolve={resolverPin} />}
    </div>
  );
}

// ── Painel de check-in (equipe) ─────────────────────────────────────────────
function CheckinPanel({ token }: { token: string; onWalkinDone: () => void }) {
  const [loading, setLoading] = useState(true);
  const [turma, setTurma] = useState('');
  const [pessoas, setPessoas] = useState<PresencaPessoa[]>([]);
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState('');
  const [novo, setNovo] = useState(false);

  function carregar() {
    setLoading(true);
    nextApi.publicCheckinInfo(token)
      .then((r: any) => { setTurma(r.turma?.nome || 'NEXT'); setPessoas(r.pessoas || []); setErro(''); })
      .catch((e: any) => setErro(e?.message || 'Erro ao carregar')).finally(() => setLoading(false));
  }
  useEffect(() => { carregar(); }, [token]);

  async function toggle(p: PresencaPessoa) {
    // otimista
    setPessoas(ps => ps.map(x => x.id === p.id ? { ...x, presente: !x.presente } : x));
    try { await nextApi.publicCheckin(token, { matricula_id: p.id, presente: !p.presente }); }
    catch { setPessoas(ps => ps.map(x => x.id === p.id ? { ...x, presente: p.presente } : x)); }
  }

  const filtradas = busca.trim()
    ? pessoas.filter(p => p.nome.toLowerCase().includes(busca.trim().toLowerCase()))
    : pessoas;
  const presentes = pessoas.filter(p => p.presente).length;

  return (
    <div className="w-full rounded-3xl border border-border bg-card/90 backdrop-blur p-6 shadow-xl">
      <div className="text-center mb-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{turma || 'NEXT'} · Check-in</p>
        <h1 className="text-2xl font-bold mt-1">Lista de presença</h1>
        <p className="text-sm text-muted-foreground mt-1">{presentes} presente{presentes !== 1 ? 's' : ''} de {pessoas.length}</p>
      </div>

      {novo ? (
        <WalkinForm token={token} onCancel={() => setNovo(false)} onDone={() => { setNovo(false); carregar(); }} />
      ) : (
        <>
          <div className="flex gap-2 mb-3">
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar nome"
              className="flex-1 rounded-xl border border-border bg-background px-4 py-3 text-base" />
            <button onClick={() => setNovo(true)} className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground whitespace-nowrap">
              + Chegou
            </button>
          </div>
          {loading ? (
            <p className="text-center text-sm text-muted-foreground py-8">Carregando…</p>
          ) : erro ? (
            <p className="text-center text-sm text-destructive py-8">{erro}</p>
          ) : (
            <div className="max-h-[52vh] overflow-y-auto space-y-1.5">
              {filtradas.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-6">
                  {pessoas.length === 0 ? 'Ninguém na turma ainda. Use "+ Chegou".' : 'Ninguém encontrado.'}
                </p>
              ) : filtradas.map(p => (
                <button key={p.id} onClick={() => toggle(p)}
                  className={`w-full flex items-center gap-3 rounded-xl border-2 px-4 py-3.5 text-left transition-colors ${p.presente ? 'border-primary bg-primary/10' : 'border-border bg-background'}`}>
                  <span className={`h-6 w-6 rounded-md flex items-center justify-center text-sm ${p.presente ? 'bg-primary text-primary-foreground' : 'border border-border'}`}>
                    {p.presente ? '✓' : ''}
                  </span>
                  <span className="flex-1 text-base">{p.nome}</span>
                  {p.walk_in && <span className="text-[10px] text-muted-foreground rounded-full border border-border px-2 py-0.5">chegou</span>}
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Cadastro rápido de quem chegou (walk-in · dedup no backend) ──────────────
function WalkinForm({ token, onCancel, onDone }: { token: string; onCancel: () => void; onDone: () => void }) {
  const [f, setF] = useState({ nome: '', sobrenome: '', telefone: '', cpf: '', email: '', data_nascimento: '' });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState('');
  const set = (k: string, v: string) => setF(s => ({ ...s, [k]: v }));

  async function salvar() {
    if (f.nome.trim().length < 2) { setErro('Informe o nome.'); return; }
    setSalvando(true); setErro('');
    try { await nextApi.publicCheckinWalkin(token, f); onDone(); }
    catch (e: any) { setErro(e?.message || 'Não deu pra salvar.'); }
    finally { setSalvando(false); }
  }

  return (
    <div className="space-y-2.5">
      <p className="text-sm text-muted-foreground">Quem chegou (cruzamos com a base pra não duplicar):</p>
      <div className="flex gap-2">
        <input value={f.nome} onChange={e => set('nome', e.target.value)} placeholder="Nome" autoFocus
          className="flex-1 rounded-xl border border-border bg-background px-4 py-3 text-base" />
        <input value={f.sobrenome} onChange={e => set('sobrenome', e.target.value)} placeholder="Sobrenome"
          className="flex-1 rounded-xl border border-border bg-background px-4 py-3 text-base" />
      </div>
      <input value={f.telefone} onChange={e => set('telefone', e.target.value)} placeholder="Telefone (WhatsApp)" inputMode="tel"
        className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base" />
      <input value={f.cpf} onChange={e => set('cpf', e.target.value)} placeholder="CPF (opcional)" inputMode="numeric"
        className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base" />
      <input value={f.email} onChange={e => set('email', e.target.value)} placeholder="E-mail (opcional)" inputMode="email"
        className="w-full rounded-xl border border-border bg-background px-4 py-3 text-base" />
      <label className="block text-xs text-muted-foreground">Nascimento (opcional)
        <input type="date" value={f.data_nascimento} onChange={e => set('data_nascimento', e.target.value)}
          className="mt-1 w-full rounded-xl border border-border bg-background px-4 py-3 text-base text-foreground" />
      </label>
      {erro && <p className="text-sm text-destructive text-center">{erro}</p>}
      <div className="flex gap-2 pt-1">
        <button onClick={onCancel} className="flex-1 rounded-xl border border-border px-4 py-3 text-sm font-medium">Cancelar</button>
        <button onClick={salvar} disabled={salvando}
          className="flex-1 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60">
          {salvando ? 'Salvando…' : 'Check-in'}
        </button>
      </div>
    </div>
  );
}

// ── PIN (cria na 1ª vez · igual aos outros totens) ──────────────────────────
function PinModal({ onResolve }: { onResolve: (ok: boolean) => void }) {
  const existente = typeof window !== 'undefined' ? localStorage.getItem(PIN_KEY) : null;
  const [pin, setPin] = useState('');
  const [erro, setErro] = useState('');
  const criando = !existente;
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);

  function confirmar() {
    if (criando) {
      if (pin.length < 4) { setErro('Crie um PIN de ao menos 4 dígitos.'); return; }
      localStorage.setItem(PIN_KEY, pin); onResolve(true); return;
    }
    if (pin === existente) onResolve(true);
    else { setErro('PIN incorreto.'); setPin(''); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6" onClick={() => onResolve(false)}>
      <div className="w-full max-w-xs rounded-2xl border border-border bg-card p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-center">{criando ? 'Criar PIN da equipe' : 'PIN da equipe'}</h2>
        <p className="text-xs text-muted-foreground text-center mt-1 mb-4">
          {criando ? 'Defina um PIN pra proteger o check-in.' : 'Digite o PIN pra acessar o check-in.'}
        </p>
        <input ref={ref} type="password" inputMode="numeric" value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g, ''))}
          onKeyDown={e => { if (e.key === 'Enter') confirmar(); }}
          className="w-full rounded-xl border border-border bg-background px-4 py-3 text-center text-2xl tracking-widest" />
        {erro && <p className="text-sm text-destructive text-center mt-2">{erro}</p>}
        <div className="flex gap-2 mt-4">
          <button onClick={() => onResolve(false)} className="flex-1 rounded-xl border border-border px-4 py-2.5 text-sm">Cancelar</button>
          <button onClick={confirmar} className="flex-1 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground">OK</button>
        </div>
      </div>
    </div>
  );
}
