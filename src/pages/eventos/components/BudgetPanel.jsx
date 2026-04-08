import { useState } from 'react';
import { cycles as api } from '../../../api';

const C = { dark: 'var(--cbrio-text)', t2: 'var(--cbrio-text2)', border: 'var(--cbrio-border)', accent: '#00B39D' };

export default function BudgetPanel({ eventId, budget, onReload }) {
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expense, setExpense] = useState({ descricao: '', valor: '', categoria: 'compras', fornecedor: '' });
  const [saving, setSaving] = useState(false);

  if (!budget) return null;

  const orcamento = Number(budget.orcamento_aprovado);
  const gasto = Number(budget.total_gasto || 0);
  const pct = orcamento > 0 ? Math.min(Math.round((gasto / orcamento) * 100), 150) : 0;
  const excedido = gasto > orcamento && orcamento > 0;

  const handleSubmitExpense = async (e) => {
    e.preventDefault();
    if (!expense.descricao || !expense.valor) return;
    setSaving(true);
    try {
      const res = await api.registerExpense({
        event_id: eventId, descricao: expense.descricao,
        valor: parseFloat(expense.valor), categoria: expense.categoria,
        fornecedor: expense.fornecedor || null,
      });
      if (res.alert) alert(res.message);
      setExpense({ descricao: '', valor: '', categoria: 'compras', fornecedor: '' });
      setShowExpenseForm(false);
      onReload();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ background: 'var(--cbrio-card)', borderRadius: 10, padding: 14, border: `1px solid ${C.border}`, marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.dark }}>Orçamento</span>
        <button onClick={() => setShowExpenseForm(!showExpenseForm)}
          style={{ background: 'none', border: 'none', color: C.accent, cursor: 'pointer', fontWeight: 600, fontSize: 12 }}>
          {showExpenseForm ? 'Cancelar' : '+ Registrar gasto'}
        </button>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.t2, marginBottom: 4 }}>
        <span>R$ {gasto.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
        <span>R$ {orcamento.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
      </div>
      <div style={{ height: 8, background: 'var(--cbrio-border)', borderRadius: 4 }}>
        <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, borderRadius: 4, transition: 'width 0.3s',
          background: excedido ? '#ef4444' : pct > 80 ? '#f59e0b' : '#10b981' }} />
      </div>
      {excedido && (
        <div style={{ marginTop: 6, padding: '6px 10px', borderRadius: 6, background: '#fef2f2', border: '1px solid #fecaca', fontSize: 11, color: '#ef4444', fontWeight: 600 }}>
          Orçamento excedido em R$ {(gasto - orcamento).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </div>
      )}

      {showExpenseForm && (
        <form onSubmit={handleSubmitExpense} style={{ marginTop: 10, padding: 10, background: 'var(--cbrio-table-header)', borderRadius: 8, border: `1px solid ${C.border}` }}>
          <input placeholder="Descrição" value={expense.descricao} onChange={e => setExpense(p => ({ ...p, descricao: e.target.value }))}
            style={inputStyle} />
          <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            <input type="number" step="0.01" placeholder="Valor R$" value={expense.valor}
              onChange={e => setExpense(p => ({ ...p, valor: e.target.value }))} style={{ ...inputStyle, flex: 1 }} />
            <select value={expense.categoria} onChange={e => setExpense(p => ({ ...p, categoria: e.target.value }))} style={{ ...inputStyle, flex: 1 }}>
              <option value="compras">Compras</option>
              <option value="manutencao">Manutenção</option>
              <option value="limpeza">Limpeza</option>
              <option value="financeiro">Financeiro</option>
              <option value="outro">Outro</option>
            </select>
          </div>
          <input placeholder="Fornecedor (opcional)" value={expense.fornecedor}
            onChange={e => setExpense(p => ({ ...p, fornecedor: e.target.value }))} style={{ ...inputStyle, marginTop: 6 }} />
          <button type="submit" disabled={saving} style={{ ...btnSave, marginTop: 8, opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Salvando...' : 'Registrar'}
          </button>
        </form>
      )}
    </div>
  );
}

const inputStyle = { width: '100%', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--cbrio-border)', fontSize: 12, color: 'var(--cbrio-text)', outline: 'none' };
const btnSave = { width: '100%', padding: '8px', borderRadius: 6, border: 'none', background: '#00B39D', color: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 12 };
