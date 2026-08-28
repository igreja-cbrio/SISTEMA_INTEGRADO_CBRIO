import { describe, it, expect } from 'vitest';
import { avisoPedidoNovo, primeiroNome, TIPOS_ROTEADOS_HOJE } from '../../backend/utils/avisoGrupoApp.js';

// ─────────────────────────────────────────────────────────────────────────────
// Contexto medido em 11/08/2026, em produção:
//   · `app_notificacoes`: 825 linhas, 8 tipos, **ZERO de qualquer tipo de grupo**
//   · 459 pedidos de grupo desde 01/07 — o líder nunca soube pelo app
//   · 89 líderes de grupos ativos · 15 com conta no app · 6 com push token
//   · a Edge Function `notify-grupo-pedido` está DEPLOYADA (401, não 404)
// ─────────────────────────────────────────────────────────────────────────────

describe('avisoPedidoNovo · o aviso que o app entende', () => {
  const base = { pedidoId: 'ped-1', grupoId: 'gru-1', grupoNome: 'Conexão Barra', pessoaNome: 'Maria Silva Souza' };

  // ⚠️⚠️ MUTATION TEST · o ERP emite `pedido_grupo` na tabela `notificacoes` e o
  // app roteia `grupo_pedido` em `app_notificacoes`. São INVERTIDOS. Copiar o
  // tipo de um pro outro faz o aviso chegar e não abrir tela nenhuma.
  it('o tipo é `grupo_pedido` — NÃO o `pedido_grupo` do sino do ERP', () => {
    expect(avisoPedidoNovo(base)!.tipo).toBe('grupo_pedido');
    expect(avisoPedidoNovo(base)!.tipo).not.toBe('pedido_grupo');
  });

  it('leva grupo e pedido no `data` — é deles que o toque monta a rota', () => {
    expect(avisoPedidoNovo(base)!.data).toEqual({ grupo_id: 'gru-1', pedido_id: 'ped-1' });
  });

  // ⚠️⚠️ MUTATION TEST · sem chave amarrada ao PEDIDO, qualquer reprocessamento
  // (reenvio, retry, ou o dia em que a Edge Function deployada for religada)
  // duplica o aviso na mão do líder — e `app_notificacoes` não tinha dedup nenhum.
  it('a chave de dedup é o PEDIDO, não o instante', () => {
    const a = avisoPedidoNovo(base)!;
    const b = avisoPedidoNovo({ ...base, pessoaNome: 'Outro Nome' })!;
    expect(a.chaveDedup).toBe('grupo_pedido:ped-1');
    expect(b.chaveDedup).toBe(a.chaveDedup);            // mesmo pedido ⇒ mesma chave
    expect(avisoPedidoNovo({ ...base, pedidoId: 'ped-2' })!.chaveDedup)
      .not.toBe(a.chaveDedup);                          // pedido outro ⇒ chave outra
  });

  it('diz o PRÓXIMO PASSO, porque a lei do fluxo é ligar antes de aprovar', () => {
    expect(avisoPedidoNovo(base)!.body).toBe(
      'Maria quer entrar em Conexão Barra. Fale com Maria antes de aprovar.',
    );
  });

  // ⚠️ Sem referência não há como o toque abrir nada — melhor não avisar que
  // avisar sem destino (a lei do `notifTap` sobre tipo sem rota).
  it('sem pedido ou sem grupo devolve null, nunca aviso pela metade', () => {
    expect(avisoPedidoNovo({ ...base, pedidoId: undefined as never })).toBeNull();
    expect(avisoPedidoNovo({ ...base, grupoId: undefined as never })).toBeNull();
  });

  it('grupo sem nome não vira "undefined" na tela da pessoa', () => {
    expect(avisoPedidoNovo({ ...base, grupoNome: '' })!.body).toContain('em seu grupo');
    expect(avisoPedidoNovo({ ...base, grupoNome: undefined })!.body).not.toContain('undefined');
  });

  it('primeiroNome cabe no push e nunca fica vazio', () => {
    expect(primeiroNome('  Ana  Beatriz  Lima ')).toBe('Ana');
    expect(primeiroNome('')).toBe('Alguém');
    expect(primeiroNome(null as never)).toBe('Alguém');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️⚠️ A GUARDA DO CONTRATO COM O APP VIVE NO REPO DO APP, não aqui.
//
// A 1ª versão deste arquivo lia `lib/notifTap.ts` do outro repo por CAMINHO
// ABSOLUTO do Windows, com `if (!src) return` pra tolerar a ausência. No CI
// (ubuntu) isso é sempre ausência ⇒ **zero asserções, verde garantido** — e o
// cabeçalho ainda a chamava de "a guarda que importa". Guarda que não guarda é
// pior que guarda nenhuma: ela compra confiança sem entregar nada.
//
// A guarda de verdade está em `Aplicativo-CBRio/test/reguas.test.ts`
// ("aviso de grupo · o app tem que rotear o tipo que o ERP manda"), que lê por
// `process.cwd()` e roda no CI de lá. O que fica DESTE lado é o contrato do
// vocabulário — que é o que este repo controla.
// ─────────────────────────────────────────────────────────────────────────────
describe('contrato do vocabulário', () => {
  it('`grupo_pedido` é o único ligado agora — e NÃO é o `pedido_grupo` do ERP', () => {
    expect(TIPOS_ROTEADOS_HOJE).toEqual(['grupo_pedido']);
    expect(TIPOS_ROTEADOS_HOJE).not.toContain('pedido_grupo');
  });
});
