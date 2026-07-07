// Gera o certificado de Apresentação de Crianças a partir do MESMO arquivo PPTX
// modelo (public/certificado-apresentacao-template.pptx · 1 slide com placeholders).
// Substitui SÓ o nome da criança, os pais, a data e a concordância de gênero —
// layout, fontes e cores ficam idênticos ao modelo.
import JSZip from 'jszip';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function dataPorExtenso(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return String(iso);
  return `${d} de ${MESES[m - 1]} de ${y}`;
}

// Escapa o que vai pro XML (nomes podem ter & < > " ')
function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function baixarBlob(blob, nomeArquivo) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomeArquivo;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// Nome de arquivo seguro (sem caracteres proibidos no sistema de arquivos)
function nomeSeguro(criancaNome) {
  return (criancaNome || 'crianca').replace(/[\\/:*?"<>|]+/g, ' ').trim();
}

// Carrega o modelo PPTX uma vez e devolve o ArrayBuffer (reusado no lote).
async function carregarTemplateBuffer() {
  const res = await fetch('/certificado-apresentacao-template.pptx', { cache: 'no-store' });
  if (!res.ok) throw new Error('Não consegui carregar o modelo do certificado.');
  return res.arrayBuffer();
}

// Aplica os dados de UMA criança sobre o modelo e devolve o blob do .pptx.
async function montarCertificadoBlob({ criancaNome, nomePai, nomeMae, dataApresentacao, genero = 'menino' }, templateBuffer) {
  const fem = genero === 'menina';
  const pais = [nomePai, nomeMae].map(s => (s || '').trim()).filter(Boolean).join(' e ') || '_______________';

  // slice(0) clona o buffer — JSZip consome o ArrayBuffer, então reusar o mesmo
  // no lote exige passar uma cópia a cada iteração.
  const zip = await JSZip.loadAsync(templateBuffer.slice(0));

  const slidePath = 'ppt/slides/slide1.xml';
  let xml = await zip.file(slidePath).async('string');
  xml = xml
    .replace(/\{\{NOME\}\}/g, esc(criancaNome))
    .replace(/\{\{PAIS\}\}/g, esc(pais))
    .replace(/\{\{DATA\}\}/g, esc(dataPorExtenso(dataApresentacao)))
    .replace(/\{\{FILHO\}\}/g, fem ? 'filha' : 'filho')
    .replace(/\{\{DEDICADO\}\}/g, fem ? 'dedicada' : 'dedicado')
    .replace(/\{\{PRONOME\}\}/g, fem ? 'dela' : 'dele');
  zip.file(slidePath, xml);

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  });
}

/**
 * Gera e baixa UM certificado (.pptx).
 * @param {object} p
 * @param {string} p.criancaNome
 * @param {string} [p.nomePai]
 * @param {string} [p.nomeMae]
 * @param {string} p.dataApresentacao  ISO yyyy-mm-dd
 * @param {'menino'|'menina'} [p.genero]
 */
export async function gerarCertificadoApresentacao(p) {
  const templateBuffer = await carregarTemplateBuffer();
  const blob = await montarCertificadoBlob(p, templateBuffer);
  baixarBlob(blob, `Certificado - ${nomeSeguro(p.criancaNome)}.pptx`);
}

/**
 * Gera VÁRIOS certificados de uma vez e baixa TUDO num único .zip
 * (uma criança = um .pptx dentro do zip) — evita baixar um por um.
 * @param {Array<object>} itens  cada item no formato de gerarCertificadoApresentacao
 * @param {object} [opts]
 * @param {string} [opts.nomeArquivo]  nome do .zip (default "Certificados de Apresentacao.zip")
 * @param {(feitos:number, total:number)=>void} [opts.onProgresso]
 * @returns {Promise<number>} quantidade de certificados gerados
 */
export async function gerarCertificadosApresentacaoLote(itens, opts = {}) {
  const validos = (itens || []).filter(it => it && it.criancaNome && it.dataApresentacao);
  if (validos.length === 0) throw new Error('Nenhuma criança válida para gerar (falta nome ou data da turma).');

  const templateBuffer = await carregarTemplateBuffer();
  const pacote = new JSZip();
  const usados = new Set();

  for (let i = 0; i < validos.length; i++) {
    const it = validos[i];
    const blob = await montarCertificadoBlob(it, templateBuffer);
    // Garante nome único dentro do zip (duas crianças com o mesmo nome)
    let nome = `Certificado - ${nomeSeguro(it.criancaNome)}`;
    let candidato = `${nome}.pptx`;
    let n = 2;
    while (usados.has(candidato)) { candidato = `${nome} (${n++}).pptx`; }
    usados.add(candidato);
    pacote.file(candidato, blob);
    opts.onProgresso?.(i + 1, validos.length);
  }

  const zipBlob = await pacote.generateAsync({ type: 'blob', mimeType: 'application/zip' });
  baixarBlob(zipBlob, opts.nomeArquivo || 'Certificados de Apresentacao.zip');
  return validos.length;
}
