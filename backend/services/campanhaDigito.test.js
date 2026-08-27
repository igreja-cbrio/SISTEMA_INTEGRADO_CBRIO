const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  extrairDigito, digitoValido, normalizarDigito, ehCredito,
  digitoDoLancamento, checarDigitoLivre, sugerirDigito, valorComDigito,
} = require('../utils/digitoCampanha');
const {
  calcularProgresso, ritmoNecessario, estaNoAr, brlRedondo,
} = require('../utils/campanhaProgresso');
const { elegivel, montarPublico } = require('../utils/campanhaPublico');
const { deveAgradecer, textoAgradecimento } = require('../utils/campanhaAgradecimento');

// ════════════════════════════════════════════════════════════════════════════
// ⚠️ O QUE ESTE TESTE PROTEGE (27/08/2026)
//
// O dígito verificador de campanha JÁ MORREU UMA VEZ, exatamente assim: a régua
// do centavo foi escrita só no JS (`services/financeiroClassificador.js`), o
// caminho que roda de verdade é o trigger SQL, e ninguém percebeu por 3 meses.
// Medido em 26/08/2026, em produção:
//
//   dígito 25 (Campanha 2025) · 105 créditos · R$ 21.745,25 · 0 classificados
//   dígito 22 (Bazar)         ·  90 créditos · R$  7.063,80 · 0 classificados
//   dígito 31 (Ação Social)   ·  10 créditos · R$ 13.379,10 · 0 classificados
//   `fin_transacoes.identificador_centavo` preenchido em ZERO linhas
//
// Este teste está no gate de deploy (`npm run test:campanha-digito`) e trava a
// publicação se: a régua do dígito mudar de resposta, a barrinha voltar a somar
// camadas que geram dupla contagem, o agradecimento voltar a citar nome, ou o
// ESPELHO SQL divergir do JS.
// ════════════════════════════════════════════════════════════════════════════

// ── 1. O dígito sai certo do valor, inclusive contra ponto flutuante ────────
// `1907.25 % 1` = 0.25000000000004547 e `0.07` = 0.07000000000000028: truncar em
// vez de arredondar devolve 24 e 6, e a doação vai pra campanha errada (ou pra
// nenhuma). É o bug que não aparece em teste manual com valores redondos.
assert.equal(extrairDigito(1907.25), '25');
assert.equal(extrairDigito(500.07), '07');
assert.equal(extrairDigito(0.07), '07');
assert.equal(extrairDigito(4456.77), '77');
assert.equal(extrairDigito(1000), '00');
assert.equal(extrairDigito(-830.29), '29', 'valor negativo: o dígito é do módulo');
assert.equal(extrairDigito(null), null);
assert.equal(extrairDigito(''), null);
assert.equal(extrairDigito('abc'), null);
// Os cinco dígitos que existem em produção hoje, com valores reais medidos.
assert.equal(extrairDigito(327.17), '17');
assert.equal(extrairDigito(1719.31), '31');
assert.equal(extrairDigito(554.07), '07');

// ── 2. '00' NUNCA é dígito de campanha ─────────────────────────────────────
// 87,5% dos créditos da igreja têm centavo ",00" (4.261 de 4.868 em 12 meses).
// Aceitar '00' como dígito jogaria o caixa inteiro dentro de uma campanha.
assert.equal(digitoValido('00'), false, "'00' não pode ser dígito de campanha");
assert.equal(digitoValido('07'), true);
assert.equal(digitoValido('7'), false, 'dígito é sempre de 2 caracteres');
assert.equal(digitoValido(''), false);
assert.equal(normalizarDigito(7), '07', 'formulário manda 7; a régua normaliza');
assert.equal(normalizarDigito(' 07 '), '07');
assert.equal(normalizarDigito(0), null, "0 normaliza pra '00', que é inválido");
assert.equal(normalizarDigito('7x'), null);
assert.equal(normalizarDigito('107'), null);

// ── 3. Só CRÉDITO carrega dígito ───────────────────────────────────────────
// Um pagamento a fornecedor de R$ 500,07 é coincidência; contá-lo somaria
// DESPESA na arrecadação da campanha.
assert.equal(ehCredito({ tipo_trn: 'CREDIT', valor: 100 }), true);
assert.equal(ehCredito({ tipo_trn: 'DEBIT', valor: 100 }), false,
  'tipo_trn manda mais que o sinal do valor');
assert.equal(ehCredito({ valor: 100 }), true, 'sem tipo_trn, o sinal decide');
assert.equal(ehCredito({ valor: -100 }), false);
assert.equal(digitoDoLancamento({ tipo_trn: 'DEBIT', valor: 500.07 }, ['07']), null,
  'saída de R$ 500,07 NÃO é doação da campanha 07');
assert.equal(digitoDoLancamento({ tipo_trn: 'CREDIT', valor: 500.07 }, ['07']), '07');
assert.equal(digitoDoLancamento({ tipo_trn: 'CREDIT', valor: 500.09 }, ['07']), null,
  'dígito fora da lista de ativos não classifica');
assert.equal(digitoDoLancamento({ tipo_trn: 'CREDIT', valor: 500 }, ['07']), null,
  'centavo 00 nunca classifica');
// Os dois formatos que existem no sistema têm que funcionar sem conversão na
// chamada — `camp_campanhas.digito` e `fin_identificadores_centavo.centavo`.
assert.equal(digitoDoLancamento({ valor: 500.07 }, [{ digito: '07' }]), '07');
assert.equal(digitoDoLancamento({ valor: 500.07 }, [{ centavo: '07' }]), '07');
assert.equal(digitoDoLancamento({ valor: 500.07 }, [7]), '07');

// ── 4. Colisão de dígito é barrada ANTES de gravar ─────────────────────────
// Se a campanha do Kids adotar '25' (já usado pela campanha do templo), todo
// crédito vai pro destino errado — e o extrato bancário não guarda nada que
// permita desempatar depois. Não existe conserto retroativo.
const OCUPADOS = [
  { dono: 'templo', digito: '17', descricao: 'Templo' },
  { dono: 'bazar', digito: '22', descricao: 'Bazar' },
  { dono: 'camp2025', digito: '25', descricao: 'Campanha 2025' },
  { dono: 'social', digito: '31', descricao: 'Ação Social' },
];
assert.equal(checarDigitoLivre('07', OCUPADOS).ok, true, '07 está livre em produção');
assert.equal(checarDigitoLivre('25', OCUPADOS).ok, false);
assert.match(checarDigitoLivre('25', OCUPADOS).motivo, /Campanha 2025/,
  'a mensagem tem que dizer QUEM já usa o dígito');
assert.equal(checarDigitoLivre('00', OCUPADOS).ok, false);
// Editar a própria campanha sem trocar o dígito não pode colidir consigo mesma.
assert.equal(checarDigitoLivre('25', OCUPADOS, { ignorar: 'camp2025' }).ok, true);
assert.equal(sugerirDigito(OCUPADOS), '01');
assert.equal(sugerirDigito([...OCUPADOS, { dono: 'x', digito: '01' }]), '02');

// ── 5. O valor com dígito nunca cobra MAIS do que a pessoa quis dar ────────
// Doar R$ 500,00 com dígito 07 = transferir R$ 500,07. Mas R$ 500,50 vira
// R$ 500,07 (arredonda pra BAIXO): cobrar mais é a única direção do erro que
// gera reclamação de quem estava doando.
assert.equal(valorComDigito(50000, '07'), 50007);
assert.equal(valorComDigito(50050, '07'), 50007, 'arredonda pra baixo, nunca pra cima');
assert.equal(valorComDigito(50099, '07'), 50007);
assert.equal(valorComDigito(5, '07'), 7, 'valor menor que o dígito devolve o dígito');
assert.equal(valorComDigito(50000, null), 50000, 'campanha sem dígito não mexe no valor');
assert.equal(valorComDigito(0, '07'), 0);

// ── 6. A barrinha NÃO gera dupla contagem ──────────────────────────────────
// LEI Nº 6 DO NÚCLEO: `mem_contribuicoes` não é caixa. Os três baldes são
// disjuntos por construção, e quando a fila aprova um crédito ele MIGRA de
// `conciliando` pra `confirmado` — o total NÃO se move. Se algum dia o total
// pular quando o financeiro trabalha, é este assert que quebra.
const ANTES = calcularProgresso({
  meta_centavos: 50000000,
  caixa_confirmado_centavos: 10000000,
  caixa_conciliando_centavos: 2500000,
  online_pago_centavos: 500000,
});
const DEPOIS = calcularProgresso({
  meta_centavos: 50000000,
  caixa_confirmado_centavos: 12500000, // a fila aprovou os 2,5 mi
  caixa_conciliando_centavos: 0,
  online_pago_centavos: 500000,
});
assert.equal(ANTES.total_centavos, DEPOIS.total_centavos,
  'aprovar na fila NÃO pode mudar o total arrecadado — só migra de balde');
assert.equal(ANTES.total_centavos, 13000000);
assert.equal(ANTES.pct, 26);
assert.equal(ANTES.pct_conciliando, 19.23);
assert.equal(DEPOIS.pct_conciliando, 0);

// pct verdadeiro passa de 100; a BARRA trava em 100 (senão estoura o card).
const ESTOUROU = calcularProgresso({ meta_centavos: 100, caixa_confirmado_centavos: 130 });
assert.equal(ESTOUROU.pct, 130, 'o relatório mostra o número verdadeiro');
assert.equal(ESTOUROU.pct_barra, 100, 'a barra desenhada trava em 100');
assert.equal(ESTOUROU.bateu_meta, true);
assert.equal(ESTOUROU.falta_centavos, 0);
// Meta zero não divide por zero.
assert.equal(calcularProgresso({ meta_centavos: 0, caixa_confirmado_centavos: 100 }).pct, 0);

// ── 7. Ritmo e janela da campanha usam data ISO, sem fuso ──────────────────
// `new Date('2026-09-06')` é meia-noite UTC = dia 5 no Rio. Este projeto já
// pagou esse bug no check-in do Kids, na curva do censo e na agenda de grupos.
const RITMO = ritmoNecessario({
  total_centavos: 13000000, meta_centavos: 50000000,
  hoje: '2026-09-06', data_fim: '2026-09-30',
});
assert.equal(RITMO.dias_restantes, 24);
assert.equal(RITMO.falta_centavos, 37000000);
assert.equal(RITMO.por_dia_centavos, Math.ceil(37000000 / 24));
assert.equal(ritmoNecessario({ hoje: '2026-09-30', data_fim: '2026-09-30' }).por_dia_centavos, null,
  'último dia não tem "por dia"');

const KIDS = { status: 'ativa', data_inicio: '2026-09-01', data_fim: '2026-10-31' };
assert.equal(estaNoAr(KIDS, '2026-09-06'), true);
assert.equal(estaNoAr(KIDS, '2026-08-31'), false, 'antes do início não aparece');
assert.equal(estaNoAr(KIDS, '2026-11-01'), false, 'depois do fim não aparece');
assert.equal(estaNoAr({ ...KIDS, status: 'rascunho' }, '2026-09-06'), false,
  'rascunho nunca vai pro ar');

// O número do cartaz é redondo; o da contabilidade não.
assert.equal(brlRedondo(12843719), 'R$ 128 mil');
assert.equal(brlRedondo(50000000), 'R$ 500 mil');
assert.equal(brlRedondo(45000), 'R$ 450');

// ── 8. WhatsApp SEM opt-in nunca entra no público ──────────────────────────
// Pedir dinheiro é Marketing na régua da Meta, e a igreja tem UM número: um
// disparo sem opt-in queima o número pra escala, grupos, Kids e o inbox.
assert.equal(elegivel({ id: 1, active: true, telefone: '21999998888' }, 'whatsapp').elegivel, false);
assert.match(elegivel({ id: 1, active: true, telefone: '21999998888' }, 'whatsapp').motivo, /opt-in/);
assert.equal(elegivel({ id: 1, active: true, telefone: '21999998888', whatsapp_optin: true }, 'whatsapp').elegivel, true);
assert.equal(elegivel({ id: 1, active: true, whatsapp_optin: true }, 'whatsapp').elegivel, false,
  'opt-in sem telefone não dá');
// Inativo e soft-deletado ficam fora.
assert.equal(elegivel({ id: 1, active: false, email: 'a@b.com' }, 'email').elegivel, false);
assert.equal(elegivel({ id: 1, active: true, deleted_at: '2026-01-01', email: 'a@b.com' }, 'email').elegivel, false);
assert.equal(elegivel({ id: 1, active: true, status: 'inativo', email: 'a@b.com' }, 'email').elegivel, false);
assert.equal(elegivel({ id: 1, active: true, status: 'falecido', email: 'a@b.com' }, 'email').elegivel, false);
// E-mail de placeholder de import antigo não vira bounce em massa.
assert.equal(elegivel({ id: 1, active: true, email: 'x@exemplo.com' }, 'email').elegivel, false);
assert.equal(elegivel({ id: 1, active: true, email: 'joao@gmail.com' }, 'email').elegivel, true);
// Opt-out de e-mail é respeitado (coluna criada pela migration 20260827120000).
assert.equal(elegivel({ id: 1, active: true, email: 'a@b.com', email_optout: true }, 'email').elegivel, false);

// ── 9. A MESMA CASA não recebe 4 cópias do pedido de doação ────────────────
// Família compartilha e-mail e telefone nesta base — é a razão de `mem_contatos`
// existir e de o matcher ter proibição de ligar pessoa por telefone sozinho.
const CASA = [
  { id: 1, nome: 'Pai', active: true, email: 'casa@gmail.com' },
  { id: 2, nome: 'Mãe', active: true, email: 'CASA@gmail.com' },
  { id: 3, nome: 'Filho', active: true, email: 'casa@gmail.com ' },
  { id: 4, nome: 'Avó', active: true, email: 'avo@gmail.com' },
  { id: 5, nome: 'Sem contato', active: true, email: null },
];
const PUB = montarPublico(CASA, 'email');
assert.equal(PUB.total_alvo, 2, 'a casa conta 1 vez, mais a avó');
assert.equal(PUB.motivos['destino repetido (mesma casa)'], 2);
assert.equal(PUB.motivos['sem e-mail utilizável'], 1);
assert.equal(PUB.total_base, 5);
assert.equal(PUB.total_alvo + PUB.total_fora, PUB.total_base,
  'todo mundo tem que ser contado em algum lado — senão a prévia mente');

// ── 10. O agradecimento NÃO cita nome nem valor ────────────────────────────
// Decisão da reunião: "a mensagem de agradecimento deverá ser genérica, sem
// citar o nome da pessoa, para evitar erros de identificação" — porque telefone
// e e-mail nesta base estão cadastrados em nome de familiares e filhos.
const TXT = textoAgradecimento({ nome: 'Reforma do Kids', link: 'https://cbrio.org/c/kids' });
assert.ok(TXT.assunto.length > 0);
assert.ok(!/\{\{|\$\{|%s/.test(TXT.corpo_texto), 'sobrou placeholder não substituído no texto');
assert.ok(!/R\$/.test(TXT.corpo_texto),
  'o agradecimento NÃO mostra valor: a mensagem pode chegar no celular da família');
assert.match(TXT.corpo_texto, /Reforma do Kids/);
assert.match(TXT.corpo_texto, /cbrio\.org\/c\/kids/);

// Idempotência, anônimo, estorno e janela de silêncio.
const AGORA = '2026-09-08T12:00:00Z';
assert.equal(deveAgradecer({ membro_id: 'm1', valor_centavos: 50007 },
  { canal_disponivel: true, agora: AGORA }).agradecer, true);
assert.equal(deveAgradecer({ membro_id: 'm1', valor_centavos: 50007 },
  { ja_agradecida: true, canal_disponivel: true, agora: AGORA }).agradecer, false);
assert.equal(deveAgradecer({ membro_id: null, valor_centavos: 50007 },
  { canal_disponivel: true, agora: AGORA }).agradecer, false);
assert.match(deveAgradecer({ membro_id: null, valor_centavos: 1 },
  { canal_disponivel: true, agora: AGORA }).motivo, /anônima/);
assert.equal(deveAgradecer({ membro_id: 'm1', valor_centavos: -50007 },
  { canal_disponivel: true, agora: AGORA }).agradecer, false,
  'estorno NUNCA dispara "obrigado pela sua generosidade"');
assert.equal(deveAgradecer({ membro_id: 'm1', valor_centavos: 50007 },
  { canal_disponivel: true, agora: AGORA, ultimo_agradecimento_em: '2026-09-07T12:00:00Z' }).agradecer,
  false, 'quem doou 2× em 24h recebe 1 obrigado');
assert.equal(deveAgradecer({ membro_id: 'm1', valor_centavos: 50007 },
  { canal_disponivel: true, agora: AGORA, ultimo_agradecimento_em: '2026-09-01T12:00:00Z' }).agradecer,
  true, 'passada a janela de 72h, agradece de novo');
assert.equal(deveAgradecer({ membro_id: 'm1', valor_centavos: 50007 },
  { canal_disponivel: false, agora: AGORA }).agradecer, false);

// ── 11. ⚠️⚠️ O ESPELHO SQL NÃO PODE DIVERGIR DO JS ────────────────────────
// Este é o assert que existe por causa da morte do dígito: a régua tem que
// estar nos DOIS caminhos (o trigger SQL decide no INSERT, sem chamar JS). Se
// alguém mexer num e esquecer o outro, o gate de deploy trava aqui em vez de o
// dinheiro parar de ser classificado em silêncio por 3 meses.
const MIGRATION = path.join(__dirname, '../../supabase/migrations/20260827120000_modulo_campanhas.sql');
const sql = fs.readFileSync(MIGRATION, 'utf8');
assert.ok(/aplicar_classificacao_lancamento/.test(sql),
  'a migration TEM que reescrever aplicar_classificacao_lancamento — é a função viva que classifica');
assert.ok(/camp_digitos_ativos|fin_identificadores_centavo/.test(sql),
  'a função SQL precisa consultar os dígitos ativos');
assert.ok(/round\(/i.test(sql) && /% *100|mod\(/i.test(sql),
  'o espelho SQL precisa ARREDONDAR o centavo (truncar devolve 24 em vez de 25)');
assert.ok(/<> *'00'|!= *'00'/.test(sql),
  "o espelho SQL precisa excluir o centavo '00' — 87,5% dos créditos têm ,00");
assert.ok(/'centavo'/.test(sql),
  "a origem 'centavo' precisa continuar no CHECK de sugestao_origem, senão o INSERT do trigger estoura");

// ── 12. ⚠️ O INTERRUPTOR TEM QUE SER REAL ─────────────────────────────────
// `wa_templates.ativo` existe, é editável na tela de Comunicação e NENHUMA
// query do sistema lê aquela coluna — é um interruptor de mentira, e foi o que
// o Matheus quase usou pra desligar o lembrete de escala. Os dois disparos da
// campanha checam `disparoDesligado(ID)`; se o ID não estiver no catálogo, o
// switch NUNCA aparece na tela e o único jeito de desligar é mexer em env.
const { IDS_CATALOGO, CATALOGO } = require('./comunicacaoAutomaticas');
const { DISPARO_ID: ID_SEMANAL } = require('./campanhaDisparo');
const { DISPARO_ID: ID_OBRIGADO } = require('./campanhaAgradece');

for (const [rotulo, id] of [['disparo semanal', ID_SEMANAL], ['agradecimento', ID_OBRIGADO]]) {
  assert.ok(IDS_CATALOGO.includes(id),
    `${rotulo}: o id "${id}" que o remetente checa NÃO está no catálogo (${IDS_CATALOGO.join(', ')}) `
    + '— o switch de desligar não apareceria na tela de Comunicação');
  const item = CATALOGO.find(i => i.id === id);
  assert.ok(item.fonte, `${rotulo}: item sem \`fonte\` — a tela precisa apontar quem dispara de verdade`);
  assert.equal(typeof item.publico, 'function', `${rotulo}: item sem resolver de público`);
}
assert.equal(new Set(IDS_CATALOGO).size, IDS_CATALOGO.length,
  'id duplicado no catálogo — o PATCH desligaria o disparo errado');

// ⚠️ O agradecimento NÃO pode declarar `envTemplate`: o `listar()` transforma
// env de template sem valor em bloqueio ("sem isso a mensagem não sai"), e isso
// seria FALSO aqui — sem a env o agradecimento continua saindo por e-mail, que é
// o canal primário. Pintar de vermelho um disparo que funciona é a mentira que
// esta tela existe pra evitar.
const itemObrigado = CATALOGO.find(i => i.id === ID_OBRIGADO);
assert.equal(itemObrigado.envTemplate, null,
  'o agradecimento não deve declarar envTemplate: sem a env ele ainda sai por e-mail');

console.log('campanhaDigito: ok');
