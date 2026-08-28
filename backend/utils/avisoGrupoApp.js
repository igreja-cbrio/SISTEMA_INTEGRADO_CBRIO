// ============================================================================
// AVISO DE GRUPO NO APP DO MEMBRO · o vocabulário é DO APP (11/08/2026)
//
// Autorizado pelo Marcos (item 3 dos 16 apontamentos): *"pode ligar claude"*.
//
// Medido em 11/08 antes de escrever: **459 pedidos de grupo desde 01/07** e
// `app_notificacoes` (825 linhas, 8 tipos) com **ZERO de qualquer tipo de
// grupo**. O líder nunca soube pelo app que alguém pediu pra entrar no grupo
// dele — e é ele quem deve ligar pra pessoa ANTES de aprovar (lei dos templates
// v2, 29/07).
//
// ⚠️⚠️ SÃO DUAS TABELAS, E DOIS VOCABULÁRIOS. `notificar()` escreve em
// `notificacoes` (o sino do ERP web + app do STAFF) e emite o tipo
// **`pedido_grupo`**; o app do MEMBRO lê `app_notificacoes` e o roteador dele
// (`lib/notifTap.ts`) entende **`grupo_pedido`** — invertido. Copiar o tipo de um
// pro outro faz o aviso chegar e **não abrir tela nenhuma**.
//
// ⚠️ Por isso o tipo daqui NÃO é traduzido nem renomeado: ele é COMPARADO no app
// (`notifTap.ts`, `notificacoes.tsx`) e é chave do mapa de ícone/categoria — é a
// mesma família do `"Sem equipe"` que era sentinela de dado, não rótulo.
//
// ⚠️ Régua vive em `utils/` (sem Supabase) porque é o que entra no gate de
// deploy. O serviço lê o banco; aqui só se decide o TEXTO e o TIPO.
// ============================================================================

/**
 * Os tipos que o app JÁ ROTEIA hoje, no binário que está no campo.
 *
 * ⚠️⚠️ `grupo_pedido` é o ÚNICO que os DOIS mapas do app entendem
 * (`lib/notifTap.ts` **e** o `abrir()` de `app/(app)/notificacoes.tsx`, mais os
 * mapas de ícone e de categoria). É por isso que ele é o único que entra AGORA:
 * chega por merge, sem esperar OTA e sem depender de 2 aberturas do app.
 *
 * Os outros ficam para depois da unificação dos dois mapas (que sai por OTA) —
 * ligar antes faria o aviso aparecer em "Outros" e o toque não levar a lugar
 * nenhum, que é pior que não avisar.
 */
const TIPOS_ROTEADOS_HOJE = Object.freeze(['grupo_pedido']);

/** Primeiro nome, para caber no título do push sem cortar no meio. */
function primeiroNome(nome) {
  const t = String(nome ?? '').trim().split(/\s+/)[0];
  return t || 'Alguém';
}

/**
 * O aviso de PEDIDO NOVO, do jeito que o app espera.
 *
 * ⚠️ `data.grupo_id` e `data.pedido_id` viajam pro FUTURO, não pro presente:
 * conferido em 11/08, `notifTap.ts:78` e o `abrir()` de `notificacoes.tsx:121`
 * navegam pra `/grupo-inscricoes` **sem ler `data`** (a tela nem tem
 * `useLocalSearchParams`). Mandar assim mesmo é barato e é o que permite, quando
 * a tela passar a receber o grupo, não ter que reprocessar aviso antigo. Não
 * escrever aqui que o app "usa" — ele ainda não usa.
 *
 * ⚠️ `chaveDedup` amarra o aviso ao PEDIDO, não ao instante. `app_notificacoes`
 * não tinha dedup nenhum (nem coluna), então reenvio do formulário, retry e
 * reprocessamento duplicavam o aviso na mão do líder.
 * ⚠️ Ela **não** protege contra a Edge Function `notify-grupo-pedido` (que está
 * DEPLOYADA e hoje não produz nada): aquela insere sem `chave_dedup`, e NULL
 * nunca conflita. Se o webhook dela for ligado, duplica mesmo assim — ver o
 * diagnóstico no fim da migration `20260811150000`.
 */
function avisoPedidoNovo({ pedidoId, grupoId, grupoNome, pessoaNome }) {
  if (!pedidoId || !grupoId) return null;
  const nome = primeiroNome(pessoaNome);
  const grupo = String(grupoNome ?? '').trim() || 'seu grupo';
  return {
    tipo: 'grupo_pedido',
    titulo: 'Novo pedido de entrada 👋',
    // ⚠️ O corpo diz o PRÓXIMO PASSO porque a lei do fluxo é o líder LIGAR antes
    // de aceitar (Pr. Nélio · 29/07). "X quer entrar" sozinho não diz o que fazer.
    body: `${nome} quer entrar em ${grupo}. Fale com ${nome} antes de aprovar.`,
    data: { grupo_id: grupoId, pedido_id: pedidoId },
    chaveDedup: `grupo_pedido:${pedidoId}`,
  };
}

/**
 * O aviso de que ALGUÉM SAIU do grupo (pedido da Naná · 18/08).
 *
 * ⚠️ Vai para o LÍDER, nunca para o roster: expor a saída de uma pessoa a todo
 * o grupo seria constrangê-la por automação. Quem decide se procura é quem
 * conduz.
 *
 * ⚠️ O tipo `grupo_saida` entra JUNTO com o OTA que o ensina aos DOIS mapas do
 * app (`notifTap.ts` e o `abrir()` de `notificacoes.tsx`, mais ícone e
 * categoria). Foi por isso que ele não entrou na leva de 11/08 — tipo que só um
 * mapa conhece cai em "Outros" e o toque não leva a lugar nenhum.
 *
 * ⚠️ `chaveDedup` amarra ao PAR (grupo, pessoa) + DIA: sair e voltar no mesmo
 * dia não vira dois avisos, mas sair de novo semanas depois vira.
 */
function avisoSaida({ grupoId, grupoNome, pessoaNome, dia }) {
  if (!grupoId || !dia) return null;
  const nome = primeiroNome(pessoaNome);
  const grupo = String(grupoNome ?? '').trim() || 'seu grupo';
  return {
    tipo: 'grupo_saida',
    titulo: `${nome} saiu do grupo`,
    body: `${nome} saiu de ${grupo}.`,
    data: { grupo_id: grupoId },
    chaveDedup: `grupo_saida:${grupoId}:${String(pessoaNome ?? '').trim() || 'sem-nome'}:${dia}`,
  };
}

module.exports = { avisoPedidoNovo, avisoSaida, primeiroNome, TIPOS_ROTEADOS_HOJE };
