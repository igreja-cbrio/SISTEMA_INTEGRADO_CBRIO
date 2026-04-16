import { Activity, Users, DollarSign, Package, Truck, Bell, CalendarDays, FolderKanban, Tag, HandHelping, BookOpen, ClipboardList, BrainCircuit, UsersRound } from 'lucide-react';
import { C } from '../MotionShell';

const kpis = [
  { label: 'Colaboradores', value: '12', color: '#8b5cf6' },
  { label: 'Saldo Total', value: 'R$ 48.200', color: '#10b981' },
  { label: 'Bens Cadastrados', value: '134', color: '#6366f1' },
  { label: 'Pedidos Pendentes', value: '3', color: '#ef4444' },
  { label: 'Notificações', value: '5', color: C.primary },
];

const modules = [
  { label: 'RH', icon: Users, color: '#8b5cf6' },
  { label: 'Financeiro', icon: DollarSign, color: '#10b981' },
  { label: 'Eventos', icon: CalendarDays, color: '#3b82f6' },
  { label: 'Projetos', icon: FolderKanban, color: '#f59e0b' },
  { label: 'Logística', icon: Truck, color: '#ef4444' },
  { label: 'Patrimônio', icon: Tag, color: '#6366f1' },
  { label: 'Voluntariado', icon: HandHelping, color: C.primary },
  { label: 'Membresia', icon: BookOpen, color: C.primary },
  { label: 'Solicitações', icon: ClipboardList, color: '#ec4899' },
];

const notifs = [
  { mod: 'Financeiro', modColor: '#10b981', text: 'Conta vencendo amanhã — R$ 1.200', time: '5min', sev: '#f59e0b' },
  { mod: 'Eventos', modColor: '#3b82f6', text: 'Conferência de Jovens: fase Design pendente', time: '18min', sev: C.primary },
  { mod: 'RH', modColor: '#8b5cf6', text: 'Férias de Ana Paula aprovadas', time: '1h', sev: C.primary },
];

export default function DashboardScene() {
  return (
    <div style={{ padding: '22px 28px', background: C.bg, height: '100%', overflowY: 'auto' }}>
      <p style={{ fontSize: 12, color: C.text3, marginBottom: 3 }}>Quinta, 16 de Abril de 2026</p>
      <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, marginBottom: 22 }}>Bom dia, João</h1>

      {/* KPIs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
        <Activity size={14} color={C.primary} />
        <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Visão Geral</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10, marginBottom: 28 }}>
        {kpis.map(k => (
          <div key={k.label} style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 16px' }}>
            <p style={{ fontSize: 11, color: C.text2, marginBottom: 8 }}>{k.label}</p>
            <p style={{ fontSize: 20, fontWeight: 700, color: C.text }}>{k.value}</p>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
        {/* Módulos */}
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 12 }}>Acesso Rápido</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
            {modules.map(m => {
              const Icon = m.icon;
              return (
                <div key={m.label} style={{
                  background: C.card, border: `1px solid ${C.border}`, borderRadius: 10,
                  padding: '14px 12px', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: `${m.color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <Icon size={15} color={m.color} />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 500, color: C.text2 }}>{m.label}</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Notificações */}
        <div>
          <p style={{ fontSize: 13, fontWeight: 600, color: C.text, marginBottom: 12 }}>Notificações</p>
          <div style={{ background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
            {notifs.map((n, i) => (
              <div key={i} style={{
                padding: '12px 14px', borderLeft: `3px solid ${n.sev}`,
                borderBottom: i < notifs.length - 1 ? `1px solid ${C.border}` : 'none',
                background: C.input, cursor: 'pointer',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 7px', borderRadius: 4, background: `${n.modColor}15`, color: n.modColor }}>{n.mod}</span>
                  <span style={{ fontSize: 10, color: C.text3 }}>{n.time}</span>
                </div>
                <p style={{ fontSize: 12, color: C.text }}>{n.text}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
