/**
 * Report Generator — gera PPTX (apresentação) e DOCX (documento) com identidade CBRio.
 *
 * Cores do manual de marca:
 * - Primária: #00839D (azul profundo)
 * - Secundária: #00ACB3 (turquesa)
 * - Escuro: #242223
 * - Areia: #E0D1B9
 * - Off-white: #EDE8E2
 * - Claro: #F2ECE8
 */
const PptxGenJS = require('pptxgenjs');
const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle, AlignmentType, PageBreak } = require('docx');

const BRAND = {
  primary: '00839D',
  secondary: '00ACB3',
  dark: '242223',
  sand: 'E0D1B9',
  offWhite: 'EDE8E2',
  cream: 'F2ECE8',
  white: 'FFFFFF',
  font: 'Avenir Next', // Similar a ITC Avant Garde Gothic (disponível na maioria dos sistemas)
};

// ══════════════════════════════════════════════
// PPTX — Apresentação (macro visão)
// ══════════════════════════════════════════════
async function generatePPTX({ eventName, eventDate, scope, phases, completedTasks, pendingTasks, totalTasks, pctDone, highlights, recommendations, reportContent }) {
  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: 'WIDE', width: 13.33, height: 7.5 });
  pptx.layout = 'WIDE';

  // ── Slide 1: Capa ──
  const slide1 = pptx.addSlide();
  slide1.background = { color: BRAND.primary };
  slide1.addText('RELATÓRIO DE EVENTO', { x: 1, y: 1.5, w: 11, h: 0.8, fontSize: 16, color: BRAND.sand, fontFace: BRAND.font, bold: false, letterSpacing: 5 });
  slide1.addText(eventName, { x: 1, y: 2.5, w: 11, h: 1.2, fontSize: 40, color: BRAND.white, fontFace: BRAND.font, bold: true });
  slide1.addText(`${scope} · ${eventDate || ''}`, { x: 1, y: 4, w: 11, h: 0.5, fontSize: 14, color: BRAND.secondary, fontFace: BRAND.font });
  slide1.addText('CBRio — Igreja Comunidade Batista do Rio', { x: 1, y: 6.2, w: 11, h: 0.4, fontSize: 11, color: BRAND.sand, fontFace: BRAND.font });

  // ── Slide 2: Resumo Executivo ──
  const slide2 = pptx.addSlide();
  slide2.background = { color: BRAND.white };
  slide2.addText('Resumo Executivo', { x: 0.8, y: 0.4, w: 11, h: 0.7, fontSize: 28, color: BRAND.dark, fontFace: BRAND.font, bold: true });
  slide2.addShape(pptx.shapes.RECTANGLE, { x: 0.8, y: 1.1, w: 2, h: 0.05, fill: { color: BRAND.primary } });

  // KPIs
  const kpis = [
    { label: 'Total de Tarefas', value: String(totalTasks), color: BRAND.primary },
    { label: 'Concluídas', value: String(completedTasks), color: '10B981' },
    { label: 'Pendentes', value: String(pendingTasks), color: 'EF4444' },
    { label: 'Progresso', value: `${pctDone}%`, color: BRAND.secondary },
  ];
  kpis.forEach((kpi, i) => {
    const x = 0.8 + i * 3;
    slide2.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x, y: 1.5, w: 2.6, h: 1.6, fill: { color: BRAND.cream }, rectRadius: 0.1 });
    slide2.addText(kpi.value, { x, y: 1.7, w: 2.6, h: 0.8, fontSize: 36, color: kpi.color, fontFace: BRAND.font, bold: true, align: 'center' });
    slide2.addText(kpi.label, { x, y: 2.5, w: 2.6, h: 0.4, fontSize: 11, color: BRAND.dark, fontFace: BRAND.font, align: 'center' });
  });

  // ── Slide 3: Progresso por Fase ──
  if (phases && phases.length > 0) {
    const slide3 = pptx.addSlide();
    slide3.background = { color: BRAND.white };
    slide3.addText('Progresso por Fase', { x: 0.8, y: 0.4, w: 11, h: 0.7, fontSize: 28, color: BRAND.dark, fontFace: BRAND.font, bold: true });
    slide3.addShape(pptx.shapes.RECTANGLE, { x: 0.8, y: 1.1, w: 2, h: 0.05, fill: { color: BRAND.primary } });

    phases.forEach((p, i) => {
      const y = 1.5 + i * 0.45;
      if (y > 6.5) return;
      const pct = p.total > 0 ? Math.round(p.done / p.total * 100) : 0;
      slide3.addText(`F${String(p.numero).padStart(2, '0')} ${p.nome}`, { x: 0.8, y, w: 4, h: 0.35, fontSize: 11, color: BRAND.dark, fontFace: BRAND.font });
      // Barra de progresso
      slide3.addShape(pptx.shapes.RECTANGLE, { x: 5, y: y + 0.05, w: 6, h: 0.25, fill: { color: BRAND.offWhite } });
      if (pct > 0) slide3.addShape(pptx.shapes.RECTANGLE, { x: 5, y: y + 0.05, w: 6 * pct / 100, h: 0.25, fill: { color: pct === 100 ? '10B981' : BRAND.primary } });
      slide3.addText(`${pct}%`, { x: 11.2, y, w: 1, h: 0.35, fontSize: 10, color: BRAND.dark, fontFace: BRAND.font, align: 'right' });
    });
  }

  // ── Slide 4: Pontos de Atenção ──
  if (highlights) {
    const slide4 = pptx.addSlide();
    slide4.background = { color: BRAND.white };
    slide4.addText('Pontos de Atenção', { x: 0.8, y: 0.4, w: 11, h: 0.7, fontSize: 28, color: BRAND.dark, fontFace: BRAND.font, bold: true });
    slide4.addShape(pptx.shapes.RECTANGLE, { x: 0.8, y: 1.1, w: 2, h: 0.05, fill: { color: 'EF4444' } });
    slide4.addText(highlights.slice(0, 1500), { x: 0.8, y: 1.5, w: 11.5, h: 5, fontSize: 12, color: BRAND.dark, fontFace: BRAND.font, paraSpaceAfter: 6 });
  }

  // ── Slide 5: Recomendações ──
  if (recommendations) {
    const slide5 = pptx.addSlide();
    slide5.background = { color: BRAND.white };
    slide5.addText('Recomendações', { x: 0.8, y: 0.4, w: 11, h: 0.7, fontSize: 28, color: BRAND.dark, fontFace: BRAND.font, bold: true });
    slide5.addShape(pptx.shapes.RECTANGLE, { x: 0.8, y: 1.1, w: 2, h: 0.05, fill: { color: BRAND.secondary } });
    slide5.addText(recommendations.slice(0, 1500), { x: 0.8, y: 1.5, w: 11.5, h: 5, fontSize: 12, color: BRAND.dark, fontFace: BRAND.font, paraSpaceAfter: 6 });
  }

  // ── Slide final ──
  const slideEnd = pptx.addSlide();
  slideEnd.background = { color: BRAND.dark };
  slideEnd.addText('CBRio', { x: 1, y: 2.5, w: 11, h: 1.2, fontSize: 48, color: BRAND.primary, fontFace: BRAND.font, bold: true, align: 'center' });
  slideEnd.addText('Igreja Comunidade Batista do Rio', { x: 1, y: 3.8, w: 11, h: 0.5, fontSize: 14, color: BRAND.sand, fontFace: BRAND.font, align: 'center' });
  slideEnd.addText('Gerado automaticamente pelo Sistema PMO CBRio', { x: 1, y: 5.5, w: 11, h: 0.3, fontSize: 9, color: '666666', fontFace: BRAND.font, align: 'center' });

  return await pptx.write({ outputType: 'nodebuffer' });
}

// ══════════════════════════════════════════════
// DOCX — Documento completo (detalhado)
// ══════════════════════════════════════════════
async function generateDOCX({ eventName, eventDate, scope, reportContent, phases, pendingTasksList, completedTasksList }) {
  const children = [];

  // Capa
  children.push(new Paragraph({ spacing: { before: 2000 } }));
  children.push(new Paragraph({
    children: [new TextRun({ text: 'RELATÓRIO DE EVENTO', font: BRAND.font, size: 24, color: BRAND.primary, bold: false })],
    alignment: AlignmentType.CENTER,
  }));
  children.push(new Paragraph({ spacing: { before: 400 } }));
  children.push(new Paragraph({
    children: [new TextRun({ text: eventName, font: BRAND.font, size: 52, color: BRAND.dark, bold: true })],
    alignment: AlignmentType.CENTER,
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: `${scope} · ${eventDate || ''}`, font: BRAND.font, size: 22, color: BRAND.primary })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 200 },
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: 'CBRio — Igreja Comunidade Batista do Rio', font: BRAND.font, size: 18, color: '888888' })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 1000 },
  }));
  children.push(new Paragraph({ children: [new PageBreak()] }));

  // Conteúdo do relatório (markdown → parágrafos)
  if (reportContent) {
    const lines = reportContent.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) { children.push(new Paragraph({ spacing: { before: 100 } })); continue; }

      if (trimmed.startsWith('# ')) {
        children.push(new Paragraph({
          children: [new TextRun({ text: trimmed.replace(/^#+\s*/, ''), font: BRAND.font, size: 32, color: BRAND.primary, bold: true })],
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 400, after: 200 },
        }));
      } else if (trimmed.startsWith('## ')) {
        children.push(new Paragraph({
          children: [new TextRun({ text: trimmed.replace(/^#+\s*/, ''), font: BRAND.font, size: 26, color: BRAND.dark, bold: true })],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 150 },
        }));
      } else if (trimmed.startsWith('### ')) {
        children.push(new Paragraph({
          children: [new TextRun({ text: trimmed.replace(/^#+\s*/, ''), font: BRAND.font, size: 22, color: BRAND.primary, bold: true })],
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 200, after: 100 },
        }));
      } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        const text = trimmed.replace(/^[-*]\s*/, '');
        const parts = text.split(/\*\*(.*?)\*\*/g);
        const runs = parts.map((p, i) => new TextRun({ text: p, font: BRAND.font, size: 20, bold: i % 2 === 1, color: BRAND.dark }));
        children.push(new Paragraph({ children: [new TextRun({ text: '  •  ', font: BRAND.font, size: 20, color: BRAND.primary }), ...runs], spacing: { before: 50 } }));
      } else {
        const parts = trimmed.split(/\*\*(.*?)\*\*/g);
        const runs = parts.map((p, i) => new TextRun({ text: p, font: BRAND.font, size: 20, bold: i % 2 === 1, color: BRAND.dark }));
        children.push(new Paragraph({ children: runs, spacing: { before: 80 } }));
      }
    }
  }

  // Rodapé
  children.push(new Paragraph({ spacing: { before: 600 } }));
  children.push(new Paragraph({
    children: [new TextRun({ text: '———', font: BRAND.font, size: 16, color: 'CCCCCC' })],
    alignment: AlignmentType.CENTER,
  }));
  children.push(new Paragraph({
    children: [new TextRun({ text: 'Gerado automaticamente pelo Sistema PMO CBRio', font: BRAND.font, size: 16, color: '999999', italics: true })],
    alignment: AlignmentType.CENTER,
    spacing: { before: 100 },
  }));

  const doc = new Document({
    sections: [{
      properties: {
        page: { margin: { top: 1000, bottom: 1000, left: 1200, right: 1200 } },
      },
      children,
    }],
  });

  return await Packer.toBuffer(doc);
}

module.exports = { generatePPTX, generateDOCX, BRAND };
