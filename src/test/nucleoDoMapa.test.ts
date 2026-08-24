// Contrato do enquadramento do mapa de calor da Membresia.
//
// ⚠️ O que esta régua decide é a CÂMERA INICIAL, nunca o que é desenhado.
// Bairro fora do núcleo continua no mapa e a tela declara quantos são — a
// diferença entre "fora do quadro" e "escondido" é o que faz este recorte ser
// honesto. Se um dia alguém usar `nucleo` para FILTRAR os pontos desenhados,
// este arquivo é o lugar de reescrever a regra, não de ajustar o consumidor.
import { describe, it, expect } from 'vitest';
import { nucleoDoMapa, type PontoBairro as BairroMapa } from '@/lib/nucleoMapaBairros';

const b = (norm: string, total: number, lat = -22.9, lng = -43.3): BairroMapa => ({
  norm, bairro: norm, total, lat, lng,
});

describe('nucleoDoMapa', () => {
  it('lista vazia devolve vazio dos dois lados', () => {
    const r = nucleoDoMapa([]);
    expect(r.nucleo).toEqual([]);
    expect(r.fora).toEqual([]);
  });

  it('com um bairro só, ele é o núcleo e nada fica de fora', () => {
    const r = nucleoDoMapa([b('barra', 55)]);
    expect(r.nucleo).toHaveLength(1);
    expect(r.fora).toHaveLength(0);
  });

  it('deixa fora do quadro o bairro distante de peso mínimo', () => {
    // Caso REAL medido em 23/08/2026: a Barra concentra 55 de 79 pessoas e um
    // único cadastro em Volta Redonda esticava o enquadramento até lá, jogando
    // o Rio inteiro para um canto da tela.
    const dados = [
      b('barra da tijuca', 55),
      b('freguesia', 7),
      b('jacarepagua', 4),
      b('centro', 2, -22.28, -42.53),
      b('jardim amalia', 1, -22.51, -44.07),
      b('copacabana', 1),
    ];
    const r = nucleoDoMapa(dados);
    const nomes = r.nucleo.map((x) => x.norm);
    expect(nomes).toContain('barra da tijuca');
    expect(r.fora.map((x) => x.norm)).toContain('jardim amalia');
    // ⚠️ Invariante: nada some. Núcleo + fora = tudo, sempre.
    expect(r.nucleo.length + r.fora.length).toBe(dados.length);
  });

  it('o núcleo cobre pelo menos a cobertura pedida', () => {
    const dados = [b('a', 50), b('b', 30), b('c', 15), b('d', 5)];
    const total = 100;
    const r = nucleoDoMapa(dados, 0.9);
    const somaNucleo = r.nucleo.reduce((s, x) => s + x.total, 0);
    expect(somaNucleo / total).toBeGreaterThanOrEqual(0.9);
  });

  it('distribuição plana mantém todo mundo no quadro', () => {
    // Sem concentração não há outlier a recortar: recortar aqui esconderia
    // bairro por acaso de ordenação.
    const dados = [b('a', 10), b('b', 10), b('c', 10), b('d', 10)];
    const r = nucleoDoMapa(dados, 0.9);
    expect(r.fora).toHaveLength(0);
  });

  it('total zero não recorta nada (evita divisão por zero silenciosa)', () => {
    const dados = [b('a', 0), b('b', 0)];
    const r = nucleoDoMapa(dados);
    expect(r.nucleo).toHaveLength(2);
    expect(r.fora).toHaveLength(0);
  });

  it('não altera a lista recebida', () => {
    const dados = [b('a', 1), b('b', 90)];
    const copia = dados.map((x) => x.norm).join('|');
    nucleoDoMapa(dados);
    expect(dados.map((x) => x.norm).join('|')).toBe(copia);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ORDEM POR PROXIMIDADE (24/08/2026)
  //
  // ⚠️⚠️ Os casos abaixo são a distribuição REAL de produção, medida em
  // 24/08/2026, não inventada: 123 pessoas em 26 bairros, com Barra 55 +
  // Recreio 21 = 62%. Chegar a 90% exige 14 bairros, e entre eles entram
  // "Centro" em Barra Mansa (2 pessoas), "Jardim Amália" em Volta Redonda (1)
  // e Teresópolis (1). O quadro abria no estado inteiro.
  // ══════════════════════════════════════════════════════════════════════════
  describe('corte por proximidade', () => {
    // ⚠️⚠️ A BASE REAL DE PRODUÇÃO, 24/08/2026: 26 bairros, 123 pessoas.
    // Reproduzir a CAUDA INTEIRA não é capricho: com uma amostra pequena a
    // ordem por tamanho já resolveria sozinha e a régua nova nunca seria
    // exercitada. Na 1ª versão deste teste eu usei 11 pontos inventados e
    // TRÊS mutantes sobreviveram por isso. É a cauda de 16 bairros com 1
    // pessoa que faz a régua antiga alcançar as outras cidades.
    const producao = [
      b('barra-da-tijuca', 55, -23.000, -43.366),
      b('recreio-dos-bandeirantes', 21, -23.019, -43.463),
      b('freguesia-jacarepagua', 7, -22.941, -43.342),
      b('taquara', 5, -22.922, -43.385),
      b('vargem-pequena', 5, -22.982, -43.458),
      b('jacarepagua', 4, -22.953, -43.372),
      b('tijuca', 3, -22.925, -43.233),
      b('pechincha', 3, -22.929, -43.353),
      b('centro', 2, -22.280, -42.533),          // Barra Mansa
      b('vargem-grande', 2, -22.971, -43.497),
      b('jardim-amalia', 1, -22.510, -44.080),   // Volta Redonda
      b('jardim-guanabara', 1, -22.813, -43.201),
      b('meier', 1, -22.902, -43.280),
      b('olaria', 1, -22.848, -43.271),
      b('realengo', 1, -22.877, -43.430),
      b('agostinho-porto', 1, -22.790, -43.384),
      b('varzea', 1, -22.412, -42.966),          // Teresópolis
      b('alto-da-boa-vista', 1, -22.962, -43.254),
      b('anil', 1, -22.956, -43.338),
      b('bangu', 1, -22.875, -43.465),
      b('bonsucesso', 1, -22.866, -43.253),
      b('campo-grande', 1, -22.903, -43.559),
      b('copacabana', 1, -22.972, -43.184),
      b('encantado', 1, -22.897, -43.304),
      b('independencia', 1, -22.539, -43.210),
      b('iraja', 1, -22.835, -43.323),
    ];
    // As três outras CIDADES, que eram o que esticava o quadro.
    const outrasCidades = ['centro', 'jardim-amalia', 'varzea'];

    const span = (l: BairroMapa[], eixo: 'lat' | 'lng') =>
      Math.max(...l.map((x) => x[eixo])) - Math.min(...l.map((x) => x[eixo]));

    it('⚠️ o distante com pouca gente NÃO entra no quadro inicial', () => {
      const r = nucleoDoMapa(producao);
      const nomes = r.nucleo.map((x) => x.norm);
      for (const d of outrasCidades) expect(nomes).not.toContain(d);
    });

    it('e continua DECLARADO em `fora` — nunca desaparece', () => {
      const r = nucleoDoMapa(producao);
      const fora = r.fora.map((x) => x.norm);
      for (const d of outrasCidades) expect(fora).toContain(d);
      // Nenhum ponto se perde entre os dois lados.
      expect(r.nucleo.length + r.fora.length).toBe(producao.length);
    });

    it('o quadro encolhe de ~1,5° para menos de 0,4° de longitude', () => {
      expect(span(producao, 'lng')).toBeGreaterThan(1.5);
      const r = nucleoDoMapa(producao);
      expect(span(r.nucleo, 'lng')).toBeLessThan(0.4);
    });

    it('a concentração que o mapa existe para mostrar FICA', () => {
      const r = nucleoDoMapa(producao);
      const nomes = r.nucleo.map((x) => x.norm);
      expect(nomes).toContain('barra-da-tijuca');
      expect(nomes).toContain('recreio-dos-bandeirantes');
      expect(nomes).toContain('freguesia-jacarepagua');
    });

    // ⚠️ Esta é a guarda contra o corte 2 virar "esconde o que é longe":
    // ele conta PESSOAS, não pontos. Um segundo polo real entra no quadro.
    it('segundo POLO com massa entra, mesmo estando longe', () => {
      const doisPolos = [
        b('barra', 55, -23.0, -43.366),
        b('niteroi', 40, -22.885, -43.104),
        b('recreio', 5, -23.019, -43.463),
      ];
      const r = nucleoDoMapa(doisPolos);
      expect(r.nucleo.map((x) => x.norm)).toContain('niteroi');
    });

    it('⚠️ a cobertura de 90% vale sobre o TOTAL, sempre', () => {
      // A 1ª tentativa deste conserto encadeou dois cortes de 90% e a cobertura
      // efetiva caiu para 88,2% (pior caso 81%). Foi este caso que pegou.
      const r = nucleoDoMapa(producao);
      const soma = r.nucleo.reduce((s, x) => s + x.total, 0);
      const total = producao.reduce((s, x) => s + x.total, 0);
      expect(soma / total).toBeGreaterThanOrEqual(0.9);
    });

    it('sem outra cidade na lista, ninguém a mais é cortado', () => {
      const soRio = producao.filter((x) => !outrasCidades.includes(x.norm));
      const r = nucleoDoMapa(soRio);
      const somaNucleo = r.nucleo.reduce((s, x) => s + x.total, 0);
      const total = soRio.reduce((s, x) => s + x.total, 0);
      expect(somaNucleo / total).toBeGreaterThanOrEqual(0.9);
    });

    // O centro é MEDIANA e não média justamente por isto: a média é arrastada
    // pelo ponto longe, e o quadro passaria a ser centrado no vazio entre os
    // dois — deixando o bairro grande na borda.
    //
    // ⚠️ A asserção é sobre o QUADRO, não sobre o conjunto ser idêntico: com os
    // distantes na lista o total de pessoas é maior, o corte 1 alcança mais
    // bairros e o corte 2 precisa de um bairro PERTO a mais para somar 90% —
    // Jacarepaguá entra. Escrevi este caso esperando conjunto igual e o código
    // me corrigiu; a promessa real é "o ponto longe não arrasta o quadro".
    // ⚠️ Mutante que SOBREVIVEU na 1ª rodada: trocar a mediana pela média
    // passava, porque 3 pontos distantes em 26 movem pouco a média. Este caso é
    // real — o CLAUDE.md registra que "membro que mora em Niterói, São Paulo ou
    // Portugal tem endereço legítimo" — e é onde a média quebra: UM ponto a
    // 34° de longitude desloca a média em ~1,3°, tirando o centro da zona oeste
    // e reordenando tudo por distância a um lugar onde não mora ninguém.
    it('⚠️ um endereço em outro CONTINENTE não move o centro (média x mediana)', () => {
      const comPortugal = [...producao, b('lisboa', 1, 38.72, -9.14)];
      const nomes = nucleoDoMapa(comPortugal).nucleo.map((x) => x.norm);
      expect(nomes).toContain('barra-da-tijuca');
      expect(nomes).toContain('recreio-dos-bandeirantes');
      expect(nomes).not.toContain('lisboa');
      // E o quadro segue sendo o Rio, não o meio do Atlântico.
      const lngs = nucleoDoMapa(comPortugal).nucleo.map((x) => x.lng);
      expect(Math.max(...lngs)).toBeLessThan(-43);
    });

    // ⚠️ Mutante que SOBREVIVEU na 1ª rodada: medir a distância só pela
    // longitude passava, porque no Rio a dispersão é mais longitudinal. Só que
    // a serra fica ao NORTE, na MESMA faixa de longitude — Petrópolis
    // (−22,50 / −43,18) tem longitude parecida com a do Méier (−43,28) e está a
    // 60 km. Sem a latitude na conta, ela entraria no quadro como se fosse
    // vizinha e esticaria o enquadramento para cima.
    it('⚠️ cidade ao NORTE na mesma longitude não entra (latitude conta)', () => {
      // Paty do Alferes (−22,43 / −43,42) é o caso que EXERCITA a latitude: a
      // longitude dela é praticamente a do centro de massa da zona oeste, então
      // medir só pela longitude a colocaria entre os PRIMEIROS da ordem — como
      // se fosse vizinha da Barra, estando a ~90 km ao norte.
      //
      // ⚠️ Escrevi este caso primeiro com Petrópolis (−43,178) e o mutante
      // SOBREVIVEU: a longitude dela também é periférica, então ela caía fora
      // por acaso, não pela régua. Um caso que passa pelo motivo errado não
      // testa nada.
      const comSerra = [...producao, b('paty-do-alferes', 2, -22.428, -43.418)];
      const nomes = nucleoDoMapa(comSerra).nucleo.map((x) => x.norm);
      expect(nomes).not.toContain('paty-do-alferes');
      const lats = nucleoDoMapa(comSerra).nucleo.map((x) => x.lat);
      expect(Math.max(...lats)).toBeLessThan(-22.7);
    });

    it('o ponto distante não arrasta o quadro', () => {
      const centro = (l: BairroMapa[]) => ({
        lat: (Math.max(...l.map((x) => x.lat)) + Math.min(...l.map((x) => x.lat))) / 2,
        lng: (Math.max(...l.map((x) => x.lng)) + Math.min(...l.map((x) => x.lng))) / 2,
      });
      const soRio = producao.filter((x) => !outrasCidades.includes(x.norm));
      const sem = centro(nucleoDoMapa(soRio).nucleo);
      const com = centro(nucleoDoMapa(producao).nucleo);
      // Menos de 0,05° ≈ 5 km: o quadro é o mesmo lugar.
      expect(Math.abs(com.lat - sem.lat)).toBeLessThan(0.05);
      expect(Math.abs(com.lng - sem.lng)).toBeLessThan(0.05);
      // E nenhum ponto de outra cidade entrou.
      const nomes = nucleoDoMapa(producao).nucleo.map((x) => x.norm);
      expect(outrasCidades.every((d) => !nomes.includes(d))).toBe(true);
    });
  });
});
