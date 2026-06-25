import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { next as nextApi } from '../../api';
import AnimatedBackground from './AnimatedBackground';
import { usePublicTheme, PublicThemeToggle } from './publicTheme';

// QR self-service no fim do Next (Fase 2a): a pessoa abre pelo QR (token da turma),
// acha o nome dela e escolhe pra onde quer ir. Devocional fica pra Fase 2b.
type Pessoa = { id: string; nome: string; ja: { grupos: boolean; voluntarios: boolean; batismo: boolean } };

const DESTINOS = [
  { v: 'grupos',      l: 'Grupos',      emoji: '👥', desc: 'Fazer parte de um grupo' },
  { v: 'voluntarios', l: 'Voluntários', emoji: '🙌', desc: 'Servir num ministério' },
  { v: 'batismo',     l: 'Batismo',     emoji: '💧', desc: 'Quero me batizar' },
] as const;

export default function NextDirecionar() {
  usePublicTheme();
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [turma, setTurma] = useState('');
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [busca, setBusca] = useState('');
  const [sel, setSel] = useState<Pessoa | null>(null);
  const [destinos, setDestinos] = useState<Record<string, boolean>>({});
  const [salvando, setSalvando] = useState(false);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    if (!token) { setErro('Link inválido.'); setLoading(false); return; }
    nextApi.publicDirecionarInfo(token)
      .then((r: any) => { setTurma(r.turma?.nome || 'Next'); setPessoas(r.pessoas || []); })
      .catch((e: any) => setErro(e?.message || 'Link inválido ou expirado.'))
      .finally(() => setLoading(false));
  }, [token]);

  const filtradas = busca.trim()
    ? pessoas.filter(p => p.nome.toLowerCase().includes(busca.trim().toLowerCase()))
    : pessoas;

  async function enviar() {
    if (!sel) return;
    const escolhidos = DESTINOS.filter(d => destinos[d.v] && !sel.ja[d.v]).map(d => d.v);
    if (escolhidos.length === 0) { setErro('Escolha pra onde você quer ir.'); return; }
    setSalvando(true); setErro('');
    try {
      await nextApi.publicDirecionar(token!, { matricula_id: sel.id, destinos: escolhidos });
      setPronto(true);
    } catch (e: any) { setErro(e?.message || 'Não deu pra enviar. Tente de novo.'); }
    finally { setSalvando(false); }
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      <AnimatedBackground />
      <div className="absolute top-4 right-4 z-20"><PublicThemeToggle /></div>
      <div className="relative z-10 mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-5 py-10">
        <div className="w-full rounded-3xl border border-border bg-card/90 backdrop-blur p-6 shadow-xl">
          <div className="text-center mb-5">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{turma || 'Next'}</p>
            <h1 className="text-2xl font-bold mt-1">Qual seu próximo passo?</h1>
          </div>

          {loading ? (
            <p className="text-center text-sm text-muted-foreground py-10">Carregando…</p>
          ) : erro && !pessoas.length ? (
            <p className="text-center text-sm text-destructive py-10">{erro}</p>
          ) : pronto ? (
            <div className="text-center py-8 space-y-2">
              <div className="text-5xl">🎉</div>
              <h2 className="text-xl font-semibold">Tudo certo, {sel?.nome?.split(' ')[0]}!</h2>
              <p className="text-sm text-muted-foreground">Anotamos seu próximo passo. Logo a gente fala com você. 💚</p>
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
                  <p className="text-center text-sm text-muted-foreground py-6">Ninguém encontrado.</p>
                ) : filtradas.map(p => (
                  <button key={p.id} onClick={() => { setSel(p); setErro(''); }}
                    className="w-full text-left rounded-xl border border-border bg-background px-4 py-3 hover:border-primary transition-colors">
                    {p.nome}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <button onClick={() => { setSel(null); setDestinos({}); setErro(''); }} className="text-xs text-muted-foreground mb-3 hover:underline">← não sou eu</button>
              <p className="text-sm mb-1">Oi, <strong>{sel.nome.split(' ')[0]}</strong>! Pra onde você quer ir?</p>
              <p className="text-xs text-muted-foreground mb-3">Pode marcar mais de um.</p>
              <div className="space-y-2">
                {DESTINOS.map(d => {
                  const feito = sel.ja[d.v];
                  const on = feito || !!destinos[d.v];
                  return (
                    <button key={d.v} disabled={feito}
                      onClick={() => setDestinos(s => ({ ...s, [d.v]: !s[d.v] }))}
                      className={`w-full flex items-center gap-3 rounded-2xl border-2 px-4 py-3.5 text-left transition-colors ${on ? 'border-primary bg-primary/10' : 'border-border bg-background'} ${feito ? 'opacity-60' : ''}`}>
                      <span className="text-2xl">{d.emoji}</span>
                      <span className="flex-1">
                        <span className="block font-semibold">{d.l}</span>
                        <span className="block text-xs text-muted-foreground">{feito ? 'já escolhido' : d.desc}</span>
                      </span>
                      {on && <span className="text-primary text-lg">✓</span>}
                    </button>
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
        <p className="text-[11px] text-muted-foreground mt-4 text-center">CBRio · Next</p>
      </div>
    </div>
  );
}
