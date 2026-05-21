// ============================================================================
// Totem Kids · Teste de Etiqueta
// ============================================================================
// Pagina pra gerar e visualizar as 2 etiquetas sem precisar fazer check-in.
// 2 modos:
//   - Preview · abre em popup visivel (Ctrl+P pra ver dialogo)
//   - Imprimir · dispara pra impressora padrao (Brother no totem)
//
// Util pra:
//   - Calibrar impressora Brother antes do primeiro culto
//   - Conferir layout 62x100mm
//   - Testar troca de etiqueta (DK-22251 etc)
// ============================================================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Eye, Printer, ArrowLeft, Loader2, Baby } from 'lucide-react';
import { toast } from 'sonner';
import { imprimirEtiquetas } from './lib/imprimir';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export default function TotemKidsTesteEtiqueta() {
  const navigate = useNavigate();
  const [criancaNome, setCriancaNome] = useState('Maria Clara Teste');
  const [salaNome, setSalaNome] = useState('Infantil 1');
  const [salaCor, setSalaCor] = useState('#EC4899');
  const [idadeLabel, setIdadeLabel] = useState('4 anos');
  const [obsMedica, setObsMedica] = useState('Alergia a amendoim');
  const [responsavelNome, setResponsavelNome] = useState('Cláudia Teste');
  const [cultoNome, setCultoNome] = useState('Domingo Manhã');
  const [codigoSeguranca, setCodigoSeguranca] = useState('F8K3');
  const [processando, setProcessando] = useState(false);

  function gerarCodigo() {
    const alfa = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let c = '';
    for (let i = 0; i < 4; i++) c += alfa[Math.floor(Math.random() * alfa.length)];
    setCodigoSeguranca(c);
  }

  async function executar(preview: boolean) {
    setProcessando(true);
    try {
      await imprimirEtiquetas({
        checkinId: 'preview-only',
        crianca: {
          nome: criancaNome,
          idadeLabel,
          salaNome,
          salaCor,
          observacoesMedicas: obsMedica || null,
        },
        responsavel: { nome: responsavelNome },
        codigoSeguranca,
        codigoBarras: codigoSeguranca,
        dataHora: format(new Date(), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR }),
        cultoNome,
      }, preview);

      if (preview) {
        toast.success('2 popups abriram com as etiquetas · use Ctrl+P pra ver o preview de impressão');
      } else {
        toast.success('Impressão enviada · confira a Brother');
      }
    } catch (e: unknown) {
      toast.error((e as { message?: string })?.message || 'Erro');
    } finally {
      setProcessando(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-pink-700 dark:text-pink-300">Teste de Etiqueta</h1>
          <p className="text-sm text-muted-foreground">
            Calibre a impressora antes do culto · gera dados fake, NÃO cria check-in real
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate('/ministerial/totem-kids')}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Button>
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="text-sm font-semibold text-pink-700 dark:text-pink-300 flex items-center gap-2">
            <Baby className="h-4 w-4" /> Dados da etiqueta (editáveis)
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Nome da criança</label>
              <Input value={criancaNome} onChange={e => setCriancaNome(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Idade (texto livre)</label>
              <Input value={idadeLabel} onChange={e => setIdadeLabel(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Sala</label>
              <Input value={salaNome} onChange={e => setSalaNome(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Cor da sala (hex)</label>
              <div className="flex gap-2 items-center">
                <Input value={salaCor} onChange={e => setSalaCor(e.target.value)} />
                <span className="h-8 w-8 rounded border" style={{ background: salaCor }} />
              </div>
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground block mb-1">Observação médica (em destaque na etiqueta da criança)</label>
              <Input value={obsMedica} onChange={e => setObsMedica(e.target.value)} placeholder="ex: alergia a amendoim · vazio = sem destaque" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Responsável</label>
              <Input value={responsavelNome} onChange={e => setResponsavelNome(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Culto</label>
              <Input value={cultoNome} onChange={e => setCultoNome(e.target.value)} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">Código segurança (4 chars)</label>
              <div className="flex gap-2">
                <Input value={codigoSeguranca} onChange={e => setCodigoSeguranca(e.target.value.toUpperCase().slice(0, 4))} maxLength={4} className="font-mono uppercase tracking-widest" />
                <Button variant="outline" size="sm" onClick={gerarCodigo}>Gerar</Button>
              </div>
            </div>
          </div>

          <div className="border-t pt-4 flex flex-wrap gap-2">
            <Button onClick={() => executar(true)} disabled={processando} variant="outline">
              {processando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Eye className="h-4 w-4 mr-2" />}
              Ver preview (2 popups)
            </Button>
            <Button onClick={() => executar(false)} disabled={processando} className="bg-pink-600 hover:bg-pink-700">
              {processando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Printer className="h-4 w-4 mr-2" />}
              Imprimir teste (envia pra impressora padrão)
            </Button>
          </div>

          <div className="text-xs text-muted-foreground space-y-1 border-t pt-3">
            <p><b>Preview</b>: abre as 2 etiquetas em popups separados. Aperte Ctrl+P em cada um pra ver o preview de impressão do browser.</p>
            <p><b>Imprimir</b>: envia direto pra impressora padrão do sistema operacional (a Brother, se configurada).</p>
            <p><b>Tamanho da etiqueta</b>: 62mm × 100mm (DK-22251).</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
