// ============================================================================
// Totem Kids · pareamento de tablet com estacao
// ============================================================================
// Tablet/celular abre essa URL (via QR code escaneado uma vez):
//   /ministerial/totem-kids/parear?estacao=<uuid>&token=<uuid>
//
// Sistema valida token contra kids_estacoes.token_pareamento. Se bate:
//   - Salva {id, nome, tipo, printer_modelo} no localStorage do device
//   - Daí pra frente, todo check-in envia esse estacao_id automaticamente
//
// Sem token = redireciona pro totem (assume nao pareado).
// Token invalido = mostra erro · admin precisa gerar QR novo.
// ============================================================================

import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle2, AlertTriangle, Loader2, Tablet, ArrowRight } from 'lucide-react';
import { totemKids } from '@/api';
import { setEstacaoPareada } from './lib/estacaoPareada';

export default function TotemKidsParear() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const estacaoId = params.get('estacao');
  const token = params.get('token');

  const [status, setStatus] = useState<'pareando' | 'ok' | 'erro' | 'sem-params'>('pareando');
  const [estacao, setEstacao] = useState<{ id: string; nome: string; tipo: string; printer_modelo?: string | null } | null>(null);
  const [erro, setErro] = useState<string>('');

  useEffect(() => {
    if (!estacaoId || !token) {
      setStatus('sem-params');
      return;
    }
    parear();
  }, [estacaoId, token]);

  async function parear() {
    try {
      const e = await totemKids.estacoes.parear({ estacao_id: estacaoId, token });
      setEstacaoPareada({
        id: e.id,
        nome: e.nome,
        tipo: e.tipo,
        printer_modelo: e.printer_modelo,
      });
      setEstacao(e);
      setStatus('ok');
    } catch (e: unknown) {
      const err = e as { message?: string };
      setErro(err?.message || 'Erro ao parear');
      setStatus('erro');
    }
  }

  return (
    <div className="max-w-md mx-auto p-4 mt-12 space-y-4">
      <div className="text-center">
        <Tablet className="h-16 w-16 text-pink-500 mx-auto mb-2" />
        <h1 className="text-2xl font-bold text-pink-700 dark:text-pink-300">Parear dispositivo</h1>
        <p className="text-sm text-muted-foreground">Vincular este tablet/celular a uma estação do Totem Kids</p>
      </div>

      <Card>
        <CardContent className="p-6 text-center space-y-4">
          {status === 'pareando' && (
            <>
              <Loader2 className="h-10 w-10 animate-spin text-pink-500 mx-auto" />
              <p>Validando token...</p>
            </>
          )}

          {status === 'ok' && estacao && (
            <>
              <CheckCircle2 className="h-12 w-12 text-emerald-500 mx-auto" />
              <h2 className="text-xl font-bold">Pareado com sucesso!</h2>
              <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 rounded-lg p-3 text-left">
                <p><b>Estação</b>: {estacao.nome}</p>
                <p><b>Tipo</b>: {estacao.tipo}</p>
                {estacao.printer_modelo && <p><b>Impressora</b>: {estacao.printer_modelo}</p>}
              </div>
              <p className="text-sm text-muted-foreground">
                A partir de agora, todo check-in feito neste dispositivo será registrado nessa estação.
              </p>
              <Button onClick={() => navigate('/ministerial/totem-kids')} className="w-full bg-pink-600 hover:bg-pink-700" size="lg">
                Ir pro Totem <ArrowRight className="h-5 w-5 ml-2" />
              </Button>
            </>
          )}

          {status === 'erro' && (
            <>
              <AlertTriangle className="h-12 w-12 text-red-500 mx-auto" />
              <h2 className="text-xl font-bold">Falha no pareamento</h2>
              <div className="bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-800 rounded-lg p-3 text-sm">
                {erro}
              </div>
              <p className="text-sm text-muted-foreground">
                Token foi revogado ou está incorreto. Peça ao admin pra gerar um QR novo.
              </p>
              <Button variant="outline" onClick={() => navigate('/ministerial/totem-kids')} className="w-full">
                Voltar ao Totem (sem estação)
              </Button>
            </>
          )}

          {status === 'sem-params' && (
            <>
              <AlertTriangle className="h-12 w-12 text-amber-500 mx-auto" />
              <h2 className="text-xl font-bold">URL incompleta</h2>
              <p className="text-sm text-muted-foreground">
                Esta URL precisa dos parâmetros <code>?estacao=&token=</code>.
                Use o QR code gerado no admin pra parear.
              </p>
              <Button variant="outline" onClick={() => navigate('/ministerial/totem-kids')} className="w-full">
                Voltar ao Totem
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
