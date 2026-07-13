// ============================================================================
// NovaSolicitacaoForm — form oficial de criação de solicitação (reusável)
// ============================================================================
// Extraído de src/pages/Solicitacoes.jsx (2026-07-03) pra permitir outros
// pontos de entrada além da página — ex.: a ocorrência do culto na Produção
// abre este MESMO form prefillado. É o intake oficial: validações por
// categoria, SLA em tempo real, upload de comprovante/fotos e o fluxo de
// aprovação (origem/BPMN) intactos no backend, qualquer que seja o host.
//
// ⚠️ Os <SelectContent> usam z-[1200]: o host da Produção é um modal custom em
// z-1100 e o portal do Radix (z-50 padrão) abriria ATRÁS do overlay — dropdown
// parecia "travado". Se um host novo passar de z-1200, subir os selects junto.
//
// Props:
//   prefill              · objeto mesclado sobre o FORM_INITIAL no mount
//                          (ex.: { categoria, titulo, descricao, eh_urgente })
//   categoriasPermitidas · array de values pra limitar o select (null = todas)
//   onCreated(criada)    · chamado após sucesso, com a solicitação criada
//   onCancel()           · botão Cancelar (o host fecha o modal)
//   onDirtyChange(bool)  · notifica edições não salvas — o host liga no
//                          useConfirmarSaida (regra de ouro: abrir e fechar
//                          sem digitar não pergunta)
// ============================================================================
import { useState, useEffect, useRef } from 'react';
import { solicitacoes as api } from '../../api';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Textarea } from '../ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Plus, Upload, FileText, X, Trash2, Image as ImageIcon } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { toast } from 'sonner';

export const CATEGORIAS = [
  { value: 'compras',        label: 'Compras',             color: 'bg-orange-500/15 text-orange-700 dark:text-orange-400', areaResp: 'logistica_compras' },
  { value: 'infraestrutura', label: 'Serviços',            color: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-400', areaResp: 'manutencao' },
  { value: 'servico',        label: 'Serviço externo (contratação)', color: 'bg-sky-500/15 text-sky-700 dark:text-sky-400', areaResp: 'logistica_compras', sub: 'servico' },
  { value: 'pagamento',      label: 'Pagamento',           color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400', areaResp: 'financeiro', sub: 'pagamento' },
  { value: 'reembolso',      label: 'Reembolso',           color: 'bg-green-500/15 text-green-700 dark:text-green-400',    areaResp: 'financeiro', sub: 'reembolso' },
  { value: 'reserva_espaco', label: 'Reserva de Espaço',   color: 'bg-purple-500/15 text-purple-700 dark:text-purple-400', areaResp: 'reserva_espaco' },
  { value: 'hospitalidade',  label: 'Hospitalidade',       color: 'bg-rose-500/15 text-rose-700 dark:text-rose-400',       areaResp: 'hospitalidade' },
  { value: 'ti',             label: 'TI',                  color: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',       areaResp: 'ti' },
  { value: 'marketing',      label: 'Marketing',           color: 'bg-pink-500/15 text-pink-700 dark:text-pink-400',       areaResp: 'marketing' },
  { value: 'producao',       label: 'Produção de Culto',   color: 'bg-violet-500/15 text-violet-700 dark:text-violet-400', areaResp: 'producao' },
  { value: 'ferias',         label: 'Férias',              color: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-400',       areaResp: 'rh', sub: 'ferias' },
  { value: 'licenca',        label: 'Licença',             color: 'bg-teal-500/15 text-teal-700 dark:text-teal-400',       areaResp: 'rh', sub: 'licenca' },
];

// Dica curta por tipo · ajuda o solicitante a escolher o fluxo certo
// (intencao em linguagem simples · evita confundir Compra/Serviço/Pagamento/Reembolso).
export const CATEGORIA_HINT = {
  compras:        'Comprar um produto/material. A logística cota e compra.',
  infraestrutura: 'Pedir um reparo/serviço à manutenção da igreja (goteira, ar-condicionado, elétrica, marcenaria...). Precisa contratar alguém de fora? Use Serviço externo.',
  servico:        'Contratação de fornecedor ou prestador de fora — passa por cotação e aprovação financeira.',
  pagamento:      'Pagar um fornecedor externo (boleto, nota fiscal) ou contratar/pagar um serviço de fora (gráfica, buffet, transporte...). Já gastou do próprio bolso? Use Reembolso.',
  reembolso:      'Você já pagou do próprio bolso e quer o dinheiro de volta.',
  reserva_espaco: 'Reservar um espaço/sala na agenda da igreja.',
  hospitalidade:  'Recepção, café, hospedagem de convidados e apoio a visitantes.',
  producao:       'Apoio da equipe de Produção: movimentação de material ou configuração de equipamentos (áudio, vídeo, palco, transmissão).',
};

// Área do solicitante NÃO e' escolhida no form (2026-06-01) · o backend
// deriva de quem preenche (usuario_areas/kpi_areas) e grava em area_cliente p/ KPI.

export const FORM_INITIAL = {
  titulo: '', descricao: '', justificativa: '',
  categoria: '', valor_estimado: '',
  eh_urgente: false, justificativa_urgencia: '',
  // Planejado · pedido já aprovado no planejamento da área pula a dupla aprovação
  eh_planejado: false,
  // Visibilidade · deixar visível pros colegas da própria área (default privada)
  compartilhar_area: false,
  data_necessaria: '',
  espaco_solicitado: '', data_uso: '', horario_inicio: '', horario_fim: '', qtde_pessoas: '',
  motivo_reembolso: '', data_compra: '',
  forma_pagamento: '', chave_pix: '', banco: '', agencia: '', conta: '', documento_file: null,
  // Compras / Pagamentos / Serviços (campos estruturados compartilhados)
  itens: '', link_referencia: '', favorecido_nome: '', favorecido_documento: '',
  recorrente: false, recorrencia: '',
  // Pedido em massa (compras) · lista de itens · cada um: descrição + qtd +
  // link + valor estimado + foto (imagem_file no client → imagem_url no envio)
  itens_lista: [],
  // Fotos gerais da solicitação (Serviços/Serviço externo) · Files locais →
  // sobem pro bucket 'solicitacoes' no envio e viram imagens_url (jsonb)
  imagens: [],
  // Marketing · intake por DOR · Pedro define entregavel/publico/prazo na triagem
};

const MAX_FOTOS = 3;

// Dropzone reutilizavel · comprovante de reembolso, boleto/NF de pagamento,
// proposta de serviço. Estado de drag interno (self-contained).
export function DocDropzone({ file, onFile, onClear }) {
  const [drag, setDrag] = useState(false);
  const inputRef = useRef(null);
  return (
    <>
      <div
        className={`border-2 border-dashed rounded-lg p-5 text-center transition-colors cursor-pointer
          ${drag ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}
          ${file ? 'border-green-500 bg-green-500/5' : ''}`}
        onDragOver={e => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => {
          e.preventDefault(); setDrag(false);
          const f = e.dataTransfer.files[0];
          if (f) onFile(f);
        }}
        onClick={() => inputRef.current?.click()}
      >
        {file ? (
          <div className="flex items-center justify-center gap-2">
            <FileText className="h-5 w-5 text-green-600 shrink-0" />
            <span className="text-sm text-green-700 truncate max-w-[220px]">{file.name}</span>
            <button type="button" className="ml-1 text-muted-foreground hover:text-red-500"
              onClick={e => { e.stopPropagation(); onClear(); if (inputRef.current) inputRef.current.value = ''; }}>
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5">
            <Upload className="h-7 w-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Arraste ou clique para selecionar</p>
            <p className="text-xs text-muted-foreground">PDF, JPG, PNG — até 10 MB</p>
          </div>
        )}
      </div>
      <input ref={inputRef} type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp"
        onChange={e => { const f = e.target.files[0]; if (f) onFile(f); }} />
    </>
  );
}

// Foto compacta por item do pedido em massa · thumbnail + selecionar/remover.
// `file` = arquivo recém-escolhido (preview local) · `url` = já enviado (edição).
function ItemFotoMini({ file, url, onFile, onClear }) {
  const inputRef = useRef(null);
  const preview = file ? URL.createObjectURL(file) : url;
  return (
    <div className="shrink-0">
      {preview ? (
        <div className="relative h-12 w-12">
          <img src={preview} alt="" className="h-12 w-12 rounded-md object-cover border border-border" />
          <button type="button"
            className="absolute -right-1.5 -top-1.5 rounded-full bg-background border border-border p-0.5 text-muted-foreground hover:text-red-500"
            onClick={() => { onClear(); if (inputRef.current) inputRef.current.value = ''; }}
            title="Remover foto">
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => inputRef.current?.click()}
          className="h-12 w-12 rounded-md border-2 border-dashed border-border hover:border-primary/40 flex flex-col items-center justify-center text-muted-foreground"
          title="Adicionar foto do item">
          <ImageIcon className="h-4 w-4" />
          <span className="text-[9px] leading-none mt-0.5">foto</span>
        </button>
      )}
      <input ref={inputRef} type="file" className="hidden" accept=".jpg,.jpeg,.png,.webp"
        onChange={e => { const f = e.target.files[0]; if (f) onFile(f); }} />
    </div>
  );
}

// Fotos gerais da solicitação · até MAX_FOTOS thumbnails + botão adicionar.
// Usado em Serviços (manutenção) e Serviço externo — quem atende/cota avalia
// pela imagem (goteira, equipamento, referência do serviço).
function FotosAnexos({ fotos, onAdd, onRemove }) {
  const inputRef = useRef(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {fotos.map((file, idx) => (
        <div key={idx} className="relative h-16 w-16">
          <img src={URL.createObjectURL(file)} alt="" className="h-16 w-16 rounded-md object-cover border border-border" />
          <button type="button"
            className="absolute -right-1.5 -top-1.5 rounded-full bg-background border border-border p-0.5 text-muted-foreground hover:text-red-500"
            onClick={() => onRemove(idx)}
            title="Remover foto">
            <X className="h-3 w-3" />
          </button>
        </div>
      ))}
      {fotos.length < MAX_FOTOS && (
        <button type="button" onClick={() => inputRef.current?.click()}
          className="h-16 w-16 rounded-md border-2 border-dashed border-border hover:border-primary/40 flex flex-col items-center justify-center text-muted-foreground"
          title="Adicionar foto">
          <ImageIcon className="h-5 w-5" />
          <span className="text-[9px] leading-none mt-1">foto</span>
        </button>
      )}
      <input ref={inputRef} type="file" className="hidden" accept=".jpg,.jpeg,.png,.webp"
        onChange={e => {
          const f = e.target.files[0];
          if (f) onAdd(f);
          e.target.value = '';
        }} />
    </div>
  );
}

// Toggle "é recorrente" + frequência · pagamento e serviço (aluguel, mensalidade)
function RecorrenteToggle({ form, setForm }) {
  return (
    <div className="space-y-2">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={form.recorrente}
          onChange={e => setForm(f => ({ ...f, recorrente: e.target.checked }))}
          className="h-4 w-4 cursor-pointer"
        />
        <span className="text-sm">É recorrente (se repete todo mês/período)</span>
      </label>
      {form.recorrente && (
        <Input
          value={form.recorrencia}
          onChange={e => setForm(f => ({ ...f, recorrencia: e.target.value }))}
          placeholder="Frequência · ex: mensal (todo dia 10), trimestral..."
          className="ml-6"
        />
      )}
    </div>
  );
}

export default function NovaSolicitacaoForm({ prefill = null, categoriasPermitidas = null, onCreated, onCancel, onDirtyChange }) {
  // Estado inicial · prefill vem do host (ex.: contexto da ocorrência do culto).
  // A identidade do objeto inicial detecta edição: qualquer setForm cria objeto
  // novo → dirty. Reset pós-envio realinha as duas referências.
  const inicialRef = useRef({ ...FORM_INITIAL, ...(prefill || {}) });
  const [form, setForm] = useState(inicialRef.current);
  const [submitting, setSubmitting] = useState(false);
  const [slaDefs, setSlaDefs] = useState([]);

  const cats = categoriasPermitidas
    ? CATEGORIAS.filter(c => categoriasPermitidas.includes(c.value))
    : CATEGORIAS;

  // Notifica o host sobre alterações não salvas (liga o useConfirmarSaida).
  useEffect(() => { onDirtyChange?.(form !== inicialRef.current); }, [form, onDirtyChange]);
  // Desmontou (host fechou o modal) → não há mais rascunho pendente.
  useEffect(() => () => { onDirtyChange?.(false); }, [onDirtyChange]);

  // Pedido em massa · helpers da lista de itens (compras)
  const addItem = () => setForm(f => ({
    ...f,
    itens_lista: [...f.itens_lista, { descricao: '', quantidade: '1', link_referencia: '', valor_estimado: '', valor_tipo: 'total', imagem_file: null, imagem_url: '' }],
  }));
  const updateItem = (idx, patch) => setForm(f => ({
    ...f,
    itens_lista: f.itens_lista.map((it, i) => i === idx ? { ...it, ...patch } : it),
  }));
  const removeItem = (idx) => setForm(f => ({
    ...f,
    itens_lista: f.itens_lista.filter((_, i) => i !== idx),
  }));
  // Carrega SLAs pra mostrar prazo expected no form
  useEffect(() => {
    api.slaDefs?.().then(setSlaDefs).catch(() => setSlaDefs([]));
  }, []);

  async function handleCreate() {
    try {
      setSubmitting(true);
      const payload = { ...form };
      delete payload.documento_file;
      delete payload.imagens;

      // Urgência única (2026-07-07): manual OU automática (data necessária mais
      // curta que o prazo padrão). A "Justificativa do pedido" cobre o porquê —
      // copia pro campo de urgência pro mapa de urgência frequente continuar vivo.
      payload.eh_urgente = ehUrgente;
      if (ehUrgente && !payload.justificativa_urgencia) {
        payload.justificativa_urgencia = (form.justificativa || '').trim()
          || (urgenteAuto ? `Data necessária (${form.data_necessaria}) abaixo do prazo padrão da categoria` : '');
      }

      if (payload.valor_estimado) payload.valor_estimado = parseFloat(payload.valor_estimado);
      else delete payload.valor_estimado;

      // Limpa campos opcionais vazios
      if (!payload.data_necessaria) delete payload.data_necessaria;
      if (!payload.data_uso) delete payload.data_uso;
      if (!payload.horario_inicio) delete payload.horario_inicio;
      if (!payload.horario_fim) delete payload.horario_fim;
      if (!payload.qtde_pessoas) delete payload.qtde_pessoas;
      else payload.qtde_pessoas = parseInt(payload.qtde_pessoas, 10);
      if (!payload.justificativa_urgencia) delete payload.justificativa_urgencia;
      if (!payload.espaco_solicitado) delete payload.espaco_solicitado;
      if (!payload.data_compra) delete payload.data_compra;
      if (!payload.motivo_reembolso) delete payload.motivo_reembolso;
      if (!payload.itens) delete payload.itens;
      if (!payload.link_referencia) delete payload.link_referencia;
      if (!payload.favorecido_nome) delete payload.favorecido_nome;
      if (!payload.favorecido_documento) delete payload.favorecido_documento;
      if (!payload.recorrencia) delete payload.recorrencia;
      // Marketing por dor · so título+descrição no intake (Pedro define o resto na triagem)

      // Upload do comprovante para Supabase Storage (bucket: solicitações)
      if (form.documento_file && supabase) {
        const ext = form.documento_file.name.split('.').pop().toLowerCase();
        const path = `comprovantes/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
        const { error: uploadError } = await supabase.storage
          .from('solicitacoes')
          .upload(path, form.documento_file, { upsert: false });
        if (uploadError) throw new Error('Erro ao enviar comprovante: ' + uploadError.message);
        const { data: { publicUrl } } = supabase.storage.from('solicitacoes').getPublicUrl(path);
        payload.documento_url = publicUrl;
      }

      // Fotos gerais (Serviços/Serviço externo) · sobe cada uma pro bucket e
      // manda só as URLs públicas (backend grava em solicitacoes.imagens_url)
      if (Array.isArray(form.imagens) && form.imagens.length && supabase) {
        const urls = [];
        for (const file of form.imagens) {
          const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
          const path = `fotos/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from('solicitacoes')
            .upload(path, file, { upsert: false });
          if (upErr) throw new Error('Erro ao enviar foto: ' + upErr.message);
          urls.push(supabase.storage.from('solicitacoes').getPublicUrl(path).data.publicUrl);
        }
        payload.imagens_url = urls;
      }

      // Pedido em massa (compras) · sobe as fotos de cada item e monta a lista
      // estruturada (sem o File local) que o backend grava em solicitacao_itens.
      if (isCompras && Array.isArray(form.itens_lista) && form.itens_lista.length) {
        const lista = [];
        for (const it of form.itens_lista) {
          if (!(it.descricao || '').trim()) continue;
          let imagem_url = it.imagem_url || '';
          if (it.imagem_file && supabase) {
            const ext = (it.imagem_file.name.split('.').pop() || 'jpg').toLowerCase();
            const path = `itens/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
            const { error: upErr } = await supabase.storage
              .from('solicitacoes')
              .upload(path, it.imagem_file, { upsert: false });
            if (upErr) throw new Error('Erro ao enviar foto do item: ' + upErr.message);
            imagem_url = supabase.storage.from('solicitacoes').getPublicUrl(path).data.publicUrl;
          }
          const qtd = parseFloat(it.quantidade);
          const valor = parseFloat(it.valor_estimado);
          lista.push({
            descricao: it.descricao.trim(),
            quantidade: qtd > 0 ? qtd : 1,
            link_referencia: (it.link_referencia || '').trim() || null,
            valor_estimado: isFinite(valor) ? valor : null,
            valor_tipo: it.valor_tipo === 'unitario' ? 'unitario' : 'total',
            imagem_url: imagem_url || null,
          });
        }
        payload.itens_lista = lista;
      } else {
        delete payload.itens_lista;
      }

      const created = await api.create(payload);
      toast.success('Solicitação enviada! Acompanhe o andamento em "Minhas Solicitações".');
      inicialRef.current = FORM_INITIAL;
      setForm(FORM_INITIAL);
      onDirtyChange?.(false);
      onCreated?.(created);
    } catch (e) {
      console.error('[SOLICITACOES] create error:', e);
      toast.error(e.message || 'Erro ao criar solicitação');
    } finally {
      setSubmitting(false);
    }
  }

  // Compras saiu daqui (2026-07-07 · dualidade #1): o total é CALCULADO dos itens
  const showValueField = ['reembolso', 'pagamento'].includes(form.categoria);
  const isReembolso = form.categoria === 'reembolso';
  const isReservaEspaco = form.categoria === 'reserva_espaco';
  const isCompras = form.categoria === 'compras';
  const isPagamento = form.categoria === 'pagamento';
  // Reembolso e Pagamento compartilham os campos de destino do dinheiro (PIX/banco)
  const dadosBancariosValid = (forma) => (
    !!forma &&
    (forma !== 'pix' || form.chave_pix.trim()) &&
    (forma !== 'transferencia_bancaria' || (form.banco.trim() && form.agencia.trim() && form.conta.trim()))
  );
  // Reembolso · valor EXATO da nota + data da compra + destino do dinheiro.
  // (o "motivo" saiu · a "Justificativa do pedido" geral já cobre o porquê)
  const reembolsoValid = !isReembolso || (
    !!form.valor_estimado &&
    form.data_compra &&
    dadosBancariosValid(form.forma_pagamento)
  );
  const reservaEspacoValid = !isReservaEspaco || (form.espaco_solicitado.trim() && form.data_uso);
  // Compras · pelo menos um item com descrição preenchida
  const comprasValid = !isCompras || form.itens_lista.some(it => (it.descricao || '').trim().length >= 2);
  // Pagamento · favorecido + vencimento (data_necessaria) + forma/destino do dinheiro.
  // Boleto não exige PIX/banco (o documento carrega a linha de pagamento).
  const pagamentoValid = !isPagamento || (
    form.favorecido_nome.trim() &&
    form.data_necessaria &&
    form.forma_pagamento &&
    (form.forma_pagamento === 'boleto' || dadosBancariosValid(form.forma_pagamento))
  );
  // SLA padrão (não-urgente) da categoria · base do urgente-automático
  const slaPadrao = (() => {
    const cat = CATEGORIAS.find(c => c.value === form.categoria);
    if (!cat?.areaResp || form.categoria === 'marketing') return null;
    const sub = cat.sub || 'default';
    return slaDefs.find(s => s.area_responsavel === cat.areaResp && s.subcategoria === sub && s.eh_urgente === false)
      || slaDefs.find(s => s.area_responsavel === cat.areaResp && s.subcategoria === 'default' && s.eh_urgente === false)
      || slaDefs.find(s => s.area_responsavel === cat.areaResp && s.eh_urgente === false)
      || null;
  })();
  // Data necessária mais curta que o prazo padrão de conclusão → urgente automático
  const urgenteAuto = !!(
    form.data_necessaria && slaPadrao &&
    (new Date(form.data_necessaria + 'T23:59:59') - Date.now()) < slaPadrao.sla_resolucao_horas * 3600e3
  );
  const ehUrgente = form.eh_urgente || urgenteAuto;
  // Justificativa única (dualidade #3): urgência manual exige o porquê na
  // "Justificativa do pedido" (não há mais 2ª caixa) · automática não trava.
  const urgenciaValid = !form.eh_urgente || form.justificativa.trim().length >= 5;
  // Compras · total estimado calculado dos itens (respeita R$ total/por unid.)
  const totalCompras = !isCompras ? 0 : form.itens_lista.reduce((acc, it) => {
    const v = parseFloat(it.valor_estimado);
    if (!(v > 0)) return acc;
    const q = parseFloat(it.quantidade) > 0 ? parseFloat(it.quantidade) : 1;
    return acc + (it.valor_tipo === 'unitario' ? v * q : v);
  }, 0);

  return (
    <div className="space-y-4 mt-2 flex-1 overflow-y-auto min-h-0">
      {/* ── Seção 1 · O que você precisa? ── */}
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">O que você precisa?</p>
      <div className="space-y-2">
        <Label>Qual tipo de solicitação? *</Label>
        <Select value={form.categoria} onValueChange={v => setForm(f => ({ ...f, categoria: v }))}>
          <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
          <SelectContent className="z-[1200]">
            {cats.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {CATEGORIA_HINT[form.categoria] && (
          <p className="rounded-md border border-primary/20 bg-primary/5 px-3 py-2 text-xs leading-relaxed text-foreground/80">
            {CATEGORIA_HINT[form.categoria]}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <Label>Título da solicitação *</Label>
        <Input value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Resuma em uma frase" />
      </div>

      {/* ── Seção 2 · Detalhes ── */}
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground pt-3 border-t border-border">Detalhes</p>
      <div className="space-y-2">
        <Label>{isReservaEspaco ? 'Descrição da necessidade (qual evento / finalidade)' : 'Descrição da necessidade'}</Label>
        <Textarea
          value={form.descricao}
          onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
          rows={3}
          placeholder={isReservaEspaco ? 'Qual evento/atividade vai acontecer e o que precisa no espaço' : 'Conte o que precisa, com detalhes que ajudem quem vai atender'}
        />
      </div>
      <div className="space-y-2">
        <Label>Justificativa do pedido{form.eh_urgente ? ' (inclua o porquê da urgência) *' : ''}</Label>
        <Textarea value={form.justificativa} onChange={e => setForm(f => ({ ...f, justificativa: e.target.value }))} rows={2}
          placeholder="Por que este pedido é importante agora?" />
      </div>

      {/* Serviços (manutenção) / Serviço externo · fotos pra quem atende/cota
          avaliar (goteira, equipamento, referência do serviço) */}
      {['infraestrutura', 'servico'].includes(form.categoria) && (
        <div className="space-y-2 rounded-lg border border-indigo-500/30 bg-indigo-500/5 p-3">
          <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-400">Fotos (opcional)</p>
          <p className="text-xs text-muted-foreground">
            Anexe até {MAX_FOTOS} fotos do problema ou do que precisa ser feito — ajuda quem vai
            {form.categoria === 'servico' ? ' cotar o serviço' : ' atender'} a avaliar sem precisar ir até o local.
          </p>
          <FotosAnexos
            fotos={form.imagens}
            onAdd={f => setForm(prev => ({ ...prev, imagens: [...prev.imagens, f].slice(0, MAX_FOTOS) }))}
            onRemove={idx => setForm(prev => ({ ...prev, imagens: prev.imagens.filter((_, i) => i !== idx) }))}
          />
        </div>
      )}

      {/* Reserva de Espaco · campos especificos */}
      {form.categoria === 'reserva_espaco' && (
        <div className="space-y-3 rounded-lg border border-purple-500/30 bg-purple-500/5 p-3">
          <p className="text-sm font-semibold text-purple-700 dark:text-purple-400">Detalhes da reserva</p>
          <div className="space-y-2">
            <Label className="text-xs">Espaço solicitado *</Label>
            <Input
              value={form.espaco_solicitado}
              onChange={e => setForm(f => ({ ...f, espaco_solicitado: e.target.value }))}
              placeholder="ex: Auditório principal, Sala Kids, Cozinha"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-2">
              <Label className="text-xs">Data *</Label>
              <Input type="date" value={form.data_uso} onChange={e => setForm(f => ({ ...f, data_uso: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Início</Label>
              <Input type="time" value={form.horario_inicio} onChange={e => setForm(f => ({ ...f, horario_inicio: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">Fim</Label>
              <Input type="time" value={form.horario_fim} onChange={e => setForm(f => ({ ...f, horario_fim: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Qtde de pessoas (estimada)</Label>
            <Input type="number" value={form.qtde_pessoas} onChange={e => setForm(f => ({ ...f, qtde_pessoas: e.target.value }))} placeholder="0" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Material ou arrumação específica (opcional)</Label>
            <Textarea
              value={form.itens}
              onChange={e => setForm(f => ({ ...f, itens: e.target.value }))}
              rows={2}
              placeholder="Ex: 50 cadeiras em U · som + microfone · projetor · mesa de apoio"
            />
          </div>
        </div>
      )}

      {/* Compras · pedido em massa · lista de itens (descrição + qtd +
          link + valor + foto por item) + fornecedor sugerido */}
      {isCompras && (
        <div className="space-y-3 rounded-lg border border-orange-500/30 bg-orange-500/5 p-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-orange-700 dark:text-orange-400">Itens da compra *</p>
            <span className="text-xs text-muted-foreground">
              {form.itens_lista.length} {form.itens_lista.length === 1 ? 'item' : 'itens'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            Adicione tudo que precisa num só pedido — uma linha por item. Anexe uma foto pra facilitar a identificação. No valor, escolha se está informando o <strong>total da linha</strong> ou o <strong>preço por unidade</strong>.
          </p>

          {form.itens_lista.length === 0 && (
            <p className="text-xs text-muted-foreground italic py-2 text-center">
              Nenhum item ainda. Clique em "Adicionar item" abaixo.
            </p>
          )}

          {form.itens_lista.map((it, idx) => (
            <div key={idx} className="rounded-md border border-border bg-background/60 p-2.5">
              <div className="flex items-start gap-2">
                <ItemFotoMini
                  file={it.imagem_file}
                  url={it.imagem_url}
                  onFile={f => updateItem(idx, { imagem_file: f })}
                  onClear={() => updateItem(idx, { imagem_file: null, imagem_url: '' })}
                />
                <div className="flex-1 space-y-2 min-w-0">
                  <div className="flex gap-2">
                    <Input
                      className="flex-1"
                      placeholder="O que é? Ex: Peruca loira"
                      value={it.descricao}
                      onChange={e => updateItem(idx, { descricao: e.target.value })}
                    />
                    <Input
                      className="w-16 shrink-0"
                      type="number" min="1"
                      placeholder="Qtd"
                      value={it.quantidade}
                      onChange={e => updateItem(idx, { quantidade: e.target.value })}
                    />
                    <button type="button" onClick={() => removeItem(idx)}
                      className="text-muted-foreground hover:text-red-500 px-1 shrink-0" title="Remover item">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <Input
                      className="flex-1 min-w-0"
                      placeholder="Link de referência (opcional)"
                      value={it.link_referencia}
                      onChange={e => updateItem(idx, { link_referencia: e.target.value })}
                    />
                    {/* Valor · a pessoa ESCOLHE a semântica (total da linha ou por
                        unidade) · evita o caso "30 coletes × R$ 1.000 = R$ 30.000" */}
                    <Select value={it.valor_tipo === 'unitario' ? 'unitario' : 'total'}
                      onValueChange={v => updateItem(idx, { valor_tipo: v })}>
                      <SelectTrigger className="w-[104px] shrink-0 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="z-[1200]">
                        <SelectItem value="total">R$ total</SelectItem>
                        <SelectItem value="unitario">R$ por unid.</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      className="w-24 shrink-0"
                      type="number" min="0" step="0.01"
                      placeholder="R$"
                      value={it.valor_estimado}
                      onChange={e => updateItem(idx, { valor_estimado: e.target.value })}
                    />
                  </div>
                  {it.valor_tipo === 'unitario' && parseFloat(it.valor_estimado) > 0 && (
                    <p className="text-[11px] text-muted-foreground text-right">
                      = R$ {((parseFloat(it.quantidade) > 0 ? parseFloat(it.quantidade) : 1) * parseFloat(it.valor_estimado)).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} no total da linha
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}

          <Button type="button" variant="outline" size="sm" className="w-full" onClick={addItem}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar item
          </Button>

          {/* Total do pedido = soma dos itens (era campo digitável · dualidade #1) */}
          {totalCompras > 0 && (
            <p className="text-sm font-medium text-right text-orange-700 dark:text-orange-400">
              Total estimado do pedido: R$ {totalCompras.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </p>
          )}

          <div className="space-y-2">
            <Label className="text-xs">Fornecedor sugerido (opcional)</Label>
            <Input
              value={form.favorecido_nome}
              onChange={e => setForm(f => ({ ...f, favorecido_nome: e.target.value }))}
              placeholder="Se já sabe de onde comprar (vale pro pedido todo)"
            />
          </div>
        </div>
      )}

      {/* Pagamento · favorecido + documento + forma + recorrencia */}
      {isPagamento && (
        <div className="space-y-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Dados do pagamento</p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs">Favorecido (quem recebe) *</Label>
              <Input
                value={form.favorecido_nome}
                onChange={e => setForm(f => ({ ...f, favorecido_nome: e.target.value }))}
                placeholder="Nome ou razão social"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs">CNPJ/CPF (opcional)</Label>
              <Input
                value={form.favorecido_documento}
                onChange={e => setForm(f => ({ ...f, favorecido_documento: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Documento — boleto / nota fiscal / contrato *</Label>
            <DocDropzone
              file={form.documento_file}
              onFile={f => setForm(prev => ({ ...prev, documento_file: f }))}
              onClear={() => setForm(prev => ({ ...prev, documento_file: null }))}
            />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Forma de pagamento *</Label>
            <Select value={form.forma_pagamento} onValueChange={v => setForm(f => ({ ...f, forma_pagamento: v, chave_pix: '', banco: '', agencia: '', conta: '' }))}>
              <SelectTrigger><SelectValue placeholder="Como pagar?" /></SelectTrigger>
              <SelectContent className="z-[1200]">
                <SelectItem value="boleto">Boleto</SelectItem>
                <SelectItem value="pix">PIX</SelectItem>
                <SelectItem value="transferencia_bancaria">Transferência Bancária</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {form.forma_pagamento === 'pix' && (
            <div className="space-y-2">
              <Label className="text-xs">Chave PIX *</Label>
              <Input value={form.chave_pix} onChange={e => setForm(f => ({ ...f, chave_pix: e.target.value }))} placeholder="CPF, e-mail, telefone ou chave aleatória" />
            </div>
          )}
          {form.forma_pagamento === 'transferencia_bancaria' && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="text-xs">Banco *</Label>
                <Input value={form.banco} onChange={e => setForm(f => ({ ...f, banco: e.target.value }))} placeholder="Ex: Banco do Brasil, Nubank..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label className="text-xs">Agência *</Label>
                  <Input value={form.agencia} onChange={e => setForm(f => ({ ...f, agencia: e.target.value }))} placeholder="0000" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs">Conta *</Label>
                  <Input value={form.conta} onChange={e => setForm(f => ({ ...f, conta: e.target.value }))} placeholder="00000-0" />
                </div>
              </div>
            </div>
          )}
          <RecorrenteToggle form={form} setForm={setForm} />
        </div>
      )}

      {/* Marketing · intake por DOR (Redesenho 2026-05-30 · só o aviso · Pedro tria) */}
      {form.categoria === 'marketing' && (
        <div className="rounded-lg border border-pink-500/30 bg-pink-500/5 p-3">
          <p className="text-sm font-semibold text-pink-700 dark:text-pink-400 mb-1">
            Demanda de Marketing
          </p>
          <p className="text-xs text-muted-foreground">
            Conte a <strong>necessidade/dor</strong> no título e na descrição acima — o problema, não a peça.
            A equipe vai avaliar e te devolver o formato e o prazo. Demandas de marketing levam de
            3 a 8 semanas conforme a complexidade.
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {showValueField && (
          <div className="space-y-2">
            <Label>{isReembolso ? 'Valor (exato da nota) *' : 'Valor estimado (R$)'}</Label>
            <Input type="number" step="0.01" value={form.valor_estimado} onChange={e => setForm(f => ({ ...f, valor_estimado: e.target.value }))}
              placeholder={isReembolso ? 'Igual ao da nota fiscal' : undefined} />
          </div>
        )}
      </div>
      {isReembolso && (
        <>
          <div className="space-y-2">
            <Label>Data da compra *</Label>
            <Input type="date" max={new Date().toISOString().slice(0, 10)}
              value={form.data_compra}
              onChange={e => setForm(f => ({ ...f, data_compra: e.target.value }))} />
          </div>
          {/* Comprovante — drag and drop */}
          <div className="space-y-2">
            <Label>Comprovante / Documento *</Label>
            <DocDropzone
              file={form.documento_file}
              onFile={f => setForm(prev => ({ ...prev, documento_file: f }))}
              onClear={() => setForm(prev => ({ ...prev, documento_file: null }))}
            />
          </div>

          {/* Forma de pagamento */}
          <div className="space-y-2">
            <Label>Forma de pagamento *</Label>
            <Select value={form.forma_pagamento} onValueChange={v => setForm(f => ({ ...f, forma_pagamento: v, chave_pix: '', banco: '', agencia: '', conta: '' }))}>
              <SelectTrigger><SelectValue placeholder="Como quer receber?" /></SelectTrigger>
              <SelectContent className="z-[1200]">
                <SelectItem value="pix">PIX</SelectItem>
                <SelectItem value="transferencia_bancaria">Transferência Bancária</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {form.forma_pagamento === 'pix' && (
            <div className="space-y-2">
              <Label>Chave PIX *</Label>
              <Input value={form.chave_pix} onChange={e => setForm(f => ({ ...f, chave_pix: e.target.value }))} placeholder="CPF, e-mail, telefone ou chave aleatória" />
            </div>
          )}

          {form.forma_pagamento === 'transferencia_bancaria' && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Banco *</Label>
                <Input value={form.banco} onChange={e => setForm(f => ({ ...f, banco: e.target.value }))} placeholder="Ex: Banco do Brasil, Nubank..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Agência *</Label>
                  <Input value={form.agencia} onChange={e => setForm(f => ({ ...f, agencia: e.target.value }))} placeholder="0000" />
                </div>
                <div className="space-y-2">
                  <Label>Conta *</Label>
                  <Input value={form.conta} onChange={e => setForm(f => ({ ...f, conta: e.target.value }))} placeholder="00000-0" />
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Seção 3 · Prazo e urgência ── */}
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground pt-3 border-t border-border">Prazo e urgência</p>

      {/* Data necessária · vira "Vencimento" obrigatório pra pagamento */}
      {form.categoria && form.categoria !== 'reserva_espaco' && (
        <div className="space-y-2">
          <Label>{isPagamento ? 'Vencimento *' : 'Data necessária (opcional)'}</Label>
          <Input type="date" value={form.data_necessaria} onChange={e => setForm(f => ({ ...f, data_necessaria: e.target.value }))} />
          <p className="text-xs text-muted-foreground">
            {isPagamento
              ? 'Quando o boleto/nota vence. Priorizamos pra não pagar com atraso.'
              : 'Se preencher, avisaremos a equipe caso o prazo padrão não atenda.'}
          </p>
        </div>
      )}

      {/* Urgente checkbox · reduz SLA · pra compras significa "sai pra rua mesmo dia".
          Data necessária mais curta que o prazo padrão → urgente AUTOMÁTICO (aviso).
          O porquê da urgência vai na "Justificativa do pedido" (uma caixa só). */}
      <div className="space-y-2 rounded-lg border border-border p-3 bg-muted/30">
        <label className={`flex items-center gap-2 ${urgenteAuto ? 'cursor-default' : 'cursor-pointer'}`}>
          <input
            type="checkbox"
            checked={ehUrgente}
            disabled={urgenteAuto}
            onChange={e => setForm(f => ({ ...f, eh_urgente: e.target.checked }))}
            className="h-4 w-4 cursor-pointer disabled:cursor-default"
          />
          <span className="text-sm font-medium">Esta solicitação é urgente</span>
        </label>
        <p className="text-xs text-muted-foreground ml-6">
          Reduz o prazo. Compras urgentes não passam por cotação · alguém sai pra comprar no mesmo dia.
          Use só quando necessário · o sistema mapeia quem solicita urgência frequente.
        </p>
        {urgenteAuto && slaPadrao && (
          <p className="ml-6 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
            A data necessária é menor que o prazo padrão da categoria
            (~{Math.round(slaPadrao.sla_resolucao_horas / 24 * 10) / 10} dias) — a solicitação
            será tratada como <strong>urgente</strong> automaticamente.
          </p>
        )}
        {form.eh_urgente && (
          <p className="ml-6 text-xs text-muted-foreground">
            Explique o porquê da urgência na <strong>Justificativa do pedido</strong> acima *
          </p>
        )}
      </div>

      {/* SLA esperado em tempo real (oculto p/ marketing · usa o aviso de 3-8 sem) */}
      {(() => {
        const cat = CATEGORIAS.find(c => c.value === form.categoria);
        if (!cat?.areaResp || form.categoria === 'marketing') return null;
        const urg = ehUrgente;
        const sub = cat.sub || 'default';
        // Prefere a subcategoria exata · cai pra 'default' · cai pra área
        const sla = slaDefs.find(s => s.area_responsavel === cat.areaResp && s.subcategoria === sub && s.eh_urgente === urg)
          || slaDefs.find(s => s.area_responsavel === cat.areaResp && s.subcategoria === 'default' && s.eh_urgente === urg)
          || slaDefs.find(s => s.area_responsavel === cat.areaResp && s.eh_urgente === urg);
        if (!sla) return null;
        return (
          <div className="rounded-md bg-blue-500/5 border border-blue-500/30 px-3 py-2 text-xs text-blue-700 dark:text-blue-300">
            <strong>Prazo esperado:</strong> resposta em ~{Math.round(sla.sla_resposta_horas/24*10)/10} dias · conclusão em ~{Math.round(sla.sla_resolucao_horas/24*10)/10} dias
            {ehUrgente && ' · modo urgente'}
          </div>
        );
      })()}

      {/* Planejado · dispensa Gestão + mérito, mas mantém a aprovação do diretor da área */}
      <div className="space-y-1 rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.eh_planejado}
            onChange={e => setForm(f => ({ ...f, eh_planejado: e.target.checked }))}
            className="h-4 w-4 cursor-pointer"
          />
          <span className="text-sm font-medium">Este pedido estava no planejamento</span>
        </label>
        <p className="text-xs text-muted-foreground ml-6">
          Marque só se a demanda já foi aprovada no planejamento da sua área — pedidos planejados
          dispensam o carimbo da diretoria de Gestão e o mérito, mas <b>ainda passam pela aprovação
          do diretor da sua área</b> antes de ir pro atendimento. Fica registrado quem marcou.
        </p>
      </div>

      {/* Visibilidade · compartilhar com a própria área (assuntos pessoais/RH ficam privados) */}
      {!['ferias', 'licenca', 'reembolso'].includes(form.categoria) && (
        <div className="space-y-1 rounded-lg border border-border bg-muted/20 p-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.compartilhar_area}
              onChange={e => setForm(f => ({ ...f, compartilhar_area: e.target.checked }))}
              className="h-4 w-4 cursor-pointer"
            />
            <span className="text-sm font-medium">Compartilhar com a minha área</span>
          </label>
          <p className="text-xs text-muted-foreground ml-6">
            Se marcar, os colegas da sua área também veem esta solicitação (útil pra acompanhar
            demandas do time). Deixe desmarcado se for um assunto pessoal.
          </p>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={() => onCancel?.()}>Cancelar</Button>
        <Button onClick={handleCreate} disabled={!form.titulo || !form.categoria || !reembolsoValid || !reservaEspacoValid || !comprasValid || !pagamentoValid || !urgenciaValid || submitting}>
          {submitting ? 'Enviando...' : 'Enviar solicitação'}
        </Button>
      </div>
    </div>
  );
}
