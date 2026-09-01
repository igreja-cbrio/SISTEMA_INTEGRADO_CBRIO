// Contrato da linha de escala quando a equipe não está vinculada.
//
// ⚠️ O que estes testes protegem, em ordem de dano:
//   1. ⚠️⚠️ equipes DESVINCULADAS não colapsarem numa linha só — era isso que
//      punha Liderança, Assistentes e Vocal no mesmo bloco "SEM EQUIPE";
//   2. o `team_name` que EXISTE ser mostrado, em vez de "Sem equipe" (a tela
//      afirmava não saber algo que sabia);
//   3. `vinculada: false` ser um TERCEIRO estado — "conhecida mas não ligada" e
//      "realmente sem equipe" pedem ações diferentes da coordenação;
//   4. área NUNCA ser inventada a partir do nome (chutar o organograma).
import { describe, it, expect } from 'vitest';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const reg = require('../../backend/utils/escalaLinhaEquipe.js');
const { chaveNome, chaveExataNome, chaveDaLinha, rotuloDaEquipe, areaDaLinha } = reg;

// Nomes REAIS medidos em produção em 01/09/2026 (escalas do PCO sem team_id).
const REAIS = ['Liderança', 'Assistentes', 'Vocal', 'Recepção', 'Câmeras', 'Ofertório'];

describe('escalaLinhaEquipe · chave da linha', () => {
  it('⚠️⚠️ equipes DESVINCULADAS diferentes viram linhas DIFERENTES', () => {
    const chaves = REAIS.map((n) => chaveDaLinha({ team_id: null, team_name: n, position_id: null }));
    expect(new Set(chaves).size).toBe(REAIS.length);
  });

  it('⚠️ o caso do print: Liderança e Assistentes NÃO colapsam', () => {
    const a = chaveDaLinha({ team_id: null, team_name: 'Liderança', position_id: null });
    const b = chaveDaLinha({ team_id: null, team_name: 'Assistentes', position_id: null });
    expect(a).not.toBe(b);
  });

  it('`team_id` manda quando existe (é a identidade real)', () => {
    const a = chaveDaLinha({ team_id: 't1', team_name: 'Vocal', position_id: 'p1' });
    const b = chaveDaLinha({ team_id: 't2', team_name: 'Vocal', position_id: 'p1' });
    expect(a).not.toBe(b);
  });

  it('mesma equipe + mesma função = MESMA linha (é o agrupamento)', () => {
    const a = chaveDaLinha({ team_id: null, team_name: 'Vocal', position_id: 'p1' });
    const b = chaveDaLinha({ team_id: null, team_name: '  vocal  ', position_id: 'p1' });
    expect(a).toBe(b);
  });

  it('⚠️ acento e caixa não partem a mesma equipe em duas linhas', () => {
    expect(chaveDaLinha({ team_name: 'Câmeras' })).toBe(chaveDaLinha({ team_name: 'cameras' }));
    // (medido: a base tem "Câmeras" E "Cameras" vindos do PCO)
  });

  it('função diferente = linha diferente, na mesma equipe', () => {
    const a = chaveDaLinha({ team_name: 'Vocal', position_id: 'p1' });
    const b = chaveDaLinha({ team_name: 'Vocal', position_id: 'p2' });
    expect(a).not.toBe(b);
  });

  it('⚠️ id e nome não colidem entre si (prefixo na chave)', () => {
    expect(chaveDaLinha({ team_id: 'vocal' })).not.toBe(chaveDaLinha({ team_name: 'vocal' }));
  });

  it('sem id e sem nome tem chave própria', () => {
    expect(chaveDaLinha({ position_id: 'p1' })).toBe('sem::p1');
    expect(chaveDaLinha({})).toBe('sem::');
  });
});

describe('escalaLinhaEquipe · rótulo', () => {
  it('⚠️⚠️ equipe CONHECIDA e não vinculada mostra O NOME, não "Sem equipe"', () => {
    const r = rotuloDaEquipe({ team_id: null, team_name: 'Liderança' });
    expect(r).toEqual({ nome: 'Liderança', vinculada: false });
  });

  it('⚠️ `vinculada` é o TERCEIRO estado — os dois casos se distinguem', () => {
    expect(rotuloDaEquipe({ team_id: 't1', team_name: 'Vocal' }).vinculada).toBe(true);
    expect(rotuloDaEquipe({ team_id: null, team_name: 'Vocal' }).vinculada).toBe(false);
  });

  it('vinculada: o nome da TABELA vence o snapshot do PCO (renomear reflete)', () => {
    const r = rotuloDaEquipe({ team_id: 't1', team_name: 'Vocal (PCO)', nome_do_vinculo: 'Vocal' });
    expect(r.nome).toBe('Vocal');
  });

  it('realmente sem equipe: "Sem equipe" e não vinculada', () => {
    expect(rotuloDaEquipe({})).toEqual({ nome: 'Sem equipe', vinculada: false });
    expect(rotuloDaEquipe({ team_name: '   ' })).toEqual({ nome: 'Sem equipe', vinculada: false });
  });

  it('nome é trimado e o espaço interno colapsado', () => {
    expect(rotuloDaEquipe({ team_name: '  Mesa   de  Som ' }).nome).toBe('Mesa de Som');
  });

  it('os 6 nomes reais saem legíveis, com acento', () => {
    for (const n of REAIS) {
      expect(rotuloDaEquipe({ team_name: n }).nome).toBe(n);
    }
  });
});

describe('escalaLinhaEquipe · área', () => {
  it('área vem da equipe VINCULADA', () => {
    expect(areaDaLinha({ team_id: 't1', area: 'Produção' })).toBe('Produção');
  });

  it('⚠️⚠️ equipe NÃO vinculada nunca tem área (não se chuta organograma)', () => {
    expect(areaDaLinha({ team_id: null, area: 'Produção' })).toBeNull();
    expect(areaDaLinha({ team_id: null })).toBeNull();
  });

  it('⚠️ vinculada SEM área é null (116 das 129 equipes estão assim)', () => {
    expect(areaDaLinha({ team_id: 't1', area: '   ' })).toBeNull();
    expect(areaDaLinha({ team_id: 't1', area: null })).toBeNull();
  });
});

describe('escalaLinhaEquipe · chaveNome', () => {
  it('só serve pra CHAVE: tira acento, caixa e espaço', () => {
    expect(chaveNome('  Câmeras  ')).toBe('cameras');
    expect(chaveNome('Mesa   de Som')).toBe('mesa de som');
  });
  it('vazio/nulo devolve string vazia', () => {
    for (const v of ['', '   ', null, undefined]) expect(chaveNome(v)).toBe('');
  });
});

describe('escalaLinhaEquipe · chaveExataNome (casar pra RELIGAR)', () => {
  it('⚠️⚠️ PRESERVA acento e caixa — é o que desempata os 7 pares da base', () => {
    // Medido em produção (01/09/2026): vol_teams tem "Cameras" E "Câmeras",
    // "Liderança" E "LIDERANÇA". Se a chave exata normalizasse, os dois pares
    // colidiriam, o nome viraria ambíguo e 126 escalas deixariam de religar.
    expect(chaveExataNome('Câmeras')).not.toBe(chaveExataNome('Cameras'));
    expect(chaveExataNome('Liderança')).not.toBe(chaveExataNome('LIDERANÇA'));
    expect(chaveExataNome('Check-in')).not.toBe(chaveExataNome('Check-In'));
  });

  it('⚠️ ela é MAIS estrita que chaveNome — os 7 pares colapsam lá e não aqui', () => {
    const pares: Array<[string, string]> = [
      ['Cameras', 'Câmeras'],
      ['Liderança', 'LIDERANÇA'],
      ['Check-in', 'Check-In'],
      ['preletor', 'Preletor'],
      ['Próximos passos', 'Próximos Passos'],
      ['assistente ministerial', 'Assistente Ministerial'],
      ['Transmissão e infraestrutura', 'Transmissão e Infraestrutura'],
    ];
    for (const [a, b] of pares) {
      expect(chaveNome(a)).toBe(chaveNome(b));            // colapsa (bom pra agrupar linha)
      expect(chaveExataNome(a)).not.toBe(chaveExataNome(b)); // não colapsa (bom pra religar)
    }
  });

  it('trima e colapsa espaço interno (o único saneamento permitido)', () => {
    expect(chaveExataNome('  Mesa   de  Som ')).toBe('Mesa de Som');
    expect(chaveExataNome('Vocal')).toBe('Vocal');
  });

  it('vazio/nulo devolve string vazia (nunca casa com equipe nenhuma)', () => {
    for (const v of ['', '   ', null, undefined]) expect(chaveExataNome(v)).toBe('');
  });
});
