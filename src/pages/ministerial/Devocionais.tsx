import { useState, useEffect, useMemo, useCallback } from 'react';
import { bible as bibleApi, devocionais as devApi, pessoas as pessoasApi } from '../../api';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Card } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Skeleton } from '../../components/ui/skeleton';
import { BookOpen, ChevronLeft, ChevronRight, Loader2, Save, Trash2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

const C = { primary: '#00B39D', primaryBg: '#00B39D15' };
const LS_BIBLE = 'devocionais.bibleId';
const LS_BOOK = 'devocionais.bookId';
const LS_CHAPTER = 'devocionais.chapterId';

type Bible = { id: string; name: string; nameLocal?: string; abbreviation?: string; language?: { id: string; name: string } };
type Book = { id: string; name: string; nameLong?: string; abbreviation?: string };
type Chapter = { id: string; number: string; reference?: string; bookId?: string };
type ChapterContent = { id: string; reference: string; content: string; copyright?: string };
type Devocional = {
  id: string;
  data_devocional: string;
  tipo: 'pessoal' | 'familiar' | 'grupo';
  topico: string | null;
  observacoes: string | null;
  concluida: boolean;
  mem_membros?: { nome: string; foto_url?: string };
};

export default function Devocionais() {
  const { profile } = useAuth();

  const [bibles, setBibles] = useState<Bible[]>([]);
  const [bibleId, setBibleId] = useState<string>(() => localStorage.getItem(LS_BIBLE) || '');
  const [books, setBooks] = useState<Book[]>([]);
  const [bookId, setBookId] = useState<string>(() => localStorage.getItem(LS_BOOK) || '');
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chapterId, setChapterId] = useState<string>(() => localStorage.getItem(LS_CHAPTER) || '');
  const [chapter, setChapter] = useState<ChapterContent | null>(null);

  const [loadingBibles, setLoadingBibles] = useState(true);
  const [loadingBooks, setLoadingBooks] = useState(false);
  const [loadingChapter, setLoadingChapter] = useState(false);

  const [membro, setMembro] = useState<{ id: string; nome: string } | null>(null);
  const [membroSearched, setMembroSearched] = useState(false);

  const [tipo, setTipo] = useState<'pessoal' | 'familiar' | 'grupo'>('pessoal');
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [observacoes, setObservacoes] = useState('');
  const [saving, setSaving] = useState(false);

  const [historico, setHistorico] = useState<Devocional[]>([]);
  const [loadingHist, setLoadingHist] = useState(true);

  useEffect(() => {
    if (bibleId) localStorage.setItem(LS_BIBLE, bibleId);
  }, [bibleId]);
  useEffect(() => {
    if (bookId) localStorage.setItem(LS_BOOK, bookId);
  }, [bookId]);
  useEffect(() => {
    if (chapterId) localStorage.setItem(LS_CHAPTER, chapterId);
  }, [chapterId]);

  // Carregar Biblias (filtra portugues)
  useEffect(() => {
    setLoadingBibles(true);
    bibleApi.bibles('por')
      .then((r: any) => {
        const list: Bible[] = r?.data || [];
        setBibles(list);
        if (!bibleId && list.length) setBibleId(list[0].id);
      })
      .catch((e: any) => toast.error('Erro ao carregar Biblias: ' + e.message))
      .finally(() => setLoadingBibles(false));
  }, []);

  // Carregar livros ao trocar Biblia
  useEffect(() => {
    if (!bibleId) return;
    setLoadingBooks(true);
    setBooks([]);
    bibleApi.books(bibleId)
      .then((r: any) => {
        const list: Book[] = r?.data || [];
        setBooks(list);
        if (!list.find(b => b.id === bookId) && list.length) {
          setBookId(list[0].id);
          setChapterId('');
        }
      })
      .catch((e: any) => toast.error('Erro ao carregar livros: ' + e.message))
      .finally(() => setLoadingBooks(false));
  }, [bibleId]);

  // Carregar capitulos ao trocar livro
  useEffect(() => {
    if (!bibleId || !bookId) return;
    bibleApi.chapters(bibleId, bookId)
      .then((r: any) => {
        const list: Chapter[] = (r?.data || []).filter((c: Chapter) => c.number !== 'intro');
        setChapters(list);
        if (!list.find(c => c.id === chapterId) && list.length) setChapterId(list[0].id);
      })
      .catch((e: any) => toast.error('Erro ao carregar capitulos: ' + e.message));
  }, [bibleId, bookId]);

  // Carregar conteudo do capitulo
  useEffect(() => {
    if (!bibleId || !chapterId) return;
    setLoadingChapter(true);
    bibleApi.chapter(bibleId, chapterId)
      .then((r: any) => setChapter(r?.data || null))
      .catch((e: any) => toast.error('Erro ao carregar capitulo: ' + e.message))
      .finally(() => setLoadingChapter(false));
  }, [bibleId, chapterId]);

  // Lookup membro pelo email do profile
  useEffect(() => {
    if (!profile?.email || membroSearched) return;
    pessoasApi.lookup({ email: profile.email })
      .then((r: any) => {
        if (r?.found && r.membro?.id) setMembro({ id: r.membro.id, nome: r.membro.nome });
      })
      .catch(() => {})
      .finally(() => setMembroSearched(true));
  }, [profile?.email, membroSearched]);

  const loadHistorico = useCallback(() => {
    setLoadingHist(true);
    const params: any = { limit: 20 };
    if (membro?.id) params.membro_id = membro.id;
    devApi.list(params)
      .then((r: any) => setHistorico(r?.data || []))
      .catch(() => {})
      .finally(() => setLoadingHist(false));
  }, [membro?.id]);

  useEffect(() => {
    if (membroSearched) loadHistorico();
  }, [membroSearched, loadHistorico]);

  const currentBook = useMemo(() => books.find(b => b.id === bookId), [books, bookId]);
  const currentChapter = useMemo(() => chapters.find(c => c.id === chapterId), [chapters, chapterId]);
  const chapterIdx = useMemo(() => chapters.findIndex(c => c.id === chapterId), [chapters, chapterId]);

  const referencia = useMemo(() => {
    if (chapter?.reference) return chapter.reference;
    if (currentBook && currentChapter) return `${currentBook.name} ${currentChapter.number}`;
    return '';
  }, [chapter, currentBook, currentChapter]);

  function prevChapter() {
    if (chapterIdx > 0) setChapterId(chapters[chapterIdx - 1].id);
  }
  function nextChapter() {
    if (chapterIdx >= 0 && chapterIdx < chapters.length - 1) setChapterId(chapters[chapterIdx + 1].id);
  }

  async function salvar() {
    if (!membro?.id) {
      toast.error('Voce nao esta vinculado a um membro. Avise a equipe para cadastrar seu email.');
      return;
    }
    if (!observacoes.trim()) {
      toast.error('Escreva sua reflexao antes de salvar.');
      return;
    }
    setSaving(true);
    try {
      await devApi.create({
        membro_id: membro.id,
        data_devocional: data,
        tipo,
        topico: referencia,
        observacoes: observacoes.trim(),
      });
      toast.success('Devocional registrado');
      setObservacoes('');
      loadHistorico();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function remover(id: string) {
    if (!confirm('Remover este devocional?')) return;
    try {
      await devApi.remove(id);
      toast.success('Removido');
      loadHistorico();
    } catch (e: any) {
      toast.error(e.message);
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <div className="rounded-lg p-2" style={{ background: C.primaryBg }}>
          <BookOpen className="h-6 w-6" style={{ color: C.primary }} />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Devocional</h1>
          <p className="text-sm text-muted-foreground">Leia a Biblia e registre sua reflexao do dia</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Leitor Biblia */}
        <Card className="lg:col-span-2 p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs">Versao</Label>
              <Select value={bibleId} onValueChange={setBibleId} disabled={loadingBibles}>
                <SelectTrigger><SelectValue placeholder={loadingBibles ? 'Carregando...' : 'Selecione'} /></SelectTrigger>
                <SelectContent>
                  {bibles.map(b => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.abbreviation || b.nameLocal || b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Livro</Label>
              <Select value={bookId} onValueChange={(v) => { setBookId(v); setChapterId(''); }} disabled={loadingBooks || !books.length}>
                <SelectTrigger><SelectValue placeholder={loadingBooks ? 'Carregando...' : 'Selecione'} /></SelectTrigger>
                <SelectContent className="max-h-80">
                  {books.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Capitulo</Label>
              <Select value={chapterId} onValueChange={setChapterId} disabled={!chapters.length}>
                <SelectTrigger><SelectValue placeholder="Cap." /></SelectTrigger>
                <SelectContent className="max-h-80">
                  {chapters.map(c => <SelectItem key={c.id} value={c.id}>{c.number}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between border-y py-2">
            <Button variant="ghost" size="sm" onClick={prevChapter} disabled={chapterIdx <= 0}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
            </Button>
            <div className="font-semibold text-sm">{referencia || '—'}</div>
            <Button variant="ghost" size="sm" onClick={nextChapter} disabled={chapterIdx < 0 || chapterIdx >= chapters.length - 1}>
              Proximo <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>

          <div className="min-h-[400px]">
            {loadingChapter ? (
              <div className="space-y-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-full" />
              </div>
            ) : chapter ? (
              <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap leading-relaxed text-[15px]">
                {chapter.content}
                {chapter.copyright && (
                  <p className="text-xs text-muted-foreground mt-6 not-prose">{chapter.copyright}</p>
                )}
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">Selecione livro e capitulo para comecar.</p>
            )}
          </div>
        </Card>

        {/* Form de devocional */}
        <Card className="p-4 space-y-3 h-fit">
          <div>
            <h2 className="font-semibold">Registrar devocional</h2>
            {membro ? (
              <p className="text-xs text-muted-foreground">Como <strong>{membro.nome}</strong></p>
            ) : membroSearched ? (
              <p className="text-xs text-amber-600">Sem cadastro de membro vinculado ao seu email. Avise a equipe.</p>
            ) : (
              <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Verificando cadastro...</p>
            )}
          </div>

          <div>
            <Label className="text-xs">Referencia</Label>
            <Input value={referencia} readOnly className="bg-muted" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Data</Label>
              <Input type="date" value={data} onChange={e => setData(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">Tipo</Label>
              <Select value={tipo} onValueChange={(v: any) => setTipo(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pessoal">Pessoal</SelectItem>
                  <SelectItem value="familiar">Familiar</SelectItem>
                  <SelectItem value="grupo">Grupo</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs">Reflexao</Label>
            <Textarea
              rows={6}
              value={observacoes}
              onChange={e => setObservacoes(e.target.value)}
              placeholder="O que Deus te falou hoje?"
            />
          </div>

          <Button onClick={salvar} disabled={saving || !membro} className="w-full">
            {saving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Salvando</> : <><Save className="h-4 w-4 mr-2" /> Salvar</>}
          </Button>
        </Card>
      </div>

      {/* Historico */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold">{membro ? 'Meus devocionais recentes' : 'Devocionais recentes'}</h2>
          <Button variant="ghost" size="sm" onClick={loadHistorico} disabled={loadingHist}>
            <RefreshCw className={`h-4 w-4 ${loadingHist ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        {loadingHist ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : historico.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum devocional registrado ainda.</p>
        ) : (
          <div className="space-y-2">
            {historico.map(d => (
              <div key={d.id} className="flex items-start justify-between gap-3 p-3 rounded-md border bg-card">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="secondary" className="text-xs">{d.tipo}</Badge>
                    <span className="text-xs text-muted-foreground">{new Date(d.data_devocional + 'T00:00').toLocaleDateString('pt-BR')}</span>
                    {d.topico && <span className="text-xs font-medium truncate">· {d.topico}</span>}
                  </div>
                  {d.observacoes && <p className="text-sm whitespace-pre-wrap line-clamp-3">{d.observacoes}</p>}
                  {!membro && d.mem_membros?.nome && (
                    <p className="text-xs text-muted-foreground mt-1">— {d.mem_membros.nome}</p>
                  )}
                </div>
                {membro && (
                  <Button variant="ghost" size="icon" onClick={() => remover(d.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
