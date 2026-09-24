import { describe, it, expect } from 'vitest';
import { hojeBRT, mensagemLiberada, statusSerie, dataLonga, youtubeId } from '@/lib/seriesSite';
import { SERIES } from '@/pages/public/novosite/series2027';

describe('seriesSite · régua da aba de Séries', () => {
  it('hoje é o dia BRT: 23h de sábado no Rio ainda é sábado (UTC já é domingo)', () => {
    expect(hojeBRT(new Date('2027-03-07T02:00:00Z'))).toBe('2027-03-06');
    expect(hojeBRT(new Date('2027-03-07T03:00:00Z'))).toBe('2027-03-07');
  });

  it('mensagem libera no próprio dia, nunca antes', () => {
    expect(mensagemLiberada('2027-03-07', '2027-03-06')).toBe(false);
    expect(mensagemLiberada('2027-03-07', '2027-03-07')).toBe(true);
    expect(mensagemLiberada('2027-03-07', '2027-04-01')).toBe(true);
  });

  it('data ausente ou malformada NUNCA libera', () => {
    expect(mensagemLiberada('', '2027-03-07')).toBe(false);
    expect(mensagemLiberada(undefined, '2027-03-07')).toBe(false);
    expect(mensagemLiberada('07/03/2027', '2027-12-31')).toBe(false);
  });

  it('status da série pelo mês', () => {
    expect(statusSerie(2027, 3, '2027-02-28')).toBe('em_breve');
    expect(statusSerie(2027, 3, '2027-03-01')).toBe('acontecendo');
    expect(statusSerie(2027, 3, '2027-04-01')).toBe('concluida');
    expect(statusSerie(2027, 12, '2026-12-15')).toBe('em_breve');
  });

  it('data longa sem Date (não escorrega de dia)', () => {
    expect(dataLonga('2027-03-07')).toBe('7 de março');
    expect(dataLonga('2027-01-01')).toBe('1 de janeiro');
  });

  it('youtubeId aceita ID e os formatos de URL', () => {
    const id = 'dQw4w9WgXcQ';
    expect(youtubeId(id)).toBe(id);
    expect(youtubeId(`https://www.youtube.com/watch?v=${id}&t=10`)).toBe(id);
    expect(youtubeId(`https://youtu.be/${id}`)).toBe(id);
    expect(youtubeId(`https://www.youtube.com/live/${id}?si=x`)).toBe(id);
    expect(youtubeId('https://www.youtube.com/@cbrio')).toBeNull();
    expect(youtubeId('')).toBeNull();
  });

  it('conteúdo: 12 meses, slugs únicos e seguros, datas no mês da série', () => {
    expect(SERIES.map((s) => s.mes)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const slugs = SERIES.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of SERIES) {
      expect(s.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      for (const m of s.mensagens) {
        expect(m.data).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(Number(m.data.slice(5, 7))).toBe(s.mes);
        if (m.pdf) expect(m.pdf.startsWith('/')).toBe(true);
      }
    }
  });
});
