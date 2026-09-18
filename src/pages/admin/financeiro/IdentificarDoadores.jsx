// Conciliação balanço × OFX · identificar o doador por CPF (Fase 3).
// O balanço tem nome+valor+data (sem CPF); o OFX tem CPF+valor+data. O motor
// casa os dois e vincula a transação do balanço ao membro. Conservador:
// auto-vincula só o inequívoco; ambíguo vem pra revisão de 1 clique aqui.
import { useState } from 'react';
import { financeiroV2 } from '../../../api';
import { Button } from '../../../components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
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
  // ⚠️ A LISTA de quem já foi identificado. Sem ela a tela só tinha contadores,
  // e a pergunta "como vou saber quem foi?" não tinha resposta na tela.
  const [ident, setIdent] = useState(null);
  const [carregandoIdent, setCarregandoIdent] = useState(false);
  const [soDivergentes, setSoDivergentes] = useState(false);

  async function carregarIdentificados() {
    setCarregandoIdent(true);
    try {
      setIdent(await financeiroV2.conciliacaoOfx.identificados(inicio, fim));
    } catch (e) {
      // ⚠️ Erro não vira lista vazia: a tela DIZ que não conseguiu carregar.
      setIdent({ erro: e.message || 'Não consegui carregar a lista' });
    }
    setCarregandoIdent(false);
  }

  async function desfazer(transacaoId) {
    if (!confirm('Desfazer este vínculo? A doação volta a ficar sem dono e pode ser reconciliada depois.')) return;
    try {
      await financeiroV2.conciliacaoOfx.desfazer(transacaoId);
      toast.success('Vínculo desfeito');
      setIdent((cur) => (cur?.itens ? {
        ...cur,
        total: cur.total - 1,
        itens: cur.itens.filter((i) => i.transacao_id !== transacaoId),
      } : cur));
    } catch (e) { toast.error(e.message || 'Erro ao desfazer'); }
  }

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
      // ⚠️ O toast diz o que SOBROU, não só o que deu certo — número solto de
      // sucesso esconde que boa parte casou e ficou sem dono por falta de ficha.
      toast.success(
        `${r.stats.vinculados || 0} doações ganharam dono`
        + (r.stats.casou_cpf_sem_cadastro ? ` · ${r.stats.casou_cpf_sem_cadastro} casaram mas o CPF não tem cadastro` : '')
        + (r.stats.revisao ? ` · ${r.stats.revisao} p/ revisar` : ''),
      );
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
        <label style={{ fontSize: 12, color: C.text2 }}>De<br /><DatePicker value={inicio} onChange={setInicio} style={inp} /></label>
        <label style={{ fontSize: 12, color: C.text2 }}>Até<br /><DatePicker value={fim} onChange={setFim} style={inp} /></label>
        <Button variant="outline" onClick={previa} disabled={busy}>{busy ? '...' : 'Prévia (não grava)'}</Button>
        <Button onClick={conciliar} disabled={busy}>{busy ? '...' : 'Conciliar período'}</Button>
      </div>

      {stats && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
          <Stat label="Balanço analisado" value={stats.balanco_analisado} />
          <Stat label={stats.modo === 'aplicado' ? 'Vinculados' : 'Auto (inequívoco)'} value={stats.modo === 'aplicado' ? (stats.vinculados ?? stats.auto) : stats.auto} cor={C.green} />
          {/* ⚠️ CASOU ≠ TEM DONO. O casamento é balanço × extrato; o dono só
              existe se aquele CPF já tiver ficha. Sem este card, "auto" promete
              dono para doação cujo CPF ninguém cadastrou — medido em 02/09/2026:
              dos 1.948 CPFs do extrato, só 786 (40%) têm cadastro. */}
          {stats.modo === 'aplicado' && (
            <Stat label="CPF sem cadastro" value={stats.casou_cpf_sem_cadastro || 0} cor={C.blue} />
          )}
          <Stat label="Pra revisar" value={stats.revisao} cor={C.amber} />
          <Stat label="Sem match no OFX" value={stats.sem_match} cor={C.text3} />
        </div>
      )}

      {/* ⚠️ A LISTA — o que responde "quem foi?". Fica ANTES da fila de revisão
          porque é o resultado do trabalho; a revisão é a exceção. */}
      <div style={{ margin: '14px 0 4px' }}>
        <Button size="sm" variant="outline" onClick={carregarIdentificados} disabled={carregandoIdent}>
          {carregandoIdent ? 'Carregando…' : (ident ? 'Atualizar lista de identificados' : 'Ver quem já foi identificado')}
        </Button>
      </div>

      {ident?.erro && (
        <div style={{ fontSize: 12.5, color: C.red || '#dc2626', padding: '8px 0' }}>{ident.erro}</div>
      )}

      {ident && !ident.erro && (
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
            Identificados no período · {ident.total} doações de {ident.pessoas} pessoas
            {ident.valor_total != null && <> · {fmtMoney(ident.valor_total)}</>}
          </div>
          {/* ⚠️ Nome que diverge NÃO é necessariamente erro: pagamento por
              terceiro (cônjuge, filho, sócio) é comum. Mas é o que precisa de
              olho humano, então é contado e vem primeiro. */}
          {ident.divergentes > 0 && (
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: C.text3, marginTop: 4, cursor: 'pointer' }}>
              <input type="checkbox" checked={soDivergentes} onChange={(e) => setSoDivergentes(e.target.checked)} style={{ accentColor: C.primary }} />
              Mostrar só os {ident.divergentes} em que o nome do balanço não bate com o do cadastro
              (pode ser alguém pagando por outra pessoa)
            </label>
          )}
          {ident.truncado && (
            <div style={{ fontSize: 11, color: C.text3, marginTop: 2 }}>
              Mostrando os {ident.itens.length} primeiros — os divergentes e os de maior valor vêm antes.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
            {(soDivergentes ? ident.itens.filter((i) => i.nome_diverge) : ident.itens).map((i) => (
              <div key={i.transacao_id} style={{
                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                border: `1px solid ${i.nome_diverge ? (C.amber || '#f59e0b') + '55' : C.border}`,
                borderRadius: 10, padding: '7px 10px', fontSize: 12,
              }}>
                <span style={{ fontWeight: 700, color: C.text, minWidth: 180 }}>{i.membro_nome || '(sem nome)'}</span>
                {i.nome_diverge && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: C.amber || '#b45309', background: (C.amberBg || '#fef3c7'), padding: '1px 6px', borderRadius: 6 }}>
                    balanço diz “{i.nome_balanco}”
                  </span>
                )}
                <span style={{ color: C.text3 }}>{fmtMoney(i.valor)} · {i.data.split('-').reverse().join('/')}</span>
                {i.cpf && <span style={{ color: C.text3 }}>CPF {fmtCpf(i.cpf)}</span>}
                <Button size="sm" variant="ghost" style={{ marginLeft: 'auto' }} onClick={() => desfazer(i.transacao_id)}>
                  Desfazer
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {revisao.length > 0 && (
        <div>
          <div style={{ margin: '4px 0 8px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
              Revisão · escolha qual PIX corresponde a cada doação ({revisao.length})
            </div>
            {/* ⚠️ Sem esta frase o operador não sabe o que está decidindo: só
                chegam aqui os casos em que ALGUM candidato tem nome que pode ser
                a mesma pessoa. Quando nenhum bate, o caso não é perguntado — vira
                "sem correspondência", porque escolher ali atribuiria a doação de
                uma pessoa a outra. */}
            <div style={{ fontSize: 11.5, color: C.text3, marginTop: 3 }}>
              Só aparece aqui o que tem candidato com <strong>nome compatível</strong>. Na dúvida,
              use <strong>Ignorar</strong> — a doação continua no balanço, só fica sem dono.
            </div>
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
                      {/* ⚠️ DIZ por que este candidato está na lista. Sem o selo,
                          todos parecem igualmente prováveis e o operador escolhe
                          o primeiro. */}
                      {c.nome_parecido && <span style={{ fontSize: 10, fontWeight: 700, color: C.primary, background: C.primaryBg, padding: '1px 6px', borderRadius: 6 }}>nome compatível</span>}
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
