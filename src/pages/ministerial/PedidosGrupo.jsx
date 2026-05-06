// ============================================================================
// /grupos/pedidos — tela onde o lider aprova/rejeita pedidos de inscricao.
//
// Modo "mine" por padrao: mostra so os pedidos dos grupos onde o user
// logado e o lider (resolvido via vol_profiles.membresia_id no backend).
// Admin/diretor pode mudar pra ver tudo.
// ============================================================================

import { useEffect, useState } from 'react';
import { grupos as api } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { toast } from 'sonner';
import { Check, X, Mail, Phone, User as UserIcon, MapPin, Clock, Hash } from 'lucide-react';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  primary: '#00B39D', primaryBg: '#00B39D18',
  green: '#10b981', greenBg: '#10b98120',
  red: '#ef4444', redBg: '#ef444420',
  amber: '#f59e0b', amberBg: '#f59e0b20',
};

const STATUS_LABEL = {
  pendente: { label: 'Pendente', cor: C.amber, bg: C.amberBg },
  aprovado: { label: 'Aprovado', cor: C.green, bg: C.greenBg },
  rejeitado: { label: 'Rejeitado', cor: C.red, bg: C.redBg },
  cancelado: { label: 'Cancelado', cor: C.t3, bg: C.bg },
};

export default function PedidosGrupo() {
  const { profile } = useAuth();
  const isAdmin = ['admin', 'diretor'].includes(profile?.role);
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(isAdmin); // admin ve tudo por padrao
  const [filterStatus, setFilterStatus] = useState('pendente');
  const [rejectingId, setRejectingId] = useState(null);
  const [motivoRej, setMotivoRej] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const params = { status: filterStatus };
      if (!showAll) params.mine = 'true';
      const data = await api.listarPedidos(params);
      setPedidos(data || []);
    } catch (e) {
      toast.error('Erro ao carregar pedidos');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [filterStatus, showAll]);

  const aprovar = async (p) => {
    if (!confirm(`Aprovar ${p.nome} no grupo "${p.mem_grupos?.nome}"?`)) return;
    try {
      await api.aprovarPedido(p.id);
      toast.success('Pedido aprovado');
      load();
    } catch (e) { toast.error(e.message || 'Erro ao aprovar'); }
  };

  const rejeitar = async (p) => {
    try {
      await api.rejeitarPedido(p.id, motivoRej.trim() || null);
      toast.success('Pedido rejeitado');
      setRejectingId(null);
      setMotivoRej('');
      load();
    } catch (e) { toast.error(e.message || 'Erro ao rejeitar'); }
  };

  return (
    <div style={{ padding: '24px 32px', maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>Pedidos de inscrição em grupos</h1>
        <p style={{ fontSize: 13, color: C.t3, marginTop: 6 }}>
          {showAll
            ? <>Vendo <strong>todos os pedidos</strong> da igreja (admin/diretor).</>
            : <>Vendo apenas pedidos dos grupos que <strong>você lidera</strong>.</>
          }
        </p>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {['pendente', 'aprovado', 'rejeitado'].map(s => (
          <button key={s} onClick={() => setFilterStatus(s)} style={{
            padding: '6px 14px', borderRadius: 99, fontSize: 12, cursor: 'pointer',
            border: filterStatus === s ? `2px solid ${C.primary}` : `1px solid ${C.border}`,
            background: filterStatus === s ? C.primaryBg : 'transparent',
            color: filterStatus === s ? C.primary : C.t3, fontWeight: filterStatus === s ? 700 : 500,
            textTransform: 'capitalize',
          }}>
            {STATUS_LABEL[s].label}
          </button>
        ))}
        {isAdmin && (
          <label style={{ marginLeft: 'auto', fontSize: 12, color: C.t2, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} style={{ accentColor: C.primary }} />
            Ver todos da igreja (admin)
          </label>
        )}
      </div>

      {loading ? (
        <div style={{ padding: 60, textAlign: 'center', color: C.t3 }}>Carregando...</div>
      ) : pedidos.length === 0 ? (
        <div style={{ padding: 60, textAlign: 'center', background: C.card, borderRadius: 12, border: `1px dashed ${C.border}`, color: C.t3, fontSize: 13 }}>
          Nenhum pedido {filterStatus === 'pendente' ? 'pendente' : `${STATUS_LABEL[filterStatus].label.toLowerCase()}`}.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {pedidos.map(p => {
            const grupo = p.mem_grupos;
            const lider = grupo?.mem_membros;
            const status = STATUS_LABEL[p.status];
            const isRejecting = rejectingId === p.id;
            return (
              <div key={p.id} style={{ background: C.card, borderRadius: 12, padding: 14, border: `1px solid ${C.border}` }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: C.primaryBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.primary, fontWeight: 700 }}>
                    {p.nome?.charAt(0)?.toUpperCase() || '?'}
                  </div>
                  <div style={{ flex: 1, minWidth: 240 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{p.nome}</div>
                      <span style={{ fontSize: 10, padding: '1px 8px', borderRadius: 99, background: status.bg, color: status.cor, fontWeight: 600, textTransform: 'uppercase' }}>
                        {status.label}
                      </span>
                      <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: C.bg, color: C.t3, fontWeight: 500 }}>
                        {p.origem === 'formulario_publico' ? 'via QR' : p.origem === 'cadastro_interno' ? 'via cadastro' : 'manual'}
                      </span>
                    </div>
                    <div style={{ fontSize: 11, color: C.t3, marginTop: 4, display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                      {p.email && <span><Mail size={11} style={{ display: 'inline', marginRight: 3 }} /> {p.email}</span>}
                      {p.telefone && <span><Phone size={11} style={{ display: 'inline', marginRight: 3 }} /> {p.telefone}</span>}
                    </div>
                    {p.observacao && <div style={{ fontSize: 11, color: C.t2, marginTop: 4, fontStyle: 'italic' }}>"{p.observacao}"</div>}
                  </div>
                  <div style={{ minWidth: 200, fontSize: 12, color: C.t2 }}>
                    <div style={{ fontWeight: 700, color: C.text, display: 'flex', alignItems: 'center', gap: 6 }}>
                      {grupo?.nome}
                      {grupo?.codigo && <code style={{ fontSize: 10, color: C.t3, fontFamily: 'monospace' }}>{grupo.codigo}</code>}
                    </div>
                    <div style={{ fontSize: 11, color: C.t3, marginTop: 2 }}>
                      {grupo?.bairro && <><MapPin size={10} style={{ display: 'inline', marginRight: 3 }} /> {grupo.bairro}</>}
                      {lider?.nome && <> · líder: {lider.nome}</>}
                    </div>
                  </div>
                </div>

                {p.status === 'pendente' && !isRejecting && (
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <Button size="sm" variant="outline" onClick={() => { setRejectingId(p.id); setMotivoRej(''); }}>
                      <X size={14} style={{ marginRight: 4 }} /> Rejeitar
                    </Button>
                    <Button size="sm" onClick={() => aprovar(p)}>
                      <Check size={14} style={{ marginRight: 4 }} /> Aprovar
                    </Button>
                  </div>
                )}

                {isRejecting && (
                  <div style={{ background: C.bg, borderRadius: 8, padding: 10, marginTop: 8 }}>
                    <Input
                      placeholder="Motivo (opcional, será mostrado para a pessoa)..."
                      value={motivoRej}
                      onChange={e => setMotivoRej(e.target.value)}
                      autoFocus
                    />
                    <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
                      <Button size="sm" variant="outline" onClick={() => { setRejectingId(null); setMotivoRej(''); }}>Cancelar</Button>
                      <Button size="sm" variant="destructive" onClick={() => rejeitar(p)}>Confirmar rejeição</Button>
                    </div>
                  </div>
                )}

                {p.status === 'rejeitado' && p.motivo_rejeicao && (
                  <div style={{ fontSize: 11, color: C.t2, marginTop: 6, padding: '6px 10px', background: C.redBg, borderRadius: 6 }}>
                    Motivo: {p.motivo_rejeicao}
                  </div>
                )}
                {p.decidido_por_nome && p.decidido_em && (
                  <div style={{ fontSize: 10, color: C.t3, marginTop: 6 }}>
                    {p.status === 'aprovado' ? 'Aprovado' : 'Decidido'} por {p.decidido_por_nome} em {new Date(p.decidido_em).toLocaleDateString('pt-BR')}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
