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
const { chaveNome, chaveExataNome, chaveDaLinha, rotuloDaEquipe, areaDaLinha, destinoDaOrfa, indexarEquipesAtivas, indexarMapaPco } = reg;

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

describe('escalaLinhaEquipe · destinoDaOrfa (o incidente de 01/09/2026)', () => {
  // Estado REAL de producao: "Cameras" e equipe-ESPELHO do PCO, aposentada em
  // 16/08; o mapa manda a escala pra equipe "Producao" com a funcao "Cameras".
  const ESPELHO = 'espelho-cameras-inativa';
  const PRODUCAO = 'time-producao-ativa';
  const FUNCAO_CAMERAS = 'pos-cameras';

  const fontes = {
    mapa: new Map([['cameras', { team_id: PRODUCAO, position_id: FUNCAO_CAMERAS }]]),
    // ⚠️ O espelho NAO entra aqui: o indice de fallback so tem equipe ATIVA.
    porExatoAtivas: new Map([['Produção', [PRODUCAO]], ['Cuidados', ['time-cuidados']]]),
    porNomeAtivas: new Map([['producao', [PRODUCAO]], ['cuidados', ['time-cuidados']]]),
  };

  it('⚠️⚠️ o MAPA vence o nome — e o destino NUNCA e a equipe-espelho', () => {
    const d = destinoDaOrfa({ team_name: 'Câmeras', position_id: null }, fontes);
    expect(d.via).toBe('mapa_pco');
    expect(d.team_id).toBe(PRODUCAO);
    expect(d.team_id).not.toBe(ESPELHO);
    expect(d.position_id).toBe(FUNCAO_CAMERAS);
  });

  it('⚠️ acento/caixa nao impedem o mapa de casar (a base tem as duas grafias)', () => {
    for (const n of ['Câmeras', 'Cameras', 'CAMERAS', '  cameras  ']) {
      expect(destinoDaOrfa({ team_name: n }, fontes).team_id).toBe(PRODUCAO);
    }
  });

  it('⚠️⚠️ funcao JA definida nao e sobrescrita pelo mapa', () => {
    const d = destinoDaOrfa({ team_name: 'Câmeras', position_id: 'pos-que-alguem-escolheu' }, fontes);
    expect(d.position_id).toBe('pos-que-alguem-escolheu');
  });

  it('fora do mapa, cai no nome — mas so em equipe ATIVA', () => {
    const d = destinoDaOrfa({ team_name: 'Cuidados' }, fontes);
    expect(d.via).toBe('nome_ativa');
    expect(d.team_id).toBe('time-cuidados');
  });

  it('⚠️⚠️ nome que existe SO como equipe aposentada NAO religa (fica nulo)', () => {
    // "Vocal" e espelho inativo e nao esta no mapa deste caso: o certo e
    // deixar nulo, nunca ressuscitar a equipe que alguem aposentou.
    const d = destinoDaOrfa({ team_name: 'Vocal' }, fontes);
    expect(d.via).toBe('nenhum');
    expect(d.team_id).toBeUndefined();
  });

  it('⚠️ linha do mapa marcada `ignorar` nao chega ate aqui (indice a exclui)', () => {
    const semIgnoradas = { ...fontes, mapa: new Map() };
    expect(destinoDaOrfa({ team_name: 'Câmeras' }, semIgnoradas).via).toBe('nenhum');
  });

  it('duas equipes ATIVAS com o mesmo nome = ambiguo, nunca chute', () => {
    const dois = { ...fontes, mapa: new Map(), porExatoAtivas: new Map(), porNomeAtivas: new Map([['vocal', ['a', 'b']]]) };
    expect(destinoDaOrfa({ team_name: 'Vocal' }, dois).via).toBe('ambiguo');
  });

  it('sem nome de equipe nao vai a lugar nenhum', () => {
    for (const n of ['', '   ', null, undefined]) {
      expect(destinoDaOrfa({ team_name: n }, fontes).via).toBe('nenhum');
    }
  });

  it('argumentos ausentes nao estouram (fail-closed)', () => {
    expect(destinoDaOrfa(undefined, undefined).via).toBe('nenhum');
    expect(destinoDaOrfa({ team_name: 'Câmeras' }, undefined).via).toBe('nenhum');
  });
});

describe('escalaLinhaEquipe · indexarEquipesAtivas (a guarda do incidente)', () => {
  // Estado REAL: "Cameras" e espelho do PCO APOSENTADO; "Producao" e viva.
  const EQUIPES = [
    { id: 'espelho-cameras', name: 'Câmeras', is_active: false },
    { id: 'espelho-vocal', name: 'Vocal', is_active: false },
    { id: 'viva-producao', name: 'Produção', is_active: true },
    { id: 'viva-legado', name: 'Cuidados', is_active: null }, // coluna nula = viva
  ];

  it('⚠️⚠️ equipe APOSENTADA nao entra no indice — nunca recebe escala', () => {
    const { porNomeAtivas, porExatoAtivas } = indexarEquipesAtivas(EQUIPES);
    expect(porNomeAtivas.get('cameras')).toBeUndefined();
    expect(porNomeAtivas.get('vocal')).toBeUndefined();
    expect(porExatoAtivas.get('Câmeras')).toBeUndefined();
  });

  it('equipe viva entra pelas duas chaves', () => {
    const { porNomeAtivas, porExatoAtivas } = indexarEquipesAtivas(EQUIPES);
    expect(porNomeAtivas.get('producao')).toEqual(['viva-producao']);
    expect(porExatoAtivas.get('Produção')).toEqual(['viva-producao']);
  });

  it('⚠️ `is_active` NULO conta como viva (legado) — so `false` aposenta', () => {
    const { porNomeAtivas } = indexarEquipesAtivas(EQUIPES);
    expect(porNomeAtivas.get('cuidados')).toEqual(['viva-legado']);
  });

  it('⚠️⚠️ ponta a ponta: a orfa "Câmeras" NAO cai no espelho', () => {
    const fontes = { mapa: new Map(), ...indexarEquipesAtivas(EQUIPES) };
    const d = destinoDaOrfa({ team_name: 'Câmeras' }, fontes);
    expect(d.via).toBe('nenhum');
    expect(d.team_id).toBeUndefined();
  });

  it('nome vazio e lista nula nao viram chave', () => {
    const { porNomeAtivas } = indexarEquipesAtivas([{ id: 'x', name: '  ', is_active: true }, null]);
    expect(porNomeAtivas.size).toBe(0);
    expect(indexarEquipesAtivas(undefined).porNomeAtivas.size).toBe(0);
  });
});

describe('escalaLinhaEquipe · indexarMapaPco', () => {
  it('⚠️ linha `ignorar` ou sem destino e o VETO de quem cadastrou — nao entra', () => {
    const m = indexarMapaPco([
      { pco_nome: 'Câmeras', team_id: 't1', position_id: 'p1' },
      { pco_nome: 'Vocal', team_id: 't2', ignorar: true },
      { pco_nome: 'Baixo', team_id: null, position_id: 'p3' },
    ]);
    expect(m.get('cameras')).toEqual({ team_id: 't1', position_id: 'p1' });
    expect(m.get('vocal')).toBeUndefined();
    expect(m.get('baixo')).toBeUndefined();
  });
  it('casa sem acento e sem caixa', () => {
    const m = indexarMapaPco([{ pco_nome: '  CÂMERAS  ', team_id: 't1' }]);
    expect(m.get('cameras')?.team_id).toBe('t1');
    expect(m.get('cameras')?.position_id).toBeNull();
  });
});
