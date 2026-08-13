import { useEffect, useState } from 'react';
import { solicitacoes, permissoes } from '../../api';
import { Loader2, GitBranch, Info } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../contexts/AuthContext';
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
  const { isAdmin } = useAuth();
  const [cats, setCats] = useState([]);
  const [sel, setSel] = useState(null);
  const [fluxo, setFluxo] = useState(null);
  const [andamento, setAndamento] = useState({});
  const [colaboradores, setColaboradores] = useState([]);
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
    if (isAdmin) permissoes.colaboradores().then(d => setColaboradores(d || [])).catch(() => {});
  }, [isAdmin]);

  function carregarFluxo(categoria) {
    setLoadingFluxo(true);
    setErro(null);
    Promise.all([
      solicitacoes.fluxos.get(categoria),
      solicitacoes.fluxos.andamento(categoria).catch(() => ({ porStatus: {} })),
    ])
      .then(([f, a]) => { setFluxo(f); setAndamento(a?.porStatus || {}); })
      .catch(e => { setErro(e.message); setFluxo(null); })
      .finally(() => setLoadingFluxo(false));
  }

  useEffect(() => { if (sel) carregarFluxo(sel); }, [sel]);

  async function salvarResponsaveis(etapaId, profileIds) {
    try {
      await solicitacoes.fluxos.setEtapaResponsaveis(etapaId, profileIds);
      toast.success('Responsáveis da etapa atualizados.');
      carregarFluxo(sel);
    } catch (e) {
      toast.error(e.message || 'Não foi possível salvar os responsáveis.');
    }
  }

  async function criarEtapa() {
    const label = window.prompt('Nome da nova etapa:');
    if (!label || !label.trim()) return;
    try {
      await solicitacoes.fluxos.criarEtapa(sel, { label: label.trim(), tipo: 'etapa', pos_x: 1, pos_y: 2 });
      toast.success('Etapa criada — arraste e ajuste os detalhes.');
      carregarFluxo(sel);
    } catch (e) { toast.error(e.message || 'Não foi possível criar a etapa.'); }
  }
  async function editarEtapa(etapaId, patch) {
    await solicitacoes.fluxos.editarEtapa(etapaId, patch);
    carregarFluxo(sel);
  }
  async function removerEtapa(etapaId) {
    await solicitacoes.fluxos.removerEtapa(etapaId);
    toast.success('Etapa removida.');
    carregarFluxo(sel);
  }
  async function moverEtapa(etapaId, pos_x, pos_y) {
    try { await solicitacoes.fluxos.editarEtapa(etapaId, { pos_x, pos_y }); } catch { /* silencioso */ }
  }
  async function criarTransicao(payload) {
    await solicitacoes.fluxos.criarTransicao(payload);
    carregarFluxo(sel);
  }
  async function removerTransicao(id) {
    await solicitacoes.fluxos.removerTransicao(id);
    carregarFluxo(sel);
  }

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
        <Info size={13} /> Clique numa etapa para atribuir responsáveis. Reordenar etapas e desenhar
        transições chega numa próxima leva.
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 13, color: C.text2 }}>
                  <b style={{ color: C.text }}>{fluxo.nome || label(fluxo.categoria)}</b>
                  <span> · versão {fluxo.versao} · {fluxo.etapas?.length || 0} etapas</span>
                  {fluxo.descricao && <div style={{ marginTop: 2 }}>{fluxo.descricao}</div>}
                </div>
                {isAdmin && (
                  <button onClick={criarEtapa} style={{ padding: '8px 14px', fontSize: 13, fontWeight: 650, borderRadius: 8, border: `1px solid ${C.primary}`, background: C.primary, color: '#fff', cursor: 'pointer' }}>+ Adicionar etapa</button>
                )}
              </div>
              <FluxoCanvas
                fluxo={fluxo}
                andamento={andamento}
                colaboradores={colaboradores}
                editable={isAdmin}
                onSaveResponsaveis={salvarResponsaveis}
                onEditEtapa={editarEtapa}
                onDeleteEtapa={removerEtapa}
                onMoveEtapa={moverEtapa}
                onCreateTransicao={criarTransicao}
                onDeleteTransicao={removerTransicao}
              />
            </>
          ) : !erro && (
            <div style={{ padding: 40, textAlign: 'center', color: C.text2 }}>Selecione uma categoria.</div>
          )}
        </>
      )}
    </div>
  );
}
