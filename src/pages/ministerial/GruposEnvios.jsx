// ============================================================================
// Aba ENVIOS do /grupos (Marcos 2026-07-23)
//
// Uma tela só pra: (1) LIGAR/DESLIGAR os envios automáticos (kill-switch · o
// "botão de pânico" que o Marcos pediu depois do susto), (2) disparar MANUAL a
// chamada do mês pra um líder / bairro / rede / todos (com prévia + confirmação
// pelo número), (3) disparar a renovação de temporada, e (4) ver o histórico +
// o que dispara sozinho (transparência). Nada de texto livre — só template.
// ============================================================================
import { useState, useEffect, useCallback } from 'react';
import { grupos as api } from '../../api';
import { Button } from '../../components/ui/button';
import { toast } from 'sonner';
import { Send, Power, Users, CheckCircle2, AlertTriangle, RefreshCw, Zap, Info, Paperclip, FileText, X } from 'lucide-react';

const C = {
  bg: 'var(--cbrio-bg)', card: 'var(--cbrio-card)', text: 'var(--cbrio-text)',
  t2: 'var(--cbrio-text2)', t3: 'var(--cbrio-text3)', border: 'var(--cbrio-border)',
  primary: '#00B39D', primaryBg: '#00B39D18',
  green: '#10b981', greenBg: '#10b98120', red: '#ef4444', redBg: '#ef444420',
  amber: '#f59e0b', amberBg: '#f59e0b20',
};
const selStyle = { padding: '8px 10px', borderRadius: 8, border: `1px solid ${C.border}`, fontSize: 13, background: 'var(--cbrio-input-bg)', color: C.text, minWidth: 180 };
const fmtDT = (d) => { try { return new Date(d).toLocaleString('pt-BR'); } catch { return ''; } };

// Envios que disparam SOZINHOS por evento (transparência · não são botões)
const AUTOMATICOS_EVENTO = [
  ['Nova inscrição → líder', 'quando alguém se inscreve num grupo'],
  ['Inscrição recebida → a pessoa', 'quando alguém se inscreve'],
  ['Pedido aprovado → a pessoa', 'quando o líder aprova'],
];

export default function GruposEnvios({ podeEditar = false }) {
  const [config, setConfig] = useState(null);
  const [aux, setAux] = useState(null);
  const [historico, setHistorico] = useState([]);
  const [renPainel, setRenPainel] = useState(null);
  const [loading, setLoading] = useState(true);
  const [salvandoConfig, setSalvandoConfig] = useState(false);

  const [tipoAud, setTipoAud] = useState('todos');
  const [valorAud, setValorAud] = useState('');
  const [preview, setPreview] = useState(null);
  const [carregandoPreview, setCarregandoPreview] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [dispRenov, setDispRenov] = useState(false);

  // Box "Materiais" — mesmo formato do de chamada, com anexo de arquivo.
  const [tipoAudM, setTipoAudM] = useState('todos');
  const [valorAudM, setValorAudM] = useState('');
  const [arquivoM, setArquivoM] = useState(null);
  const [previewM, setPreviewM] = useState(null);
  const [carregandoPreviewM, setCarregandoPreviewM] = useState(false);
  const [enviandoM, setEnviandoM] = useState(false);

  // Box "Convite de abertura" — avisa o líder que as inscrições abriram (Utility).
  const [tipoAudA, setTipoAudA] = useState('todos');
  const [valorAudA, setValorAudA] = useState('');
  const [previewA, setPreviewA] = useState(null);
  const [carregandoPreviewA, setCarregandoPreviewA] = useState(false);
  const [enviandoA, setEnviandoA] = useState(false);
  const [confirmandoA, setConfirmandoA] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [cfg, a, h, rp] = await Promise.all([
        api.envios.getConfig().catch(() => ({ bloqueio_total: false, auto_frequencia: false })),
        api.envios.aux().catch(() => ({ redes: [], bairros: [], grupos: [], temporada: null })),
        api.envios.historico().then(r => r?.items || []).catch(() => []),
        api.renovacao.painel().catch(() => null),
      ]);
      setConfig(cfg); setAux(a); setHistorico(h); setRenPainel(rp);
    } catch { toast.error('Erro ao carregar a aba de envios'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Bloqueio GERAL (garantia 100%): quando ligado, NADA de grupos sai.
  const toggleBloqueio = async () => {
    if (!podeEditar) return;
    const novo = !config?.bloqueio_total;
    if (novo && !confirm('BLOQUEAR todos os envios de grupos? Enquanto ligado, NADA sai — nem automático, nem por evento (confirmação de inscrição, aviso ao líder), nem manual. É o botão de pânico. Confirma?')) return;
    setSalvandoConfig(true);
    try {
      const r = await api.envios.setConfig({ bloqueio_total: novo });
      setConfig(r);
      toast.success(novo ? 'TUDO bloqueado — nenhum envio de grupos vai sair' : 'Bloqueio geral desligado');
    } catch (e) { toast.error(e.message || 'Erro ao salvar'); }
    finally { setSalvandoConfig(false); }
  };

  // Automático por tipo (hoje só a frequência mensal é automática).
  const toggleAutoFreq = async () => {
    if (!podeEditar) return;
    const novo = !config?.auto_frequencia;
    if (novo && !confirm('LIGAR o envio AUTOMÁTICO da chamada mensal de frequência? O sistema passa a disparar sozinho 1×/mês (temporada em curso · respeitando opt-out).')) return;
    setSalvandoConfig(true);
    try {
      const r = await api.envios.setConfig({ auto_frequencia: novo });
      setConfig(r);
      toast.success(novo ? 'Frequência mensal automática LIGADA' : 'Frequência mensal automática DESLIGADA');
    } catch (e) { toast.error(e.message || 'Erro ao salvar'); }
    finally { setSalvandoConfig(false); }
  };

  const audiencia = () => ({ tipo: tipoAud, valor: tipoAud === 'todos' ? null : valorAud });
  const audienciaValida = () => tipoAud === 'todos' || !!valorAud;

  const gerarPreview = async () => {
    if (!audienciaValida()) { toast.error('Escolha o destino.'); return; }
    setCarregandoPreview(true); setPreview(null);
    try { setPreview(await api.envios.previewFrequencia(audiencia())); }
    catch (e) { toast.error(e.message || 'Erro ao gerar prévia'); }
    finally { setCarregandoPreview(false); }
  };

  const enviarFrequencia = async () => {
    setEnviando(true); setConfirmando(false);
    try {
      const r = await api.envios.dispararFrequencia(audiencia());
      toast.success(`${r.enfileirados} mensagem(ns) na fila de envio`);
      setPreview(null); setValorAud('');
      api.envios.historico().then(res => setHistorico(res?.items || [])).catch(() => {});
    } catch (e) { toast.error(e.message || 'Erro ao enviar'); }
    finally { setEnviando(false); }
  };

  // ── Material (anexo) ──
  const audienciaM = () => ({ tipo: tipoAudM, valor: tipoAudM === 'todos' ? null : valorAudM });
  const audienciaMValida = () => tipoAudM === 'todos' || !!valorAudM;

  const gerarPreviewM = async () => {
    if (!audienciaMValida()) { toast.error('Escolha o destino.'); return; }
    setCarregandoPreviewM(true); setPreviewM(null);
    try { setPreviewM(await api.envios.previewMaterial(audienciaM())); }
    catch (e) { toast.error(e.message || 'Erro ao gerar prévia'); }
    finally { setCarregandoPreviewM(false); }
  };

  const enviarMaterial = async () => {
    if (!arquivoM) { toast.error('Anexe o arquivo do material.'); return; }
    if (!(previewM?.total > 0)) { toast.error('Gere a prévia — ninguém pra enviar.'); return; }
    if (!confirm(`Enviar o material "${arquivoM.name}" para ${previewM.total} líder(es)?`)) return;
    setEnviandoM(true);
    try {
      const r = await api.envios.dispararMaterial(arquivoM, audienciaM(), arquivoM.name);
      if (r?.motivo === 'template_material_nao_configurado') {
        toast.warning('Material salvo, mas o envio por WhatsApp precisa do template aprovado na Meta (testamos na próxima temporada).');
      } else {
        toast.success(`${r?.enfileirados ?? 0} mensagem(ns) na fila de envio`);
      }
      setPreviewM(null); setArquivoM(null); setValorAudM('');
      api.envios.historico().then(res => setHistorico(res?.items || [])).catch(() => {});
    } catch (e) { toast.error(e.message || 'Erro ao enviar o material'); }
    finally { setEnviandoM(false); }
  };

  // ── Convite de abertura (líderes encaminham no grupo) ──
  const audienciaA = () => ({ tipo: tipoAudA, valor: tipoAudA === 'todos' ? null : valorAudA });
  const audienciaAValida = () => tipoAudA === 'todos' || !!valorAudA;

  const gerarPreviewA = async () => {
    if (!audienciaAValida()) { toast.error('Escolha o destino.'); return; }
    setCarregandoPreviewA(true); setPreviewA(null);
    try { setPreviewA(await api.envios.previewAbertura(audienciaA())); }
    catch (e) { toast.error(e.message || 'Erro ao gerar prévia'); }
    finally { setCarregandoPreviewA(false); }
  };

  const enviarAbertura = async () => {
    setEnviandoA(true); setConfirmandoA(false);
    try {
      const r = await api.envios.dispararAbertura(audienciaA());
      toast.success(`${r.enfileirados} mensagem(ns) na fila de envio`);
      setPreviewA(null); setValorAudA('');
      api.envios.historico().then(res => setHistorico(res?.items || [])).catch(() => {});
    } catch (e) { toast.error(e.message || 'Erro ao enviar'); }
    finally { setEnviandoA(false); }
  };

  const dispararRenovacao = async () => {
    if (!renPainel?.temporada?.id) return;
    const sem = renPainel?.resumo?.sem_resposta ?? 0;
    const jaEnviou = (renPainel?.resumo?.enviadas ?? 0) > 0;
    const alvo = jaEnviou ? sem : (renPainel?.resumo?.podem_receber ?? 0);
    if (!alvo) { toast.info('Ninguém para enviar agora.'); return; }
    if (!confirm(jaEnviou
      ? `Reenviar a renovação pros ${sem} líder(es) que ainda não responderam?`
      : `Enviar a pergunta de renovação pros líderes de ${alvo} grupo(s) de ${renPainel.temporada.label}?`)) return;
    setDispRenov(true);
    try {
      const r = await api.renovacao.disparar(renPainel.temporada.id);
      toast.success(`${r?.enfileirados ?? 0} na fila de envio`);
      load();
    } catch (e) { toast.error(e.message || 'Erro ao disparar a renovação'); }
    finally { setDispRenov(false); }
  };

  if (loading) return <div style={{ padding: 60, textAlign: 'center', color: C.t3 }}>Carregando...</div>;
  const bloqueado = config?.bloqueio_total === true;
  const autoFreq = config?.auto_frequencia === true;

  return (
    <div style={{ paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 1) BLOQUEIO GERAL — garantia 100% (botão de pânico) */}
      <div style={{
        background: bloqueado ? `${C.red}10` : C.card, borderRadius: 16,
        border: `1px solid ${bloqueado ? C.red : C.border}`,
        borderLeft: `4px solid ${bloqueado ? C.red : C.green}`, padding: 18,
        display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
      }}>
        <Power size={26} style={{ color: bloqueado ? C.red : C.green, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 240 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: bloqueado ? C.red : C.text }}>
            {bloqueado ? 'TUDO BLOQUEADO — nenhum envio de grupos sai' : 'Envios de grupos: liberados'}
          </div>
          <div style={{ fontSize: 12.5, color: C.t3, marginTop: 3, lineHeight: 1.5 }}>
            {bloqueado
              ? 'Garantia 100%: nada sai — nem automático, nem por evento (confirmação de inscrição, aviso ao líder), nem manual. Desligue pra voltar ao normal.'
              : 'Botão de pânico: bloqueia de uma vez TODOS os envios de grupos (automático + evento + manual). Use se algo parecer errado.'}
          </div>
        </div>
        {podeEditar && (
          <Button variant={bloqueado ? 'default' : 'outline'} disabled={salvandoConfig} onClick={toggleBloqueio}>
            {salvandoConfig ? 'Salvando...' : (bloqueado ? 'Desbloquear' : 'Bloquear tudo')}
          </Button>
        )}
      </div>

      {/* 1b) AUTOMÁTICOS POR TIPO — cada mensagem automática liga/desliga sozinha */}
      <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: 18, opacity: bloqueado ? 0.6 : 1 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: '0 0 4px' }}>Envios automáticos (por mensagem)</h2>
        <p style={{ fontSize: 12.5, color: C.t3, margin: '0 0 12px', lineHeight: 1.5 }}>
          Ligue/desligue cada envio automático separadamente. {bloqueado && <strong style={{ color: C.red }}>O bloqueio geral está ligado — nada sai enquanto isso.</strong>}
        </p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, border: `1px solid ${C.border}`, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: C.text }}>Chamada mensal de frequência</div>
            <div style={{ fontSize: 11.5, color: C.t3, marginTop: 2 }}>1×/mês, pros líderes da temporada em curso (respeita opt-out). {autoFreq ? 'LIGADA' : 'desligada'}.</div>
          </div>
          {podeEditar && (
            <Button size="sm" variant={autoFreq ? 'outline' : 'default'} disabled={salvandoConfig || bloqueado} onClick={toggleAutoFreq}>
              {autoFreq ? 'Desligar' : 'Ligar'}
            </Button>
          )}
        </div>
      </div>

      {/* 2) DISPARO MANUAL · FREQUÊNCIA */}
      <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Send size={17} style={{ color: C.primary }} />
          <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>Pedir a chamada do mês (manual)</h2>
        </div>
        <p style={{ fontSize: 12.5, color: C.t3, margin: '0 0 12px', lineHeight: 1.5 }}>
          Manda pro líder o link pra marcar quem participou. Escolha o destino, veja a prévia e confirme.
          Só sai por template aprovado; quem pediu pra não receber fica de fora.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <select value={tipoAud} onChange={e => { setTipoAud(e.target.value); setValorAud(''); setPreview(null); }} style={selStyle}>
            <option value="todos">Todos os líderes</option>
            <option value="lider">Um líder específico</option>
            <option value="bairro">Por bairro</option>
            <option value="rede">Por rede</option>
          </select>
          {tipoAud === 'lider' && (
            <select value={valorAud} onChange={e => { setValorAud(e.target.value); setPreview(null); }} style={{ ...selStyle, minWidth: 260 }}>
              <option value="">Escolha o grupo/líder...</option>
              {(aux?.grupos || []).map(g => <option key={g.id} value={g.id}>{g.nome}{g.lider_nome ? ` — ${g.lider_nome}` : ''}</option>)}
            </select>
          )}
          {tipoAud === 'bairro' && (
            <select value={valorAud} onChange={e => { setValorAud(e.target.value); setPreview(null); }} style={selStyle}>
              <option value="">Escolha o bairro...</option>
              {(aux?.bairros || []).map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          )}
          {tipoAud === 'rede' && (
            <select value={valorAud} onChange={e => { setValorAud(e.target.value); setPreview(null); }} style={selStyle}>
              <option value="">Escolha a rede...</option>
              {(aux?.redes || []).map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
            </select>
          )}
          <Button variant="outline" disabled={carregandoPreview || !audienciaValida()} onClick={gerarPreview}>
            {carregandoPreview ? 'Calculando...' : 'Ver prévia'}
          </Button>
        </div>

        {preview && (
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, background: C.bg }}>
            <div style={{ fontSize: 13.5, color: C.text, fontWeight: 600, marginBottom: 8 }}>
              <Users size={14} style={{ display: 'inline', verticalAlign: -2, marginRight: 6, color: C.primary }} />
              {preview.total} líder(es) vão receber · chamada de {preview.mes}
            </div>
            {preview.exemplo && (
              <div style={{ fontSize: 12.5, color: C.t2, fontStyle: 'italic', borderLeft: `3px solid ${C.primary}`, paddingLeft: 10, marginBottom: 10, lineHeight: 1.5 }}>
                Ex. ({preview.exemplo.lider}): "{preview.exemplo.texto}"
              </div>
            )}
            {preview.excluidos_total > 0 && (
              <div style={{ fontSize: 12, color: C.t3, marginBottom: 10 }}>
                🚫 {preview.excluidos_total} não recebem:
                {preview.excluidos.sem_lider ? ` ${preview.excluidos.sem_lider} sem líder ·` : ''}
                {preview.excluidos.sem_telefone ? ` ${preview.excluidos.sem_telefone} sem WhatsApp ·` : ''}
                {preview.excluidos.opt_out ? ` ${preview.excluidos.opt_out} pediram pra não receber ·` : ''}
                {preview.excluidos.sem_roster ? ` ${preview.excluidos.sem_roster} sem participantes` : ''}
              </div>
            )}
            {preview.total > 0 ? (
              <Button disabled={enviando || !podeEditar} onClick={() => setConfirmando(true)}>
                <Send size={14} style={{ marginRight: 6 }} /> Enviar para {preview.total} líder(es)
              </Button>
            ) : (
              <div style={{ fontSize: 13, color: C.amber }}>Ninguém para enviar com esse destino.</div>
            )}
          </div>
        )}
      </div>

      {/* 2a) CONVITE DE ABERTURA — avisa o líder que as inscrições abriram, pra
           ele encaminhar o link no grupo (Utility · o link vive no template) */}
      <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: 18, opacity: bloqueado ? 0.6 : 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <Send size={17} style={{ color: C.primary }} />
          <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>Convite de abertura pros líderes (manual)</h2>
        </div>
        <p style={{ fontSize: 12.5, color: C.t3, margin: '0 0 12px', lineHeight: 1.5 }}>
          Avisa cada líder que as inscrições da temporada abriram e manda o texto pra ele <strong>encaminhar no WhatsApp do próprio grupo</strong> (o link vai no template). {bloqueado && <strong style={{ color: C.red }}>Bloqueio geral ligado — nada sai. </strong>}
          Só sai depois do template <code>abertura_grupos_convite_lider</code> ser aprovado na Meta.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <select value={tipoAudA} onChange={e => { setTipoAudA(e.target.value); setValorAudA(''); setPreviewA(null); }} style={selStyle}>
            <option value="todos">Todos os líderes</option>
            <option value="lider">Um líder específico</option>
            <option value="bairro">Por bairro</option>
            <option value="rede">Por rede</option>
          </select>
          {tipoAudA === 'lider' && (
            <select value={valorAudA} onChange={e => { setValorAudA(e.target.value); setPreviewA(null); }} style={{ ...selStyle, minWidth: 260 }}>
              <option value="">Escolha o grupo/líder...</option>
              {(aux?.grupos || []).map(g => <option key={g.id} value={g.id}>{g.nome}{g.lider_nome ? ` — ${g.lider_nome}` : ''}</option>)}
            </select>
          )}
          {tipoAudA === 'bairro' && (
            <select value={valorAudA} onChange={e => { setValorAudA(e.target.value); setPreviewA(null); }} style={selStyle}>
              <option value="">Escolha o bairro...</option>
              {(aux?.bairros || []).map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          )}
          {tipoAudA === 'rede' && (
            <select value={valorAudA} onChange={e => { setValorAudA(e.target.value); setPreviewA(null); }} style={selStyle}>
              <option value="">Escolha a rede...</option>
              {(aux?.redes || []).map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
            </select>
          )}
          <Button variant="outline" disabled={carregandoPreviewA || !audienciaAValida()} onClick={gerarPreviewA}>
            {carregandoPreviewA ? 'Calculando...' : 'Ver prévia'}
          </Button>
        </div>

        {previewA && (
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, background: C.bg }}>
            <div style={{ fontSize: 13.5, color: C.text, fontWeight: 600, marginBottom: 8 }}>
              <Users size={14} style={{ display: 'inline', verticalAlign: -2, marginRight: 6, color: C.primary }} />
              {previewA.total} líder(es) vão receber o convite de abertura
            </div>
            {previewA.exemplo && (
              <div style={{ fontSize: 12.5, color: C.t2, fontStyle: 'italic', borderLeft: `3px solid ${C.primary}`, paddingLeft: 10, marginBottom: 10, lineHeight: 1.5 }}>
                Ex. ({previewA.exemplo.lider}): "{previewA.exemplo.texto}"
              </div>
            )}
            {previewA.excluidos_total > 0 && (
              <div style={{ fontSize: 12, color: C.t3, marginBottom: 10 }}>
                🚫 {previewA.excluidos_total} não recebem:
                {previewA.excluidos.sem_lider ? ` ${previewA.excluidos.sem_lider} sem líder ·` : ''}
                {previewA.excluidos.sem_telefone ? ` ${previewA.excluidos.sem_telefone} sem WhatsApp ·` : ''}
                {previewA.excluidos.opt_out ? ` ${previewA.excluidos.opt_out} pediram pra não receber` : ''}
              </div>
            )}
            {previewA.total > 0 ? (
              <Button disabled={enviandoA || !podeEditar} onClick={() => setConfirmandoA(true)}>
                <Send size={14} style={{ marginRight: 6 }} /> Enviar para {previewA.total} líder(es)
              </Button>
            ) : (
              <div style={{ fontSize: 13, color: C.amber }}>Ninguém para enviar com esse destino.</div>
            )}
          </div>
        )}
      </div>

      {/* 2b) MATERIAIS (manual · igual ao de chamada, com anexo de arquivo) */}
      <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: 18, opacity: bloqueado ? 0.6 : 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <FileText size={17} style={{ color: C.primary }} />
          <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>Enviar material (manual)</h2>
        </div>
        <p style={{ fontSize: 12.5, color: C.t3, margin: '0 0 12px', lineHeight: 1.5 }}>
          Anexe o arquivo e escolha o destino — mesma lógica da chamada. {bloqueado && <strong style={{ color: C.red }}>Bloqueio geral ligado — nada sai. </strong>}
          O envio por WhatsApp depende do template de material aprovado na Meta (testamos na próxima temporada).
        </p>
        {/* Anexo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '8px 14px', borderRadius: 8, border: `1px dashed ${C.primary}`, color: C.primary, fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
            <Paperclip size={14} /> {arquivoM ? 'Trocar arquivo' : 'Anexar arquivo'}
            <input type="file" style={{ display: 'none' }} onChange={e => { setArquivoM(e.target.files?.[0] || null); setPreviewM(null); }} />
          </label>
          {arquivoM && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: C.text }}>
              <FileText size={13} style={{ color: C.t3 }} /> {arquivoM.name}
              <button type="button" onClick={() => setArquivoM(null)} style={{ background: 'none', border: 'none', color: C.t3, cursor: 'pointer', display: 'flex' }}><X size={14} /></button>
            </span>
          )}
        </div>
        {/* Destino (igual ao box de chamada) */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <select value={tipoAudM} onChange={e => { setTipoAudM(e.target.value); setValorAudM(''); setPreviewM(null); }} style={selStyle}>
            <option value="todos">Todos os líderes</option>
            <option value="lider">Um líder específico</option>
            <option value="bairro">Por bairro</option>
            <option value="rede">Por rede</option>
          </select>
          {tipoAudM === 'lider' && (
            <select value={valorAudM} onChange={e => { setValorAudM(e.target.value); setPreviewM(null); }} style={{ ...selStyle, minWidth: 260 }}>
              <option value="">Escolha o grupo/líder...</option>
              {(aux?.grupos || []).map(g => <option key={g.id} value={g.id}>{g.nome}{g.lider_nome ? ` — ${g.lider_nome}` : ''}</option>)}
            </select>
          )}
          {tipoAudM === 'bairro' && (
            <select value={valorAudM} onChange={e => { setValorAudM(e.target.value); setPreviewM(null); }} style={selStyle}>
              <option value="">Escolha o bairro...</option>
              {(aux?.bairros || []).map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          )}
          {tipoAudM === 'rede' && (
            <select value={valorAudM} onChange={e => { setValorAudM(e.target.value); setPreviewM(null); }} style={selStyle}>
              <option value="">Escolha a rede...</option>
              {(aux?.redes || []).map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
            </select>
          )}
          <Button variant="outline" disabled={carregandoPreviewM || !audienciaMValida()} onClick={gerarPreviewM}>
            {carregandoPreviewM ? 'Calculando...' : 'Ver prévia'}
          </Button>
        </div>

        {previewM && (
          <div style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: 14, background: C.bg }}>
            <div style={{ fontSize: 13.5, color: C.text, fontWeight: 600, marginBottom: 8 }}>
              <Users size={14} style={{ display: 'inline', verticalAlign: -2, marginRight: 6, color: C.primary }} />
              {previewM.total} líder(es) vão receber o material
            </div>
            {previewM.excluidos_total > 0 && (
              <div style={{ fontSize: 12, color: C.t3, marginBottom: 10 }}>
                🚫 {previewM.excluidos_total} não recebem:
                {previewM.excluidos.sem_lider ? ` ${previewM.excluidos.sem_lider} sem líder ·` : ''}
                {previewM.excluidos.sem_telefone ? ` ${previewM.excluidos.sem_telefone} sem WhatsApp ·` : ''}
                {previewM.excluidos.opt_out ? ` ${previewM.excluidos.opt_out} pediram pra não receber ·` : ''}
                {previewM.excluidos.sem_roster ? ` ${previewM.excluidos.sem_roster} sem participantes` : ''}
              </div>
            )}
            {previewM.total > 0 ? (
              <Button disabled={enviandoM || !podeEditar || !arquivoM} onClick={enviarMaterial}>
                <Send size={14} style={{ marginRight: 6 }} /> {enviandoM ? 'Enviando...' : (arquivoM ? `Enviar material para ${previewM.total} líder(es)` : 'Anexe o arquivo primeiro')}
              </Button>
            ) : (
              <div style={{ fontSize: 13, color: C.amber }}>Ninguém para enviar com esse destino.</div>
            )}
          </div>
        )}
      </div>

      {/* 3) RENOVAÇÃO DE TEMPORADA */}
      {renPainel?.temporada && (
        <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <RefreshCw size={16} style={{ color: C.primary }} />
            <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>Renovação de temporada (manual)</h2>
          </div>
          <p style={{ fontSize: 12.5, color: C.t3, margin: '0 0 10px', lineHeight: 1.5 }}>
            Pergunta a cada líder se continua com o grupo na próxima temporada. Só funciona com as inscrições
            da temporada FECHADAS. {renPainel.temporada.inscricoes_abertas && <strong style={{ color: C.amber }}>As inscrições da {renPainel.temporada.label} estão abertas — feche-as antes de disparar.</strong>}
          </p>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12.5, color: C.t2, marginBottom: 12 }}>
            <span>Grupos: <strong style={{ color: C.text }}>{renPainel.resumo?.grupos ?? 0}</strong></span>
            <span>Enviadas: <strong style={{ color: C.text }}>{renPainel.resumo?.enviadas ?? 0}</strong></span>
            <span>Continuam: <strong style={{ color: C.green }}>{renPainel.resumo?.continuam ?? 0}</strong></span>
            <span>Não continuam: <strong style={{ color: C.red }}>{renPainel.resumo?.nao_continuam ?? 0}</strong></span>
            <span>Sem resposta: <strong style={{ color: C.amber }}>{renPainel.resumo?.sem_resposta ?? 0}</strong></span>
          </div>
          {podeEditar && (
            <Button variant="outline" disabled={dispRenov || renPainel.temporada.inscricoes_abertas} onClick={dispararRenovacao}>
              <RefreshCw size={14} style={{ marginRight: 6 }} />
              {dispRenov ? 'Enviando...' : ((renPainel.resumo?.enviadas ?? 0) > 0 ? `Reenviar aos sem resposta (${renPainel.resumo?.sem_resposta ?? 0})` : `Enviar renovação (${renPainel.resumo?.podem_receber ?? 0})`)}
            </Button>
          )}
        </div>
      )}

      {/* 4) O QUE DISPARA SOZINHO (transparência) */}
      <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <Zap size={16} style={{ color: C.amber }} />
          <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: 0 }}>O que o sistema envia sozinho</h2>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {bloqueado
            ? <Linha nome="TODOS os envios de grupos" quando="BLOQUEADOS (bloqueio geral ligado)" cor={C.red} />
            : <Linha nome="Chamada mensal de frequência → líder" quando={autoFreq ? 'automático · 1×/mês (temporada em curso)' : 'DESLIGADO agora'} cor={autoFreq ? C.amber : C.t3} />}
          {!bloqueado && AUTOMATICOS_EVENTO.map(([n, q]) => <Linha key={n} nome={n} quando={q} cor={C.t3} />)}
          <div style={{ fontSize: 11.5, color: C.t3, marginTop: 4, lineHeight: 1.5, display: 'flex', gap: 6 }}>
            <Info size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            Cobrança automática de relato e estudo automático foram <strong>removidos</strong>. Nada é enviado por texto livre — só templates aprovados pela Meta.
          </div>
        </div>
      </div>

      {/* 5) HISTÓRICO */}
      <div style={{ background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: 18 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: C.text, margin: '0 0 10px' }}>Últimos envios</h2>
        {historico.length === 0 ? (
          <div style={{ fontSize: 13, color: C.t3 }}>Nenhum envio de grupos registrado ainda.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
            {historico.map(h => {
              const cor = h.status === 'enviado' ? C.green : h.status === 'erro' ? C.red : C.amber;
              return (
                <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, padding: '6px 0', borderBottom: `1px solid ${C.border}` }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: cor, flexShrink: 0 }} />
                  <span style={{ color: C.t2, minWidth: 128 }}>{fmtDT(h.criado_em)}</span>
                  <span style={{ color: C.text, minWidth: 130, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.nome || h.telefone || '—'}</span>
                  <span style={{ color: C.t3, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.template} · {(h.contexto || '').replace('grupos.', '')}</span>
                  <span style={{ color: cor, fontWeight: 600 }}>{h.status}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirmação do envio de frequência (número = o freio) */}
      {confirmando && preview && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', padding: 16 }}>
          <div style={{ width: '100%', maxWidth: 420, background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: C.text, margin: '0 0 10px' }}>Confirmar envio</h3>
            <p style={{ fontSize: 13.5, color: C.t2, margin: '0 0 16px', lineHeight: 1.6 }}>
              Vou mandar a chamada do mês para <strong style={{ color: C.primary }}>{preview.total} líder(es)</strong> agora.
              {preview.total >= 20 && <> É um disparo grande — confirme que é isso.</>}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <Button variant="outline" style={{ flex: 1 }} onClick={() => setConfirmando(false)}>Cancelar</Button>
              <Button style={{ flex: 1 }} disabled={enviando} onClick={enviarFrequencia}>
                {enviando ? 'Enviando...' : `Enviar para ${preview.total}`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmação do convite de abertura (número = o freio) */}
      {confirmandoA && previewA && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1100, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.55)', padding: 16 }}>
          <div style={{ width: '100%', maxWidth: 420, background: C.card, borderRadius: 16, border: `1px solid ${C.border}`, padding: 20 }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: C.text, margin: '0 0 10px' }}>Confirmar envio</h3>
            <p style={{ fontSize: 13.5, color: C.t2, margin: '0 0 16px', lineHeight: 1.6 }}>
              Vou mandar o convite de abertura para <strong style={{ color: C.primary }}>{previewA.total} líder(es)</strong> agora — eles encaminham o link no grupo.
              {previewA.total >= 20 && <> É um disparo grande — confirme que é isso.</>}
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <Button variant="outline" style={{ flex: 1 }} onClick={() => setConfirmandoA(false)}>Cancelar</Button>
              <Button style={{ flex: 1 }} disabled={enviandoA} onClick={enviarAbertura}>
                {enviandoA ? 'Enviando...' : `Enviar para ${previewA.total}`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Linha({ nome, quando, cor }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5 }}>
      <CheckCircle2 size={13} style={{ color: cor, flexShrink: 0 }} />
      <span style={{ color: 'var(--cbrio-text)', flex: 1 }}>{nome}</span>
      <span style={{ color: cor, fontWeight: 600, whiteSpace: 'nowrap' }}>{quando}</span>
    </div>
  );
}
