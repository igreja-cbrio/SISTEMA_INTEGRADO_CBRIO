import { describe, it, expect } from 'vitest';
import { lerBackend, chamadasNotificar, corpoDaRota } from './utils/notificarEstatico';

// ─────────────────────────────────────────────────────────────────────────────
// GUARDA · notificação de grupo é do DONO do grupo
//
// Pedido do Matheus (10/08/2026): "as notificações de grupos devem chegar apenas
// para os seus respectivos responsáveis... preciso que isso seja para todos".
//
// A causa media assim: em 21 dias, 10.914 notificações do módulo `grupos` para
// 18 pessoas, 9.637 (88%) nunca lidas, 4.762 escritas para contas-robô. Nada
// disso era filtro esquecido — era o FALLBACK de `resolverDestinatarios()`, que
// sem lista em `notificacao_regras` manda pra todos os admin/diretor.
//
// ⚠️ ESTE ARQUIVO PROTEGE UMA REGRESSÃO QUE JÁ ACONTECEU DUAS VEZES, das duas
// em SILÊNCIO: um `notificar` de assunto de grupo sem `targetIds` não quebra
// nada, não falha teste nenhum e não aparece em log — só volta a inundar o sino
// de quem não tem nada a ver com aquele grupo. É invisível por construção, e é
// exatamente o tipo de coisa que precisa de guarda estática.
// ─────────────────────────────────────────────────────────────────────────────

const ROTAS_PEDIDO = [
  'backend/routes/grupos.js',
  'backend/routes/publicGrupos.js',
  'backend/routes/membresia.js',
  'backend/routes/publicMembresia.js',
];

describe('pedido de grupo · avisa o dono do grupo, nunca o público do módulo', () => {
  for (const arquivo of ROTAS_PEDIDO) {
    it(`${arquivo} · todo aviso de pedido_grupo tem targetIds`, () => {
      const blocos = chamadasNotificar(lerBackend(arquivo))
        .filter(b => b.includes("tipo: 'pedido_grupo'"));
      expect(blocos.length, `${arquivo} deveria ter pelo menos um aviso de pedido_grupo`)
        .toBeGreaterThan(0);
      for (const bloco of blocos) {
        expect(bloco, `${arquivo}: pedido_grupo sem targetIds volta pro fallback de ~16 admins`)
          .toMatch(/targetIds:/);
      }
    });

    it(`${arquivo} · quem resolve o destinatário é o donosDoGrupo`, () => {
      // ⚠️ ASSERÇÃO POSITIVA, e isso é deliberado. Minha primeira versão deste
      // teste proibia `vol_profiles` perto de `lider_id` no arquivo — e deu
      // FALSO POSITIVO em `grupos.js`, onde a aprovação de pedido usa aquela
      // tabela por outro motivo, num caminho que funciona. Já existe precedente
      // registrado no repo: teste incorreto no portão bloqueia produção, e isso
      // é pior que a ausência do teste. Então a régua afirma o que TEM que
      // existir em vez de tentar enumerar o que não pode.
      expect(lerBackend(arquivo)).toMatch(/donosDoGrupo\(/);
    });
  }
});

describe('transferência de participante · quem aprova é avisado', () => {
  const APP = lerBackend('backend/routes/app.js');
  const ROTA = corpoDaRota(APP, '/grupos/:grupoId/membros/:rowId/transferir');

  it('a rota existe e foi encontrada pelo extrator', () => {
    expect(ROTA).toContain('mem_grupo_pedidos');
    expect(ROTA).toContain('destino');
  });

  it('avisa o dono do grupo de DESTINO (não o de origem)', () => {
    // O pedido nasce na fila do destino; quem aprova é o líder de lá.
    expect(ROTA).toMatch(/donosDoGrupo\(destino\.id\)/);
    const aviso = chamadasNotificar(ROTA)
      .filter(b => b.includes("tipo: 'grupo_transferencia_pedida'"));
    expect(aviso.length).toBeGreaterThan(0);
    for (const bloco of aviso) expect(bloco).toMatch(/targetIds:/);
  });

  it('⚠️ manda o WhatsApp do líder — o canal que de fato decide', () => {
    // 368 das 388 decisões de pedido dos últimos 90 dias saíram pelo link do
    // WhatsApp, não pelo sistema. E em 86 dos 102 grupos ativos o líder não tem
    // conta: sem este envio, a transferência fica invisível pra quem aprova.
    expect(ROTA).toMatch(/notificarLiderNovoPedido\(/);
  });

  it('⚠️ o WhatsApp vai pro grupo de DESTINO, não pro de origem', () => {
    // Errar aqui manda pro líder de origem um link que aprova pedido no grupo
    // de OUTRA pessoa — o token é assinado com o par (pedido, líder), então
    // seria um link-capability entregue a quem não deveria decidir.
    const i = ROTA.indexOf('notificarLiderNovoPedido(');
    const chamada = ROTA.slice(i, i + 400);
    expect(chamada).toMatch(/grupo:\s*destino/);
    expect(chamada).not.toMatch(/grupo:\s*g\.grupo/);
  });

  it('a coordenação não recebe em dobro quando também é dona do destino', () => {
    // Duas linhas do mesmo fato pra mesma pessoa é o defeito que esta leva de
    // consertos existe pra tirar.
    expect(ROTA).toMatch(/resolverDestinatarios\('grupos'\)/);
    expect(ROTA).toMatch(/filter\(\s*id\s*=>\s*!donosDestino\.includes\(id\)\s*\)/);
  });
});
