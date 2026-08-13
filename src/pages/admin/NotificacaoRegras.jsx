import { useState, useEffect } from 'react';
import { notificacoes } from '../../api';
import { Button } from '../../components/ui/button';

const C = {
  text: 'var(--cbrio-text)', text2: 'var(--cbrio-text2)', text3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', card: 'var(--cbrio-card)', primary: '#00B39D',
};

const MODULOS = [
  { id: 'rh', label: 'Recursos Humanos', desc: 'Férias, documentos, experiência CLT, admissões', color: '#8b5cf6' },
  { id: 'financeiro', label: 'Financeiro', desc: 'Contas a pagar, reembolsos, vencimentos', color: '#10b981' },
  { id: 'logistica', label: 'Logística', desc: 'Pedidos atrasados, solicitações pendentes', color: '#3b82f6' },
  { id: 'patrimonio', label: 'Patrimônio', desc: 'Bens extraviados, inventários abertos', color: '#f59e0b' },
  { id: 'membresia', label: 'Membresia', desc: 'Novos cadastros, aprovações, batismos', color: '#00B39D' },
  { id: 'eventos', label: 'Eventos', desc: 'Novo evento criado, tarefas atrasadas', color: '#6366f1' },
  { id: 'eventos-externos', label: 'Eventos Externos', desc: 'Novas inscrições no formulário público de eventos externos', color: '#6366f1' },
  { id: 'projetos', label: 'Projetos', desc: 'Marcos atrasados, tarefas pendentes', color: '#ec4899' },
  { id: 'kpis', label: 'KPIs e Indicadores', desc: 'Metas atingidas, registros de culto e batismo', color: '#f97316' },
  { id: 'cuidados', label: 'Cuidados', desc: 'Novos acompanhamentos, alertas Jornada 180 e capelania', color: '#ef476f' },
  { id: 'next', label: 'NEXT', desc: 'Novas inscrições, indicações de batismo/servir/grupo/dízimo', color: '#06b6d4' },
  { id: 'voluntariado', label: 'Voluntariado', desc: 'Novos voluntários, indicações para servir', color: '#14b8a6' },
  { id: 'grupos', label: 'Grupos', desc: 'Novos membros, grupos sem encontro recente, membros sem grupo, indicações via NEXT', color: '#a855f7' },
  { id: 'integracao', label: 'Integração', desc: 'Dados de culto aguardando aprovação, visitantes novos, indicações de batismo via NEXT', color: '#0ea5e9' },
  { id: 'kids', label: 'Kids', desc: 'Criança ativa faltando 3 cultos seguidos (para contato com a família)', color: '#ec4899' },
  { id: 'batismos', label: 'Batismos', desc: 'Novas inscrições para batismo via formulário público', color: '#06b6d4' },
  { id: 'nps', label: 'NPS', desc: 'Novas pesquisas de satisfação, lembretes e análises', color: '#06b6d4' },
  { id: 'marketing', label: 'Marketing', desc: 'Cards atribuídos, prazo confirmado, preview pronto, entrega aprovada, revisão sugerida, gargalo de aprovação', color: '#ec4899' },
  { id: 'producao', label: 'Produção de Culto', desc: 'Ocorrências críticas (falha técnica / estrutura) e novas solicitações da Produção', color: '#6366f1' },
  { id: 'governanca', label: 'Governança', desc: 'Lembrete de reunião próxima e reuniões da diretoria sem ata registrada', color: '#475569' },
  { id: 'wifi', label: 'WiFi', desc: 'Novos visitantes recorrentes identificados pelo portal WiFi (2+ cultos)', color: '#00B39D' },
  { id: 'administrativo', label: 'Administrativo', desc: 'Solicitações em triagem (sem setor), reserva de espaço, infraestrutura, devolução/ajuste de pedido', color: '#64748b' },
  { id: 'ti', label: 'TI', desc: 'Solicitações de tecnologia (acessos, equipamentos, sistemas)', color: '#0ea5e9' },
];

export default function NotificacaoRegras() {
  const [regras, setRegras] = useState([]);
  const [addTipo, setAddTipo] = useState('');
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [addModulo, setAddModulo] = useState('');
  const [addProfile, setAddProfile] = useState('');

  async function load() {
    setLoading(true);
    try {
      const data = await notificacoes.regras.list();
      setRegras(data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function loadProfiles() {
    try {
      const { supabase } = await import('../../supabaseClient');
      const { data } = await supabase.from('profiles').select('id, name, email, role').order('name');
      setProfiles(data || []);
    } catch (e) { console.error(e); }
  }

  useEffect(() => { load(); loadProfiles(); }, []);

  async function addRegra() {
    if (!addModulo || !addProfile) return;
    try {
      await notificacoes.regras.create({ modulo: addModulo, profile_id: addProfile, tipo: addTipo.trim() || null });
      setAddModulo(''); setAddProfile(''); setAddTipo('');
      load();
    } catch (e) { alert(e.message); }
  }

  async function removeRegra(id) {
    try { await notificacoes.regras.remove(id); load(); } catch (e) { alert(e.message); }
  }

  // Agrupar por módulo
  const porModulo = {};
  MODULOS.forEach(m => { porModulo[m.id] = regras.filter(r => r.modulo === m.id); });

  return (
    <div style={{ maxWidth: 1600, margin: '0 auto', padding: '0 24px' }}>
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: C.text, letterSpacing: -0.5 }}>Regras de Notificação</div>
        <div style={{ fontSize: 13, color: C.text2, marginTop: 2 }}>Configure quem recebe notificações de cada módulo. Sem regra, todos admin/diretor recebem. O campo \u0022tipo\u0022 é opcional: preenchido, a regra vale só para aquele aviso — e vence a regra geral do módulo.</div>
      </div>

      {/* Adicionar regra */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, alignItems: 'center', padding: 16, background: 'var(--panel)', WebkitBackdropFilter: 'blur(14px) saturate(140%)', backdropFilter: 'blur(14px) saturate(140%)', borderRadius: 16, border: '1px solid var(--hairline)', boxShadow: 'var(--shadow), var(--hi)' }}>
        <select value={addModulo} onChange={e => setAddModulo(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, background: 'var(--cbrio-input-bg)', color: C.text }}>
          <option value="">Selecione módulo...</option>
          {MODULOS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
        <select value={addProfile} onChange={e => setAddProfile(e.target.value)}
          style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, background: 'var(--cbrio-input-bg)', color: C.text, flex: 1 }}>
          <option value="">Selecione usuário...</option>
          {profiles.map(p => <option key={p.id} value={p.id}>{p.name} ({p.role}){p.email ? ` — ${p.email}` : ''}</option>)}
        </select>
        <input
          value={addTipo}
          onChange={e => setAddTipo(e.target.value)}
          placeholder="tipo (opcional)"
          title={'Deixe vazio para valer em TODOS os avisos do módulo (é o padrão).\n'
            + 'Preencha com um tipo (ex.: webhook_pagamento_recusado) para uma regra só daquele aviso — '
            + 'útil quando o módulo mistura alerta técnico com aviso operacional.'}
          style={{ padding: '8px 12px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, background: 'var(--cbrio-input-bg)', color: C.text, width: 210 }}
        />
        <Button onClick={addRegra} disabled={!addModulo || !addProfile}>+ Adicionar Regra</Button>
      </div>

      {/* Regras por módulo */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: 16 }}>
        {MODULOS.map(m => (
          <div key={m.id} style={{ background: 'var(--panel)', WebkitBackdropFilter: 'blur(14px) saturate(140%)', backdropFilter: 'blur(14px) saturate(140%)', borderRadius: 16, border: '1px solid var(--hairline)', boxShadow: 'var(--shadow), var(--hi)', borderLeft: `4px solid ${m.color}`, overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.text }}>{m.label}</div>
              <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>{m.desc}</div>
            </div>
            <div style={{ padding: '12px 20px' }}>
              {porModulo[m.id].length === 0 ? (
                <div style={{ fontSize: 12, color: C.text3, padding: '8px 0' }}>
                  Nenhuma regra — todos admin/diretor recebem
                </div>
              ) : (
                porModulo[m.id].map(r => (
                  <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: `1px solid ${C.border}` }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>{r.profiles?.name || 'Usuário'}</div>
                      <div style={{ fontSize: 11, color: C.text3 }}>{r.profiles?.email || ''}</div>
                      {/* ⚠️ Sem isto a regra de tipo fica INVISÍVEL: a tela diria
                          "recebe tudo do módulo" pra quem só recebe um aviso. */}
                      <div style={{ fontSize: 11, marginTop: 2, color: r.tipo ? '#00B39D' : C.text3, fontWeight: r.tipo ? 700 : 400 }}>
                        {r.tipo ? `só o aviso: ${r.tipo}` : 'todos os avisos do módulo'}
                      </div>
                    </div>
                    <Button variant="ghost" size="xs" className="text-red-500" onClick={() => removeRegra(r.id)}>Remover</Button>
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
