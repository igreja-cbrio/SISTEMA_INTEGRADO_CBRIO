import { useEffect, useState } from 'react';
import { solicitacoes } from '../../api';
import { Loader2, GitBranch, Info } from 'lucide-react';
import { toast } from 'sonner';
import FluxoCanvas from '../../components/fluxo/FluxoCanvas';

const C = {
  text: 'var(--cbrio-text)', text2: 'var(--cbrio-text2)', text3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', card: 'var(--cbrio-card)', primary: '#00B39D',
};

const CAT_LABEL = {
  compras: 'Compras', servico: 'Serviço', reembolso: 'Reembolso', pagamento: 'Pagamento',
  ti: 'TI', marketing: 'Marketing', producao: 'Produção', infraestrutura: 'Serviços/Infra',
  reserva_espaco: 'Reserva de espaço', ferias: 'Férias', licenca: 'Licença', outro: 'Outro',
};
const label = (c) => CAT_LABEL[c] || c;

export default function SolicitacoesFluxo() {
  const [cats, setCats] = useState([]);
  const [sel, setSel] = useState(null);
  const [fluxo, setFluxo] = useState(null);
  const [loadingCats, setLoadingCats] = useState(true);
  const [loadingFluxo, setLoadingFluxo] = useState(false);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    solicitacoes.fluxos.list()
      .then(rows => {
        const list = Array.isArray(rows) ? rows : [];
        setCats(list);
        if (list.length) setSel(list[0].categoria);
      })
      .catch(e => setErro(e.message))
      .finally(() => setLoadingCats(false));
  }, []);

  useEffect(() => {
    if (!sel) return;
    setLoadingFluxo(true);
    setErro(null);
    solicitacoes.fluxos.get(sel)
      .then(setFluxo)
      .catch(e => { setErro(e.message); setFluxo(null); })
      .finally(() => setLoadingFluxo(false));
  }, [sel]);

  return (
    <div style={{ padding: '24px clamp(16px, 4vw, 32px)', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <GitBranch size={22} color={C.primary} />
        <h1 style={{ fontSize: 22, fontWeight: 800, color: C.text, margin: 0 }}>Fluxo das Solicitações</h1>
      </div>
      <p style={{ color: C.text2, fontSize: 14, margin: '0 0 4px', maxWidth: '70ch' }}>
        O caminho de cada categoria — etapas, para onde vai e quem é responsável. Arraste um nó para
        organizar, use o scroll para dar zoom e clique para ver os detalhes da etapa.
      </p>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12, color: C.text2,
        background: 'var(--cbrio-bg)', border: `1px solid ${C.border}`, borderRadius: 999,
        padding: '4px 12px', marginBottom: 18,
      }}>
        <Info size={13} /> Somente leitura por enquanto — a edição (arrastar para reordenar, criar etapas
        e atribuir responsáveis) chega na próxima etapa.
      </div>

      {loadingCats ? (
        <div style={{ padding: 60, textAlign: 'center' }}><Loader2 className="animate-spin" style={{ margin: '0 auto', color: C.text3 }} /></div>
      ) : cats.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: C.text2, border: `1px dashed ${C.border}`, borderRadius: 14 }}>
          Nenhum fluxo configurado ainda.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
            {cats.map(c => {
              const on = sel === c.categoria;
              return (
                <button key={c.categoria} onClick={() => setSel(c.categoria)}
                  style={{
                    padding: '7px 14px', fontSize: 13, fontWeight: 650, borderRadius: 999, cursor: 'pointer',
                    border: `1px solid ${on ? C.primary : C.border}`,
                    background: on ? C.primary : C.card, color: on ? '#fff' : C.text,
                  }}>
                  {label(c.categoria)}
                </button>
              );
            })}
          </div>

          {erro && (
            <div style={{ padding: '10px 14px', borderRadius: 10, background: '#ef444418', color: '#ef4444', fontSize: 13, marginBottom: 12 }}>
              {erro}
            </div>
          )}

          {loadingFluxo ? (
            <div style={{ padding: 60, textAlign: 'center' }}><Loader2 className="animate-spin" style={{ margin: '0 auto', color: C.text3 }} /></div>
          ) : fluxo ? (
            <>
              <div style={{ fontSize: 13, color: C.text2, marginBottom: 10 }}>
                <b style={{ color: C.text }}>{fluxo.nome || label(fluxo.categoria)}</b>
                <span> · versão {fluxo.versao} · {fluxo.etapas?.length || 0} etapas</span>
                {fluxo.descricao && <div style={{ marginTop: 2 }}>{fluxo.descricao}</div>}
              </div>
              <FluxoCanvas fluxo={fluxo} />
            </>
          ) : !erro && (
            <div style={{ padding: 40, textAlign: 'center', color: C.text2 }}>Selecione uma categoria.</div>
          )}
        </>
      )}
    </div>
  );
}
