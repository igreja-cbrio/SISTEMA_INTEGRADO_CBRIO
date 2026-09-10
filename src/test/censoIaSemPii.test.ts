import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const req = createRequire(import.meta.url);
const { ehTextoDeOpiniao, prepararMaterial, TIPOS_PARA_IA } =
  req(resolve(__dirname, '../../backend/services/censoLeituraIA.js'));

/**
 * Guarda do que sai do censo para a IA.
 *
 * ⚠️⚠️ Achado em 10/09/2026: o comentário da rota `/censo/ia` prometia "só
 * pergunta ABERTA" e o código NUNCA checava o tipo. Medido no censo vivo: 167
 * itens de `texto_curto` — nome, CPF, e-mail, telefone, CEP, cidade, bairro —
 * seriam enviados à Anthropic a cada clique. Dado de igreja identifica
 * convicção religiosa (LGPD art. 11).
 */
describe('censo · o que vai para a IA', () => {
  it('texto_longo (opinião de verdade) VAI', () => {
    expect(ehTextoDeOpiniao({ tipo: 'texto_longo', valor_texto: 'Gosto do acolhimento' })).toBe(true);
  });

  // ⚠️ Os ids são os REAIS do censo vivo, e o tipo real é `texto_curto`.
  it.each([
    ['cpf', '02110852780'],
    ['nome', 'Fulano da Silva Souza'],
    ['email', 'fulano@gmail.com'],
    ['telefone', '(21) 98455-5026'],
    ['p9_cep', '22640-100'],
    ['bairro', 'Barra da Tijuca'],
    ['cidade', 'Rio de Janeiro'],
    ['conjuge_nome', 'Beltrana Souza'],
    ['instagram', '@fulano'],
  ])('texto_curto "%s" NUNCA vai', (id, valor) => {
    expect(ehTextoDeOpiniao({ pergunta_id: id, tipo: 'texto_curto', valor_texto: valor })).toBe(false);
  });

  it('nascimento (data) não vai', () => {
    expect(ehTextoDeOpiniao({ tipo: 'data', valor_texto: '1980-01-01' })).toBe(false);
  });

  // ⚠️ `busca` guarda nome de igreja e de GRUPO — e em `qual_grupo` a base tem
  // nome de LÍDER digitado à mão. Categórico com gente dentro, não opinião.
  it('busca (nome de igreja/grupo) não vai', () => {
    expect(ehTextoDeOpiniao({ tipo: 'busca', valor_texto: 'PIB Barra' })).toBe(false);
  });

  // ⚠️ FAIL-CLOSED: sem tipo, ou tipo novo, fica de fora por padrão.
  it.each([[undefined], ['tipo_que_nao_existe'], [null], ['']])
    ('tipo desconhecido (%s) NÃO vai', (tipo) => {
      expect(ehTextoDeOpiniao({ tipo, valor_texto: 'qualquer coisa' })).toBe(false);
    });

  it('item nulo não derruba nem vaza', () => {
    expect(ehTextoDeOpiniao(null)).toBe(false);
    expect(ehTextoDeOpiniao(undefined)).toBe(false);
  });

  it('a lista é FECHADA e contém apenas texto_longo', () => {
    expect([...TIPOS_PARA_IA]).toEqual(['texto_longo']);
  });

  // O teste de ponta: um lote realista do censo vivo só entrega a opinião.
  it('num lote misto, só a opinião sobrevive a prepararMaterial', () => {
    const lote = [
      { pergunta_id: 'cpf', pergunta_texto: 'CPF', tipo: 'texto_curto', valor_texto: '02110852780', sensivel: false },
      { pergunta_id: 'nome', pergunta_texto: 'Nome completo', tipo: 'texto_curto', valor_texto: 'Fulano da Silva', sensivel: false },
      { pergunta_id: 'telefone', pergunta_texto: 'Telefone', tipo: 'texto_curto', valor_texto: '(21) 98455-5026', sensivel: false },
      { pergunta_id: 'igreja_anterior_nome', pergunta_texto: 'Qual era a igreja?', tipo: 'busca', valor_texto: 'PIB Barra', sensivel: false },
      { pergunta_id: 'mais_ama', pergunta_texto: 'O que você mais ama?', tipo: 'texto_longo', valor_texto: 'O acolhimento das pessoas', sensivel: false },
    ];
    const { blocos, total_textos } = prepararMaterial(lote);
    expect(blocos).toHaveLength(1);
    expect(blocos[0].pergunta_id).toBe('mais_ama');
    expect(total_textos).toBe(1);
    const serializado = JSON.stringify(blocos);
    for (const proibido of ['02110852780', 'Fulano', '98455', 'PIB Barra']) {
      expect(serializado).not.toContain(proibido);
    }
  });

  it('sensível continua fora mesmo sendo texto_longo', () => {
    const { blocos } = prepararMaterial([
      { pergunta_id: 'x', tipo: 'texto_longo', valor_texto: 'confidencial', sensivel: true },
    ]);
    expect(blocos).toHaveLength(0);
  });
});

// Guarda ESTÁTICA: o SQL da rota também precisa filtrar por tipo.
// ⚠️ Comentário removido antes de casar — a explicação CITA `.in('tipo'`.
describe('censo · a rota /ia filtra tipo no SQL', () => {
  it("o SELECT do /ia tem .in('tipo', ...)", () => {
    const src = readFileSync(resolve(__dirname, '../../backend/routes/censo.js'), 'utf8');
    const limpo = src
      .split('\n')
      .map((l) => l.replace(/\/\*.*?\*\//g, ''))
      .map((l) => l.replace(/(^|[^:])\/\/[^\n]*/, '$1'))
      .join('\n');
    const i = limpo.indexOf("router.post('/ia'");
    expect(i).toBeGreaterThan(-1);
    const bloco = limpo.slice(i, i + 2200);
    expect(bloco).toContain("cen_resposta_item");
    expect(bloco).toContain(".in('tipo'");
    expect(bloco).toContain('TIPOS_PARA_IA');
  });
});
