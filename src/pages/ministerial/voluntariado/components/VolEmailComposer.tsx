// ════════════════════════════════════════════════════════════════════════════
// Composer de e-mail pros voluntários · WYSIWYG (Tiptap) + IA + segmentos.
// O corpo produzido aqui é envolvido num shell de e-mail (estilos inline) pelo
// backend na hora do envio; {{nome}} vira o primeiro nome de cada destinatário.
// ════════════════════════════════════════════════════════════════════════════
import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import { voluntariado } from '@/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ArrowLeft, Bold, Italic, Heading2, Heading3, List, ListOrdered, Link2, Unlink,
  ImagePlus, AlignLeft, AlignCenter, AlignRight, AtSign, Sparkles, Loader2,
  Send, Clock, Eye, Save, FlaskConical, Users, Search, RefreshCw, PenLine, UserPlus,
  FileText, Trash2,
} from 'lucide-react';

export type VolEmailTemplate = {
  id: string;
  nome: string;
  assunto: string;
  corpo_html: string;
  is_padrao: boolean;
  updated_at?: string;
};

export type VolEmailDisparo = {
  id: string;
  assunto: string;
  corpo_html: string;
  segmento: {
    tipo: 'todos' | 'equipe' | 'escala' | 'manual';
    team_id?: string | null;
    service_id?: string | null;
    vol_profile_ids?: string[];
  };
  incluir_assinatura?: boolean;
  status: string;
  agendado_para: string | null;
  total_destinatarios: number;
  total_enviados: number;
  total_erros: number;
  criado_por_nome: string | null;
  enviado_em: string | null;
  created_at: string;
};

type Props = { disparo: VolEmailDisparo | null; onVoltar: () => void };
type SegTipo = 'todos' | 'equipe' | 'escala' | 'manual';
type TeamOpt = { id: string; name: string };
type ServiceOpt = { id: string; name: string; scheduled_at: string };
type ResolucaoDest = { total: number; sem_email: number; lista: { nome: string | null; email: string }[] };
type PoolVol = { id: string; full_name: string; email: string | null };

function msgErro(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

const EDITOR_CSS = `
.vol-email-editor .ProseMirror { min-height: 320px; outline: none; padding: 14px 16px; font-size: 15px; line-height: 1.6; }
.vol-email-editor .ProseMirror p { margin: 0 0 10px; }
.vol-email-editor .ProseMirror h2 { font-size: 1.35em; font-weight: 700; margin: 16px 0 8px; }
.vol-email-editor .ProseMirror h3 { font-size: 1.15em; font-weight: 600; margin: 14px 0 6px; }
.vol-email-editor .ProseMirror ul { list-style: disc; padding-left: 1.4em; margin: 0 0 10px; }
.vol-email-editor .ProseMirror ol { list-style: decimal; padding-left: 1.4em; margin: 0 0 10px; }
.vol-email-editor .ProseMirror a { color: #00B39D; text-decoration: underline; }
.vol-email-editor .ProseMirror img { max-width: 100%; height: auto; border-radius: 6px; }
.vol-email-editor .ProseMirror p.is-editor-empty:first-child::before { content: attr(data-placeholder); color: var(--cbrio-text3, #9aa1ab); float: left; height: 0; pointer-events: none; }
.vol-email-assinatura .ProseMirror { min-height: 120px; }
.vol-email-assinatura .ProseMirror img { max-height: 64px; width: auto; vertical-align: middle; }
`;

export default function VolEmailComposer({ disparo, onVoltar }: Props) {
  const [id, setId] = useState<string | null>(disparo?.id || null);
  const [assunto, setAssunto] = useState(disparo?.assunto || '');
  const [segTipo, setSegTipo] = useState<SegTipo>(disparo?.segmento?.tipo || 'todos');
  const [segTeamId, setSegTeamId] = useState<string>(disparo?.segmento?.team_id || '');
  const [segServiceId, setSegServiceId] = useState<string>(disparo?.segmento?.service_id || '');
  const [segIds, setSegIds] = useState<string[]>(disparo?.segmento?.vol_profile_ids || []);
  const [incluirAssinatura, setIncluirAssinatura] = useState(disparo?.incluir_assinatura !== false);
  const [verListaOpen, setVerListaOpen] = useState(false);
  const [buscaLista, setBuscaLista] = useState('');
  const [selecionarOpen, setSelecionarOpen] = useState(false);
  const [buscaSelecao, setBuscaSelecao] = useState('');
  const [assinaturaOpen, setAssinaturaOpen] = useState(false);
  const [aba, setAba] = useState('editor');
  const [previewHtml, setPreviewHtml] = useState('');
  const [iaObjetivo, setIaObjetivo] = useState('');
  const [iaTom, setIaTom] = useState('');
  const [linkDialog, setLinkDialog] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [confirmEnvio, setConfirmEnvio] = useState(false);
  const [agendarDialog, setAgendarDialog] = useState(false);
  const [agendadoPara, setAgendadoPara] = useState('');
  const [salvarTemplateOpen, setSalvarTemplateOpen] = useState(false);
  const [templateNome, setTemplateNome] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Image,
      Link.configure({ openOnClick: false, autolink: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Placeholder.configure({ placeholder: 'Escreva o aviso aqui — ou gere um rascunho com a IA ao lado…' }),
    ],
    content: disparo?.corpo_html || '<p>Olá, {{nome}}!</p><p></p>',
  });

  const segmento = () => ({
    tipo: segTipo,
    ...(segTipo === 'equipe' ? { team_id: segTeamId || null } : {}),
    ...(segTipo === 'escala' ? { service_id: segServiceId || null } : {}),
    ...(segTipo === 'manual' ? { vol_profile_ids: segIds } : {}),
  });

  const segmentoValido =
    segTipo === 'todos' ||
    (segTipo === 'equipe' && segTeamId) ||
    (segTipo === 'escala' && segServiceId) ||
    (segTipo === 'manual' && segIds.length > 0);

  // Equipes (com id) e cultos futuros pro seletor de segmento
  const { data: teams = [] } = useQuery<TeamOpt[]>({
    queryKey: ['vol', 'teams-managed'],
    queryFn: () => voluntariado.teamsManage.list(),
  });
  const { data: services = [] } = useQuery<ServiceOpt[]>({
    queryKey: ['vol', 'services-upcoming'],
    queryFn: () => voluntariado.services.upcoming(),
  });

  const { data: destinatarios, isFetching: resolvendo, refetch: refetchDestinatarios } = useQuery<ResolucaoDest>({
    queryKey: ['vol', 'emails', 'resolver', segTipo, segTeamId, segServiceId, segIds.join(',')],
    queryFn: () => voluntariado.emails.resolverDestinatarios(segmento()),
    enabled: !!segmentoValido,
  });

  // Pool completo pra seleção manual (só carrega com o dialog aberto)
  const { data: pool = [], isLoading: poolCarregando } = useQuery<PoolVol[]>({
    queryKey: ['vol', 'volunteers-pool', false],
    queryFn: () => voluntariado.volunteersPool(false),
    enabled: selecionarOpen,
    staleTime: 5 * 60 * 1000,
  });

  const backfillMut = useMutation({
    mutationFn: (): Promise<{ updated: number; via_membresia: number; skipped_existing: number }> =>
      voluntariado.backfillEmails(),
    onSuccess: (r) => {
      toast.success(`E-mails preenchidos: ${r.updated} do Planning Center + ${r.via_membresia || 0} da membresia`);
      refetchDestinatarios();
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao buscar e-mails no Planning Center'),
  });

  // ── Salvar rascunho (create ou update) · retorna o id ─────────────────────
  async function salvar(): Promise<string> {
    const body = { assunto, corpo_html: editor?.getHTML() || '', segmento: segmento(), incluir_assinatura: incluirAssinatura };
    if (id) {
      await voluntariado.emails.update(id, body);
      return id;
    }
    const criado = await voluntariado.emails.create(body);
    setId(criado.id);
    return criado.id;
  }

  const salvarMut = useMutation({
    mutationFn: salvar,
    onSuccess: () => toast.success('Rascunho salvo'),
    onError: (e: Error) => toast.error(e.message || 'Erro ao salvar'),
  });

  // ── Templates de e-mail (modelos prontos + custom) ────────────────────────
  const { data: templates = [], refetch: refetchTemplates } = useQuery<VolEmailTemplate[]>({
    queryKey: ['vol', 'email-templates'],
    queryFn: () => voluntariado.emails.templates.list(),
  });

  function aplicarTemplate(t: VolEmailTemplate) {
    if (t.assunto) setAssunto(t.assunto);
    editor?.commands.setContent(t.corpo_html || '<p>Olá, {{nome}}!</p>');
    toast.success(`Modelo "${t.nome}" aplicado`);
  }

  const salvarTemplateMut = useMutation({
    mutationFn: () => voluntariado.emails.templates.create({
      nome: templateNome.trim(),
      assunto,
      corpo_html: editor?.getHTML() || '',
    }),
    onSuccess: () => {
      toast.success('Modelo salvo');
      setSalvarTemplateOpen(false);
      setTemplateNome('');
      refetchTemplates();
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao salvar o modelo'),
  });

  const removerTemplateMut = useMutation({
    mutationFn: (id: string) => voluntariado.emails.templates.remove(id),
    onSuccess: () => { toast.success('Modelo removido'); refetchTemplates(); },
    onError: (e: Error) => toast.error(e.message || 'Erro ao remover'),
  });

  const iaMut = useMutation({
    mutationFn: (): Promise<{ assunto: string; corpo_html: string }> => {
      const corpoAtual = editor?.getText().trim() ? editor.getHTML() : '';
      return voluntariado.emails.gerarIa({ objetivo: iaObjetivo, tom: iaTom, corpo_atual: corpoAtual || undefined });
    },
    onSuccess: (r) => {
      if (r.corpo_html) editor?.commands.setContent(r.corpo_html);
      if (r.assunto && !assunto.trim()) setAssunto(r.assunto);
      toast.success('Texto gerado — revise antes de enviar');
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao gerar com IA'),
  });

  const testeMut = useMutation({
    mutationFn: async (): Promise<{ para: string }> => {
      const did = await salvar();
      return voluntariado.emails.teste(did);
    },
    onSuccess: (r) => toast.success(`E-mail de teste enviado pra ${r.para}`),
    onError: (e: Error) => toast.error(e.message || 'Erro no envio de teste'),
  });

  const enviarMut = useMutation({
    mutationFn: async () => {
      const did = await salvar();
      return voluntariado.emails.enviar(did);
    },
    onSuccess: () => {
      toast.success('Envio iniciado! Acompanhe o progresso no histórico.');
      onVoltar();
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao iniciar envio'),
  });

  const agendarMut = useMutation({
    mutationFn: async () => {
      const did = await salvar();
      return voluntariado.emails.agendar(did, new Date(agendadoPara).toISOString());
    },
    onSuccess: () => {
      toast.success('Disparo agendado');
      onVoltar();
    },
    onError: (e: Error) => toast.error(e.message || 'Erro ao agendar'),
  });

  async function abrirPreview() {
    setAba('preview');
    try {
      const r = await voluntariado.emails.preview(editor?.getHTML() || '', incluirAssinatura);
      setPreviewHtml(r.html || '');
    } catch (e) {
      toast.error(msgErro(e, 'Erro ao montar preview'));
    }
  }

  async function subirImagem(file: File) {
    if (!file) return;
    try {
      const r = await voluntariado.emails.uploadImagem(file);
      editor?.chain().focus().setImage({ src: r.url }).run();
    } catch (e) {
      toast.error(msgErro(e, 'Erro ao enviar imagem'));
    }
  }

  function aplicarLink() {
    const url = linkUrl.trim();
    if (url) editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    setLinkDialog(false);
    setLinkUrl('');
  }

  const podeEnviar = assunto.trim() && (editor?.getText().trim()?.length || 0) > 0 && segmentoValido;

  const toolBtn = (active: boolean) =>
    `h-8 w-8 p-0 ${active ? 'bg-primary/15 text-primary' : ''}`;

  return (
    <div className="space-y-4">
      <style>{EDITOR_CSS}</style>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onVoltar}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
          </Button>
          <h1 className="text-lg font-semibold">{id ? 'Editar disparo' : 'Novo disparo'}</h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => salvarMut.mutate()} disabled={salvarMut.isPending}>
            {salvarMut.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
            Salvar rascunho
          </Button>
          <Button variant="outline" size="sm" onClick={() => testeMut.mutate()} disabled={testeMut.isPending || !assunto.trim()}>
            {testeMut.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <FlaskConical className="h-4 w-4 mr-1.5" />}
            Enviar teste pra mim
          </Button>
          <Button variant="outline" size="sm" onClick={() => setAgendarDialog(true)} disabled={!podeEnviar}>
            <Clock className="h-4 w-4 mr-1.5" /> Agendar
          </Button>
          <Button size="sm" onClick={() => setConfirmEnvio(true)} disabled={!podeEnviar || enviarMut.isPending}>
            {enviarMut.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
            Enviar agora
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* ── Coluna principal · assunto + editor/preview ── */}
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardContent className="pt-4 space-y-3">
              {/* Modelos prontos · aplica assunto + corpo · pode salvar o atual */}
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-[200px]">
                  <Label className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5" /> Modelo de e-mail</Label>
                  <Select
                    value=""
                    onValueChange={(id) => {
                      const t = templates.find(x => x.id === id);
                      if (t) aplicarTemplate(t);
                    }}
                  >
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Começar de um modelo…" /></SelectTrigger>
                    <SelectContent>
                      {templates.length === 0 && <div className="px-2 py-1.5 text-sm text-muted-foreground">Nenhum modelo ainda</div>}
                      {templates.map(t => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.nome}{t.is_padrao ? ' · pronto' : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => { setTemplateNome(assunto || ''); setSalvarTemplateOpen(true); }}>
                  <Save className="h-4 w-4 mr-1.5" /> Salvar como modelo
                </Button>
              </div>

              <div>
                <Label htmlFor="assunto">Assunto</Label>
                <Input
                  id="assunto"
                  value={assunto}
                  onChange={(e) => setAssunto(e.target.value)}
                  placeholder="Ex.: Treinamento de voluntários neste domingo"
                  className="mt-1"
                />
              </div>

              <Tabs value={aba} onValueChange={(v) => (v === 'preview' ? abrirPreview() : setAba(v))}>
                <TabsList>
                  <TabsTrigger value="editor">Editor</TabsTrigger>
                  <TabsTrigger value="preview" className="gap-1.5"><Eye className="h-3.5 w-3.5" /> Pré-visualização</TabsTrigger>
                </TabsList>

                <TabsContent value="editor" className="mt-3">
                  <div className="rounded-lg border border-border bg-background">
                    <div className="flex items-center gap-0.5 flex-wrap border-b border-border px-2 py-1.5">
                      <Button type="button" variant="ghost" size="sm" className={toolBtn(!!editor?.isActive('bold'))} title="Negrito"
                        onClick={() => editor?.chain().focus().toggleBold().run()}>
                        <Bold className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className={toolBtn(!!editor?.isActive('italic'))} title="Itálico"
                        onClick={() => editor?.chain().focus().toggleItalic().run()}>
                        <Italic className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className={toolBtn(!!editor?.isActive('heading', { level: 2 }))} title="Título"
                        onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>
                        <Heading2 className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className={toolBtn(!!editor?.isActive('heading', { level: 3 }))} title="Subtítulo"
                        onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}>
                        <Heading3 className="h-4 w-4" />
                      </Button>
                      <span className="w-px h-5 bg-border mx-1" />
                      <Button type="button" variant="ghost" size="sm" className={toolBtn(!!editor?.isActive('bulletList'))} title="Lista"
                        onClick={() => editor?.chain().focus().toggleBulletList().run()}>
                        <List className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className={toolBtn(!!editor?.isActive('orderedList'))} title="Lista numerada"
                        onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
                        <ListOrdered className="h-4 w-4" />
                      </Button>
                      <span className="w-px h-5 bg-border mx-1" />
                      <Button type="button" variant="ghost" size="sm" className={toolBtn(!!editor?.isActive({ textAlign: 'left' }))} title="Alinhar à esquerda"
                        onClick={() => editor?.chain().focus().setTextAlign('left').run()}>
                        <AlignLeft className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className={toolBtn(!!editor?.isActive({ textAlign: 'center' }))} title="Centralizar"
                        onClick={() => editor?.chain().focus().setTextAlign('center').run()}>
                        <AlignCenter className="h-4 w-4" />
                      </Button>
                      <Button type="button" variant="ghost" size="sm" className={toolBtn(!!editor?.isActive({ textAlign: 'right' }))} title="Alinhar à direita"
                        onClick={() => editor?.chain().focus().setTextAlign('right').run()}>
                        <AlignRight className="h-4 w-4" />
                      </Button>
                      <span className="w-px h-5 bg-border mx-1" />
                      <Button type="button" variant="ghost" size="sm" className={toolBtn(!!editor?.isActive('link'))} title="Inserir link"
                        onClick={() => {
                          setLinkUrl((editor?.getAttributes('link')?.href as string) || '');
                          setLinkDialog(true);
                        }}>
                        <Link2 className="h-4 w-4" />
                      </Button>
                      {editor?.isActive('link') && (
                        <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" title="Remover link"
                          onClick={() => editor?.chain().focus().unsetLink().run()}>
                          <Unlink className="h-4 w-4" />
                        </Button>
                      )}
                      <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" title="Inserir imagem"
                        onClick={() => fileRef.current?.click()}>
                        <ImagePlus className="h-4 w-4" />
                      </Button>
                      <span className="w-px h-5 bg-border mx-1" />
                      <Button type="button" variant="ghost" size="sm" className="h-8 px-2 gap-1 text-xs" title="Personalização: vira o primeiro nome do voluntário"
                        onClick={() => editor?.chain().focus().insertContent('{{nome}}').run()}>
                        <AtSign className="h-3.5 w-3.5" /> {'{{nome}}'}
                      </Button>
                    </div>
                    <div className="vol-email-editor">
                      <EditorContent editor={editor} />
                    </div>
                  </div>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) subirImagem(f);
                      e.target.value = '';
                    }}
                  />
                </TabsContent>

                <TabsContent value="preview" className="mt-3">
                  <div className="rounded-lg border border-border overflow-hidden bg-white">
                    <iframe
                      title="Pré-visualização do e-mail"
                      srcDoc={previewHtml}
                      className="w-full h-[480px] border-0"
                      sandbox=""
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    É assim que o e-mail chega na caixa do voluntário ({'{{nome}}'} vira o primeiro nome de cada um).
                  </p>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* ── Coluna lateral · destinatários + IA ── */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4 text-primary" /> Destinatários
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label>Enviar para</Label>
                <Select value={segTipo} onValueChange={(v) => setSegTipo(v as SegTipo)}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos os voluntários</SelectItem>
                    <SelectItem value="equipe">Uma equipe</SelectItem>
                    <SelectItem value="escala">Escalados de um culto</SelectItem>
                    <SelectItem value="manual">Escolher voluntários</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {segTipo === 'manual' && (
                <Button variant="outline" className="w-full" onClick={() => setSelecionarOpen(true)}>
                  <UserPlus className="h-4 w-4 mr-1.5" />
                  {segIds.length ? `${segIds.length} selecionado${segIds.length === 1 ? '' : 's'} · alterar` : 'Selecionar voluntários'}
                </Button>
              )}

              {segTipo === 'equipe' && (
                <div>
                  <Label>Equipe</Label>
                  <Select value={segTeamId} onValueChange={setSegTeamId}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Escolha a equipe" /></SelectTrigger>
                    <SelectContent>
                      {teams.map((t) => (
                        <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {segTipo === 'escala' && (
                <div>
                  <Label>Culto</Label>
                  <Select value={segServiceId} onValueChange={setSegServiceId}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Escolha o culto" /></SelectTrigger>
                    <SelectContent>
                      {services.map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name} · {new Date(s.scheduled_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm">
                {!segmentoValido ? (
                  <span className="text-muted-foreground">Escolha o segmento pra ver a contagem.</span>
                ) : resolvendo ? (
                  <span className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Contando destinatários…
                  </span>
                ) : destinatarios ? (
                  <>
                    <strong>{destinatarios.total}</strong> voluntário{destinatarios.total === 1 ? '' : 's'} com e-mail
                    {destinatarios.total > 0 && (
                      <button
                        type="button"
                        className="block text-xs text-primary underline underline-offset-2 mt-1"
                        onClick={() => { setBuscaLista(''); setVerListaOpen(true); }}
                      >
                        Ver quem vai receber
                      </button>
                    )}
                    {destinatarios.sem_email > 0 && (
                      <span className="block text-xs text-muted-foreground mt-0.5">
                        {destinatarios.sem_email} sem e-mail cadastrado ficam de fora
                      </span>
                    )}
                  </>
                ) : null}
              </div>

              <Button
                variant="outline"
                size="sm"
                className="w-full"
                disabled={backfillMut.isPending}
                onClick={() => backfillMut.mutate()}
                title="Puxa os e-mails cadastrados no Planning Center (e na membresia) pros voluntários que estão sem e-mail aqui"
              >
                {backfillMut.isPending
                  ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                Buscar e-mails no Planning Center
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <PenLine className="h-4 w-4 text-primary" /> Assinatura
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="incluir-assinatura" className="text-sm font-normal">
                  Incluir assinatura neste e-mail
                </Label>
                <Switch id="incluir-assinatura" checked={incluirAssinatura} onCheckedChange={setIncluirAssinatura} />
              </div>
              <Button variant="outline" size="sm" className="w-full" onClick={() => setAssinaturaOpen(true)}>
                <PenLine className="h-3.5 w-3.5 mr-1.5" /> Editar assinatura
              </Button>
              <p className="text-xs text-muted-foreground">
                A assinatura é única do voluntariado (texto + logo) e entra no final de todos os disparos que a incluírem.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> Escrever com IA
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <Label htmlFor="ia-objetivo">O que precisa comunicar?</Label>
                <Textarea
                  id="ia-objetivo"
                  value={iaObjetivo}
                  onChange={(e) => setIaObjetivo(e.target.value)}
                  placeholder="Ex.: Treinamento obrigatório dos voluntários do Kids no domingo 12/07 às 9h, na sala 3. Confirmar presença até sexta."
                  rows={4}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="ia-tom">Tom (opcional)</Label>
                <Input
                  id="ia-tom"
                  value={iaTom}
                  onChange={(e) => setIaTom(e.target.value)}
                  placeholder="Ex.: animado, urgente, acolhedor…"
                  className="mt-1"
                />
              </div>
              <Button
                className="w-full"
                variant="secondary"
                disabled={iaMut.isPending || iaObjetivo.trim().length < 5}
                onClick={() => iaMut.mutate()}
              >
                {iaMut.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
                {editor?.getText().trim() ? 'Melhorar texto atual' : 'Gerar rascunho'}
              </Button>
              <p className="text-xs text-muted-foreground">
                A IA escreve a partir do briefing acima. Se já houver texto no editor, ela melhora em vez de recomeçar.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Dialog · link ── */}
      <Dialog open={linkDialog} onOpenChange={setLinkDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Inserir link</DialogTitle></DialogHeader>
          <Input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://…"
            onKeyDown={(e) => e.key === 'Enter' && aplicarLink()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialog(false)}>Cancelar</Button>
            <Button onClick={aplicarLink}>Aplicar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog · salvar/gerenciar modelos ── */}
      <Dialog open={salvarTemplateOpen} onOpenChange={setSalvarTemplateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Salvar como modelo</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="tpl-nome">Nome do modelo</Label>
            <Input
              id="tpl-nome"
              value={templateNome}
              onChange={(e) => setTemplateNome(e.target.value)}
              placeholder="Ex.: Convocação do Kids"
              onKeyDown={(e) => { if (e.key === 'Enter' && templateNome.trim()) salvarTemplateMut.mutate(); }}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">Salva o assunto e o corpo atuais como um modelo reutilizável.</p>
          </div>

          {templates.some(t => !t.is_padrao) && (
            <div className="mt-2 border-t pt-3">
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Seus modelos</p>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {templates.filter(t => !t.is_padrao).map(t => (
                  <div key={t.id} className="flex items-center justify-between gap-2 text-sm rounded-md border px-2 py-1.5">
                    <span className="truncate">{t.nome}</span>
                    <button
                      type="button"
                      onClick={() => removerTemplateMut.mutate(t.id)}
                      className="text-muted-foreground hover:text-red-600 shrink-0"
                      title="Remover modelo"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSalvarTemplateOpen(false)}>Fechar</Button>
            <Button onClick={() => salvarTemplateMut.mutate()} disabled={!templateNome.trim() || salvarTemplateMut.isPending}>
              {salvarTemplateMut.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
              Salvar modelo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog · agendar ── */}
      <Dialog open={agendarDialog} onOpenChange={setAgendarDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Agendar disparo</DialogTitle></DialogHeader>
          <div>
            <Label htmlFor="agendado-para">Enviar em</Label>
            <Input
              id="agendado-para"
              type="datetime-local"
              value={agendadoPara}
              onChange={(e) => setAgendadoPara(e.target.value)}
              className="mt-1"
            />
            <p className="text-xs text-muted-foreground mt-2">
              O envio começa até 5 minutos depois do horário escolhido.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAgendarDialog(false)}>Cancelar</Button>
            <Button
              disabled={!agendadoPara || new Date(agendadoPara).getTime() <= Date.now() || agendarMut.isPending}
              onClick={() => agendarMut.mutate()}
            >
              {agendarMut.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Clock className="h-4 w-4 mr-1.5" />}
              Agendar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog · quem vai receber ── */}
      <Dialog open={verListaOpen} onOpenChange={setVerListaOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Quem vai receber ({destinatarios?.total ?? 0})</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={buscaLista}
              onChange={(e) => setBuscaLista(e.target.value)}
              placeholder="Buscar por nome ou e-mail…"
              className="pl-9"
            />
          </div>
          <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-border divide-y divide-border/60">
            {(destinatarios?.lista || [])
              .filter((d) => {
                const q = buscaLista.trim().toLowerCase();
                return !q || (d.nome || '').toLowerCase().includes(q) || d.email.toLowerCase().includes(q);
              })
              .map((d) => (
                <div key={d.email} className="px-3 py-2 text-sm flex items-center justify-between gap-3">
                  <span className="truncate">{d.nome || '(sem nome)'}</span>
                  <span className="text-xs text-muted-foreground truncate">{d.email}</span>
                </div>
              ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog · seleção manual ── */}
      <Dialog open={selecionarOpen} onOpenChange={setSelecionarOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Selecionar voluntários ({segIds.length})</DialogTitle>
          </DialogHeader>
          <div className="relative">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={buscaSelecao}
              onChange={(e) => setBuscaSelecao(e.target.value)}
              placeholder="Buscar voluntário…"
              className="pl-9"
            />
          </div>
          <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-border divide-y divide-border/60">
            {poolCarregando ? (
              <div className="py-8 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : (
              pool
                .filter((v) => {
                  const q = buscaSelecao.trim().toLowerCase();
                  return !q || (v.full_name || '').toLowerCase().includes(q) || (v.email || '').toLowerCase().includes(q);
                })
                .slice(0, 200)
                .map((v) => {
                  const marcado = segIds.includes(v.id);
                  const semEmail = !v.email;
                  return (
                    <label
                      key={v.id}
                      className={`px-3 py-2 text-sm flex items-center gap-3 cursor-pointer hover:bg-accent/50 ${semEmail ? 'opacity-50' : ''}`}
                    >
                      <Checkbox
                        checked={marcado}
                        disabled={semEmail}
                        onCheckedChange={(c) =>
                          setSegIds((prev) => (c ? [...prev, v.id] : prev.filter((id) => id !== v.id)))
                        }
                      />
                      <span className="truncate flex-1">{v.full_name}</span>
                      <span className="text-xs text-muted-foreground truncate">
                        {v.email || 'sem e-mail'}
                      </span>
                    </label>
                  );
                })
            )}
          </div>
          <DialogFooter className="flex-row justify-between sm:justify-between">
            <Button variant="ghost" size="sm" onClick={() => setSegIds([])} disabled={!segIds.length}>
              Limpar seleção
            </Button>
            <Button size="sm" onClick={() => setSelecionarOpen(false)}>Concluir</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {assinaturaOpen && (
        <AssinaturaDialog
          onClose={() => setAssinaturaOpen(false)}
          onSaved={() => { setAssinaturaOpen(false); if (aba === 'preview') abrirPreview(); }}
        />
      )}

      {/* ── Confirmação de envio ── */}
      <AlertDialog open={confirmEnvio} onOpenChange={setConfirmEnvio}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar agora?</AlertDialogTitle>
            <AlertDialogDescription>
              "{assunto}" será enviado pra{' '}
              <strong>{destinatarios?.total ?? '…'} voluntário{(destinatarios?.total ?? 0) === 1 ? '' : 's'}</strong>.
              {(destinatarios?.total ?? 0) > 100 && (
                <span className="block mt-1.5">
                  Envios grandes levam vários minutos (limite do servidor de e-mail) — acompanhe o progresso no histórico.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmEnvio(false);
                enviarMut.mutate();
              }}
            >
              <Send className="h-4 w-4 mr-1.5" /> Enviar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Editor da assinatura global (texto + logo) · salva em vol_email_config ──
function AssinaturaDialog({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [carregando, setCarregando] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const editorAss = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      Image,
      Link.configure({ openOnClick: false, autolink: true }),
      Placeholder.configure({ placeholder: 'Ex.: Coordenação de Voluntários · CBRio (adicione a logo pelo botão de imagem)' }),
    ],
    content: '',
  });

  useEffect(() => {
    voluntariado.emails.config()
      .then((r: { assinatura_html: string }) => {
        if (r.assinatura_html) editorAss?.commands.setContent(r.assinatura_html);
      })
      .catch(() => toast.error('Erro ao carregar a assinatura'))
      .finally(() => setCarregando(false));
     
  }, [editorAss]);

  const salvarMut = useMutation({
    mutationFn: () => voluntariado.emails.saveConfig(editorAss?.getHTML() || ''),
    onSuccess: () => { toast.success('Assinatura salva'); onSaved(); },
    onError: (e: Error) => toast.error(e.message || 'Erro ao salvar a assinatura'),
  });

  async function subirLogo(file: File) {
    try {
      const r = await voluntariado.emails.uploadImagem(file);
      editorAss?.chain().focus().setImage({ src: r.url }).run();
    } catch (e) {
      toast.error(msgErro(e, 'Erro ao enviar a imagem'));
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PenLine className="h-5 w-5 text-primary" /> Assinatura do voluntariado
          </DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Essa assinatura é compartilhada por todos os disparos do módulo. Use o botão de imagem pra incluir a logo.
        </p>
        {carregando ? (
          <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="rounded-lg border border-border bg-background">
            <div className="flex items-center gap-0.5 flex-wrap border-b border-border px-2 py-1.5">
              <Button type="button" variant="ghost" size="sm" className={`h-8 w-8 p-0 ${editorAss?.isActive('bold') ? 'bg-primary/15 text-primary' : ''}`} title="Negrito"
                onClick={() => editorAss?.chain().focus().toggleBold().run()}>
                <Bold className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="sm" className={`h-8 w-8 p-0 ${editorAss?.isActive('italic') ? 'bg-primary/15 text-primary' : ''}`} title="Itálico"
                onClick={() => editorAss?.chain().focus().toggleItalic().run()}>
                <Italic className="h-4 w-4" />
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0" title="Inserir logo/imagem"
                onClick={() => fileRef.current?.click()}>
                <ImagePlus className="h-4 w-4" />
              </Button>
            </div>
            <div className="vol-email-editor vol-email-assinatura">
              <EditorContent editor={editorAss} />
            </div>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) subirLogo(f);
            e.target.value = '';
          }}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => salvarMut.mutate()} disabled={salvarMut.isPending || carregando}>
            {salvarMut.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Save className="h-4 w-4 mr-1.5" />}
            Salvar assinatura
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
