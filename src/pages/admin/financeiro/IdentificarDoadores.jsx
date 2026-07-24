// Conciliação balanço × OFX · identificar o doador por CPF (Fase 3).
// O balanço tem nome+valor+data (sem CPF); o OFX tem CPF+valor+data. O motor
// casa os dois e vincula a transação do balanço ao membro. Conservador:
// auto-vincula só o inequívoco; ambíguo vem pra revisão de 1 clique aqui.
import { useState } from 'react';
import { financeiroV2 } from '../../../api';
import { Button } from '../../../components/ui/button';
import { toast } from 'sonner';

const C = {
  card: 'var(--cbrio-card)', primary: '#00B39D', primaryBg: '#00B39D18',
  text: 'var(--cbrio-text)', text2: 'var(--cbrio-text2)', text3: 'var(--cbrio-text3)',
  border: 'var(--cbrio-border)', inputBg: 'var(--cbrio-input-bg)',
  green: '#10b981', greenBg: '#10b98118', amber: '#f59e0b', amberBg: '#f59e0b18',
  blue: '#3b82f6', blueBg: '#3b82f618', red: '#ef4444',
};
const fmtMoney = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtCpf = (c) => String(c || '').replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
const inp = { padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: C.inputBg, color: C.text, fontSize: 13 };

function Stat({ label, value, cor }) {
  return (
    <div style={{ flex: 1, minWidth: 120, padding: 12, borderRadius: 12, background: C.card, border: `1px solid ${C.border}` }}>
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.4, color: C.text3 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: cor || C.text, marginTop: 2 }}>{value}</div>
    </div>
  );
}

export default function IdentificarDoadores() {
  const hoje = new Date();
  const primeiroDia = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
  const [inicio, setInicio] = useState(primeiroDia);
  const [fim, setFim] = useState(hoje.toISOString().slice(0, 10));
  const [stats, setStats] = useState(null);
  const [revisao, setRevisao] = useState([]);
  const [escolha, setEscolha] = useState({}); // transacao_id -> bruto_id
  const [busy, setBusy] = useState(false);

  async function previa() {
    setBusy(true); setStats(null); setRevisao([]);
    try {
      const r = await financeiroV2.conciliacaoOfx.rodar(inicio, fim, true);
      setStats({ ...r.stats, modo: 'previa' });
      setRevisao(r.revisao || []);
    } catch (e) { toast.error(e.message || 'Erro na prévia'); }
    setBusy(false);
  }

  async function conciliar() {
    if (!confirm('Vincular automaticamente os casos inequívocos deste período? (os ambíguos ficam pra revisão)')) return;
    setBusy(true);
    try {
      const r = await financeiroV2.conciliacaoOfx.rodar(inicio, fim, false);
      setStats({ ...r.stats, modo: 'aplicado' });
      setRevisao(r.revisao || []);
      toast.success(`${r.stats.vinculados || 0} vinculados · ${r.stats.avulsos_criados || 0} novos contribuintes · ${r.stats.revisao} p/ revisar`);
    } catch (e) { toast.error(e.message || 'Erro ao conciliar'); }
    setBusy(false);
  }

  async function confirmar(transacaoId) {
    const brutoId = escolha[transacaoId];
    if (!brutoId) return toast.error('Escolha qual PIX é o doador.');
    try {
      await financeiroV2.conciliacaoOfx.confirmar(transacaoId, brutoId);
      setRevisao(rev => rev.filter(r => r.transacao_id !== transacaoId));
      toast.success('Doador identificado.');
    } catch (e) { toast.error(e.message || 'Erro ao confirmar'); }
  }
  async function ignorar(transacaoId) {
    try {
      await financeiroV2.conciliacaoOfx.ignorar(transacaoId);
      setRevisao(rev => rev.filter(r => r.transacao_id !== transacaoId));
    } catch (e) { toast.error(e.message || 'Erro ao ignorar'); }
  }

  return (
    <div>
      <div style={{ marginBottom: 6 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: C.text }}>Identificar doadores · balanço × OFX</div>
        <div style={{ fontSize: 12, color: C.text3, marginTop: 2 }}>
          Casa cada doação do balanço (nome+valor+data) com o PIX do OFX (CPF) e vincula ao membro.
          Conservador: auto-vincula só o inequívoco; o resto vem pra revisão. Não duplica no dashboard.
        </div>
        <div style={{ fontSize: 12, color: C.text2, marginTop: 8, padding: '8px 10px', borderRadius: 8, background: C.blueBg, lineHeight: 1.5 }}>
          <b>Como usar:</b> escolha o período → <b>Prévia</b> (não grava) pra ver quantos casam →
          <b> Conciliar período</b> pra vincular os inequívocos. Sobra a <b>fila de revisão</b>: quando
          uma doação do balanço bate em valor+data com <b>mais de um</b> PIX, você escolhe qual CPF é o
          doador e confirma. Cada CPF mostra o nome de quem é na base (o extrato do Santander vem só com
          o CPF); <i>CPF não cadastrado</i> = ninguém no sistema tem esse CPF ainda.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap', margin: '14px 0' }}>
        <label style={{ fontSize: 12, color: C.text2 }}>De<br /><input type="date" value={inicio} onChange={e => setInicio(e.target.value)} style={inp} /></label>
        <label style={{ fontSize: 12, color: C.text2 }}>Até<br /><input type="date" value={fim} onChange={e => setFim(e.target.value)} style={inp} /></label>
        <Button variant="outline" onClick={previa} disabled={busy}>{busy ? '...' : 'Prévia (não grava)'}</Button>
        <Button onClick={conciliar} disabled={busy}>{busy ? '...' : 'Conciliar período'}</Button>
      </div>

      {stats && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          <Stat label="Balanço analisado" value={stats.balanco_analisado} />
          <Stat label={stats.modo === 'aplicado' ? 'Vinculados' : 'Auto (inequívoco)'} value={stats.modo === 'aplicado' ? (stats.vinculados ?? stats.auto) : stats.auto} cor={C.green} />
          <Stat label="Novos contribuintes" value={stats.avulsos_criados || 0} cor={C.blue} />
          <Stat label="Pra revisar" value={stats.revisao} cor={C.amber} />
          <Stat label="Sem match no OFX" value={stats.sem_match} cor={C.text3} />
        </div>
      )}

      {revisao.length > 0 && (
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text, margin: '4px 0 8px' }}>
            Revisão · escolha qual PIX corresponde a cada doação ({revisao.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {revisao.map(r => (
              <div key={r.transacao_id} style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{r.nome || '(sem nome)'}</div>
                  <div style={{ fontSize: 12, color: C.text2 }}>{fmtMoney(r.valor)} · {r.data.split('-').reverse().join('/')}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {r.candidatos.map(c => (
                    <label key={c.bruto_id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: C.text, cursor: 'pointer', padding: '6px 8px', borderRadius: 8, background: escolha[r.transacao_id] === c.bruto_id ? C.primaryBg : 'transparent' }}>
                      <input type="radio" name={`r${r.transacao_id}`} checked={escolha[r.transacao_id] === c.bruto_id} onChange={() => setEscolha(s => ({ ...s, [r.transacao_id]: c.bruto_id }))} style={{ accentColor: C.primary }} />
                      <span style={{ fontWeight: 600, color: c.nome ? C.text : C.text3, fontStyle: c.nome ? 'normal' : 'italic' }}>
                        {c.nome || 'CPF não cadastrado'}
                      </span>
                      {c.ja_membro && <span style={{ fontSize: 10, fontWeight: 700, color: C.green, background: C.greenBg, padding: '1px 6px', borderRadius: 6 }}>membro</span>}
                      <span style={{ color: C.text3 }}>CPF {fmtCpf(c.cpf)}{c.hora ? ` · ${String(c.hora).slice(0, 5)}` : ''}</span>
                    </label>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <Button size="sm" onClick={() => confirmar(r.transacao_id)}>Confirmar</Button>
                  <Button size="sm" variant="ghost" onClick={() => ignorar(r.transacao_id)}>Ignorar</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {stats && revisao.length === 0 && (
        <div style={{ padding: '18px 0', textAlign: 'center', color: C.text3, fontSize: 13 }}>
          Nada pendente de revisão neste período.
        </div>
      )}
    </div>
  );
}
