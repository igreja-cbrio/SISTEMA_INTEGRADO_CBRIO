import { C } from '../MotionShell';

const events = [
  { name: 'Conferência de Jovens', date: '24 Abr', status: 'Em planejamento', statusC: '#3b82f6', prog: 72, resp: 'Marcos Alves' },
  { name: 'Culto de Domingo', date: '20 Abr', status: 'Concluído', statusC: '#10b981', prog: 100, resp: 'Paulo Lima' },
  { name: 'Retiro de Células', date: '15 Mai', status: 'Rascunho', statusC: '#737373', prog: 18, resp: 'Ana Costa' },
  { name: 'Encontro de Casais', date: '07 Jun', status: 'Em planejamento', statusC: '#3b82f6', prog: 30, resp: 'Carla Nunes' },
];

export default function EventosScene() {
  return (
    <div style={{ padding: '22px 28px', background: C.bg, height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text }}>Eventos</h1>
          <p style={{ fontSize: 13, color: C.text2, marginTop: 2 }}>Gestão de eventos e ciclo criativo</p>
        </div>
        <button style={{ padding: '8px 16px', borderRadius: 8, background: C.primary, color: '#000', border: 'none', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
          + Novo Evento
        </button>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        {['Todos', 'Em planejamento', 'Concluído', 'Rascunho'].map((f, i) => (
          <div key={f} style={{
            padding: '5px 12px', borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: 'pointer',
            background: i === 0 ? `${C.primary}20` : 'transparent',
            color: i === 0 ? C.primary : C.text3,
            border: `1px solid ${i === 0 ? C.primary + '40' : C.border}`,
          }}>{f}</div>
        ))}
      </div>

      {/* Tabela */}
      <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#111' }}>
              {['Evento', 'Data', 'Responsável', 'Status', 'Progresso', ''].map(h => (
                <th key={h} style={{ padding: '10px 16px', fontSize: 11, fontWeight: 700, color: C.text3, textAlign: 'left', textTransform: 'uppercase', letterSpacing: '0.05em', borderBottom: `1px solid ${C.border}` }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {events.map((e, i) => (
              <tr key={e.name} style={{ borderBottom: i < events.length - 1 ? `1px solid ${C.border}` : 'none', cursor: 'pointer' }}>
                <td style={{ padding: '13px 16px', fontSize: 13, color: C.text, fontWeight: 500 }}>{e.name}</td>
                <td style={{ padding: '13px 16px', fontSize: 13, color: C.text2 }}>{e.date}</td>
                <td style={{ padding: '13px 16px', fontSize: 13, color: C.text2 }}>{e.resp}</td>
                <td style={{ padding: '13px 16px' }}>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, background: `${e.statusC}18`, color: e.statusC }}>{e.status}</span>
                </td>
                <td style={{ padding: '13px 16px', width: 140 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ flex: 1, height: 5, background: '#262626', borderRadius: 3, overflow: 'hidden' }}>
                      <div style={{ width: `${e.prog}%`, height: '100%', background: e.statusC, borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 11, color: C.text3, flexShrink: 0 }}>{e.prog}%</span>
                  </div>
                </td>
                <td style={{ padding: '13px 16px' }}>
                  <span style={{ fontSize: 12, color: C.primary, fontWeight: 500, cursor: 'pointer' }}>Ver →</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
