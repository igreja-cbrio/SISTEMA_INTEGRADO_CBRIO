import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { funcaoDoRoster } from '../../backend/utils/pessoaDiretaCampos.js';

// ─────────────────────────────────────────────────────────────────────────────
// "Adicionar pessoa" no grupo (Marcos · 25/08/2026 · pedido do Pr. Nélio e da
// Natasha): o líder preenche e a pessoa já nasce dentro do grupo, sem WhatsApp
// e sem confirmação.
//
// ⚠️⚠️ AJUSTE DELE NO MESMO DIA: *"queremos cadastro completo, os mesmos campos
// que solicitam a inscrição de grupos."* A 1ª versão validava por conta própria
// (só nome + telefone) e isso VIOLAVA a lei do Contrato de Inscrição — *"NÃO
// recriar cópias locais de máscara/CPF, era assim que divergia"*. A validação
// virou `inscricaoContrato.validarCamposPadrao`, que já tem teste próprio no
// gate (`test:inscricao-contrato`).
//
// ⇒ ESTE ARQUIVO guarda o que sobrou de POLÍTICA DESTA PORTA:
//   1. a whitelist de `funcao` no roster (autorização, não formato);
//   2. estaticamente, que a porta CHAMA o contrato em vez de validar sozinha —
//      é a regressão provável (alguém "simplifica" a exigência de CPF porque um
//      líder reclamou) e ela não quebra teste nenhum por si só.
// ─────────────────────────────────────────────────────────────────────────────

describe('⚠️ função no grupo: whitelist FECHADA, não o que vier no corpo', () => {
  it('o default é frequentador — adicionar de propósito é PARTICIPAÇÃO', () => {
    // Régua de 13/08 ("a coordenação adicionou esta pessoa DE PROPÓSITO — isso é
    // participação, não visita") e lei de 14/08.
    expect(funcaoDoRoster({})).toBe('frequentador');
    expect(funcaoDoRoster({ funcao: '' })).toBe('frequentador');
    expect(funcaoDoRoster()).toBe('frequentador');
  });

  it('visitante quando quem preenche DECLARA', () => {
    // Lei de 14/08: "quem o líder realmente identifica como visitante, deve ser
    // visitante".
    expect(funcaoDoRoster({ funcao: 'visitante' })).toBe('visitante');
  });

  it('⚠️⚠️ liderança NÃO passa por esta porta — é AUTORIZAÇÃO, não rótulo', () => {
    // Desde 25/08/2026 `lider` e `lider_treinamento` decidem quem GERENCIA o
    // grupo (`gruposPapelApp`). Aceitar `funcao` cru daria a qualquer líder o
    // poder de promover alguém a gestor por uma tela de cadastro.
    expect(funcaoDoRoster({ funcao: 'lider' })).toBe('frequentador');
    expect(funcaoDoRoster({ funcao: 'lider_treinamento' })).toBe('frequentador');
    expect(funcaoDoRoster({ funcao: 'co_lider' })).toBe('frequentador');
    expect(funcaoDoRoster({ funcao: 'supervisor' })).toBe('frequentador');
    expect(funcaoDoRoster({ funcao: 'coordenador' })).toBe('frequentador');
  });

  it('valor inventado cai no default, nunca vai cru pro banco', () => {
    // `funcao` é ENUM (`grupo_funcao`): valor fora dele estoura 22P02 e a tela
    // diria "erro ao cadastrar" sem explicar nada.
    expect(funcaoDoRoster({ funcao: 'chefe' })).toBe('frequentador');
    expect(funcaoDoRoster({ funcao: 42 as unknown as string })).toBe('frequentador');
    expect(funcaoDoRoster({ funcao: null as unknown as string })).toBe('frequentador');
  });
});

// ⚠️ Guarda ESTÁTICA (o mesmo estilo do `test:porta-ligar` e do
// `routeModuleMap`): o serviço lê o banco, então exercitá-lo aqui exigiria
// Supabase de pé — e o que precisa de rede não entra no gate.
// ⚠️ Comentário é REMOVIDO antes de casar: este arquivo cita os nomes que
// procura, e a armadilha de "checagem por texto casa o próprio comentário" já
// mordeu este repo duas vezes (06/08) — e mordeu de novo nesta leva.
const SERVICO = (() => {
  const bruto = readFileSync(
    resolve(process.cwd(), 'backend/services/grupoPessoaDireta.js'), 'utf8',
  );
  return bruto
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map(l => l.replace(/(^|[^:])\/\/[^\n]*/, '$1'))
    .join('\n');
})();

describe('⚠️⚠️ a porta usa o CONTRATO, não uma validação própria', () => {
  it('chama validarCamposPadrao', () => {
    expect(SERVICO).toMatch(/validarCamposPadrao\(/);
  });

  it('⚠️ exige os 4 campos que o formulário público de grupos exige', () => {
    // É literalmente o pedido do Marcos: "os mesmos campos que solicitam a
    // inscrição de grupos". Afrouxar qualquer um destes muda o contrato da porta
    // e tem que ser decisão consciente, não "simplificação".
    expect(SERVICO).toMatch(/exigirCpf:\s*true/);
    expect(SERVICO).toMatch(/exigirEmail:\s*true/);
    expect(SERVICO).toMatch(/exigirNascimento:\s*true/);
    expect(SERVICO).toMatch(/exigirSexo:\s*true/);
  });

  it('resolve identidade pelo funil canônico, nunca por insert direto em mem_membros', () => {
    // Sem o matcher esta tela é fábrica de duplicata operada por ~89 líderes que
    // não têm visão nenhuma do cadastro.
    expect(SERVICO).toMatch(/processarIdentidade\(/);
    expect(SERVICO).not.toMatch(/from\('mem_membros'\)\s*\.insert/);
  });

  it('⚠️ enriquece o cadastro existente SÓ ONDE VAZIO', () => {
    // Política do censo: o que a pessoa declarou preenche o que falta e NUNCA
    // sobrescreve o que existe (pode ter sido corrigido pela equipe depois).
    expect(SERVICO).toMatch(/!mem\.genero/);
    expect(SERVICO).toMatch(/!mem\.data_nascimento/);
    expect(SERVICO).toMatch(/!mem\.email/);
  });

  it('⚠️ contato divergente ACUMULA em mem_contatos, não sobrescreve o principal', () => {
    // Contrato de porta, item 3. Família compartilha telefone e e-mail — é o
    // caso NORMAL, não a exceção.
    expect(SERVICO).toMatch(/registrarContatoDaPorta\(/);
  });

  it('⚠️⚠️ o opt-in de WhatsApp SÓ LIGA, nunca desliga', () => {
    // Política de 05/08: não marcar a caixa é ausência de consentimento NESTA
    // porta, não revogação do que a pessoa autorizou em outra. E a guarda do
    // `.or(...)` preserva o `whatsapp_optin_em` de quem já havia consentido — a
    // data é a PROVA de desde quando vale.
    expect(SERVICO).toMatch(/whatsapp_optin\.is\.null,whatsapp_optin\.eq\.false/);
    expect(SERVICO).not.toMatch(/whatsapp_optin:\s*false/);
  });

  it('⚠️⚠️ o consentimento é gravado como DECLARAÇÃO DE TERCEIRO', () => {
    // No formulário público quem marca a caixa é a própria pessoa; aqui é o
    // líder por ela. Gravar como aceite do titular seria fabricar prova legal —
    // mesma decisão do link do voluntário (14/08).
    expect(SERVICO).toMatch(/DECLARADO PRESENCIALMENTE POR/);
    expect(SERVICO).toMatch(/não é aceite digitado pelo próprio titular/);
    // O texto canônico vai junto: a pessoa tem direito a saber o que foi
    // autorizado, então o prefixo ACRESCENTA, não substitui.
    expect(SERVICO).toMatch(/TEXTOS\.termos_lgpd/);
  });

  it('⚠️ registra o item de WhatsApp mesmo quando a pessoa disse NÃO', () => {
    // Gravar só quando é `true` perderia a prova de que a pergunta foi feita.
    expect(SERVICO).toMatch(/tipo:\s*'whatsapp',\s*aceito:\s*optin/);
  });

  it('⚠️ NÃO manda WhatsApp nem cria pedido — foi o pedido explícito', () => {
    // *"se for criado ali, ela não passa por whatsapp e confirmação nenhuma"*.
    expect(SERVICO).not.toMatch(/notificarLiderNovoPedido|gruposWpp|sendTemplate/);
    expect(SERVICO).not.toMatch(/from\('mem_grupo_pedidos'\)\s*\.insert/);
    expect(SERVICO).not.toMatch(/aprovarPedidoCore/);
  });

  it('⚠️ o vínculo é idempotente: dois toques não criam dois', () => {
    expect(SERVICO).toMatch(/ja_no_grupo/);
  });
});
