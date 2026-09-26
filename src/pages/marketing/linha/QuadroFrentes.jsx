import { ArrowRight } from 'lucide-react';
import { FRENTES, G, ddmm, rotuloCulto, statusSerie, frenteVisivel } from './layout';

// Os 4 quadrados fixos à esquerda. O quadrado não cresce: abrir um desenha a
// linha para frente (feito pela página), aqui só muda o destaque.
export function BlocosFrentes({ dados, aberta, onToggle }) {
  return FRENTES.map((f, i) => {
    if (!frenteVisivel(f, dados)) return null;
    const fr = dados.frentes?.[f.key] || { status: 'indisponivel' };
    const cor = fr.status === 'vermelho' ? 'red' : fr.status === 'verde' ? 'green' : 'gray';
    let st = '';
    if (fr.status === 'indisponivel') st = 'Indisponível no momento';
    else if (fr.pendentes) {
      const atras = (fr.semanas_atrasadas || []).length;
      st = `${fr.pendentes} em aberto até hoje${atras ? ` · ${atras} ${atras === 1 ? 'semana atrasada' : 'semanas atrasadas'}` : ''}`;
    }
    const exp = aberta === f.key;
    return (
      <button
        key={f.key}
        type="button"
        className={`ml-abs ml-blk ${cor} ${exp ? 'exp' : ''}`}
        aria-expanded={exp}
        style={{ left: G.BX, top: G.TOPY + i * (G.BH + G.BGAP), width: G.BW, height: G.BH }}
        onClick={() => onToggle(exp ? null : f.key)}
      >
        <ArrowRight className="ar h-4 w-4" />
        <span className="k">Frente {i + 1}</span>
        <span className="nm">{f.nome}</span>
        <span className="ds">{f.desc}</span>
        <span className="st">{st}</span>
      </button>
    );
  });
}

export function NotaPerfil({ dados }) {
  const lider = dados.perfil?.lider;
  const ocultas = FRENTES.filter(f => !frenteVisivel(f, dados)).length;
  return (
    <div className="ml-abs ml-note" style={{ left: G.BX, top: G.NOTE_Y - ocultas * (G.BH + G.BGAP), width: G.BW }}>
      {lider
        ? <><b>Visão do líder.</b> Você vê todas as tarefas. Clique num quadrado para abrir a linha da frente e num cartão para ver as subtarefas.</>
        : <><b>Sua visão.</b> Aparece o que está no seu nome ou sob sua responsabilidade. Clique num cartão para ler a demanda inteira.</>}
    </div>
  );
}

// Bloco da série (Institucionais), no meio do caminho entre o quadrado e as etapas.
export function BlocoSerie({ grupo, semanaAtual }) {
  const s = grupo.serie;
  const st = statusSerie(s, semanaAtual);
  const cor = st.pendentes ? 'red' : 'green';
  const prox = s.proxima_pendencia;
  const quando = prox == null ? null : prox < semanaAtual ? 'Atrasada' : prox === semanaAtual ? 'Esta semana' : 'Próxima';
  const etapaProx = prox == null ? null
    : (s.etapas || []).find(e => (e.faixas || []).some(t => t.aberta && t.semana === prox));
  return (
    <div
      className={`ml-abs ml-blk vb ${cor}`}
      style={{ left: G.SBX, top: grupo.blocoY, width: G.SBW, minHeight: G.SBH, cursor: 'default' }}
    >
      <span className="k">{s.data ? `Lançamento ${ddmm(s.data)}` : 'Sem data de lançamento'}</span>
      <span className="nm">{s.nome || 'Evento sem nome'}</span>
      {st.cultos.length > 0 && (
        <span className="vchips">
          {st.cultos.map(c => (
            <span key={c || 'x'} className={st.cultosAtrasados.has(c) ? 'late' : ''}>{rotuloCulto(c)}</span>
          ))}
        </span>
      )}
      {quando && etapaProx && (
        <span className="nx">{quando}: {etapaProx.nome_fase}{prox > 0 ? ` · semana ${prox}` : ''}</span>
      )}
      <span className="st">
        {st.pendentes ? `${st.pendentes} em aberto até hoje` : ''}
      </span>
    </div>
  );
}
