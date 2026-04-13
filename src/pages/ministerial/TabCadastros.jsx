import { useState, useEffect, useCallback } from 'react';
import { membresia } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import {
  Inbox, Check, X, Search, User, Mail, Phone,
  MapPin, Calendar, Copy, ExternalLink, Trash2, CheckCircle2,
  CreditCard, RefreshCw,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '../../components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '../../components/ui/dialog';

const C = {
  card: 'var(--cbrio-card)', primary: '#00B39D', primaryBg: '#00B39D18',
  text: 'var(--cbrio-text)', text2: 'var(--cbrio-text2)', text3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)',
  green: '#10b981', greenBg: '#10b98118',
  red: '#ef4444', redBg: '#ef444418',
  amber: '#f59e0b', amberBg: '#f59e0b18',
  blue: '#3b82f6', blueBg: '#3b82f618',
};

const STATUS_META = {
  pendente:  { label: 'Pendente',  cor: C.amber, bg: C.amberBg, icon: Inbox },
  aprovado:  { label: 'Aprovado',  cor: C.green, bg: C.greenBg, icon: CheckCircle2 },
  rejeitado: { label: 'Rejeitado', cor: C.red,   bg: C.redBg,   icon: X },
  duplicado: { label: 'Duplicado', cor: C.blue,  bg: C.blueBg,  icon: Copy },
};

const ORIGEM_LABEL = {
  site: 'Site', qr_code: 'QR Code', evento: 'Evento', importacao: 'Importação',
};

function fmtCpf(v) {
  const d = (v || '').toString().replace(/\D+/g, '');
  if (d.length !== 11) return v || '';
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function fmtData(d) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return '—'; }
}

function Badge({ status }) {
  const s = STATUS_META[status] || STATUS_META.pendente;
  const Icon = s.icon;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600,
      color: s.cor, background: s.bg,
    }}>
      <Icon style={{ width: 11, height: 11 }} />
      {s.label}
    </span>
  );
}

export default function TabCadastros() {
  const { isDiretor } = useAuth();

  const [cadastros, setCadastros] = useState([]);
  const [kpis, setKpis] = useState({ pendente: 0, aprovado: 0, rejeitado: 0, duplicado: 0 });
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('pendente');
  const [busca, setBusca] = useState('');
  const [error, setError] = useState('');

  const [selecionado, setSelecionado] = useState(null);
  const [acao, setAcao] = useState(null); // 'aprovar' | 'rejeitar'
  const [motivoRejeicao, setMotivoRejeicao] = useState('');
  const [observacoesAprov, setObservacoesAprov] = useState('');
  const [salvando, setSalvando] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = filterStatus ? { status: filterStatus } : undefined;
      const [lista, k] = await Promise.all([
        membresia.cadastros.list(params),
        membresia.cadastros.kpis(),
      ]);
      setCadastros(lista || []);
      setKpis(k || {});
    } catch (e) {
      setError(e.message || 'Erro ao carregar cadastros');
    } finally {
      setLoading(false);
    }
  }, [filterStatus]);

  useEffect(() => { load(); }, [load]);

  const filtrados = cadastros.filter((c) => {
    if (!busca) return true;
    const q = busca.toLowerCase();
    return (
      (c.nome || '').toLowerCase().includes(q) ||
      (c.email || '').toLowerCase().includes(q) ||
      (c.telefone || '').toLowerCase().includes(q)
    );
  });

  async function handleAprovar() {
    if (!selecionado) return;
    setSalvando(true);
    try {
      await membresia.cadastros.aprovar(selecionado.id, {
        observacoes: observacoesAprov || undefined,
      });
      setAcao(null);
      setSelecionado(null);
      setObservacoesAprov('');
      await load();
    } catch (e) {
      setError(e.message || 'Erro ao aprovar cadastro');
    } finally {
      setSalvando(false);
    }
  }

  async function handleRejeitar() {
    if (!selecionado) return;
    setSalvando(true);
    try {
      await membresia.cadastros.rejeitar(selecionado.id, motivoRejeicao);
      setAcao(null);
      setSelecionado(null);
      setMotivoRejeicao('');
      await load();
    } catch (e) {
      setError(e.message || 'Erro ao rejeitar cadastro');
    } finally {
      setSalvando(false);
    }
  }

  async function handleDelete(cad) {
    if (!confirm(`Remover definitivamente o cadastro de ${cad.nome}?`)) return;
    try {
      await membresia.cadastros.remove(cad.id);
      if (selecionado?.id === cad.id) setSelecionado(null);
      await load();
    } catch (e) {
      setError(e.message || 'Erro ao remover cadastro');
    }
  }

  return (
    <div>
      {error && (
        <div style={{
          background: C.redBg, border: `1px solid ${C.red}30`, color: C.red,
          borderRadius: 10, padding: '10px 14px', fontSize: 13, marginBottom: 16,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          {error}
          <X style={{ width: 16, height: 16, cursor: 'pointer' }} onClick={() => setError('')} />
        </div>
      )}

      {/* KPIs por status */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {Object.entries(STATUS_META).map(([key, meta]) => {
          const Icon = meta.icon;
          const active = filterStatus === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setFilterStatus(active ? '' : key)}
              style={{
                textAlign: 'left',
                background: C.card,
                border: `1px solid ${active ? meta.cor : C.border}`,
                borderRadius: 14,
                padding: '16px 18px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                boxShadow: active ? `0 0 0 3px ${meta.bg}` : 'none',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 12, color: C.text3, fontWeight: 500 }}>{meta.label}</span>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  background: meta.bg, color: meta.cor,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Icon style={{ width: 16, height: 16 }} />
                </div>
              </div>
              <div style={{ fontSize: 26, fontWeight: 700, color: C.text, marginTop: 6 }}>
                {kpis[key] ?? 0}
              </div>
            </button>
          );
        })}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 200 }}>
          <Search style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, color: C.text3, zIndex: 1 }} />
          <Input
            placeholder="Buscar por nome, e-mail ou telefone..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            style={{ paddingLeft: 36 }}
          />
        </div>
        <div style={{ minWidth: 180 }}>
          <Select value={filterStatus || '__all__'} onValueChange={(v) => setFilterStatus(v === '__all__' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder="Todos os status" /></SelectTrigger>
            <SelectContent className="z-[1001]">
              <SelectItem value="__all__">Todos os status</SelectItem>
              {Object.entries(STATUS_META).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Tabela */}
      <div style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
          <thead>
            <tr>
              {['Nome', 'Contato', 'Status', 'Origem', 'Recebido em', ''].map((h, i) => (
                <th key={i} style={{
                  textAlign: 'left', padding: '14px 18px', fontSize: 11,
                  fontWeight: 600, color: C.text3, textTransform: 'uppercase',
                  letterSpacing: 0.5, background: 'var(--cbrio-table-header)',
                  borderBottom: `1px solid ${C.border}`,
                }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6}><div className="flex items-center justify-center py-6 gap-2">
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-muted-foreground/25 border-t-primary" />
                <span className="text-xs text-muted-foreground">Carregando...</span>
              </div></td></tr>
            ) : filtrados.length === 0 ? (
              <tr><td colSpan={6}><div className="flex flex-col items-center py-10 gap-2">
                <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-1">
                  <Inbox className="h-5 w-5 text-muted-foreground" />
                </div>
                <span className="text-sm font-medium text-foreground">Nenhum cadastro encontrado</span>
                <span className="text-xs text-muted-foreground">Formulários enviados aparecem aqui</span>
              </div></td></tr>
            ) : filtrados.map((c) => (
              <tr key={c.id} className="cbrio-row" onClick={() => setSelecionado(c)}>
                <td style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%',
                      background: C.primaryBg, color: C.primary,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontWeight: 700, fontSize: 13, flexShrink: 0,
                    }}>
                      {c.nome?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 500, color: C.text }}>{c.nome}</div>
                      {c.duplicado_de && (
                        <div style={{ fontSize: 11, color: C.blue, marginTop: 2 }}>
                          ↻ possível duplicado de {c.duplicado_de.nome}
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 12, color: C.text2, lineHeight: 1.5 }}>
                    {c.email && <div>{c.email}</div>}
                    {c.telefone && <div style={{ color: C.text3 }}>{c.telefone}</div>}
                    {!c.email && !c.telefone && <span style={{ color: C.text3 }}>—</span>}
                  </div>
                </td>
                <td style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}` }}>
                  <Badge status={c.status} />
                </td>
                <td style={{ padding: '14px 18px', fontSize: 13, color: C.text2, borderBottom: `1px solid ${C.border}` }}>
                  {ORIGEM_LABEL[c.origem] || c.origem}
                </td>
                <td style={{ padding: '14px 18px', fontSize: 12, color: C.text3, borderBottom: `1px solid ${C.border}` }}>
                  {fmtData(c.created_at)}
                </td>
                <td style={{ padding: '14px 18px', borderBottom: `1px solid ${C.border}`, textAlign: 'right' }}>
                  <ExternalLink style={{ width: 14, height: 14, color: C.text3, display: 'inline-block' }} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal de detalhe */}
      {selecionado && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'var(--cbrio-overlay)',
            zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
          }}
          onClick={() => setSelecionado(null)}
        >
          <div
            style={{
              background: 'var(--cbrio-modal-bg)', borderRadius: 20,
              width: '100%', maxWidth: 640, maxHeight: '90vh', overflow: 'auto',
              border: `1px solid ${C.border}`,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: '28px 32px 20px', borderBottom: `1px solid ${C.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%',
                  background: C.primaryBg, color: C.primary,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: 20,
                }}>
                  {selecionado.nome?.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()}
                </div>
                <div>
                  <h2 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>{selecionado.nome}</h2>
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <Badge status={selecionado.status} />
                    <span style={{ fontSize: 11, color: C.text3, padding: '3px 10px', background: 'var(--cbrio-input-bg)', borderRadius: 20 }}>
                      {ORIGEM_LABEL[selecionado.origem] || selecionado.origem}
                    </span>
                  </div>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setSelecionado(null)}>
                <X style={{ width: 20, height: 20 }} />
              </Button>
            </div>

            <div style={{ padding: '20px 32px 28px' }}>
              {selecionado.duplicado_de && (
                <div style={{
                  padding: '12px 14px', marginBottom: 16,
                  background: C.blueBg, border: `1px solid ${C.blue}40`,
                  borderRadius: 10, fontSize: 13, color: C.blue,
                  display: 'flex', alignItems: 'flex-start', gap: 10,
                }}>
                  <RefreshCw style={{ width: 16, height: 16, flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <strong>Atualização cadastral</strong> — CPF / contato já pertence ao membro{' '}
                    <strong>{selecionado.duplicado_de.nome}</strong>. Ao aprovar, os dados abaixo
                    serão aplicados ao cadastro existente (não cria membro novo).
                  </div>
                </div>
              )}

              <DataGrid
                items={[
                  { icon: CreditCard, label: 'CPF', value: selecionado.cpf ? fmtCpf(selecionado.cpf) : null },
                  { icon: Mail, label: 'E-mail', value: selecionado.email },
                  { icon: Phone, label: 'Telefone', value: selecionado.telefone },
                  { icon: Calendar, label: 'Nascimento', value: selecionado.data_nascimento ? new Date(selecionado.data_nascimento + 'T00:00:00').toLocaleDateString('pt-BR') : null },
                  { icon: User, label: 'Estado civil', value: selecionado.estado_civil },
                  { icon: User, label: 'Profissão', value: selecionado.profissao },
                  {
                    icon: MapPin,
                    label: 'Endereço',
                    value: [selecionado.endereco, selecionado.bairro, selecionado.cidade, selecionado.cep].filter(Boolean).join(', '),
                  },
                ]}
              />

              {selecionado.como_conheceu && (
                <div style={{ marginTop: 18 }}>
                  <div style={{ fontSize: 11, color: C.text3, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                    Como conheceu
                  </div>
                  <div style={{
                    fontSize: 13, color: C.text2, lineHeight: 1.6,
                    padding: 12, background: 'var(--cbrio-input-bg)',
                    border: `1px solid ${C.border}`, borderRadius: 10,
                  }}>
                    {selecionado.como_conheceu}
                  </div>
                </div>
              )}

              <div style={{
                marginTop: 18, padding: 12,
                background: 'var(--cbrio-input-bg)',
                border: `1px solid ${C.border}`, borderRadius: 10,
                fontSize: 12, color: C.text3, lineHeight: 1.6,
              }}>
                <div><strong style={{ color: C.text2 }}>Consentimento LGPD:</strong>{' '}
                  {selecionado.aceita_termos ? '✓ Aceitou termos' : '✗ Não aceitou termos'}
                  {' · '}
                  {selecionado.aceita_contato ? '✓ Aceitou contato' : '✗ Recusou contato'}
                </div>
                <div style={{ marginTop: 4 }}><strong style={{ color: C.text2 }}>Recebido em:</strong> {fmtData(selecionado.created_at)}</div>
                {selecionado.ip_origem && (
                  <div style={{ marginTop: 4 }}><strong style={{ color: C.text2 }}>IP:</strong> {selecionado.ip_origem}</div>
                )}
                {selecionado.motivo_rejeicao && (
                  <div style={{ marginTop: 4 }}><strong style={{ color: C.red }}>Motivo da rejeição:</strong> {selecionado.motivo_rejeicao}</div>
                )}
                {selecionado.aprovado_em && (
                  <div style={{ marginTop: 4 }}>
                    <strong style={{ color: C.text2 }}>Decidido em:</strong> {fmtData(selecionado.aprovado_em)}
                  </div>
                )}
              </div>

              {/* Ações — só se ainda estiver pendente/duplicado */}
              {isDiretor && ['pendente', 'duplicado'].includes(selecionado.status) && (
                <div style={{ display: 'flex', gap: 10, marginTop: 22, flexWrap: 'wrap' }}>
                  <Button
                    onClick={() => { setAcao('aprovar'); setObservacoesAprov(''); }}
                    style={{ background: selecionado.duplicado_de ? C.blue : C.green, color: '#fff', flex: 1, minWidth: 160 }}
                  >
                    {selecionado.duplicado_de ? (
                      <><RefreshCw style={{ width: 16, height: 16 }} /> Atualizar cadastro existente</>
                    ) : (
                      <><Check style={{ width: 16, height: 16 }} /> Aprovar e criar membro</>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => { setAcao('rejeitar'); setMotivoRejeicao(''); }}
                    style={{ flex: 1, minWidth: 140, color: C.red, borderColor: `${C.red}60` }}
                  >
                    <X style={{ width: 16, height: 16 }} /> Rejeitar
                  </Button>
                </div>
              )}

              {isDiretor && (
                <div style={{ marginTop: 14, textAlign: 'right' }}>
                  <button
                    type="button"
                    onClick={() => handleDelete(selecionado)}
                    style={{
                      background: 'transparent', border: 'none',
                      color: C.text3, fontSize: 12, cursor: 'pointer',
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                    }}
                  >
                    <Trash2 style={{ width: 12, height: 12 }} /> Remover definitivamente
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Dialog de confirmação — Aprovar */}
      <Dialog open={acao === 'aprovar'} onOpenChange={(v) => !v && setAcao(null)}>
        <DialogContent className="max-w-md z-[1100]">
          <DialogHeader>
            <DialogTitle>
              {selecionado?.duplicado_de ? 'Atualizar cadastro existente' : 'Aprovar cadastro'}
            </DialogTitle>
          </DialogHeader>
          <div style={{ padding: '4px 0 12px' }}>
            <p style={{ fontSize: 13, color: C.text2, lineHeight: 1.6, marginBottom: 14 }}>
              {selecionado?.duplicado_de ? (
                <>Os dados enviados serão aplicados ao membro <strong>{selecionado.duplicado_de.nome}</strong>.
                Campos vazios no formulário não sobrescrevem os dados atuais.</>
              ) : (
                <>Isso criará um novo <strong>membro</strong> a partir dos dados enviados,
                com status inicial <em>visitante</em>. Você poderá ajustar família, grupo
                e trilha depois na tela do membro.</>
              )}
            </p>
            <Label htmlFor="obs-aprov">Observações (opcional)</Label>
            <Textarea
              id="obs-aprov"
              rows={3}
              value={observacoesAprov}
              onChange={(e) => setObservacoesAprov(e.target.value)}
              placeholder="Ex.: conheceu pela campanha X, agendar café..."
              className="mt-1"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcao(null)} disabled={salvando}>Cancelar</Button>
            <Button
              onClick={handleAprovar}
              disabled={salvando}
              style={{ background: selecionado?.duplicado_de ? C.blue : C.green, color: '#fff' }}
            >
              {salvando
                ? (selecionado?.duplicado_de ? 'Atualizando...' : 'Aprovando...')
                : (selecionado?.duplicado_de ? 'Confirmar atualização' : 'Confirmar aprovação')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmação — Rejeitar */}
      <Dialog open={acao === 'rejeitar'} onOpenChange={(v) => !v && setAcao(null)}>
        <DialogContent className="max-w-md z-[1100]">
          <DialogHeader>
            <DialogTitle>Rejeitar cadastro</DialogTitle>
          </DialogHeader>
          <div style={{ padding: '4px 0 12px' }}>
            <p style={{ fontSize: 13, color: C.text2, lineHeight: 1.6, marginBottom: 14 }}>
              O cadastro será marcado como rejeitado. Esse registro fica arquivado
              para auditoria.
            </p>
            <Label htmlFor="motivo-rej">Motivo (opcional)</Label>
            <Textarea
              id="motivo-rej"
              rows={3}
              value={motivoRejeicao}
              onChange={(e) => setMotivoRejeicao(e.target.value)}
              placeholder="Ex.: dados incompletos, spam, duplicata confirmada..."
              className="mt-1"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAcao(null)} disabled={salvando}>Cancelar</Button>
            <Button onClick={handleRejeitar} disabled={salvando} variant="destructive">
              {salvando ? 'Rejeitando...' : 'Confirmar rejeição'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DataGrid({ items }) {
  const visible = items.filter((it) => it.value);
  if (visible.length === 0) {
    return <p style={{ fontSize: 13, color: C.text3 }}>Nenhum dado adicional informado.</p>;
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
      {visible.map((it, i) => {
        const Icon = it.icon;
        return (
          <div key={i} style={{
            padding: 12, background: 'var(--cbrio-input-bg)',
            border: `1px solid ${C.border}`, borderRadius: 10,
            display: 'flex', alignItems: 'flex-start', gap: 10,
          }}>
            <Icon style={{ width: 16, height: 16, color: C.text3, flexShrink: 0, marginTop: 2 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 10, color: C.text3, textTransform: 'uppercase', letterSpacing: 0.5 }}>{it.label}</div>
              <div style={{ fontSize: 13, color: C.text, marginTop: 2, wordBreak: 'break-word' }}>{it.value}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
