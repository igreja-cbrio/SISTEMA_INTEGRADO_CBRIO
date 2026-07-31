// Aba "E-mails" do módulo /inscricoes · 2026-07-31
//
// Editor VISUAL (TipTap), no mesmo padrão do VolEmailComposer do voluntariado —
// negrito/lista/link pela barra, e os dados da inscrição entram por BOTÃO com
// nome em português ("Primeiro nome"), não digitando {{primeiro_nome}} na mão.
//
// Três decisões que fazem a tela ser usável no dia a dia:
//   1. abre PREENCHIDA com o texto padrão (o backend manda o esqueleto) — o
//      editor em branco era o que tornava a tarefa intimidante;
//   2. "Restaurar padrão" APAGA a customização (o padrão vive no código);
//   3. a prévia mostra o corpo COM a assinatura, como a pessoa vai receber.
//
// Ler = nível 2 · salvar/testar = nível 5 (o texto sai em nome da igreja).
import { useEffect, useMemo, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Mail, Eye, Send, RotateCcw, Save, Info, Bold, Italic, List, ListOrdered,
  Link2, Unlink, AlignLeft, AlignCenter, Heading2, FileText, PenLine,
} from 'lucide-react';
import { toast } from 'sonner';
import { inscricoesApi } from '@/api';
import { useAuth } from '@/contexts/AuthContext';

type Tipo = 'confirmada' | 'pendente' | 'expirada' | 'assinatura';

const ROTULO: Record<Tipo, { titulo: string; quando: string }> = {
  confirmada: {
    titulo: 'Inscrição confirmada',
    quando: 'Enviado quando o pagamento é aprovado — ou na hora, em evento gratuito e em bolsa integral.',
  },
  pendente: {
    titulo: 'Pagamento pendente',
    quando: 'Enviado ao gerar a cobrança, com o link de pagamento. É o único caminho de volta pra quem fecha a aba.',
  },
  expirada: {
    titulo: 'Reserva expirada',
    quando: 'Enviado quando o prazo vence e a vaga volta pra fila. Depende do cron de expiração estar ativo.',
  },
  assinatura: {
    titulo: 'Assinatura',
    quando: 'Vai no fim de todos os e-mails acima (cada um pode desligar). Não é um e-mail — é o rodapé da igreja.',
  },
};

// Nome em português → variável. É isto que evita a pessoa ter que decorar chave.
const NOME_VAR: Record<string, string> = {
  nome: 'Nome completo',
  primeiro_nome: 'Primeiro nome',
  codigo: 'Código da inscrição',
  evento: 'Nome do evento',
  data: 'Data e hora',
  hora: 'Hora',
  local: 'Local',
  link: 'Link do botão',
  valor: 'Valor',
  forma: 'Forma de pagamento',
  expira_em: 'Prazo do pagamento',
};

type Template = {
  tipo: Tipo; evento_id: string | null; assunto: string; corpo_html: string;
  ativo: boolean; incluir_assinatura?: boolean;
  atualizado_por_nome?: string | null; updated_at?: string;
};

const CSS = `
.insc-email-ed .ProseMirror { min-height: 260px; outline: none; font-size: 14px; line-height: 1.55; }
.insc-email-ed .ProseMirror p { margin: 0 0 10px; }
.insc-email-ed .ProseMirror a { color: #00B39D; text-decoration: underline; }
.insc-email-ed .ProseMirror p.is-editor-empty:first-child::before {
  content: attr(data-placeholder); color: var(--cbrio-text3); float: left; height: 0; pointer-events: none;
}
.insc-email-assin .ProseMirror { min-height: 120px; }
`;

export default function InscricoesEmails() {
  const { getAccessLevel } = useAuth();
  const podeEditar = getAccessLevel(['inscricoes']) >= 5;

  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const [variaveis, setVariaveis] = useState<Record<string, string[]>>({});
  const [padrao, setPadrao] = useState<Record<string, { assunto: string; corpo_html: string }>>({});
  const [salvos, setSalvos] = useState<Record<string, Template>>({});
  const [tipoAberto, setTipoAberto] = useState<Tipo>('confirmada');
  const [assunto, setAssunto] = useState('');
  const [incluirAssin, setIncluirAssin] = useState(true);
  const [sujo, setSujo] = useState(false);
  const [preview, setPreview] = useState<{ assunto: string; html: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Link.configure({ openOnClick: false }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: 'Escreva o e-mail aqui…' }),
    ],
    content: '',
    editable: podeEditar,
    onUpdate: () => setSujo(true),
  });

  function abrir(tipo: Tipo, mapa = salvos, pad = padrao) {
    const t = mapa[tipo];
    const base = t || pad[tipo];
    setTipoAberto(tipo);
    setAssunto(t?.assunto ?? pad[tipo]?.assunto ?? '');
    setIncluirAssin(t ? t.incluir_assinatura !== false : true);
    editor?.commands.setContent(base?.corpo_html || '');
    setSujo(false);
    setPreview(null);
  }

  async function carregar(tipoParaAbrir?: Tipo) {
    setCarregando(true);
    try {
      const r = await inscricoesApi.emailTemplates();
      setAviso(r?.aviso || null);
      setVariaveis(r?.variaveis || {});
      setPadrao(r?.padrao || {});
      const mapa: Record<string, Template> = {};
      (r?.templates || []).forEach((t: Template) => { mapa[t.tipo] = t; });
      setSalvos(mapa);
      abrir(tipoParaAbrir || tipoAberto, mapa, r?.padrao || {});
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao carregar os templates');
    } finally {
      setCarregando(false);
    }
  }

  // Espera o editor existir pra poder semear o conteúdo inicial.
  useEffect(() => { if (editor) carregar(); }, [editor]);

  const atual = salvos[tipoAberto];
  const personalizado = !!atual;
  const ehAssinatura = tipoAberto === 'assinatura';

  const vars = useMemo(() => {
    if (ehAssinatura) return [];
    const comuns = variaveis.comuns || [];
    const proprias = (variaveis as any)[tipoAberto] || [];
    return [...comuns, ...proprias];
  }, [variaveis, tipoAberto, ehAssinatura]);

  function inserir(v: string) {
    editor?.chain().focus().insertContent(`{{${v}}}`).run();
    setSujo(true);
  }

  function usarPadrao() {
    const p = padrao[tipoAberto];
    if (!p) return;
    setAssunto(p.assunto || '');
    editor?.commands.setContent(p.corpo_html || '');
    setSujo(true);
    toast.success('Texto padrão carregado — edite como quiser e salve');
  }

  function definirLink() {
    const url = window.prompt('Endereço do link (use {{link}} para o link automático do e-mail):', '{{link}}');
    if (url === null) return;
    if (!url) { editor?.chain().focus().unsetLink().run(); return; }
    editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    setSujo(true);
  }

  function corpoAtual() {
    const html = editor?.getHTML() || '';
    // TipTap devolve '<p></p>' quando está vazio.
    return html === '<p></p>' ? '' : html;
  }

  async function verPrevia() {
    setOcupado(true);
    try {
      const p = await inscricoesApi.previewEmailTemplate({
        tipo: tipoAberto, assunto, corpo_html: corpoAtual(), incluir_assinatura: incluirAssin,
      });
      setPreview({ assunto: p.assunto, html: p.html });
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao gerar a prévia');
    } finally { setOcupado(false); }
  }

  async function salvar() {
    const corpo = corpoAtual();
    if (!corpo) { toast.error(ehAssinatura ? 'A assinatura está vazia' : 'O corpo do e-mail está vazio'); return; }
    if (!ehAssinatura && !assunto.trim()) { toast.error('O assunto é obrigatório'); return; }
    setOcupado(true);
    try {
      await inscricoesApi.salvarEmailTemplate(tipoAberto, {
        assunto, corpo_html: corpo, incluir_assinatura: incluirAssin,
      });
      toast.success(ehAssinatura ? 'Assinatura salva' : 'Salvo — os próximos e-mails já usam este texto');
      await carregar(tipoAberto);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar');
    } finally { setOcupado(false); }
  }

  async function restaurar() {
    if (!window.confirm('Isto APAGA a personalização e volta ao texto padrão do sistema. Confirma?')) return;
    setOcupado(true);
    try {
      await inscricoesApi.restaurarEmailTemplate(tipoAberto);
      toast.success('Voltou ao texto padrão');
      await carregar(tipoAberto);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao restaurar');
    } finally { setOcupado(false); }
  }

  async function enviarTeste() {
    setOcupado(true);
    try {
      const r = await inscricoesApi.testarEmailTemplate({
        tipo: tipoAberto, assunto, corpo_html: corpoAtual(), incluir_assinatura: incluirAssin,
      });
      toast.success(`Teste enviado para ${r.enviado_para}`);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao enviar o teste');
    } finally { setOcupado(false); }
  }

  const btn = (ativo: boolean) =>
    `p-1.5 rounded hover:bg-foreground/10 ${ativo ? 'bg-foreground/10 text-primary' : ''}`;

  if (carregando) return <Card className="glass-solid p-6 text-sm text-muted-foreground">Carregando…</Card>;

  return (
    <div className="space-y-4">
      <style>{CSS}</style>

      {aviso && (
        <Card className="glass-solid p-3 text-sm flex items-start gap-2 border-amber-500/40">
          <Info className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" /><span>{aviso}</span>
        </Card>
      )}

      <div className="flex gap-1.5 flex-wrap">
        {(Object.keys(ROTULO) as Tipo[]).map(t => (
          <button key={t} onClick={() => abrir(t)}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors inline-flex items-center gap-1.5 ${tipoAberto === t ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/50'}`}>
            {t === 'assinatura' ? <PenLine className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
            {ROTULO[t].titulo}
            {salvos[t] && <span className="text-[10px] opacity-80">•</span>}
          </button>
        ))}
      </div>

      <Card className="glass-solid p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold">{ROTULO[tipoAberto].titulo}</h2>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">{ROTULO[tipoAberto].quando}</p>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full whitespace-nowrap ${personalizado ? 'bg-primary/15 text-primary' : 'bg-foreground/10 text-muted-foreground'}`}>
            {personalizado ? 'Personalizado' : 'Texto padrão'}
          </span>
        </div>

        {!ehAssinatura && (
          <div>
            <label className="text-xs text-muted-foreground">Assunto</label>
            <Input value={assunto} disabled={!podeEditar}
              onChange={e => { setAssunto(e.target.value); setSujo(true); }} />
          </div>
        )}

        {!ehAssinatura && vars.length > 0 && (
          <div>
            <label className="text-xs text-muted-foreground">
              Inserir dado da inscrição (entra onde o cursor está)
            </label>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {vars.map(v => (
                <button key={v} type="button" disabled={!podeEditar} onClick={() => inserir(v)}
                  className="px-2 py-1 rounded-full border border-border text-xs hover:border-primary/60 hover:text-primary disabled:opacity-40">
                  + {NOME_VAR[v] || v}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className={`rounded-md border border-border ${ehAssinatura ? 'insc-email-assin' : ''} insc-email-ed`}>
          <div className="flex flex-wrap items-center gap-0.5 border-b border-border p-1.5">
            <button type="button" title="Negrito" className={btn(!!editor?.isActive('bold'))}
              onClick={() => editor?.chain().focus().toggleBold().run()}><Bold className="h-4 w-4" /></button>
            <button type="button" title="Itálico" className={btn(!!editor?.isActive('italic'))}
              onClick={() => editor?.chain().focus().toggleItalic().run()}><Italic className="h-4 w-4" /></button>
            <button type="button" title="Título" className={btn(!!editor?.isActive('heading', { level: 2 }))}
              onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="h-4 w-4" /></button>
            <span className="w-px h-5 bg-border mx-1" />
            <button type="button" title="Lista" className={btn(!!editor?.isActive('bulletList'))}
              onClick={() => editor?.chain().focus().toggleBulletList().run()}><List className="h-4 w-4" /></button>
            <button type="button" title="Lista numerada" className={btn(!!editor?.isActive('orderedList'))}
              onClick={() => editor?.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></button>
            <span className="w-px h-5 bg-border mx-1" />
            <button type="button" title="Alinhar à esquerda" className={btn(!!editor?.isActive({ textAlign: 'left' }))}
              onClick={() => editor?.chain().focus().setTextAlign('left').run()}><AlignLeft className="h-4 w-4" /></button>
            <button type="button" title="Centralizar" className={btn(!!editor?.isActive({ textAlign: 'center' }))}
              onClick={() => editor?.chain().focus().setTextAlign('center').run()}><AlignCenter className="h-4 w-4" /></button>
            <span className="w-px h-5 bg-border mx-1" />
            <button type="button" title="Inserir link" className={btn(!!editor?.isActive('link'))}
              onClick={definirLink}><Link2 className="h-4 w-4" /></button>
            <button type="button" title="Remover link" className={btn(false)}
              onClick={() => { editor?.chain().focus().unsetLink().run(); setSujo(true); }}><Unlink className="h-4 w-4" /></button>
            {podeEditar && (
              <>
                <span className="flex-1" />
                <button type="button" onClick={usarPadrao}
                  className="text-xs px-2 py-1 rounded border border-border hover:border-primary/60 inline-flex items-center gap-1">
                  <FileText className="h-3.5 w-3.5" /> Começar do texto padrão
                </button>
              </>
            )}
          </div>
          <div className="p-2.5">
            <EditorContent editor={editor} />
          </div>
        </div>

        {!ehAssinatura && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={incluirAssin} disabled={!podeEditar}
              onChange={e => { setIncluirAssin(e.target.checked); setSujo(true); }} />
            Incluir a assinatura no fim deste e-mail
          </label>
        )}

        <div className="flex gap-2 flex-wrap pt-1">
          <Button variant="outline" onClick={verPrevia} disabled={ocupado}>
            <Eye className="h-4 w-4 mr-1" /> Ver prévia
          </Button>
          {podeEditar && (
            <>
              <Button onClick={salvar} disabled={ocupado || !sujo}>
                <Save className="h-4 w-4 mr-1" /> Salvar
              </Button>
              {!ehAssinatura && (
                <Button variant="outline" onClick={enviarTeste} disabled={ocupado}>
                  <Send className="h-4 w-4 mr-1" /> Enviar teste pra mim
                </Button>
              )}
              {personalizado && (
                <Button variant="ghost" onClick={restaurar} disabled={ocupado}>
                  <RotateCcw className="h-4 w-4 mr-1" /> Restaurar padrão
                </Button>
              )}
            </>
          )}
        </div>

        {!podeEditar && (
          <p className="text-xs text-muted-foreground">
            Você pode ver e pré-visualizar. Editar exige nível 5 no módulo — o texto sai em nome da igreja.
          </p>
        )}

        {atual?.atualizado_por_nome && (
          <p className="text-xs text-muted-foreground">
            Última alteração por {atual.atualizado_por_nome}
            {atual.updated_at ? ` em ${new Date(atual.updated_at).toLocaleString('pt-BR')}` : ''}.
          </p>
        )}
      </Card>

      {preview && (
        <Card className="glass-solid p-4">
          <div className="text-xs text-muted-foreground mb-1">
            Prévia com dados de exemplo · nada foi enviado
          </div>
          {preview.assunto && <div className="text-sm font-semibold mb-2">Assunto: {preview.assunto}</div>}
          {/* Conteúdo do próprio template (autor de nível 5, já sanitizado no
              servidor) renderizado pra conferência visual — é o objetivo da tela. */}
          <div className="rounded-md bg-white text-black p-3 overflow-x-auto"
            dangerouslySetInnerHTML={{ __html: preview.html }} />
        </Card>
      )}
    </div>
  );
}
