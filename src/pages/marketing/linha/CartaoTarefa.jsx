import { G, ddmm, rotuloCulto, nomeMembro } from './layout';

// Título exibível de uma tarefa. A rotina não tem título próprio: é "a semana
// de alguém", então o nome vem da pessoa.
export function tituloTarefa(t, membros) {
  if (t.frente === 'rot') return `Rotina · ${nomeMembro(membros, t.membro_id) || 'Sem nome'}`;
  return t.titulo || 'Sem título';
}

export function subTarefa(t) {
  if (t.frente === 'rot') {
    const n = (t.itens || []).length;
    return `${n} ${n === 1 ? 'compromisso' : 'compromissos'} na semana`;
  }
  if (t.frente === 'sis') return t.pedido?.titulo || 'Solicitação';
  return t.culto ? rotuloCulto(t.culto) : (t.descricao || 'Demanda interna');
}

export function contagemItens(t, fut) {
  const itens = t.itens || [];
  if (!itens.length) return 'Sem subtarefas';
  const abertos = itens.filter(i => !i.feito).length;
  return fut ? `${itens.length} previstas` : `${abertos} de ${itens.length} em aberto`;
}

const PAPEL = { responsavel: 'Você é responsável', dono: 'Suas subtarefas' };

export default function CartaoTarefa({ no, membros, onAbrir }) {
  const t = no.tarefa;
  const itens = t.itens || [];
  const feitos = itens.filter(i => i.feito).length;
  const pct = itens.length ? Math.round((feitos / itens.length) * 100) : 0;
  const donoId = t.frente === 'rot' ? t.membro_id : t.atribuido_a;
  const dono = nomeMembro(membros, donoId);
  return (
    <button
      type="button"
      className={`ml-abs ml-node l-${t.frente} ${no.fut ? 'fut' : ''}`}
      style={{ left: no.x, top: no.y, width: G.NW, height: no.h }}
      onClick={() => onAbrir(t)}
      title={tituloTarefa(t, membros)}
    >
      <div className="bar" />
      <div className="body">
        <span className="ttl">{tituloTarefa(t, membros)}</span>
        <span className="sub">{subTarefa(t)} · {contagemItens(t, no.fut)}</span>
        {itens.length > 0 && (
          <div className="ml-prog">
            <div className="tr"><i style={{ width: `${pct}%` }} /></div>
            <span>{feitos}/{itens.length}</span>
          </div>
        )}
        <div className="foot">
          {PAPEL[t.papel]
            ? <span className="own">{PAPEL[t.papel]}</span>
            : <span className="who">{dono || 'Sem responsável'}</span>}
          <span>{t.semana === 0 ? 'de antes' : t.prazo ? `prazo ${ddmm(t.prazo)}` : ''}</span>
        </div>
      </div>
    </button>
  );
}
