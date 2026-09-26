import { G, rotuloCulto, nomeMembro } from './layout';

// Estado da faixa (um culto dentro da etapa): nada em aberto fica verde; em
// aberto é atrasado, desta semana ou previsto conforme a semana dela.
function estadoFaixa(t, semanaAtual) {
  if (!t.aberta) return '';
  if (t.semana == null) return 'fut';
  if (t.semana < semanaAtual) return 'late';
  if (t.semana === semanaAtual) return 'now';
  return 'fut';
}

export default function CartaoEtapa({ no, semanaAtual, membros, onAbrir }) {
  const { etapa, serie } = no;
  const faixas = etapa.faixas || [];
  return (
    <div
      className={`ml-abs ml-node l-ins ${no.fut ? 'fut' : ''}`}
      style={{ left: no.x, top: no.y, width: G.NW, height: no.h }}
    >
      <div className="bar" />
      <div className="body" style={{ height: G.ETAPA_TOPO - 5 }}>
        <span className="ttl">{etapa.nome_fase || 'Etapa'}</span>
        <span className="sub">
          {serie.nome || 'Evento sem nome'} · {faixas.length} {faixas.length === 1 ? 'culto' : 'cultos'}
        </span>
      </div>
      {faixas.map(t => {
        const itens = t.itens || [];
        const feitos = itens.filter(i => i.feito).length;
        const pct = itens.length ? Math.round((feitos / itens.length) * 100) : 0;
        const culto = t.culto && ['cbrio', 'ami', 'kids'].includes(t.culto) ? t.culto : '';
        const resp = nomeMembro(membros, t.atribuido_a);
        return (
          <button
            key={t.id}
            type="button"
            className={`ml-strand ${culto ? `t-${culto}` : ''}`}
            onClick={() => onAbrir(t)}
            title={`${etapa.nome_fase} · ${rotuloCulto(t.culto)}${resp ? ` · ${resp}` : ''}`}
          >
            <span className="ml-tag">{rotuloCulto(t.culto)}</span>
            <span className="mini"><i style={{ width: `${pct}%` }} /></span>
            <span className="ct">{itens.length ? `${feitos}/${itens.length}` : '—'}</span>
            <span className={`dot ${estadoFaixa(t, semanaAtual)}`} />
          </button>
        );
      })}
    </div>
  );
}
