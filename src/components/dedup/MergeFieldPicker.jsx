// Seletor "melhor de cada campo" na fusão de cadastros de pessoa. Compartilhado
// pelas 3 telas de dedup (Entradas, Membresia, Grupos). O merge_membros só
// preenche os campos VAZIOS do mantido; este seletor deixa escolher, campo a
// campo, qual valor vence quando os cadastros DIVERGEM. Emite `onCampos` com só
// os campos cujo valor escolhido difere do que o mantido já tem (o resto o
// merge resolve sozinho). Funciona pra par (prop `drop`) e pra grupo de N
// cadastros (prop `outros`).
import { useState, useEffect, useMemo } from 'react';

const maskCpf = (v) => {
  const d = String(v || '').replace(/\D/g, '');
  return d.length === 11 ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : (v || '');
};
const maskTelefone = (v) => {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length === 11) return d.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3');
  if (d.length === 10) return d.replace(/(\d{2})(\d{4})(\d{4})/, '($1) $2-$3');
  return v || '';
};
const fmtData = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '');
};

const CAMPOS = [
  { key: 'nome', label: 'Nome', fmt: (v) => v || '' },
  { key: 'telefone', label: 'Telefone', fmt: maskTelefone },
  { key: 'email', label: 'E-mail', fmt: (v) => v || '' },
  { key: 'cpf', label: 'CPF', fmt: maskCpf },
  { key: 'data_nascimento', label: 'Nascimento', fmt: fmtData },
  { key: 'genero', label: 'Gênero', fmt: (v) => v || '' },
];
const norm = (key, v) => {
  if (v == null) return '';
  const s = String(v).trim();
  return (key === 'cpf' || key === 'telefone') ? s.replace(/\D/g, '') : s.toLowerCase();
};

export default function MergeFieldPicker({ keep, drop, outros, onCampos }) {
  const others = Array.isArray(outros) ? outros : (drop ? [drop] : []);

  // Por campo, os valores DISTINTOS não-vazios entre [mantido, ...absorvidos].
  // Só vira escolha quando há >=2 valores distintos (conflito real); onde só um
  // cadastro tem valor, o merge_membros preenche sozinho.
  const camposConf = useMemo(() => {
    const registros = [keep, ...others].filter(Boolean);
    return CAMPOS.map((c) => {
      const distintos = [];
      registros.forEach((r, idx) => {
        const nv = norm(c.key, r[c.key]);
        if (!nv || distintos.some((d) => d.norm === nv)) return;
        distintos.push({ norm: nv, valor: r[c.key], keep: idx === 0 });
      });
      return { ...c, distintos };
    }).filter((c) => c.distintos.length >= 2);
  }, [keep, others]);

  const maisLongo = (ds) => ds.reduce((a, b) => (String(b.valor || '').length > String(a.valor || '').length ? b : a));
  const escolhaInicial = (c) => {
    const doKeep = c.distintos.find((d) => d.keep);
    if (c.key === 'nome') return maisLongo(c.distintos).norm; // nome → o mais completo
    return (doKeep || c.distintos[0]).norm;                    // demais → o do mantido
  };

  const [escolhas, setEscolhas] = useState(() => {
    const o = {}; camposConf.forEach((c) => { o[c.key] = escolhaInicial(c); }); return o;
  });

  useEffect(() => {
    const campos = {};
    camposConf.forEach((c) => {
      const doKeep = c.distintos.find((d) => d.keep);
      const esc = c.distintos.find((d) => d.norm === escolhas[c.key]) || c.distintos.find((d) => d.norm === escolhaInicial(c));
      if (!esc) return;
      if (!doKeep || doKeep.norm !== esc.norm) campos[c.key] = esc.valor; // só override real
    });
    onCampos?.(campos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [escolhas, camposConf]);

  if (!camposConf.length) return null;
  return (
    <div className="rounded-lg border p-3 space-y-2.5">
      <div className="text-[11px] font-semibold text-foreground">Campos divergentes · escolha o que fica</div>
      {camposConf.map((c) => (
        <div key={c.key} className="space-y-1">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.label}</div>
          <div className={`grid gap-1.5 ${c.distintos.length > 2 ? 'grid-cols-1' : 'grid-cols-2'}`}>
            {c.distintos.map((d) => {
              const ativo = escolhas[c.key] === d.norm;
              return (
                <button key={d.norm} type="button"
                  onClick={() => setEscolhas((e) => ({ ...e, [c.key]: d.norm }))}
                  className={`text-left rounded-md border px-2 py-1.5 text-xs transition ${ativo ? 'border-primary bg-primary/10 text-foreground font-medium' : 'border-border text-muted-foreground hover:border-primary/50'}`}>
                  <span className="block truncate">{c.fmt(d.valor) || '—'}</span>
                  <span className="block text-[9px] opacity-60 mt-0.5">{d.keep ? 'mantido' : 'a absorver'}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      <p className="text-[10px] text-muted-foreground">Campos que só um cadastro tem são preenchidos automaticamente.</p>
    </div>
  );
}
