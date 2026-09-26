import { useCallback, useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { toast } from 'sonner';
import { marketing } from '../../../api';

// Marketing no ciclo criativo padrão de Eventos (2026-09-26).
// A tarefa do Marketing em cada fase vem da MATRIZ POR CULTO
// (marketing_ciclo_padroes + marketing_ciclo_itens_padrao · padrão global),
// não de adm_task_templates. É a mesma matriz que gera as tarefas das Demandas
// do Marketing: editar aqui vale para as tarefas que NASCEREM depois.

const CULTOS = [
  { v: null, l: 'Todos os cultos' },
  { v: 'cbrio', l: 'CBRio' },
  { v: 'ami', l: 'AMI' },
  { v: 'kids', l: 'Kids' },
];
const rotuloCulto = (c) => (CULTOS.find(x => x.v === (c || null)) || CULTOS[0]).l;
const nomeMembro = (m) => m.profile?.name || m.nome_display || 'Sem nome';
const VIS = { equipe: 'equipe vê', lider_move: 'equipe vê · só o líder marca', so_lider: 'só o líder vê' };

// "Pré-Briefing" (Eventos) e "Pré Briefing" (catálogo de fases) são a mesma fase.
export const chaveFase = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z]/g, '');

export function useMatrizMarketing(ativo = true) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const recarregar = useCallback(async () => {
    try {
      const [padroes, itens, membros] = await Promise.all([
        marketing.admin.cicloPadroes.list(),
        marketing.admin.cicloItens.list('global'),
        marketing.membros(),
      ]);
      setDados({
        padroes: (padroes || []).filter(p => !p.category_id && p.ativo !== false),
        itens: (itens || []).filter(i => i.ativo !== false),
        membros: (membros || []).filter(m => m.ativo !== false),
      });
      setErro(null);
    } catch (e) {
      setErro(e?.status === 403
        ? 'Só a coordenação do Marketing edita as entregas do Marketing.'
        : (e?.message || 'Não foi possível carregar o padrão do Marketing.'));
    }
  }, []);
  useEffect(() => { if (ativo && !dados && !erro) recarregar(); }, [ativo, dados, erro, recarregar]);
  return { dados, erro, recarregar };
}

const selStyle = { padding: '3px 6px', borderRadius: 6, border: '1px solid var(--cbrio-border)', background: 'var(--cbrio-input-bg, var(--cbrio-card))', color: 'var(--cbrio-text)', fontSize: 11 };

export function MatrizMarketingFase({ fase, matriz }) {
  const { dados, erro, recarregar } = matriz;
  const [novo, setNovo] = useState({ texto: '', culto: '', membro_id: '' });
  const [novaTarefa, setNovaTarefa] = useState({ culto: '', atribuido_a: '' });
  const [salvando, setSalvando] = useState(false);

  const cor = '#00B39D';
  const cab = (
    <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 99, background: cor + '20', color: cor, fontWeight: 600, flexShrink: 0 }}>Marketing</span>
  );
  if (erro) {
    return <div style={{ padding: '10px 16px', display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--cbrio-text3)' }}>{cab}{erro}</div>;
  }
  if (!dados) return null;

  const chaves = new Set(fase.etapas.map(chaveFase));
  const nomeFase = dados.padroes.find(p => chaves.has(chaveFase(p.nome_fase)))?.nome_fase
    || dados.itens.find(i => chaves.has(chaveFase(i.nome_fase)))?.nome_fase
    || fase.nome;
  const padroes = dados.padroes.filter(p => chaves.has(chaveFase(p.nome_fase)))
    .sort((a, b) => CULTOS.findIndex(c => c.v === (a.culto || null)) - CULTOS.findIndex(c => c.v === (b.culto || null)));
  const itens = dados.itens.filter(i => chaves.has(chaveFase(i.nome_fase)))
    .sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  const nomeDe = (id) => { const m = dados.membros.find(x => x.id === id); return m ? nomeMembro(m) : null; };

  async function acao(fn, ok) {
    setSalvando(true);
    try { await fn(); if (ok) toast.success(ok); await recarregar(); }
    catch (e) { toast.error(e?.message || 'Não foi possível salvar.'); }
    finally { setSalvando(false); }
  }

  const cultosUsados = new Set(padroes.map(p => p.culto || null));

  return (
    <div style={{ borderBottom: '1px solid var(--cbrio-border)', padding: '10px 16px', background: cor + '08' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        {cab}
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--cbrio-text)' }}>
          {padroes.length ? 'Uma tarefa por culto do evento' : 'O Marketing não tem tarefa nesta fase'}
        </span>
        <span style={{ fontSize: 10, color: 'var(--cbrio-text3)', marginLeft: 'auto' }}>vale para os ciclos que nascerem daqui pra frente</span>
      </div>

      {padroes.map(p => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 12, color: 'var(--cbrio-text2)' }}>
          <span style={{ minWidth: 110, fontWeight: 600 }}>{rotuloCulto(p.culto)}</span>
          <select disabled={salvando} value={p.atribuido_a || ''} style={selStyle}
            onChange={(e) => acao(() => marketing.admin.cicloPadroes.update(p.id, { atribuido_a: e.target.value || null }), 'Responsável atualizado')}>
            <option value="">Sem responsável</option>
            {dados.membros.map(m => <option key={m.id} value={m.id}>{nomeMembro(m)}</option>)}
          </select>
          <span style={{ fontSize: 10, color: 'var(--cbrio-text3)' }}>{VIS[p.visibilidade] || ''}</span>
          <button disabled={salvando} title="Tirar esta tarefa do padrão"
            onClick={() => { if (window.confirm(`Tirar a tarefa de ${rotuloCulto(p.culto)} desta fase?`)) acao(() => marketing.admin.cicloPadroes.remove(p.id), 'Removida'); }}
            style={{ marginLeft: 'auto', background: 'none', border: 'none', color: 'var(--cbrio-text3)', cursor: 'pointer' }}><X size={12} /></button>
        </div>
      ))}

      <div style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '4px 0 8px' }}>
        <select value={novaTarefa.culto} onChange={(e) => setNovaTarefa(f => ({ ...f, culto: e.target.value }))} style={selStyle}>
          {CULTOS.filter(c => !cultosUsados.has(c.v)).map(c => <option key={c.l} value={c.v || ''}>{c.l}</option>)}
        </select>
        <select value={novaTarefa.atribuido_a} onChange={(e) => setNovaTarefa(f => ({ ...f, atribuido_a: e.target.value }))} style={selStyle}>
          <option value="">Responsável…</option>
          {dados.membros.map(m => <option key={m.id} value={m.id}>{nomeMembro(m)}</option>)}
        </select>
        <button disabled={salvando || !novaTarefa.atribuido_a || CULTOS.every(c => cultosUsados.has(c.v))}
          onClick={() => acao(() => marketing.admin.cicloPadroes.create({
            category_id: 'global', nome_fase: nomeFase, culto: novaTarefa.culto || null, atribuido_a: novaTarefa.atribuido_a,
          }), 'Tarefa adicionada').then(() => setNovaTarefa({ culto: '', atribuido_a: '' }))}
          style={{ padding: '3px 10px', fontSize: 10, borderRadius: 6, border: 'none', background: cor, color: '#fff', cursor: 'pointer' }}>
          <Plus size={10} style={{ display: 'inline', verticalAlign: '-1px' }} /> tarefa
        </button>
      </div>

      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--cbrio-text3)', fontWeight: 600, marginBottom: 2 }}>Entregas da fase</div>
      {itens.length === 0 && <div style={{ fontSize: 12, color: 'var(--cbrio-text3)', padding: '2px 0' }}>Nenhuma entrega cadastrada.</div>}
      {itens.map(i => (
        <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 12, color: 'var(--cbrio-text2)' }}>
          <span style={{ color: 'var(--cbrio-text3)', fontSize: 8 }}>{'●'}</span>
          <span style={{ flex: 1 }}>{i.texto}{i.exige_registro ? ' · exige registro' : ''}</span>
          <span style={{ fontSize: 10, color: 'var(--cbrio-text3)' }}>{rotuloCulto(i.culto)}</span>
          <span style={{ fontSize: 10, color: 'var(--cbrio-text3)', minWidth: 120, textAlign: 'right' }}>{nomeDe(i.membro_id) || 'responsável do culto'}</span>
          <button disabled={salvando} title="Tirar esta entrega"
            onClick={() => acao(() => marketing.admin.cicloItens.remove(i.id), 'Entrega removida')}
            style={{ background: 'none', border: 'none', color: 'var(--cbrio-text3)', cursor: 'pointer' }}><X size={12} /></button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
        <input placeholder="Nova entrega…" value={novo.texto} onChange={(e) => setNovo(f => ({ ...f, texto: e.target.value }))}
          style={{ ...selStyle, flex: 1, minWidth: 160, padding: 5 }} />
        <select value={novo.culto} onChange={(e) => setNovo(f => ({ ...f, culto: e.target.value }))} style={selStyle}>
          {CULTOS.map(c => <option key={c.l} value={c.v || ''}>{c.l}</option>)}
        </select>
        <select value={novo.membro_id} onChange={(e) => setNovo(f => ({ ...f, membro_id: e.target.value }))} style={selStyle}>
          <option value="">Responsável do culto</option>
          {dados.membros.map(m => <option key={m.id} value={m.id}>{nomeMembro(m)}</option>)}
        </select>
        <button disabled={salvando || !novo.texto.trim()}
          onClick={() => acao(() => marketing.admin.cicloItens.create({
            category_id: 'global', nome_fase: nomeFase, texto: novo.texto.trim(), culto: novo.culto || null,
            membro_id: novo.membro_id || null, ordem: (itens[itens.length - 1]?.ordem ?? 0) + 1,
          }), 'Entrega adicionada').then(() => setNovo({ texto: '', culto: '', membro_id: '' }))}
          style={{ padding: '4px 12px', fontSize: 10, borderRadius: 6, border: 'none', background: cor, color: '#fff', cursor: 'pointer' }}>+ Entrega</button>
      </div>
    </div>
  );
}
