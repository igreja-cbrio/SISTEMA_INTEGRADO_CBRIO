import { useState } from 'react';
import { logistica } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Button } from '../components/ui/button';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', primary: '#00B39D',
  text: 'var(--cbrio-text)', text2: 'var(--cbrio-text2)', text3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)',
};

const inputClass = "flex h-9 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm shadow-black/5 transition-all duration-200 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary hover:border-muted-foreground/50";
const textareaClass = inputClass + " min-h-[80px] py-2";
const labelClass = "text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1 block";

export default function SolicitarCompra() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    titulo: '',
    descricao: '',
    justificativa: '',
    valor_estimado: '',
    urgencia: 'normal',
    area: profile?.area || '',
  });
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }));

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.titulo.trim()) { setError('Título é obrigatório'); return; }
    if (!form.justificativa.trim()) { setError('Justificativa é obrigatória'); return; }
    setSaving(true);
    setError('');
    try {
      await logistica.solicitacoes.create(form);
      setSuccess(true);
    } catch (err) {
      setError(err.message);
    }
    setSaving(false);
  }

  if (success) {
    return (
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '0 24px' }}>
        <div style={{ marginTop: 80, textAlign: 'center' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, color: C.text, marginBottom: 8 }}>Solicitação enviada!</h2>
          <p style={{ fontSize: 14, color: C.text2, lineHeight: 1.5, marginBottom: 24 }}>
            Sua solicitação de compra foi registrada e será analisada pelo responsável de logística.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
            <Button variant="outline" onClick={() => { setSuccess(false); setForm({ titulo: '', descricao: '', justificativa: '', valor_estimado: '', urgencia: 'normal', area: profile?.area || '' }); }}>
              Nova Solicitação
            </Button>
            <Button onClick={() => navigate('/planejamento')}>
              Voltar ao Sistema
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: '0 24px' }}>
      <div style={{ marginBottom: 24, marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <span style={{ fontSize: 24 }}>🛒</span>
          <h1 style={{ fontSize: 20, fontWeight: 700, color: C.text, lineHeight: 1.25 }}>Solicitar Compra</h1>
        </div>
        <p style={{ fontSize: 14, color: C.text2, lineHeight: 1.5 }}>
          Preencha o formulário abaixo para solicitar a compra de materiais ou serviços.
        </p>
      </div>

      {error && (
        <div style={{
          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
          color: '#ef4444', borderRadius: 8, padding: '10px 14px', fontSize: 14, marginBottom: 16,
        }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{
          background: C.card, borderRadius: 12, border: `1px solid ${C.border}`,
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)', padding: 24,
        }}>
          {/* Título */}
          <div style={{ marginBottom: 16 }}>
            <label className={labelClass}>O que você precisa comprar? *</label>
            <input className={inputClass} placeholder="Ex: Material de escritório, Equipamento de som..." value={form.titulo} onChange={e => upd('titulo', e.target.value)} />
          </div>

          {/* Descrição */}
          <div style={{ marginBottom: 16 }}>
            <label className={labelClass}>Descrição</label>
            <textarea className={textareaClass} placeholder="Descreva os itens, quantidades, especificações..." value={form.descricao} onChange={e => upd('descricao', e.target.value)} style={{ minHeight: 80, resize: 'vertical' }} />
          </div>

          {/* Justificativa */}
          <div style={{ marginBottom: 16 }}>
            <label className={labelClass}>Por que precisa? (justificativa) *</label>
            <textarea className={textareaClass} placeholder="Explique a necessidade desta compra..." value={form.justificativa} onChange={e => upd('justificativa', e.target.value)} style={{ minHeight: 80, resize: 'vertical' }} />
          </div>

          {/* Valor + Urgência */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
            <div>
              <label className={labelClass}>Valor estimado (R$)</label>
              <input className={inputClass} type="number" step="0.01" min="0" placeholder="0,00" value={form.valor_estimado} onChange={e => upd('valor_estimado', e.target.value)} />
            </div>
            <div>
              <label className={labelClass}>Urgência</label>
              <select className={inputClass} value={form.urgencia} onChange={e => upd('urgencia', e.target.value)}>
                <option value="baixa">Baixa — sem pressa</option>
                <option value="normal">Normal — próximos dias</option>
                <option value="alta">Alta — urgente</option>
                <option value="critica">Crítica — imediato</option>
              </select>
            </div>
          </div>

          {/* Área */}
          <div style={{ marginBottom: 24 }}>
            <label className={labelClass}>Sua área</label>
            <input className={inputClass} placeholder="Ex: Ministerial, Gestão, Criativo..." value={form.area} onChange={e => upd('area', e.target.value)} />
          </div>

          {/* Info */}
          <div style={{
            background: 'var(--cbrio-input-bg)', borderRadius: 8, padding: 12,
            fontSize: 12, color: C.text3, lineHeight: 1.5, marginBottom: 16,
          }}>
            📋 Sua solicitação será analisada pelo responsável de logística. Você receberá uma notificação quando for aprovada ou recusada.
          </div>

          {/* Botão */}
          <Button className="w-full h-10" type="submit" disabled={saving}>
            {saving ? 'Enviando...' : '📩 Enviar Solicitação'}
          </Button>
        </div>
      </form>
    </div>
  );
}
