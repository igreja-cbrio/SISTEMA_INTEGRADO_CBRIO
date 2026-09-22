// ⚠️⚠️ A ENTRADA MANUAL SÓ FUNCIONA EM `dado_tipo` SEM RAMO NATIVO.
//
// `_kpi_agregar_dado` tem uma cadeia de `ELSIF p_dado_tipo = '...'` e, no fim,
// um FALLBACK que agrega de `dados_brutos` (filtrando por área e período). Mas
// vários ramos nativos terminam com:
//
//     SELECT count(*) INTO v_resultado FROM ... ;
//     RETURN v_resultado;        -- ← INCONDICIONAL
//
// `count(*)` NUNCA é NULL, então o `RETURN` sempre dispara e **o fallback é
// inalcançável**. Medido em produção (21/09/2026): é exatamente o caso de
// `solicitacoes_capelania` e `solicitacoes_aconselh`.
//
// ⇒ Ligar `entrada_manual = true` num tipo assim faz a equipe lançar em
// /dados-brutos, a tela confirmar "salvo", e o KPI NÃO SE MOVER — sem erro,
// sem log, sem ninguém descobrir. Meses de lançamento jogados fora e a
// confiança da equipe no módulo junto. É o erro mais caro desta família
// porque é o único que não se descobre.
//
// Este arquivo é guarda ESTÁTICA sobre a migration: o gate não tem banco, mas
// pode exigir que a migration (a) crie tipos NOVOS, (b) reponte os KPIs para
// eles, e (c) carregue a guarda em SQL que ABORTA se um deles ganhar ramo
// nativo depois.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const raiz = resolve(__dirname, '../..');
const dirMigrations = resolve(raiz, 'supabase/migrations');

const ARQ = '20260921120000_online_kpis_e_entrada_manual.sql';
const sql = readFileSync(resolve(dirMigrations, ARQ), 'utf8');

/** Os tipos criados para entrada manual de atendimentos. */
const TIPOS_MANUAIS = [
  'atend_capelania_recebidas',
  'atend_capelania_atendidas',
  'atend_aconselh_recebidas',
  'atend_aconselh_atendidas',
];

/**
 * ⚠️ Comentário fora antes de casar: esta migration EXPLICA o problema citando
 * os nomes dos tipos antigos, e sem limpar o comentário a "evidência" seria o
 * próprio texto que descreve o cuidado (armadilha de 06/08).
 */
function semComentarios(src: string): string {
  return src
    .split('\n')
    .map((l) => l.replace(/(^|[^:])--[^\n]*$/, '$1'))
    .join('\n');
}

const corpo = semComentarios(sql);

describe('⚠️⚠️ a entrada manual usa dado_tipo NOVO', () => {
  it('a migration cria os 4 tipos de atendimento', () => {
    for (const t of TIPOS_MANUAIS) {
      expect(corpo, `${t} não é criado`).toContain(`'${t}'`);
    }
  });

  /**
   * A entrada do VALUES de UM tipo: do `('<id>'` até o `),` que a fecha.
   *
   * ⚠️ Recortar a entrada EXATA é o que faz o teste valer: uma janela de N
   * caracteres alcança o tipo SEGUINTE, e o `NULL` dele satisfaria o match de
   * um tipo que ganhou `origem_tabela`. (Mutante rodado em 21/09 — sobreviveu
   * com janela, morre com o recorte.)
   */
  function entradaDoTipo(t: string): string {
    const bloco = corpo.slice(corpo.indexOf('INSERT INTO public.tipos_dado_bruto'));
    const i = bloco.indexOf(`('${t}',`);
    expect(i, `${t} fora do INSERT`).toBeGreaterThan(-1);
    const fim = bloco.indexOf('\n', bloco.indexOf('),', i));
    return bloco.slice(i, fim > i ? fim : i + 700);
  }

  it('os tipos nascem com entrada_manual = true', () => {
    expect(corpo).toMatch(/INSERT INTO public\.tipos_dado_bruto/);
    for (const t of TIPOS_MANUAIS) {
      // última linha do VALUES: `'unidade', 'sum', 'mensal', <origem>, true, <ordem>)`
      expect(entradaDoTipo(t), `${t} sem entrada_manual`).toMatch(/,\s*true,\s*\d+\)/);
    }
  });

  it('⚠️⚠️ os tipos novos NÃO têm origem_tabela — senão não caem no fallback', () => {
    for (const t of TIPOS_MANUAIS) {
      // `origem_tabela` preenchida faria o tipo parecer automático na UI e
      // desviaria a leitura de `dados_brutos`.
      expect(entradaDoTipo(t), `${t} com origem_tabela`).toMatch(/NULL,\s*true,\s*\d+\)/);
    }
  });
});

describe('⚠️⚠️ a guarda contra ramo nativo existe e ABORTA', () => {
  it('a migration confere _kpi_agregar_dado e levanta exceção', () => {
    const i = corpo.indexOf('FOREACH v_id IN ARRAY');
    expect(i, 'sem laço de guarda sobre os tipos novos').toBeGreaterThan(-1);
    const guarda = corpo.slice(i, i + 900);
    for (const t of TIPOS_MANUAIS) {
      expect(guarda, `${t} fora da guarda`).toContain(t);
    }
    expect(guarda).toContain('RAISE EXCEPTION');
    expect(guarda).toContain('_kpi_agregar_dado');
  });

  it('⚠️ a guarda limpa comentário antes de procurar o id na função', () => {
    // Sem isso, um comentário dentro de `_kpi_agregar_dado` citando o tipo
    // faria a guarda abortar uma migration correta (falso positivo custa
    // confiança: manda investigar um conserto que estava certo).
    // ⚠️ O bloco da GUARDA, não o do patch da PARTE 1 (os dois leem a função).
    const i = corpo.indexOf('$guarda$');
    expect(i, 'sem bloco de guarda').toBeGreaterThan(-1);
    const bloco = corpo.slice(i, corpo.indexOf('FOREACH v_id IN ARRAY'));
    expect(bloco).toContain('regexp_replace');
  });
});

describe('⚠️ os KPIs foram repontados para os tipos manuais', () => {
  it('capelania passa a ler atend_capelania_*', () => {
    expect(corpo).toContain('"atend_capelania_atendidas"');
    expect(corpo).toContain('"atend_capelania_recebidas"');
    // ...e sai do tipo antigo, cujo fallback era inalcançável.
    expect(corpo).toMatch(/formula_config->>'numerador' = 'solicitacoes_capelania'/);
  });

  it('aconselhamento passa a ler atend_aconselh_*', () => {
    expect(corpo).toContain('"atend_aconselh_atendidas"');
    expect(corpo).toContain('"atend_aconselh_recebidas"');
    expect(corpo).toMatch(/formula_config->>'numerador' = 'solicitacoes_aconselh'/);
  });
});

describe('⚠️⚠️ o patch de área do check-in é DINÂMICO e guardado', () => {
  it('lê a definição VIVA, não cola o corpo do repo', () => {
    // `_kpi_agregar_dado` foi reescrita em produção (14/08, 18/08) e a
    // definição do repo NÃO é a viva — colar o corpo de um arquivo reverteria
    // em silêncio o que só existe em prod.
    expect(corpo).toContain('pg_get_functiondef');
    expect(corpo).toMatch(/EXECUTE replace\(v_def/);
  });

  it('⚠️ aborta se a âncora não for única', () => {
    // Âncora que casa em dois lugares reescreveria um ramo que ninguém pediu.
    expect(corpo).toMatch(/v_ocorr <> 1/);
    expect(corpo).toMatch(/ABORTADO: âncora/);
  });

  it('⚠️ é idempotente — rodar de novo não duplica o join', () => {
    expect(corpo).toMatch(/position\('vol_teams t ON t\.id = s\.team_id' in v_def\) > 0/);
  });

  it('⚠️ confere no CATÁLOGO depois de aplicar, não no "success: true"', () => {
    const i = corpo.indexOf('ABORTADO: o patch de área não pegou');
    expect(i, 'sem prova pós-patch').toBeGreaterThan(-1);
  });
});

describe('⚠️⚠️ a tela para de oferecer lançamento que o sistema ignora', () => {
  // Medido em 21/09: `solicitacoes_servir_recebidas` tinha 47 lançamentos e
  // `_alocadas` 37 — 84 números digitados por gente que o KPI nunca leu,
  // porque os dois têm ramo nativo com RETURN incondicional.
  const OFERECIDOS_MAS_IGNORADOS = [
    'solicitacoes_servir_recebidas',
    'solicitacoes_servir_alocadas',
    'solicitacoes_capelania_recebidas',
    'solicitacoes_aconselhamento_recebidas',
  ];

  it('os 4 tipos com ramo nativo deixam de aceitar lançamento manual', () => {
    const i = corpo.indexOf('SET entrada_manual = false');
    expect(i, 'sem UPDATE desligando entrada manual').toBeGreaterThan(-1);
    const bloco = corpo.slice(i, i + 1200);
    for (const t of OFERECIDOS_MAS_IGNORADOS) {
      expect(bloco, `${t} continua oferecido`).toContain(t);
    }
  });

  it('⚠️ os lançamentos antigos NÃO são apagados', () => {
    // São o registro do que a equipe reportou; apagá-los destruiria a única
    // prova de que aqueles atendimentos existiram.
    expect(corpo).not.toMatch(/DELETE\s+FROM\s+public\.dados_brutos/i);
  });

  it('⚠️⚠️ a invariante final ABORTA se um tipo manual tiver ramo nativo', () => {
    const i = corpo.indexOf('$inv$');
    expect(i, 'sem invariante final').toBeGreaterThan(-1);
    const bloco = corpo.slice(i);
    expect(bloco).toContain('entrada_manual = true');
    expect(bloco).toContain('RAISE EXCEPTION');
    expect(bloco).toMatch(/ABORTADO: tipos manuais com ramo nativo/);
  });
});

describe('⚠️⚠️ leva 2 · grupos e generosidade também em tipo SEM ramo nativo', () => {
  const ARQ2 = '20260921190000_online_entrada_manual_grupos_generosidade.sql';
  const corpo2 = semComentarios(readFileSync(resolve(dirMigrations, ARQ2), 'utf8'));
  const DECLARADOS = [
    'grupos_ativos_declarado', 'lideres_treinamento_declarado',
    'doacoes_valor_declarado', 'doadores_count_declarado', 'doadores_recorrentes_declarado',
  ];

  it('os 5 tipos declarados são criados como manuais', () => {
    for (const t of DECLARADOS) {
      expect(corpo2, `${t} não é criado`).toContain(`'${t}'`);
    }
    expect(corpo2).toMatch(/INSERT INTO public\.tipos_dado_bruto/);
  });

  it('⚠️ a guarda de ramo nativo cobre os 5', () => {
    const i = corpo2.indexOf('FOREACH v_id IN ARRAY');
    expect(i).toBeGreaterThan(-1);
    const guarda = corpo2.slice(i, i + 900);
    for (const t of DECLARADOS) expect(guarda, `${t} fora da guarda`).toContain(t);
    expect(guarda).toContain('RAISE EXCEPTION');
  });

  it('⚠️⚠️ ONL-06 (frequencia_grupos) NÃO é repontado — ele funciona', () => {
    // Medido: `frequencia_grupos` FILTRA por área e devolveu 47 para o Online,
    // com 23,68% de crescimento real. Criar um manual ao lado daria DUAS
    // verdades sobre o mesmo número.
    expect(corpo2).not.toMatch(/'\{dado_tipo\}', '"frequencia_grupos_declarado"'/);
    expect(corpo2).not.toContain('frequencia_grupos_declarado');
  });

  it('⚠️ generosidade é repontada SÓ no Online', () => {
    // As outras 4 áreas não pediram, e repontá-las criaria digitação para
    // equipes que não estão nessa conversa.
    const i = corpo2.indexOf('doacoes_valor_declarado');
    expect(i).toBeGreaterThan(-1);
    const bloco = corpo2.slice(corpo2.indexOf("formula_config->>'dado_tipo' = 'doacoes_valor'"));
    expect(bloco.slice(0, 200)).toContain("lower(area) = 'online'");
  });

  it('⚠️ a invariante final também roda nesta migration', () => {
    expect(corpo2).toContain('$inv$');
    expect(corpo2).toMatch(/ABORTADO: tipos manuais com ramo nativo/);
  });
});

describe('⚠️ higiene do conjunto de migrations', () => {
  it('o arquivo existe e o timestamp não colide', () => {
    const iguais = readdirSync(dirMigrations).filter((f) => f.startsWith('20260921120000'));
    expect(iguais).toEqual([ARQ]);
  });
});
