import { useState, useEffect } from 'react';
import { financeiroV2 } from '../../../api';
import { Button } from '../../../components/ui/button';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', primary: '#00B39D', primaryBg: '#00B39D18',
  text: 'var(--cbrio-text)', text2: 'var(--cbrio-text2)', text3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', green: '#10b981', greenBg: '#10b98118',
  red: '#ef4444', redBg: '#ef444418', amber: '#f59e0b', amberBg: '#f59e0b18',
};

export default function DashboardSemanal() {
  const [data, setData] = useState(null);
  const [semana, setSemana] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    financeiroV2.dashboard.semana(semana)
      .then(setData)
      .finally(() => setLoading(false));
  }, [semana]);

  const navegar = (dias) => {
    const d = new Date(semana);
    d.setDate(d.getDate() + dias);
    setSemana(d.toISOString().slice(0, 10));
  };

  if (loading || !data) {
    return <div style={{ color: C.text2, padding: 24 }}>Carregando...</div>;
  }

  return (
    <div>
      {/* Header de navegacao */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: C.card, padding: '12px 16px', borderRadius: 8, marginBottom: 16,
        border: `1px solid ${C.border}`,
      }}>
        <Button variant="outline" onClick={() => navegar(-7)}>← Semana anterior</Button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
            Semana qua-ter · {data.semana?.label}
          </div>
          <div style={{ fontSize: 11, color: C.text3 }}>
            {data.semana?.inicio} a {data.semana?.fim}
          </div>
        </div>
        <Button variant="outline" onClick={() => navegar(7)}>Proxima semana →</Button>
      </div>

      {/* Resumo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 24 }}>
        <StatCard label="Receitas" value={data.receitas} color={C.green} bg={C.greenBg} />
        <StatCard label="Despesas" value={data.despesas} color={C.red} bg={C.redBg} />
        <StatCard label="Resultado" value={data.resultado} color={data.resultado >= 0 ? C.green : C.red}
          bg={data.resultado >= 0 ? C.greenBg : C.redBg} />
        <StatCard label="Lancamentos" value={data.total_lancamentos} format="qtd" />
      </div>

      {/* Por culto */}
      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 12, color: C.text }}>
        Receita por culto
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
        {data.cultos.map(c => (
          <div key={c.slug}
            style={{
              background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16,
            }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 6 }}>
              {c.nome}
            </div>
            <div style={{ fontSize: 20, fontWeight: 800, color: C.primary, marginBottom: 12 }}>
              R$ {c.total.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.text2, marginBottom: 4 }}>
              <span>Dizimo</span>
              <strong style={{ color: C.text }}>R$ {c.dizimo.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.text2 }}>
              <span>Oferta</span>
              <strong style={{ color: C.text }}>R$ {c.oferta.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
            </div>
          </div>
        ))}
        {data.cultos.length === 0 && (
          <div style={{ gridColumn: '1/-1', padding: 24, textAlign: 'center', color: C.text3, background: C.card, borderRadius: 8 }}>
            Nenhuma receita classificada por culto nesta semana
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({ label, value, color = '#00B39D', bg = '#00B39D18', format = 'currency' }) {
  return (
    <div style={{
      background: C.card, border: `1px solid ${C.border}`, borderRadius: 10, padding: 16,
    }}>
      <div style={{ fontSize: 11, color: C.text2, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color, marginTop: 6 }}>
        {format === 'currency'
          ? `R$ ${Number(value || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
          : Number(value || 0).toLocaleString('pt-BR')}
      </div>
    </div>
  );
}
