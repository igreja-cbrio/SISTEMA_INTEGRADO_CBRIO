// =====================================================================
// Stepper horizontal de fases (círculos + abreviação + nome), no mesmo
// visual do stepper de /projetos (Projetos.jsx:1584-1640 · aba Fases).
// Extraído como componente reusável para o módulo Execução do
// Planejamento (fases de projeto E de evento), que até aqui só tinha o
// Kanban por status (FasesKanban.jsx) — o pedido foi ver também esta
// visualização de progresso ao longo das fases, como em /projetos.
//
// Genérico de propósito: recebe `fases` já resolvidas em
// {id, nome, abrev, status}. Quem monta a lista (projeto: 7 fases fixas
// Concepção..Encerramento · evento: N fases do ciclo criativo) decide
// nome/abreviação; este componente só desenha.
// =====================================================================
const CORES = {
  concluida: '#10b981', 'em-andamento': '#3b82f6', bloqueada: '#ef4444', pendente: 'var(--cbrio-text3)',
};
const ROTULOS_STATUS = {
  concluida: 'concluída', 'em-andamento': 'em andamento', bloqueada: 'bloqueada', pendente: 'vazia',
};

export default function FaseStepper({ fases, selecionada, onSelecionar }) {
  if (!fases || fases.length === 0) return null;

  return (
    <div style={{ overflowX: 'auto', padding: '10px 4px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: 0, minWidth: 'max-content' }}>
        {fases.map((f, i) => {
          const status = f.status || 'pendente';
          const cor = CORES[status] || CORES.pendente;
          const isSelected = selecionada === f.id;
          const clicavel = typeof onSelecionar === 'function';

          return (
            <div key={f.id ?? i} style={{ display: 'flex', alignItems: 'flex-start' }}>
              <div
                role={clicavel ? 'button' : undefined}
                tabIndex={clicavel ? 0 : undefined}
                onClick={clicavel ? () => onSelecionar(isSelected ? null : f.id) : undefined}
                style={{
                  display: 'flex', flexDirection: 'column', alignItems: 'center',
                  cursor: clicavel ? 'pointer' : 'default', padding: '0 6px', width: 92,
                }}
              >
                <div style={{
                  width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: status === 'pendente' ? 'var(--cbrio-bg)' : `${cor}18`,
                  border: `3px solid ${cor}`,
                  boxShadow: isSelected ? `0 0 0 4px ${cor}40` : 'none',
                  transform: isSelected ? 'scale(1.08)' : 'scale(1)',
                  transition: 'all .15s',
                }}>
                  {status === 'concluida'
                    ? <span style={{ fontSize: 18, color: cor, fontWeight: 700 }}>{'✓'}</span>
                    : <span style={{ fontSize: 13, fontWeight: 700, color: cor }}>{i + 1}</span>}
                </div>
                <div style={{
                  fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: isSelected ? cor : (status === 'pendente' ? 'var(--cbrio-text3)' : cor),
                  marginTop: 6, textAlign: 'center',
                }}>
                  {f.abrev}
                </div>
                <div style={{
                  fontSize: 9, fontWeight: 500, color: 'var(--cbrio-text3)', marginTop: 1, textAlign: 'center', maxWidth: 88,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {f.nome}
                </div>
                <div style={{ fontSize: 8.5, color: 'var(--cbrio-text3)', marginTop: 1, textAlign: 'center' }}>
                  {ROTULOS_STATUS[status]}
                </div>
              </div>
              {i < fases.length - 1 && (
                <div style={{
                  width: 28, height: 3, background: status === 'concluida' ? CORES.concluida : 'var(--hairline)',
                  margin: '20px 0 0', borderRadius: 2, flexShrink: 0,
                }} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
