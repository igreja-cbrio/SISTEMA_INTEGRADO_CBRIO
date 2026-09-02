// Toda máscara de telefone tem que tirar o código do país ANTES de truncar.
//
// ⚠️⚠️ O que este arquivo protege:
//   1. ⚠️⚠️ os 2 ÚLTIMOS DÍGITOS sumirem quando a pessoa cola "+55 21 99999-8888"
//      (o formato que sai dos contatos do celular). `slice(0,11)` primeiro
//      produz `55219999988` — 11 dígitos, passa nas validações, e o número não
//      existe. Medido em 02/09/2026: **21 cadastros** assim em produção, o mais
//      recente do dia anterior, pela porta pública de batismo;
//   2. o conserto ficar só num formulário. Em 31/07 isso foi corrigido **apenas**
//      em `InscricaoGrupos` — as outras 13 máscaras continuaram truncando por
//      mais de um mês. Por isso a guarda aqui é uma VARREDURA, não um caso;
//   3. ⚠️ o DDD 55 (Santa Maria/RS) ser destruído por um `replace(/^55/,'')`
//      ingênuo — "(55) 99999-8888" é número legítimo.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mascaraTelefone, tirarCodigoPais } from '@/lib/inscricao';

const RAIZ = join(__dirname, '..', '..');

describe('⚠️⚠️ o caso que o Matheus reportou', () => {
  it('colar "+55 21 99999-8888" NÃO perde os dois últimos dígitos', () => {
    expect(mascaraTelefone('+55 21 99999-8888')).toBe('(21) 99999-8888');
    expect(mascaraTelefone('5521999998888')).toBe('(21) 99999-8888');
  });

  it('⚠️ o que era gravado antes tinha 11 dígitos e passava nas validações', () => {
    // `soDigitos('5521999998888').slice(0,11)` === '55219999988' — o bug.
    const comoEra = '5521999998888'.replace(/\D/g, '').slice(0, 11);
    expect(comoEra).toBe('55219999988');
    expect(comoEra).toHaveLength(11); // por isso ninguém percebia
    expect(tirarCodigoPais('5521999998888')).toBe('21999998888');
  });

  it('⚠️⚠️ DDD 55 (Santa Maria/RS) fica INTACTO — não é código de país', () => {
    expect(mascaraTelefone('55999998888')).toBe('(55) 99999-8888');
    expect(tirarCodigoPais('55999998888')).toBe('55999998888');
  });

  it('fixo com 10 dígitos e digitação parcial seguem normais', () => {
    expect(mascaraTelefone('2133334444')).toBe('(21) 3333-4444');
    expect(mascaraTelefone('219')).toBe('(21) 9');
    expect(mascaraTelefone('')).toBe('');
  });

  it('⚠️ só remove quando o resto AINDA é telefone completo', () => {
    expect(tirarCodigoPais('55')).toBe('55');          // curto demais
    expect(tirarCodigoPais('5521')).toBe('5521');      // idem
    expect(tirarCodigoPais('552199999888')).toBe('2199999888');   // 12 → tira
    expect(tirarCodigoPais('5521999998888')).toBe('21999998888'); // 13 → tira
    expect(tirarCodigoPais('55219999988888')).toBe('55219999988888'); // 14 → não
  });
});

describe('⚠️⚠️ guarda estática · NENHUMA máscara pode truncar antes', () => {
  // As 13 corrigidas em 02/09 + a de grupos (corrigida em 31/07).
  const ARQUIVOS = [
    'src/components/CalendarioCultos.jsx',
    'src/pages/Perfil.jsx',
    'src/pages/TotemMembro.tsx',
    'src/pages/ministerial/Batismos.tsx',
    'src/pages/ministerial/Next.tsx',
    'src/pages/ministerial/VisualizacaoDecisoes.tsx',
    'src/pages/ministerial/voluntariado/VolProfileComplete.tsx',
    'src/pages/ministerial/voluntariado/components/checkin/ContactCaptureDialog.tsx',
    'src/pages/public/CadastroMembresia.jsx',
    'src/pages/public/Doar.tsx',
    'src/pages/public/GrupoFrequenciaMes.jsx',
    'src/pages/public/InscricaoBatismo.tsx',
    'src/pages/public/InscricaoGrupos.jsx',
  ];

  // ⚠️ Sem comentário: os próprios arquivos EXPLICAM o bug citando o padrão
  // antigo, e casar no texto cru daria falso positivo. É a armadilha de 06/08,
  // que já mordeu duas vezes neste repo.
  const semComentarios = (src: string) => src
    .split('\n')
    .map((l) => l.replace(/(^|[^:])\/\/[^\n]*/, '$1'))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  // Pega o corpo de cada função cujo NOME indica telefone.
  const mascarasDeTelefone = (src: string) => {
    const achados: string[] = [];
    const re = /(?:function|const)\s+(\w*(?:[Tt]el|[Pp]hone|[Ww]hats)\w*)\s*[=(]/g;
    let m: RegExpExecArray | null;
    // eslint-disable-next-line no-cond-assign
    while ((m = re.exec(src))) achados.push(src.slice(m.index, m.index + 360));
    return achados;
  };

  it('⚠️⚠️ toda máscara de telefone chama tirarCodigoPais antes do slice', () => {
    const falhas: string[] = [];
    for (const arq of ARQUIVOS) {
      const src = semComentarios(readFileSync(join(RAIZ, arq), 'utf8'));
      for (const corpo of mascarasDeTelefone(src)) {
        if (!/slice\(0, ?11\)/.test(corpo)) continue;      // não é máscara de telefone
        if (!corpo.includes('tirarCodigoPais')) {
          falhas.push(`${arq} :: ${corpo.split(/[\s(=]/)[1]}`);
        }
      }
    }
    expect(falhas, `máscaras truncando ANTES de tirar o 55:\n${falhas.join('\n')}`).toEqual([]);
  });

  it('⚠️ e todos importam o helper canônico (nada de cópia local)', () => {
    // ⚠️ Aceita alias (`@/lib/inscricao`) E caminho relativo: o conserto de
    // 31/07 no InscricaoGrupos usa `../../lib/inscricao`, e exigir só o alias
    // reprovaria justamente a correção que serviu de modelo. O que importa é
    // vir do módulo canônico, não o estilo do caminho.
    for (const arq of ARQUIVOS) {
      const src = readFileSync(join(RAIZ, arq), 'utf8');
      expect(src, `${arq} sem import do helper`).toMatch(
        /import \{[^}]*tirarCodigoPais[^}]*\} from ['"][^'"]*lib\/inscricao['"]/,
      );
    }
  });

  it('⚠️⚠️ a porta pública de batismo normaliza no SERVIDOR também', () => {
    // Foi ela que produziu o registro corrompido de 01/09. Máscara é conforto;
    // a gravação é o que persiste — a lei de 31/07 exige os dois.
    const src = semComentarios(
      readFileSync(join(RAIZ, 'backend', 'routes', 'publicBatismo.js'), 'utf8'),
    );
    expect(src).toContain('tirarCodigoPaisTelefone(soDigitos(telefone))');
    expect(src).not.toMatch(/const telNorm = soDigitos\(telefone\);/);
  });
});
