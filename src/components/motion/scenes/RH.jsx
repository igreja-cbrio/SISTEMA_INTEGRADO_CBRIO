import { C } from '../MotionShell';

const employees = [
  { name: 'Ana Paula Santos', role: 'Designer', dept: 'Criativo', contract: 'CLT', status: 'Ativo' },
  { name: 'Carlos Ferreira', role: 'Pastor Auxiliar', dept: 'Ministerial', contract: 'CLT', status: 'Ativo' },
  { name: 'Juliana Melo', role: 'Coordenadora Adm', dept: 'Administrativo', contract: 'CLT', status: 'Férias' },
  { name: 'Rafael Costa', role: 'Técnico de Som', dept: 'Produção', contract: 'PJ', status: 'Ativo' },
  { name: 'Bruna Silveira', role: 'Secretária', dept: 'Administrativo', contract: 'CLT', status: 'Ativo' },
];

const statusColor = { 'Ativo': C.primary, 'Férias': '#f59e0b', 'Afastado': '#ef4444' };
const contractColor = { 'CLT': '#8b5cf6', 'PJ': '#3b82f6' };

export default function RHScene() {
  return (
    <div style={{ padding: '22px 28px', background: C.bg, height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text }}>Recursos Humanos</h1>
          <p style={{ fontSize: 13, color: C.text2, marginTop: 2 }}>Colaboradores e departamento pessoal</p>
        </div>
        <button style={{ padding: '8px 16px', borderRadius: 8, background: C.primary, color: '#000', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          + Novo Colaborador
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 22 }}>
        {[
          { label: 'Total', value: '12', color: '#8b5cf6' },
          { label: 'Em Férias', value: '2', color: '#f59e0b' },
          { label: 'CLT', value: '9', color: '#3b82f6' },
          { label: 'PJ', value: '3', color: '#ec4899' },
        ].map(k => (
          <div key={k.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '13px 16px' }}>
            <p style={{ fontSize: 11, color: C.text3, marginBottom: 6 }}>{k.label}</p>
            <p style={{ fontSize: 20, fontWeight: 700, color: k.color }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Tabela */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#111' }}>
              {['Colaborador', 'Cargo', 'Departamento', 'Contrato', 'Status', ''].map(h => (
                <th key={h} style={{ padding: '9px 16px', fontSize: 11, fontWeight: 700, color: C.text3, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.map((e, i) => (
              <tr key={e.name} style={{ borderBottom: i < employees.length - 1 ? `1px solid ${C.border}` : 'none', cursor: 'pointer' }}>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: '#8b5cf620', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#8b5cf6', flexShrink: 0 }}>
                      {e.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
                    </div>
                    <span style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{e.name}</span>
                  </div>
                </td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: C.text2 }}>{e.role}</td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: C.text2 }}>{e.dept}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: `${contractColor[e.contract]}18`, color: contractColor[e.contract] }}>{e.contract}</span>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: `${statusColor[e.status]}18`, color: statusColor[e.status] }}>{e.status}</span>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ fontSize: 12, color: C.primary, cursor: 'pointer', fontWeight: 500 }}>Ver →</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
