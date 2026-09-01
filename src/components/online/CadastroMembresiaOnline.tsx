// Cadastro de membresia do ONLINE · o link que a equipe distribui.
//
// Pedido do Matheus (27/08/2026): "deve ter um cadastro de membresia online
// também, dentro do módulo do online, e deve ter um link para cadastro de
// membresia online, pode ser as mesmas perguntas que já temos no formulário de
// membresia, só que esse vai ser específico para o online."
//
// ⚠️⚠️ NÃO É UM SEGUNDO FORMULÁRIO — e essa é a parte que importa. O Contrato de
// porta manda: uma pessoa = um cadastro = um funil (matcher canônico, contato
// secundário em `mem_contatos`, CPF tardio, fila de aprovação). Duplicar a ficha
// daria duas versões divergindo no primeiro campo novo e um funil de identidade
// a reconstruir do zero. O que é "do Online" aqui é a ORIGEM.
//
// ⚠️ E a origem não é etiqueta: na APROVAÇÃO ela vira
// `mem_membros.frequenta_area = 'online'` — a mesma coluna que a aba Pessoas do
// painel de área lê. Por isso o link é montado no SERVIDOR (caminho do catálogo
// de formulários + base única): URL escrita na tela é URL que ninguém valida.
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { online as onlineApi } from '../../api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { UserPlus, Link2, QrCode, ExternalLink, Loader2 } from 'lucide-react';
import QrLinkDialog from '../QrLinkDialog';

export default function CadastroMembresiaOnline() {
  const [link, setLink] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [qrAberto, setQrAberto] = useState(false);

  useEffect(() => {
    let vivo = true;
    onlineApi.linkMembresia()
      .then((r: { link: string }) => { if (vivo) setLink(r.link); })
      // ⚠️ Erro NUNCA vira link vazio nem botão que abre o nada: a tela DIZ que
      // não conseguiu montar o endereço.
      .catch((e: unknown) => {
        if (vivo) setErro(e instanceof Error ? e.message : 'Não consegui montar o link');
      })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, []);

  return (
    <Card>
      <CardContent className="p-4 md:p-5 space-y-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-primary/10 p-2"><UserPlus className="h-5 w-5 text-primary" /></div>
          <div className="min-w-0">
            <h2 className="text-base font-bold leading-tight">Cadastro de membresia · online</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              É o formulário de membresia da igreja, com as mesmas perguntas. Quem se cadastrar por
              <strong> este</strong> link entra marcado como <strong>Online</strong> — e passa pela
              mesma fila de aprovação dos outros cadastros.
            </p>
          </div>
        </div>

        {carregando ? (
          <div className="py-4 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
        ) : erro ? (
          <p className="text-sm text-destructive py-2">{erro}</p>
        ) : link ? (
          <>
            {/* ⚠️ `min-w-0` no filho: o link é longo e o `truncate` só trunca se
                o item puder encolher abaixo do próprio min-content. */}
            <div className="flex flex-wrap items-center gap-2">
              <code className="flex-1 min-w-0 truncate rounded-md bg-muted px-2 py-1.5 text-xs">{link}</code>
              <Button size="sm" variant="outline"
                onClick={() => { navigator.clipboard.writeText(link); toast.success('Link copiado'); }}>
                <Link2 className="h-3.5 w-3.5 mr-1" /> Copiar
              </Button>
              <Button size="sm" variant="outline" onClick={() => setQrAberto(true)}>
                <QrCode className="h-3.5 w-3.5 mr-1" /> QR
              </Button>
              <a href={link} target="_blank" rel="noreferrer">
                <Button size="sm" variant="ghost">
                  <ExternalLink className="h-3.5 w-3.5 mr-1" /> Abrir
                </Button>
              </a>
            </div>
            <p className="text-[11px] text-muted-foreground">
              O cadastro cai na fila da Membresia, como qualquer outro. A marcação de área só vale
              quando ele é aprovado — e não sobrescreve quem a equipe já marcou como AMI ou Bridge.
            </p>
          </>
        ) : null}

        {qrAberto && link && (
          <QrLinkDialog
            link={link}
            titulo="Cadastro de membresia · Online"
            nomeArquivo="qr-cadastro-membresia-online"
            descricao="Aponte a câmera para preencher o cadastro de membresia. Quem entrar por aqui é marcado como Online."
            onClose={() => setQrAberto(false)}
          />
        )}
      </CardContent>
    </Card>
  );
}
