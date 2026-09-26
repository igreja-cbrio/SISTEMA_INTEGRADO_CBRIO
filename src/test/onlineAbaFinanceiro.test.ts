/**
 * Guarda ESTÁTICA da aba Financeiro do /online (23/09/2026).
 *
 * A tela virou 5 abas porque o scroll tinha 14 blocos empilhados (pedido do
 * Matheus). O que precisa de trava não é o agrupamento — é o gate do DINHEIRO:
 *
 * ⚠️⚠️ A aba Financeiro só pode EXISTIR para quem o servidor deixaria ver.
 * `ArrecadacaoOnlineCard` já se esconde sozinho no 403, mas uma ABA vazia faria
 * parecer que a igreja não arrecadou nada — o mesmo erro que o card evita.
 *
 * ⚠️⚠️ E a régua tem que ser ESPELHO de `podeVerArrecadacaoOnline`
 * (backend/utils/arrecadacaoOnline.js): nível 4 em `online`, SEM bypass de role.
 * `canAccessModule` do AuthContext libera admin/diretor por `profiles.role` —
 * usá-la faria um diretor com `online` nível 1 ver a aba e levar 403, que é
 * exatamente a aba vazia que o gate existe para impedir.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { semComentariosJs } from './_semComentarios';

const RAIZ = join(__dirname, '..', '..');
const TELA = join(RAIZ, 'src', 'pages', 'ministerial', 'Online.tsx');
const REGUA_BACKEND = join(RAIZ, 'backend', 'utils', 'arrecadacaoOnline.js');

const telaCrua = readFileSync(TELA, 'utf-8');
// ⚠️ Sem isto, a guarda casa a PRÓPRIA explicação do conserto — os comentários
// da tela citam `canAccessModule` como o que NÃO fazer (armadilha de 06/08).
const tela = semComentariosJs(telaCrua);

describe('aba Financeiro do /online · gate do dinheiro', () => {
  it('a aba é condicionada por podeVerArrecadacao', () => {
    expect(tela).toMatch(/\{podeVerArrecadacao && \(/);
    // o gatilho da aba vive DENTRO da condição, não solto na barra
    const cond = tela.indexOf('{podeVerArrecadacao && (');
    const gatilho = tela.indexOf('<TabsTrigger value="financeiro"');
    expect(gatilho).toBeGreaterThan(cond);
    expect(gatilho - cond).toBeLessThan(400);
  });

  it('exige nível 4, lendo modulePerms.online.leitura', () => {
    expect(tela).toMatch(/modulePerms\?\.online\?\.leitura/);
    expect(tela).toMatch(/nivel >= 4/);
  });

  it('NÃO usa canAccessModule para decidir o dinheiro', () => {
    // canAccessModule tem bypass de role — divergiria do servidor.
    expect(tela).not.toMatch(/canAccessModule/);
  });

  it('nível não-numérico não passa (string "5" não é nível)', () => {
    expect(tela).toMatch(/typeof nivel === 'number'/);
  });

  it('respeita o deny explícito do módulo', () => {
    expect(tela).toMatch(/modulosBloqueados[\s\S]{0,60}includes\('online'\)/);
  });

  it('espelha o nível exigido pelo backend', () => {
    const backend = semComentariosJs(readFileSync(REGUA_BACKEND, 'utf-8'));
    const m = backend.match(/NIVEL_VE_DINHEIRO\s*=\s*(\d+)/);
    expect(m, 'NIVEL_VE_DINHEIRO sumiu do backend').toBeTruthy();
    // Mudou lá, tem que mudar aqui — senão a aba oferece o que o servidor recusa.
    expect(tela).toMatch(new RegExp(`nivel >= ${m![1]}`));
  });

  it('quem perde o nível não fica preso numa aba que não existe', () => {
    // ?tab=financeiro sem nível 4 deixaria a tela em branco sem dizer por quê.
    expect(tela).toMatch(/abaAtiva === 'financeiro' && !podeVerArrecadacao/);
  });
});

describe('aba Financeiro do /online · conteúdo', () => {
  it('o card da arrecadação vive dentro da aba financeiro', () => {
    const abre = tela.indexOf('<TabsContent value="financeiro"');
    expect(abre).toBeGreaterThan(-1);
    const fecha = tela.indexOf('</TabsContent>', abre);
    const dentro = tela.slice(abre, fecha);
    expect(dentro).toContain('<ArrecadacaoOnlineCard');
  });

  it('o card da arrecadação aparece uma vez só', () => {
    const n = (tela.match(/<ArrecadacaoOnlineCard/g) || []).length;
    expect(n).toBe(1);
  });
});

describe('abas do /online · deep-link', () => {
  it('toda aba do catálogo tem gatilho na barra, e vice-versa', () => {
    const m = tela.match(/const ABAS_ONLINE = \[([^\]]+)\]/);
    expect(m, 'catálogo ABAS_ONLINE sumiu').toBeTruthy();
    const catalogo = (m![1].match(/'([a-z]+)'/g) || []).map((x) => x.replace(/'/g, ''));

    // ⚠️ Só os gatilhos de NÍVEL DE TOPO: a aba Conteúdo tem um Tabs aninhado
    // (por views / por engajamento) com Root próprio, que não é deep-linkável.
    const topo = catalogo.filter((v) =>
      tela.includes(`<TabsTrigger value="${v}"`) && tela.includes(`<TabsContent value="${v}"`),
    );
    expect(topo.sort()).toEqual([...catalogo].sort());
    expect(catalogo.length).toBeGreaterThanOrEqual(4);
  });

  it('valor fora do catálogo cai na primeira aba, não em tela branca', () => {
    expect(tela).toMatch(/ABAS_ONLINE\.includes\(/);
    expect(tela).toMatch(/: 'pessoas'/);
  });

  it('a aba escolhida vai para a URL', () => {
    expect(tela).toMatch(/searchParams\.set\('tab'/);
  });
});
