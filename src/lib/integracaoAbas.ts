// ============================================================================
//  Qual aba a Integração abre para quem NÃO tem o módulo `integracao`?
//
//  ⚠️⚠️ POR QUE ISTO EXISTE (03/09/2026). Os itens **Next** e **Batismo** saíram
//  do menu Ministerial (pedido do Matheus: "já existem dentro de suas
//  respectivas abas" — e é verdade: `/ministerial/next` era só um redirect para
//  `?tab=next`, e `/batismo` renderiza o MESMO componente `Batismos` que a aba).
//
//  ⚠️ O que a medição achou antes de tirar: existe o cargo **"Responsável de
//  Batismo"** (1 pessoa ATIVA, sem área — logo sem boost — e role `assistente`,
//  logo sem bypass) com `batismo: 3` e `integracao: 0`. Para ela o item
//  *Integração* do menu não aparece, e o item *Batismo* era a ÚNICA porta.
//  Tirar sem abrir outra deixaria uma pessoa real sem caminho para o próprio
//  módulo — a mesma classe do "card obrigatório, não enfeite" do hub do Kids.
//
//  ⇒ O modo restrito, que já existia para o Next (`soNext`), passou a valer
//  também para o Batismo: quem não tem `integracao` entra direto na aba do
//  módulo que TEM, com o resto da Integração escondido (é o que evita 403 no
//  dashboard e nas pendências, que são endpoints de `integracao`).
//
//  ⚠️⚠️ ISTO NÃO AMPLIA PERMISSÃO NENHUMA. A pessoa já tinha `batismo` e já via
//  exatamente este componente em `/batismo`; o que muda é o endereço da porta.
//  Quem decide o que ela pode ver continua sendo o `ModuleGuard` e o backend.
// ============================================================================

export type NivelPorModulo = { integracao: number; next: number; batismo: number };

export type ModoIntegracao = {
  /** Sem `integracao`: a página vira monotarefa do módulo que a pessoa tem. */
  restrito: boolean;
  /** Aba que abre e única visível no modo restrito. */
  abaInicial: 'frequencia' | 'next' | 'batismos';
  soNext: boolean;
  soBatismo: boolean;
};

const nivel = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? n : 0);

/**
 * ⚠️ `next` VENCE `batismo` quando a pessoa tem os dois sem `integracao`:
 * preserva byte a byte o comportamento que existia antes desta mudança (o
 * `soNext` era a única porta restrita). Mudar a precedência aqui trocaria a
 * tela de abertura de alguém sem ninguém ter pedido.
 */
export function modoIntegracao(niveis: Partial<NivelPorModulo> | null | undefined): ModoIntegracao {
  const integracao = nivel(niveis?.integracao);
  const next = nivel(niveis?.next);
  const batismo = nivel(niveis?.batismo);

  if (integracao >= 1) {
    return { restrito: false, abaInicial: 'frequencia', soNext: false, soBatismo: false };
  }
  const soNext = next >= 1;
  const soBatismo = !soNext && batismo >= 1;

  // ⚠️ Sem `integracao`, sem `next` e sem `batismo` a pessoa não deveria estar
  // aqui (o ModuleGuard barra). Se chegar, cai no modo restrito da aba Next —
  // o comportamento de antes — em vez de ver a Integração inteira. Fail-closed.
  return {
    restrito: true,
    abaInicial: soBatismo ? 'batismos' : 'next',
    soNext: !soBatismo,
    soBatismo,
  };
}
