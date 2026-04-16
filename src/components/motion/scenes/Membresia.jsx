import { Search } from 'lucide-react';
import { C } from '../MotionShell';

const members = [
  { name: 'Ana Paula Santos', email: 'ana.santos@email.com', status: 'Ativo', since: 'Mar 2019', familia: 'Santos' },
  { name: 'Carlos Ferreira Lima', email: 'carlos.lima@email.com', status: 'Ativo', since: 'Jan 2021', familia: 'Lima' },
  { name: 'Juliana Melo Rocha', email: 'juliana.rocha@email.com', status: 'Ativo', since: 'Jun 2020', familia: 'Rocha' },
  { name: 'Pedro Henrique Costa', email: 'pedro.costa@email.com', status: 'Visitante', since: 'Abr 2026', familia: '—' },
  { name: 'Mariana Oliveira', email: 'mariana.ol@email.com', status: 'Ativo', since: 'Set 2018', familia: 'Oliveira' },
];

export default function MembresiaScene() {
  return (
    <div style={{ padding: '22px 28px', background: C.bg, height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text }}>Membresia</h1>
          <p style={{ fontSize: 13, color: C.text2, marginTop: 2 }}>Cadastro de membros e famílias</p>
        </div>
        <button style={{ padding: '8px 16px', borderRadius: 8, background: C.primary, color: '#000', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          + Novo Membro
        </button>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10, marginBottom: 20 }}>
        {[
          { label: 'Membros Ativos', value: '287', color: C.primary },
          { label: 'Famílias', value: '94', color: '#8b5cf6' },
          { label: 'Batizados', value: '198', color: '#3b82f6' },
          { label: 'Visitantes', value: '23', color: '#f59e0b' },
        ].map(k => (
          <div key={k.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '13px 16px' }}>
            <p style={{ fontSize: 11, color: C.text3, marginBottom: 6 }}>{k.label}</p>
            <p style={{ fontSize: 20, fontWeight: 700, color: k.color }}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: C.input, border: `1px solid ${C.border}`, borderRadius: 8, marginBottom: 14, width: 280 }}>
        <Search size={13} color={C.text3} />
        <span style={{ fontSize: 13, color: C.text3 }}>Buscar membro...</span>
      </div>

      {/* Tabela */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#111' }}>
              {['Nome', 'E-mail', 'Família', 'Membro desde', 'Status', ''].map(h => (
                <th key={h} style={{ padding: '9px 16px', fontSize: 11, fontWeight: 700, color: C.text3, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {members.map((m, i) => (
              <tr key={m.name} style={{ borderBottom: i < members.length - 1 ? `1px solid ${C.border}` : 'none', cursor: 'pointer' }}>
                <td style={{ padding: '12px 16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: `${C.primary}25`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: C.primary, flexShrink: 0 }}>
                      {m.name.split(' ').map(w => w[0]).slice(0, 2).join('')}
                    </div>
                    <span style={{ fontSize: 13, color: C.text, fontWeight: 500 }}>{m.name}</span>
                  </div>
                </td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: C.text2 }}>{m.email}</td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: C.text2 }}>{m.familia}</td>
                <td style={{ padding: '12px 16px', fontSize: 12, color: C.text2 }}>{m.since}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 20, background: m.status === 'Ativo' ? `${C.primary}18` : '#f59e0b18', color: m.status === 'Ativo' ? C.primary : '#f59e0b' }}>{m.status}</span>
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
