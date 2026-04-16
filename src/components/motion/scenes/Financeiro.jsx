import { C } from '../MotionShell';

const txs = [
  { desc: 'Dízimos — Domingo 13/04', cat: 'Dízimos', type: 'entrada', val: '+R$ 8.400', date: '13 Abr', color: '#10b981' },
  { desc: 'Fornecedor Gráfica CBRio', cat: 'Marketing', type: 'saída', val: '-R$ 1.200', date: '12 Abr', color: '#ef4444' },
  { desc: 'Oferta Especial — Missões', cat: 'Ofertas', type: 'entrada', val: '+R$ 3.100', date: '10 Abr', color: '#10b981' },
  { desc: 'Manutenção de Ar Condicionado', cat: 'Manutenção', type: 'saída', val: '-R$ 850', date: '09 Abr', color: '#ef4444' },
  { desc: 'Dízimos — Domingo 06/04', cat: 'Dízimos', type: 'entrada', val: '+R$ 7.950', date: '06 Abr', color: '#10b981' },
];

export default function FinanceiroScene() {
  return (
    <div style={{ padding: '22px 28px', background: C.bg, height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text }}>Financeiro</h1>
          <p style={{ fontSize: 13, color: C.text2, marginTop: 2 }}>Controle de receitas e despesas</p>
        </div>
        <button style={{ padding: '8px 16px', borderRadius: 8, background: C.primary, color: '#000', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          + Nova Transação
        </button>
      </div>

      {/* Saldo cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Saldo Total', value: 'R$ 48.200', color: '#10b981' },
          { label: 'Entradas (mês)', value: 'R$ 19.450', color: '#10b981' },
          { label: 'Saídas (mês)', value: 'R$ 8.240', color: '#ef4444' },
        ].map(k => (
          <div key={k.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '16px 18px' }}>
            <p style={{ fontSize: 11, color: C.text3, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{k.label}</p>
            <p style={{ fontSize: 22, fontWeight: 700, color: k.color }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Tabela de transações */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>Transações Recentes</span>
          <span style={{ fontSize: 12, color: C.primary, cursor: 'pointer' }}>Ver todas →</span>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#111' }}>
              {['Descrição', 'Categoria', 'Tipo', 'Valor', 'Data'].map(h => (
                <th key={h} style={{ padding: '9px 16px', fontSize: 11, fontWeight: 700, color: C.text3, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {txs.map((t, i) => (
              <tr key={i} style={{ borderBottom: i < txs.length - 1 ? `1px solid ${C.border}` : 'none', cursor: 'pointer' }}>
                <td style={{ padding: '12px 16px', fontSize: 13, color: C.text }}>{t.desc}</td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: C.text2 }}>{t.cat}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: `${t.color}18`, color: t.color }}>{t.type}</span>
                </td>
                <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: t.color }}>{t.val}</td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: C.text3 }}>{t.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
