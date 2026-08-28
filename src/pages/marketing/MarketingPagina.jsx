import MarketingNav from './MarketingNav';
import { Megaphone } from 'lucide-react';

// ============================================================================
// CABEÇALHO ÚNICO do módulo Marketing
// ============================================================================
// Reclamação do Marcos (17/08): *"cada opção que eu clico o menu fica de um
// tamanho e centralizado de uma forma, então parece que você está entrando em
// módulos diferentes"*. Ele estava certo — e a causa era estrutural: **cada tela
// montava o seu próprio cabeçalho**, e nenhuma combinava com as outras:
//
//   Dashboard/Kanban/Analytics/Admin · `p-4 md:p-6 space-y-4 md:space-y-6`, largura total
//   Planner                          · `space-y-4` (espaçamento menor)
//   Generosidade                     · só `p-4 md:p-6` (sem space-y)
//   Comunicados                      · `max-w-5xl mx-auto p-4` → ESTREITO e CENTRALIZADO
//   Destaques (veio do /admin)       · `maxWidth: 1100; margin: 0 auto` inline
//
// Somado a isso, o título mudava ("Marketing" × "Comunicados") e o menu às vezes
// ficava ao lado do título, às vezes embaixo dele.
//
// ⚠️ A correção NÃO é acertar os 7 arquivos pra "combinarem" — isso volta a
// divergir na próxima tela que alguém criar. O cabeçalho passa a existir em UM
// lugar, e as telas entregam só o conteúdo. O `MarketingNav` é montado
// exclusivamente aqui: tela que se esquecer dele não existe mais.
export default function MarketingPagina({ subtitulo, acoes, children }) {
  return (
    // ⚠️ Largura TOTAL e sem `mx-auto`: o Kanban tem 6 colunas com rolagem
    // horizontal e o Planner é uma grade de dias úteis — centralizar com largura
    // máxima (o que o Comunicados fazia) aperta as duas telas.
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0">
          {/* O título do MÓDULO é sempre o mesmo — o que muda é o subtítulo.
              Trocar o h1 por aba era parte da sensação de "outro módulo". */}
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Megaphone className="h-6 w-6 text-primary" />
            Marketing
          </h1>
          {subtitulo && <p className="text-sm text-muted-foreground mt-1">{subtitulo}</p>}
        </div>
        {acoes && <div className="flex items-center gap-2 shrink-0 flex-wrap">{acoes}</div>}
      </div>

      {/* O menu do módulo, SEMPRE no mesmo lugar e na mesma largura. */}
      <MarketingNav />

      {children}
    </div>
  );
}
