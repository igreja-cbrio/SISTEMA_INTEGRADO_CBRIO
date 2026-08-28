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

describe('transferência de participante · o líder SOLICITA, a coordenação decide', () => {
  const APP = lerBackend('backend/routes/app.js');
  const ROTA = corpoDaRota(APP, '/grupos/:grupoId/membros/:rowId/transferir');

  // ⚠️⚠️ ESTE BLOCO FOI REESCRITO EM 25/08/2026, e o motivo importa mais que os
  // asserts. Ele guardava o desenho de 10/08: o líder escolhia o grupo de
  // destino, nascia um PEDIDO lá, e o cuidado era avisar o dono do DESTINO (não
  // o de origem) — inclusive pelo WhatsApp, porque é o líder de lá quem aprova.
  //
  // Aquele desenho MORREU por decisão do Marcos: *"eu quero que o líder de grupo
  // não escolha para onde ele está transferindo, eu quero que ele aperte e
  // solicite transferência, isso vai para caixa de entradas como pendente para
  // Naná gerenciar."* Não existe mais "dono do destino" na hora do pedido —
  // então os 4 asserts antigos passaram a proteger um comportamento que o
  // produto não quer. Ele tinha ZERO uso histórico, então nada foi perdido.
  //
  // O que este bloco protege AGORA é o inverso: que o destino NÃO volte a ser
  // escolhido pelo líder, e que o aviso chegue a quem decide.

  it('a rota existe e foi encontrada pelo extrator', () => {
    expect(ROTA).toContain('mem_grupo_transferencias');
  });

  it('⚠️⚠️ o líder NÃO escolhe o destino — nada de destino_grupo_id no corpo', () => {
    // É o ponto todo da mudança. Reintroduzir isso devolve ao líder uma escolha
    // que ele não tem informação pra fazer (ele só via os grupos dele).
    expect(ROTA).not.toMatch(/destino_grupo_id/);
    expect(ROTA).not.toMatch(/req\.body\?\.destino/);
  });

  it('⚠️ NÃO cria pedido de entrada em grupo nenhum', () => {
    // `mem_grupo_pedidos` é "quero entrar NESTE grupo" e exige grupo_id — a
    // transferência nasce sem destino. O único toque naquela tabela aqui seria
    // sinal de que o desenho antigo voltou.
    expect(ROTA).not.toMatch(/from\('mem_grupo_pedidos'\)\.insert/);
  });

  it('avisa a COORDENAÇÃO pelas regras do módulo, não uma lista no código', () => {
    // Não há dono de grupo a mirar (o destino não existe ainda), então o
    // destinatário sai de `notificacao_regras` via resolverDestinatarios.
    expect(ROTA).toMatch(/resolverDestinatarios\('grupos'\)/);
    const aviso = chamadasNotificar(ROTA)
      .filter(b => b.includes("tipo: 'grupo_transferencia_pedida'"));
    expect(aviso.length).toBeGreaterThan(0);
    for (const bloco of aviso) {
      // ⚠️ EXCEÇÃO DECLARADA à lei deste arquivo: o `targetIds` é condicional
      // (`coordenacao.length ? ... : {}`) porque lista vazia tem que cair no
      // fallback de admin/diretor — `targetIds: []` seria SILÊNCIO, e pedido de
      // líder parado sem ninguém saber é pior que aviso pra gente demais num
      // fluxo raro. O assert exige a forma condicional, não a ausência.
      expect(bloco, 'o aviso tem que carregar targetIds condicionado à lista da coordenação')
        .toMatch(/coordenacao\.length \? \{ targetIds: coordenacao \} : \{\}/);
    }
  });

  it('⚠️ NENHUM WhatsApp sai daqui', () => {
    // O desenho antigo mandava o link de aprovação pro líder do destino. Sem
    // destino, não há a quem mandar — e disparar pra coordenação seria mensagem
    // paga sobre uma decisão que ela toma no sistema, onde já vê a fila.
    expect(ROTA).not.toMatch(/notificarLiderNovoPedido\(/);
    expect(ROTA).not.toMatch(/gruposWpp\./);
  });

  it('⚠️ a pessoa NÃO é tirada do grupo pelo pedido', () => {
    // Ela continua onde está até a coordenação resolver. Encerrar o vínculo aqui
    // a deixaria sem grupo nenhum no meio do caminho.
    expect(ROTA).not.toMatch(/saiu_em:/);
  });

  it('⚠️ a líder PRINCIPAL não é transferida pelo app', () => {
    // Sem ela o grupo fica sem destinatário de aviso no WhatsApp (lei de 31/07).
    expect(ROTA).toMatch(/g\.grupo\.lider_id/);
  });
});
