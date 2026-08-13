// ============================================================================
// INVENTÁRIO · RPCs chamadas DIRETO pelo cliente (2026-08-10)
//
// ⚠️⚠️ EXISTE POR CAUSA DO INCIDENTE DO CARTÃO DE MEMBRO (10/08/2026): o sweep
// de segurança revogou `anon`/`authenticated` de ~114 funções SECURITY DEFINER
// partindo de "o backend usa service_role, logo é imune". A premissa vale pro
// backend e **não vale pro app mobile nem pro front do ERP**, que falam direto
// com o PostgREST usando a chave pública. Resultado: o QR do cartão sumiu
// ("QR indisponível") e o **check-in de batismo pelo app parou**, sem ninguém
// reportar — o app descarta o `error` do `supabase.rpc()`, então falha de
// permissão vira tela vazia.
//
// ⚠️ Este arquivo é o INVENTÁRIO, não a permissão. Quem concede é a migration
// (`20260810120000_app_rpcs_grant_authenticated.sql`) e a marca que sobrevive à
// próxima varredura é o `COMMENT ON FUNCTION` no catálogo — a varredura é feita
// à mão no SQL Editor e quem varre não lê este arquivo.
//
// ⚠️ O que o teste do gate garante: toda RPC listada aqui tem `grant execute
// ... to authenticated` declarado em ALGUMA migration. É a rede contra o erro
// mais provável — acrescentar RPC nova no app e esquecer o grant, o que produz
// exatamente a mesma falha silenciosa.
//
// ⚠️ NÃO listar aqui RPC que só o BACKEND chama (essas devem ficar restritas a
// service_role — é o desenho certo, e ampliar o grant delas é regressão de
// segurança). O critério é UM: alguém chama isso com a chave pública?
// ============================================================================

/**
 * RPCs que o APP DE MEMBROS chama (repo `igreja-cbrio/Aplicativo-CBRio`).
 * ⚠️ O CI do ERP não vê aquele repo, então esta lista é mantida à mão — é o
 * ponto fraco conhecido deste inventário, e é por isso que a marca de verdade
 * está no COMMENT do catálogo.
 */
const RPCS_APP_MEMBROS = [
  {
    nome: 'app_meu_qrcode',
    assinatura: 'public.app_meu_qrcode()',
    tela: 'app/(app)/cartoes.tsx',
    // Sem parâmetro: o alvo é sempre profiles.id = auth.uid().
    alvo: 'auth.uid()',
  },
  {
    nome: 'app_batismo_checkin',
    assinatura: 'public.app_batismo_checkin(uuid)',
    tela: 'app/(app)/batismo.tsx',
    // Recebe o id da inscrição, mas filtra membro_id = membro do auth.uid().
    alvo: 'auth.uid()',
  },
  {
    nome: 'app_marcar_batizado_outra',
    assinatura: 'public.app_marcar_batizado_outra(text)',
    tela: 'app/(app)/batismo.tsx',
    alvo: 'auth.uid()',
  },
  {
    nome: 'app_desmarcar_batizado_outra',
    assinatura: 'public.app_desmarcar_batizado_outra()',
    tela: 'app/(app)/batismo.tsx',
    alvo: 'auth.uid()',
  },
];

/**
 * RPCs que o FRONT do ERP chama com a anon key (`src/**` · `supabase.rpc`).
 * ⚠️ Esta o teste confere contra o código de verdade (grep em `src/`), então
 * chamada nova aparece no gate sem depender de alguém lembrar.
 */
const RPCS_FRONT_ERP = [
  {
    nome: 'app_marcar_senha_trocada',
    assinatura: 'public.app_marcar_senha_trocada()',
    tela: 'src/contexts/AuthContext.jsx',
    alvo: 'auth.uid()',
  },
];

const RPCS_CLIENTE = [...RPCS_APP_MEMBROS, ...RPCS_FRONT_ERP];

/** Nomes das funções que PRECISAM de EXECUTE para `authenticated`. */
function nomesRpcsCliente() {
  return RPCS_CLIENTE.map((r) => r.nome);
}

/**
 * Remove comentários de linha do SQL antes de procurar COMANDO.
 * ⚠️ Sem isso a checagem casa com a própria documentação do conserto — já
 * aconteceu 2× em 06/08 (a guarda do appRateLimit e a conferência da
 * 20260806140000). Procurar comando, nunca identificador solto.
 */
function semComentariosSql(sql) {
  return String(sql || '').replace(/--[^\n]*/g, '');
}

/**
 * Acha, no SQL dado, os nomes que recebem `grant execute ... to authenticated`.
 * @param {string} sql conteúdo de uma ou mais migrations concatenadas
 * @returns {Set<string>} nomes de função
 */
function grantsAuthenticatedNoSql(sql) {
  const achados = new Set();
  const limpo = semComentariosSql(sql);
  const re = /grant\s+execute\s+on\s+function\s+(?:public\.)?([a-z0-9_]+)\s*\([^)]*\)\s+to\s+([^;]+);/gi;
  let m;
  while ((m = re.exec(limpo)) !== null) {
    if (/\bauthenticated\b/i.test(m[2])) achados.add(m[1].toLowerCase());
  }
  return achados;
}

module.exports = {
  RPCS_CLIENTE,
  RPCS_APP_MEMBROS,
  RPCS_FRONT_ERP,
  nomesRpcsCliente,
  grantsAuthenticatedNoSql,
  semComentariosSql,
};
