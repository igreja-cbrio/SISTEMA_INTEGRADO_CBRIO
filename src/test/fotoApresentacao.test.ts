// Régua da FOTO da apresentação (16/09/2026). O caminho do arquivo chega pela
// mão de quem preenche o formulário público — a guarda é o que impede que ele
// aponte pra outro arquivo do bucket privado.
import { describe, it, expect } from 'vitest';
// @ts-ignore — util CommonJS do backend (padrão do apresentacaoHorario.test.ts)
import {
  caminhoFotoValido, extensaoDeMime, nomeArquivoFoto, extensaoDoCaminho, PREFIXO_FOTO,
} from '../../backend/utils/fotoApresentacao';

const VALIDO = 'apresentacao-foto/3f2a9c1d-5b7e-4a2f-9c3d-1e2f3a4b5c6d.jpg';

describe('caminhoFotoValido', () => {
  it('aceita o caminho que a própria porta gera', () => {
    expect(caminhoFotoValido(VALIDO)).toBe(true);
    expect(caminhoFotoValido(VALIDO.replace('.jpg', '.png'))).toBe(true);
    expect(caminhoFotoValido(VALIDO.replace('.jpg', '.webp'))).toBe(true);
  });

  // ⚠️⚠️ O caso que a guarda existe pra barrar: apontar pra foto de
  // identificação de OUTRA criança, no mesmo bucket privado.
  it('recusa caminho de outra pasta do bucket', () => {
    expect(caminhoFotoValido('foto-crianca/3f2a9c1d-5b7e-4a2f-9c3d-1e2f3a4b5c6d.jpg')).toBe(false);
    expect(caminhoFotoValido('membros/3f2a9c1d-5b7e-4a2f-9c3d-1e2f3a4b5c6d.jpg')).toBe(false);
  });

  it('recusa travessia de diretório e caminho absoluto', () => {
    expect(caminhoFotoValido('apresentacao-foto/../foto-crianca/x.jpg')).toBe(false);
    expect(caminhoFotoValido('/apresentacao-foto/3f2a9c1d-5b7e-4a2f-9c3d-1e2f3a4b5c6d.jpg')).toBe(false);
    expect(caminhoFotoValido('apresentacao-foto/sub/3f2a9c1d-5b7e-4a2f-9c3d-1e2f3a4b5c6d.jpg')).toBe(false);
  });

  it('recusa extensão que não é imagem', () => {
    expect(caminhoFotoValido(VALIDO.replace('.jpg', '.svg'))).toBe(false);
    expect(caminhoFotoValido(VALIDO.replace('.jpg', '.html'))).toBe(false);
    expect(caminhoFotoValido(VALIDO.replace('.jpg', '.jpg.html'))).toBe(false);
  });

  it('recusa id que não é UUID v4', () => {
    expect(caminhoFotoValido('apresentacao-foto/qualquer-nome.jpg')).toBe(false);
    expect(caminhoFotoValido('apresentacao-foto/3f2a9c1d5b7e4a2f9c3d1e2f3a4b5c6d.jpg')).toBe(false);
  });

  it('recusa vazio, nulo e tipo errado', () => {
    expect(caminhoFotoValido('')).toBe(false);
    expect(caminhoFotoValido(null as any)).toBe(false);
    expect(caminhoFotoValido(undefined as any)).toBe(false);
    expect(caminhoFotoValido(PREFIXO_FOTO)).toBe(false);
    expect(caminhoFotoValido({ toString: () => VALIDO } as any)).toBe(false);
  });
});

describe('extensaoDeMime', () => {
  it('mapeia os tipos aceitos', () => {
    expect(extensaoDeMime('image/jpeg')).toBe('jpg');
    expect(extensaoDeMime('IMAGE/PNG')).toBe('png');
    expect(extensaoDeMime('image/webp')).toBe('webp');
  });
  it('recusa o resto — inclusive svg, que é executável no navegador', () => {
    expect(extensaoDeMime('image/svg+xml')).toBe(null);
    expect(extensaoDeMime('application/pdf')).toBe(null);
    expect(extensaoDeMime('')).toBe(null);
    expect(extensaoDeMime(null)).toBe(null);
  });
});

describe('nomeArquivoFoto', () => {
  it('leva nome e data — 14 arquivos na pasta precisam se distinguir', () => {
    expect(nomeArquivoFoto('Maria Eduarda Silva', '2026-10-11', 'jpg')).toBe('Maria-Eduarda-Silva_2026-10-11.jpg');
  });
  it('tira acento e o que não sobrevive num nome de arquivo', () => {
    expect(nomeArquivoFoto('João Antônio Conceição', '2026-10-11', 'png')).toBe('Joao-Antonio-Conceicao_2026-10-11.png');
    expect(nomeArquivoFoto('Ana / Maria: 1', '2026-10-11', 'jpg')).toBe('Ana-Maria-1_2026-10-11.jpg');
  });
  it('sem data válida, não inventa data', () => {
    expect(nomeArquivoFoto('Ana Lima', null, 'jpg')).toBe('Ana-Lima.jpg');
    expect(nomeArquivoFoto('Ana Lima', '11/10/2026', 'jpg')).toBe('Ana-Lima.jpg');
  });
  it('nome vazio não vira arquivo sem nome', () => {
    expect(nomeArquivoFoto('', '2026-10-11', 'jpg')).toBe('crianca_2026-10-11.jpg');
    expect(nomeArquivoFoto('///', '2026-10-11', 'jpg')).toBe('crianca_2026-10-11.jpg');
  });
});

describe('extensaoDoCaminho', () => {
  it('lê a extensão guardada', () => {
    expect(extensaoDoCaminho(VALIDO)).toBe('jpg');
    expect(extensaoDoCaminho(VALIDO.replace('.jpg', '.webp'))).toBe('webp');
  });
  it('cai em jpg quando não dá pra saber', () => {
    expect(extensaoDoCaminho(null)).toBe('jpg');
    expect(extensaoDoCaminho('sem-extensao')).toBe('jpg');
  });
});
