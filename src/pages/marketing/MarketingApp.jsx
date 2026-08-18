import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import MarketingPagina from './MarketingPagina';
import { ComunicadosConteudo } from './MarketingComunicados';
import Destaques from '../admin/Destaques';
import FotosBatismo from '../admin/FotosBatismo';
import { Megaphone, Images, Camera, Lock } from 'lucide-react';

// ============================================================================
// Marketing · aba "APP" — tudo o que a equipe publica no app de membros
// ============================================================================
// Pedido do Marcos (17/08): *"quero alterar a aba de comunicados para 'App', lá
// dentro vai ter uma aba de comunicados, e mais os atuais módulos, que têm que
// vir pra cá: 'Destaques' e 'Fotos Batismo'"*.
//
// As duas telas viviam soltas em `/admin/destaques` e `/admin/fotos-batismo`,
// listadas como itens separados no menu Criativo — três lugares para publicar
// coisa no mesmo app. Agora é uma aba com três sub-abas.
//
// ⚠️ PERMISSÃO AMPLIADA em 18/08/2026, a pedido do Marcos: *"Pedro deve poder
// publicar, alterar fotos, alterar destaques... mexer no app por esse módulo."*
// Os dois backends saíram de `authorize('admin','diretor')` para o módulo
// `marketing` (leitura 1 · escrita 3), então as 3 sub-abas aparecem para quem
// abre a aba — não há mais sub-aba escondida.
// ⚠️ O que continua valendo: quem tem `marketing` só em LEITURA (1 ou 2 — a
// matriz dá 1 a pastor-senior, diretor-administrativo, coordenador-estratégia,
// diretor-ministerial e diretor-criativo) vê o conteúdo publicado **sem os
// botões de escrita**, porque botão que devolve 403 é pior que botão ausente.
// `canAccessModule` é o espelho do `authorizeModule` do servidor (mesmo bypass
// de admin/diretor, mesmo deny explícito) — quem decide de verdade é o backend.
const ABAS = [
  { key: 'comunicados', label: 'Comunicados', icon: Megaphone },
  { key: 'destaques',   label: 'Destaques',   icon: Images },
  { key: 'batismo',     label: 'Fotos Batismo', icon: Camera },
];

const SUBTITULO = {
  comunicados: 'Avisos do mural do app · publicar manda push pro público escolhido',
  destaques: 'Carrossel de fotos da Home do app · atualiza sozinho em até 10 minutos',
  batismo: 'Álbum do dia · aparece na aba Batismo do app para quem foi batizado',
};

export default function MarketingApp() {
  const { canAccessModule } = useAuth();
  // Espelha o guard do servidor: escrita exige `marketing` >= 3 (admin/diretor
  // passam por bypass, dentro do próprio canAccessModule).
  const podeEditar = canAccessModule(['marketing'], 'escrita', 3);

  const [params, setParams] = useSearchParams();
  const daUrl = params.get('t');
  const inicial = ABAS.some(a => a.key === daUrl) ? daUrl : 'comunicados';
  const [aba, setAba] = useState(inicial);

  function trocar(k) {
    setAba(k);
    // Mantém a sub-aba no endereço: recarregar a página (ou compartilhar o link)
    // não pode devolver a pessoa pra outra aba.
    const p = new URLSearchParams(params);
    if (k === 'comunicados') p.delete('t'); else p.set('t', k);
    setParams(p, { replace: true });
  }

  const abaAtual = ABAS.some(a => a.key === aba) ? aba : 'comunicados';

  return (
    <MarketingPagina subtitulo={SUBTITULO[abaAtual]}>
      {/* Sub-abas · mesmo padrão visual dos seletores do módulo */}
      <div className="flex flex-wrap gap-1 border-b border-border">
        {ABAS.map(a => {
          const Icon = a.icon;
          const ativo = abaAtual === a.key;
          return (
            <button
              key={a.key}
              type="button"
              onClick={() => trocar(a.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                ativo
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
              }`}
            >
              <Icon className="h-4 w-4" /> {a.label}
            </button>
          );
        })}
      </div>

      {abaAtual === 'comunicados' && <ComunicadosConteudo />}

      {/* ⚠️ `embutido` é o que faz as duas telas do /admin abrirem mão da largura
          e centralização próprias (`maxWidth: 1100; margin: 0 auto` inline) e do
          título repetido — em vez de eu neutralizar por CSS de fora, que quebraria
          na próxima mudança interna delas. Elas seguem funcionando soltas. */}
      {abaAtual === 'destaques' && <Destaques embutido podeEditar={podeEditar} />}
      {abaAtual === 'batismo' && <FotosBatismo embutido podeEditar={podeEditar} />}

      {!podeEditar && (
        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground border-t border-border pt-3">
          <Lock className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          Você está vendo em modo leitura: publicar, editar e excluir exigem nível 3
          no módulo Marketing. Fale com o Marcos se precisar publicar.
        </p>
      )}
    </MarketingPagina>
  );
}
