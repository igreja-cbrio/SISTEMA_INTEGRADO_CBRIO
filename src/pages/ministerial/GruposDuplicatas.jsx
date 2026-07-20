// ============================================================================
// Duplicatas · visualização da aba Pessoas do /grupos (Marcos · 2026-07-14)
//
// A base acumulou cadastros repetidos da mesma pessoa (cada porta de entrada
// cria um registro quando não há chave forte pra ligar — o CPF obrigatório
// na inscrição estancou o problema; o legado é resolvido aqui). O backend
// varre o UNIVERSO DE GRUPOS e agrupa possíveis duplicatas por: mesmo CPF /
// telefone / e-mail / nome+nascimento e nome muito parecido.
//
// A triagem escolhe o cadastro a MANTER e funde os demais nele (merge_membros
// preserva histórico: move grupos/presenças, aproveita dados faltantes e loga
// snapshot em mem_merge_log) — ou marca "não é duplicata" (o par sai das
// próximas análises). Fundir/ignorar exige grupos nível 5.
// ============================================================================
import { useState, useEffect, useCallback } from 'react';
import { grupos as api } from '../../api';
import { Button } from '../../components/ui/button';
import MergeFieldPicker from '../../components/dedup/MergeFieldPicker';
import { toast } from 'sonner';
import { RefreshCw, CheckCircle2 } from 'lucide-react';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  primary: '#00B39D',
  red: '#ef4444', amber: '#f59e0b', blue: '#3b82f6', violet: '#8b5cf6',
};

const MOTIVO_COR = {
  'mesmo CPF': C.red,
  'mesmo telefone': C.amber,
  'mesmo e-mail': C.blue,
  'mesmo nome e nascimento': C.violet,
  'nome muito parecido': C.t3,
};

const fmtData = (d) => { if (!d) return '—'; try { return new Date(String(d).slice(0, 10) + 'T12:00:00').toLocaleDateString('pt-BR'); } catch { return '—'; } };
const fmtCpf = (c) => {
  const d = String(c || '').replace(/\D/g, '');
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : '—';
};

// Pré-seleção do cadastro a manter: o mais completo (CPF pesa mais, membro
// ativo conta) e, em empate, o mais antigo. A fusão aproveita dos demais o
// que faltar nele — manter "o melhor" só evita retrabalho de conferência.
function melhorRegistro(pessoas) {
  const score = (p) => (p.cpf ? 4 : 0) + (p.status === 'membro_ativo' ? 2 : 0)
    + (p.telefone ? 1 : 0) + (p.email ? 1 : 0) + (p.data_nascimento ? 1 : 0);
  return [...pessoas].sort((a, b) => score(b) - score(a) || new Date(a.criado_em) - new Date(b.criado_em))[0]?.id;
}

export default function GruposDuplicatas({ podeResolver = false }) {
  const [dados, setDados] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyIdx, setBusyIdx] = useState(null);
  const [keepSel, setKeepSel] = useState({});
  const [camposSel, setCamposSel] = useState({}); // { [i]: campos } · "melhor de cada"

  const load = useCallback(async (fresh = false) => {
    setLoading(true);
    try {
      const r = await api.duplicatas.list(fresh);
      setDados(r);
      const sel = {};
      (r?.clusters || []).forEach((c, i) => { sel[i] = melhorRegistro(c.pessoas); });
      setKeepSel(sel);
      setCamposSel({});
    } catch (e) { toast.error(e.message || 'Erro ao analisar duplicatas'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const fundir = async (c, i) => {
    const keep = keepSel[i];
    if (!keep) { toast.error('Escolha o cadastro a manter'); return; }
    const merges = c.pessoas.filter(p => p.id !== keep).map(p => p.id);
    const keepNome = c.pessoas.find(p => p.id === keep)?.nome;
    if (!confirm(
      `Fundir ${merges.length} cadastro(s) em "${keepNome}"?\n\n` +
      'Nenhum dado se perde: o histórico (grupos, presenças, jornada) é movido pro cadastro mantido, ' +
      'o que faltar nele (CPF, telefone, nascimento, foto) é completado com os outros, e o que for ' +
      'DIFERENTE (outro e-mail, outro telefone, outra grafia do nome) é somado nas observações da ficha. ' +
      'A fusão fica registrada no log.'
    )) return;
    setBusyIdx(i);
    try {
      const r = await api.duplicatas.fundir(keep, merges, camposSel[i] || {});
      const pedidos = Object.keys(camposSel[i] || {});
      const aplicados = r?.campos_aplicados || [];
      const faltaram = pedidos.filter(k => !aplicados.includes(k));
      const n = r?.dados_somados?.length || 0;
      if (faltaram.length) {
        toast.warning(`Fundido, mas ${faltaram.length} campo(s) escolhido(s) não entraram (conflito com outro cadastro): ${faltaram.join(', ')}. Ajuste na ficha.`);
      } else {
        toast.success(n > 0
          ? `Cadastros fundidos — ${n} dado${n === 1 ? '' : 's'} divergente${n === 1 ? '' : 's'} somado${n === 1 ? '' : 's'} nas observações da ficha`
          : 'Cadastros fundidos em um só');
      }
      await load(true);
    } catch (e) { toast.error(e.message || 'Erro ao fundir'); }
    finally { setBusyIdx(null); }
  };

  const ignorar = async (c, i) => {
    if (!confirm('Confirmar que NÃO são a mesma pessoa? O grupo sai das próximas análises.')) return;
    setBusyIdx(i);
    try {
      await api.duplicatas.ignorar(c.pessoas.map(p => p.id));
      toast.success('Registrado — não aparecem mais como possível duplicata');
      await load(true);
    } catch (e) { toast.error(e.message || 'Erro ao registrar'); }
    finally { setBusyIdx(null); }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: C.t3 }}>Analisando os cadastros de grupos...</div>;

  const clusters = dados?.clusters || [];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>
            Possíveis duplicatas · {clusters.length} caso{clusters.length === 1 ? '' : 's'}
          </h3>
          <p style={{ fontSize: 12, color: C.t3, margin: '4px 0 0', maxWidth: 680, lineHeight: 1.55 }}>
            Cadastros do universo de grupos que parecem ser a mesma pessoa (mesmo CPF, telefone, e-mail,
            nome e nascimento — ou nome muito parecido). Escolha qual manter e funda os demais nele.
            <strong style={{ color: C.t2 }}> Fundir não apaga nada:</strong> o histórico (grupos, presenças)
            é movido, o que falta no cadastro mantido é completado com os outros e o que for diferente
            (outro e-mail, outro telefone, outra grafia do nome) é <strong style={{ color: C.t2 }}>somado
            nas observações</strong> da ficha — não substituído. Se não for a mesma pessoa, marque
            «Não é duplicata».
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => load(true)}>
          <RefreshCw size={13} style={{ marginRight: 6 }} /> Reanalisar
        </Button>
      </div>

      {clusters.length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', background: C.card, borderRadius: 14, border: `1px dashed ${C.border}` }}>
          <CheckCircle2 size={30} style={{ color: C.primary, margin: '0 auto 10px', display: 'block' }} />
          <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>Nenhuma duplicata pendente</div>
          <div style={{ fontSize: 12, color: C.t3, marginTop: 4 }}>Os cadastros de grupos estão sem repetição aparente.</div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {clusters.map((c, i) => (
            <div key={c.pessoas.map(p => p.id).join('_')} style={{ background: C.card, borderRadius: 14, border: `1px solid ${C.border}`, overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px', borderBottom: `1px solid ${C.border}`, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{c.pessoas.length} cadastros</span>
                {c.motivos.map(m => (
                  <span key={m} style={{ fontSize: 10.5, padding: '2px 9px', borderRadius: 99, background: `${MOTIVO_COR[m] || C.t3}18`, color: MOTIVO_COR[m] || C.t3, fontWeight: 700 }}>
                    {m}
                  </span>
                ))}
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${C.border}`, background: C.bg }}>
                      {[podeResolver ? 'Manter' : '', 'Nome', 'CPF', 'Telefone', 'E-mail', 'Nascimento', 'Criado em', 'Grupos'].map((h, hi) => (
                        <th key={hi} style={{ textAlign: 'left', padding: '7px 12px', fontSize: 10, fontWeight: 700, color: C.t3, textTransform: 'uppercase', letterSpacing: 0.4, whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {c.pessoas.map(p => (
                      <tr key={p.id} style={{ borderBottom: `1px solid ${C.border}`, background: keepSel[i] === p.id && podeResolver ? `${C.primary}0d` : 'transparent' }}>
                        <td style={{ padding: '9px 12px' }}>
                          {podeResolver && (
                            <input
                              type="radio"
                              name={`keep_${i}`}
                              checked={keepSel[i] === p.id}
                              onChange={() => setKeepSel(s => ({ ...s, [i]: p.id }))}
                              style={{ accentColor: C.primary, cursor: 'pointer' }}
                              aria-label={`Manter ${p.nome}`}
                            />
                          )}
                        </td>
                        <td style={{ padding: '9px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: p.foto_url ? `url(${p.foto_url}) center/cover` : `${C.primary}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: C.primary }}>
                              {!p.foto_url && (p.nome?.charAt(0) || '?')}
                            </div>
                            <div>
                              <div style={{ fontWeight: 700, color: C.text }}>{p.nome}</div>
                              {p.status && <div style={{ fontSize: 10.5, color: C.t3 }}>{p.status === 'membro_ativo' ? 'Membro ativo' : p.status}</div>}
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', color: p.cpf ? C.t2 : C.t3 }}>{fmtCpf(p.cpf)}</td>
                        <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', color: p.telefone ? C.t2 : C.t3 }}>{p.telefone || '—'}</td>
                        <td style={{ padding: '9px 12px', color: p.email ? C.t2 : C.t3, maxWidth: 190, overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.email || '—'}</td>
                        <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', color: p.data_nascimento ? C.t2 : C.t3 }}>{fmtData(p.data_nascimento)}</td>
                        <td style={{ padding: '9px 12px', whiteSpace: 'nowrap', color: C.t3 }}>{fmtData(p.criado_em)}</td>
                        <td style={{ padding: '9px 12px', fontSize: 11.5, color: C.t2, maxWidth: 260 }}>
                          {(p.grupos || []).slice(0, 3).join(' · ') || <span style={{ color: C.t3 }}>—</span>}
                          {(p.grupos || []).length > 3 && <span style={{ color: C.t3 }}> +{p.grupos.length - 3}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {podeResolver ? (
                <>
                  {keepSel[i] && (() => {
                    const keepRec = c.pessoas.find(p => p.id === keepSel[i]);
                    const outros = c.pessoas.filter(p => p.id !== keepSel[i]);
                    if (!keepRec) return null;
                    return (
                      <div style={{ padding: '0 14px 6px' }}>
                        <MergeFieldPicker key={`${i}_${keepSel[i]}`} keep={keepRec} outros={outros}
                          onCampos={(campos) => setCamposSel(s => ({ ...s, [i]: campos }))} />
                      </div>
                    );
                  })()}
                <div style={{ padding: '10px 14px', display: 'flex', gap: 10, justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: C.t3, marginRight: 'auto' }}>
                    Fundir não apaga nada — dados diferentes são somados nas observações da ficha.
                  </span>
                  <Button size="sm" variant="ghost" disabled={busyIdx === i} onClick={() => ignorar(c, i)} style={{ color: C.t2 }}>
                    Não é duplicata
                  </Button>
                  <Button size="sm" disabled={busyIdx === i} onClick={() => fundir(c, i)}>
                    {busyIdx === i ? 'Processando...' : 'Fundir no selecionado'}
                  </Button>
                </div>
                </>
              ) : (
                <div style={{ padding: '8px 14px', fontSize: 11.5, color: C.t3 }}>
                  Somente leitura — fundir/descartar exige nível de administração de grupos.
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
