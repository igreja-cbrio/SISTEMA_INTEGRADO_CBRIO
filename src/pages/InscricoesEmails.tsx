// Aba "E-mails" do módulo /inscricoes · 2026-07-31
//
// Edita os 3 e-mails transacionais da inscrição. Sem template salvo, o e-mail
// sai no texto padrão do código — a tela mostra isso como "no padrão", e
// "Restaurar padrão" APAGA a customização em vez de copiar texto por cima.
//
// Ler = nível 2 · salvar/testar = nível 5 (o texto sai em nome da igreja).
import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Mail, Eye, Send, RotateCcw, Save, Info } from 'lucide-react';
import { toast } from 'sonner';
import { inscricoesApi } from '@/api';
import { useAuth } from '@/contexts/AuthContext';

type Tipo = 'confirmada' | 'pendente' | 'expirada';

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
};

type Template = {
  tipo: Tipo; evento_id: string | null; assunto: string; corpo_html: string;
  ativo: boolean; atualizado_por_nome?: string | null; updated_at?: string;
};

export default function InscricoesEmails() {
  const { getAccessLevel } = useAuth();
  const podeEditar = getAccessLevel(['inscricoes']) >= 5;

  const [carregando, setCarregando] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const [variaveis, setVariaveis] = useState<Record<string, string[]>>({});
  const [salvos, setSalvos] = useState<Record<string, Template>>({});
  const [rascunho, setRascunho] = useState<Record<string, { assunto: string; corpo_html: string }>>({});
  const [tipoAberto, setTipoAberto] = useState<Tipo>('confirmada');
  const [preview, setPreview] = useState<{ assunto: string; html: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function carregar() {
    setCarregando(true);
    try {
      const r = await inscricoesApi.emailTemplates();
      setAviso(r?.aviso || null);
      setVariaveis(r?.variaveis || {});
      const mapa: Record<string, Template> = {};
      (r?.templates || []).forEach((t: Template) => { mapa[t.tipo] = t; });
      setSalvos(mapa);
      setRascunho({});
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao carregar os templates');
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregar(); }, []);

  const atual = salvos[tipoAberto];
  const draft = rascunho[tipoAberto] || {
    assunto: atual?.assunto || '',
    corpo_html: atual?.corpo_html || '',
  };
  const personalizado = !!atual;
  const sujo = !!rascunho[tipoAberto];

  const listaVars = useMemo(() => {
    const comuns = variaveis.comuns || [];
    const proprias = (variaveis as any)[tipoAberto] || [];
    return [...comuns, ...proprias];
  }, [variaveis, tipoAberto]);

  function editar(campo: 'assunto' | 'corpo_html', valor: string) {
    setRascunho(r => ({ ...r, [tipoAberto]: { ...draft, [campo]: valor } }));
  }

  async function verPrevia() {
    setOcupado(true);
    try {
      const p = await inscricoesApi.previewEmailTemplate({ tipo: tipoAberto, ...draft });
      setPreview({ assunto: p.assunto, html: p.html });
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao gerar a prévia');
    } finally { setOcupado(false); }
  }

  async function salvar() {
    if (!draft.assunto.trim() || !draft.corpo_html.trim()) {
      toast.error('Assunto e corpo são obrigatórios');
      return;
    }
    setOcupado(true);
    try {
      await inscricoesApi.salvarEmailTemplate(tipoAberto, draft);
      toast.success('Template salvo — os próximos e-mails já usam este texto');
      await carregar();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao salvar');
    } finally { setOcupado(false); }
  }

  async function restaurar() {
    if (!confirm('Isto APAGA a personalização e volta ao texto padrão do sistema. Confirma?')) return;
    setOcupado(true);
    try {
      await inscricoesApi.restaurarEmailTemplate(tipoAberto);
      toast.success('Voltou ao texto padrão');
      await carregar();
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao restaurar');
    } finally { setOcupado(false); }
  }

  async function enviarTeste() {
    setOcupado(true);
    try {
      const r = await inscricoesApi.testarEmailTemplate({ tipo: tipoAberto, ...draft });
      toast.success(`Teste enviado para ${r.enviado_para}`);
    } catch (e: any) {
      toast.error(e?.message || 'Erro ao enviar o teste');
    } finally { setOcupado(false); }
  }

  if (carregando) return <Card className="glass-solid p-6 text-sm text-muted-foreground">Carregando…</Card>;

  return (
    <div className="space-y-4">
      {aviso && (
        <Card className="glass-solid p-3 text-sm flex items-start gap-2 border-amber-500/40">
          <Info className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
          <span>{aviso}</span>
        </Card>
      )}

      <div className="flex gap-1.5 flex-wrap">
        {(Object.keys(ROTULO) as Tipo[]).map(t => (
          <button key={t} onClick={() => { setTipoAberto(t); setPreview(null); }}
            className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${tipoAberto === t ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/50'}`}>
            {ROTULO[t].titulo}
            {salvos[t] && <span className="ml-1.5 text-[10px] opacity-80">personalizado</span>}
          </button>
        ))}
      </div>

      <Card className="glass-solid p-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold flex items-center gap-2"><Mail className="h-4 w-4 text-primary" /> {ROTULO[tipoAberto].titulo}</h2>
            <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">{ROTULO[tipoAberto].quando}</p>
          </div>
          <span className={`text-xs px-2 py-1 rounded-full ${personalizado ? 'bg-primary/15 text-primary' : 'bg-foreground/10 text-muted-foreground'}`}>
            {personalizado ? 'Personalizado' : 'Usando o texto padrão'}
          </span>
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Assunto</label>
          <Input value={draft.assunto} disabled={!podeEditar}
            placeholder="Inscrição confirmada · {{evento}} ({{codigo}})"
            onChange={e => editar('assunto', e.target.value)} />
        </div>

        <div>
          <label className="text-xs text-muted-foreground">Corpo do e-mail (HTML)</label>
          <textarea value={draft.corpo_html} disabled={!podeEditar}
            onChange={e => editar('corpo_html', e.target.value)}
            rows={12}
            placeholder={'<p>Olá {{primeiro_nome}},</p>\n<p>Sua inscrição no {{evento}} está confirmada.</p>\n<p>Código: <strong>{{codigo}}</strong></p>\n<p><a href="{{link}}">Ver meu comprovante</a></p>'}
            className="w-full rounded-md border border-border bg-[var(--cbrio-input-bg)] p-2.5 text-sm font-mono"
          />
        </div>

        <div className="text-xs text-muted-foreground">
          <div className="mb-1">Variáveis disponíveis (clique para copiar):</div>
          <div className="flex flex-wrap gap-1.5">
            {listaVars.map(v => (
              <button key={v} type="button"
                onClick={() => { navigator.clipboard?.writeText(`{{${v}}}`); toast.success(`{{${v}}} copiado`); }}
                className="px-2 py-0.5 rounded border border-border font-mono hover:border-primary/50">
                {`{{${v}}}`}
              </button>
            ))}
          </div>
          <p className="mt-2">
            O que estiver vazio no momento do envio some do texto. O <span className="font-mono">{'{{link}}'}</span> muda
            conforme o e-mail: comprovante na confirmação, pagamento na pendente, inscrição de novo na expirada.
          </p>
        </div>

        <div className="flex gap-2 flex-wrap pt-1">
          <Button variant="outline" onClick={verPrevia} disabled={ocupado || !draft.corpo_html}>
            <Eye className="h-4 w-4 mr-1" /> Ver prévia
          </Button>
          {podeEditar && (
            <>
              <Button onClick={salvar} disabled={ocupado || !sujo}>
                <Save className="h-4 w-4 mr-1" /> Salvar
              </Button>
              <Button variant="outline" onClick={enviarTeste} disabled={ocupado || !draft.corpo_html}>
                <Send className="h-4 w-4 mr-1" /> Enviar teste pra mim
              </Button>
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
          <div className="text-xs text-muted-foreground mb-1">Prévia com dados fictícios · nada foi enviado</div>
          <div className="text-sm font-semibold mb-2">Assunto: {preview.assunto}</div>
          {/* Conteúdo do próprio template (autor de nível 5) renderizado pra
              conferência visual — é o objetivo da tela. */}
          <div className="rounded-md bg-white text-black p-3 overflow-x-auto"
            dangerouslySetInnerHTML={{ __html: preview.html }} />
        </Card>
      )}
    </div>
  );
}
