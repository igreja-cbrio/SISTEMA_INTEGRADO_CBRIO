// ============================================================================
// EmptyState · placeholder pra listas vazias com mensagem + CTA opcional
//
// Uso:
//   <EmptyState
//     tom="positivo"             // 'positivo' | 'neutro' | 'alerta'
//     icone={CheckCircle2}
//     titulo="Tudo em dia"
//     mensagem="Nenhum lider com pendencia neste ciclo."
//   />
//
//   <EmptyState
//     tom="neutro"
//     icone={Database}
//     titulo="Nenhum dado registrado"
//     mensagem="Comece registrando o primeiro dado da sua area."
//     cta={{ label: 'Registrar dado', onClick: () => setEditando({}) }}
//   />
// ============================================================================

const TOM_CORES = {
  positivo: { cor: '#10B981', bg: '#10B98118' },
  neutro:   { cor: '#9CA3AF', bg: '#9CA3AF18' },
  alerta:   { cor: '#F59E0B', bg: '#F59E0B18' },
};

export default function EmptyState({
  tom = 'neutro',
  icone: Icone,
  titulo,
  mensagem,
  cta,           // { label, onClick }
  compacto = false,
}) {
  const { cor, bg } = TOM_CORES[tom] || TOM_CORES.neutro;

  return (
    <div style={{
      padding: compacto ? '20px 16px' : '32px 20px',
      textAlign: 'center',
      borderRadius: 8,
      background: 'var(--cbrio-input-bg)',
      border: '1px dashed var(--cbrio-border)',
    }}>
      {Icone && (
        <div style={{
          width: compacto ? 36 : 48,
          height: compacto ? 36 : 48,
          borderRadius: '50%',
          background: bg,
          margin: '0 auto 12px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Icone size={compacto ? 18 : 22} style={{ color: cor }} />
        </div>
      )}
      {titulo && (
        <div style={{
          fontSize: compacto ? 13 : 14,
          fontWeight: 700,
          color: 'var(--cbrio-text)',
          marginBottom: 4,
        }}>
          {titulo}
        </div>
      )}
      {mensagem && (
        <div style={{
          fontSize: compacto ? 11 : 12,
          color: 'var(--cbrio-text3)',
          lineHeight: 1.5,
          maxWidth: 360,
          margin: '0 auto',
        }}>
          {mensagem}
        </div>
      )}
      {cta && (
        <button
          onClick={cta.onClick}
          style={{
            marginTop: 14,
            padding: '8px 16px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
            background: '#00B39D',
            color: '#fff',
            border: 'none',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          {cta.label}
        </button>
      )}
    </div>
  );
}
