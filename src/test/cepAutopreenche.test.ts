import { describe, it, expect } from 'vitest';
import {
  mascaraCep, cepCompleto, mapearViaCep, aplicarEndereco,
} from '../lib/cepAutopreenche';

// O que está em teste é o atalho do culto: 8 dígitos e três campos prontos. Os
// dois jeitos de errar aqui APAGAM trabalho da pessoa — sobrescrever o que ela
// digitou, ou tratar "CEP não existe" como sucesso e limpar o endereço.

const PERGUNTAS = [
  { id: 'q_cep', preenche_de: 'cep' },
  { id: 'q_end', preenche_de: 'endereco' },
  { id: 'q_bairro', preenche_de: 'bairro' },
  { id: 'q_cidade', preenche_de: 'cidade' },
  { id: 'q_outra', preenche_de: 'telefone' },
  { id: 'q_solta' },
];

describe('máscara do CEP', () => {
  it('formata enquanto digita e corta em 8 dígitos', () => {
    expect(mascaraCep('2')).toBe('2');
    expect(mascaraCep('22071')).toBe('22071');
    expect(mascaraCep('220710')).toBe('22071-0');
    expect(mascaraCep('22071000')).toBe('22071-000');
    expect(mascaraCep('220710009999')).toBe('22071-000');
    expect(mascaraCep('abc22071xx000')).toBe('22071-000');
  });

  it('só considera completo com 8 dígitos', () => {
    expect(cepCompleto('22071-00')).toBe(false);
    expect(cepCompleto('22071-000')).toBe(true);
    expect(cepCompleto('')).toBe(false);
  });
});

describe('resposta do ViaCEP', () => {
  it('traduz o payload normal', () => {
    const r = mapearViaCep({
      cep: '22071-000', logradouro: 'Avenida Atlântica',
      bairro: 'Copacabana', localidade: 'Rio de Janeiro', uf: 'RJ',
    });
    expect(r).toEqual({
      endereco: 'Avenida Atlântica', bairro: 'Copacabana',
      cidade: 'Rio de Janeiro', uf: 'RJ',
    });
  });

  it('⚠️ CEP inexistente vem com HTTP 200 e `erro: true` — não pode virar sucesso', () => {
    // Quem confia só no status trata isto como endereço válido e apaga o que a
    // pessoa tinha escrito.
    expect(mapearViaCep({ erro: true })).toBeNull();
    expect(mapearViaCep({ erro: 'true' })).toBeNull();
  });

  it('⚠️ CEP de cidade inteira OMITE rua e bairro em vez de mandar vazio', () => {
    const r = mapearViaCep({ logradouro: '', bairro: '', localidade: 'Piraí', uf: 'RJ' });
    expect(r).toEqual({ cidade: 'Piraí', uf: 'RJ' });
    expect(r).not.toHaveProperty('endereco');   // string vazia apagaria o campo
  });

  it('sem cidade não é CEP útil', () => {
    expect(mapearViaCep({ logradouro: 'Rua X' })).toBeNull();
    expect(mapearViaCep(null)).toBeNull();
    expect(mapearViaCep('nada')).toBeNull();
  });
});

describe('aplicar o endereço nas respostas', () => {
  const DADOS = { endereco: 'Avenida Atlântica', bairro: 'Copacabana', cidade: 'Rio de Janeiro', uf: 'RJ' };

  it('preenche pelas perguntas com `preenche_de`, e só essas', () => {
    const r = aplicarEndereco(PERGUNTAS, {}, DADOS);
    expect(r.respostas).toEqual({
      q_end: 'Avenida Atlântica', q_bairro: 'Copacabana', q_cidade: 'Rio de Janeiro',
    });
    expect(r.respostas).not.toHaveProperty('q_outra');   // telefone não é do CEP
    expect(r.respostas).not.toHaveProperty('q_solta');
    expect(r.preenchidas.sort()).toEqual(['q_bairro', 'q_cidade', 'q_end']);
  });

  it('⚠️ NÃO sobrescreve o que a pessoa digitou à mão', () => {
    const antes = { q_end: 'Rua da minha casa, 42', q_bairro: '' };
    const r = aplicarEndereco(PERGUNTAS, antes, DADOS);
    expect(r.respostas.q_end).toBe('Rua da minha casa, 42');   // preservado
    expect(r.respostas.q_bairro).toBe('Copacabana');           // estava vazio
  });

  it('corrigir o CEP TROCA o que o CEP anterior preencheu', () => {
    // Primeiro CEP
    const um = aplicarEndereco(PERGUNTAS, {}, DADOS);
    const doCep = new Set(um.preenchidas);
    // A pessoa percebeu que errou e digitou outro CEP
    const dois = aplicarEndereco(PERGUNTAS, um.respostas, {
      endereco: 'Rua Uruguaiana', bairro: 'Centro', cidade: 'Rio de Janeiro',
    }, doCep);
    expect(dois.respostas.q_end).toBe('Rua Uruguaiana');
    expect(dois.respostas.q_bairro).toBe('Centro');
  });

  it('campo que o CEP não trouxe fica como estava', () => {
    const antes = { q_bairro: 'Centro' };
    const r = aplicarEndereco(PERGUNTAS, antes, { cidade: 'Piraí' });
    expect(r.respostas.q_bairro).toBe('Centro');
    expect(r.respostas.q_cidade).toBe('Piraí');
  });
});
