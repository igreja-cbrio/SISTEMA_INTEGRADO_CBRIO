// Seletor de responsável de pendência da ATA Semanal.
//
// Por que não é um <select> nativo: são ~55 colaboradores e o pedido foi lista
// com a foto de cada um. `<option>` não aceita imagem, e uma lista de 55 nomes
// sem busca é pior que digitar. Popover + Command (cmdk) dão foto e filtro por
// digitação.
//
// ⚠️ SÓ 11 DOS 55 TÊM FOTO no banco (conferido 18/08/2026). As iniciais não são
// enfeite de fallback — são o caso comum. Elas usam a MESMA cor derivada do
// nome, para que a mesma pessoa tenha sempre o mesmo tom e a lista fique
// reconhecível mesmo sem foto.

import { useState, useMemo } from 'react';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { Popover, PopoverTrigger, PopoverContent } from '../ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandItem } from '../ui/command';
import { Avatar, AvatarImage, AvatarFallback } from '../ui/avatar';

// Tons com contraste suficiente para texto branco por cima.
const TONS = ['#0f766e', '#1d4ed8', '#7c3aed', '#b45309', '#be123c', '#0e7490', '#4d7c0f', '#a21caf'];

function tomDoNome(nome) {
  let h = 0;
  for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) | 0;
  return TONS[Math.abs(h) % TONS.length];
}

function iniciais(nome) {
  const partes = String(nome || '').trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return '?';
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

function Foto({ nome, url, tamanho = 24 }) {
  return (
    <Avatar style={{ width: tamanho, height: tamanho, flex: '0 0 auto' }}>
      {url && <AvatarImage src={url} alt="" />}
      <AvatarFallback
        style={{ background: tomDoNome(String(nome || '')), color: '#fff', fontSize: tamanho * 0.4 }}
      >
        {iniciais(nome)}
      </AvatarFallback>
    </Avatar>
  );
}

/**
 * @param {string|null} valor        nome do responsável já salvo (texto livre no banco)
 * @param {Array}       colaboradores  [{ id, name, avatar_url, area }]
 * @param {Function}    onChange     recebe o nome escolhido, ou null ao limpar
 */
export default function SeletorResponsavel({ valor, colaboradores, onChange, cores }) {
  const [aberto, setAberto] = useState(false);
  const C = cores;

  // O banco guarda TEXTO (`governance_tasks.responsavel`), não id. Isso é
  // proposital: responsáveis vindos da ata podem ser "Milena / Mari" ou alguém
  // que não tem login. Então casamos por nome para mostrar a foto, e seguimos
  // exibindo o texto quando não há correspondência — em vez de descartá-lo.
  const escolhido = useMemo(() => {
    const v = String(valor || '').trim().toLowerCase();
    if (!v) return null;
    return colaboradores.find((c) => String(c.name || '').trim().toLowerCase() === v) || null;
  }, [valor, colaboradores]);

  const temValor = Boolean(String(valor || '').trim());

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-xs rounded-md px-2 py-1 border flex items-center gap-1.5 w-52 text-left"
          style={{ background: C.inputBg, borderColor: C.border, color: temValor ? C.text : C.t3 }}
        >
          {temValor
            ? <><Foto nome={escolhido?.name || valor} url={escolhido?.avatar_url} tamanho={20} />
                <span className="truncate flex-1">{valor}</span></>
            : <span className="flex-1">responsável…</span>}
          {temValor ? (
            // Limpar sem abrir a lista: <span> e não <button>, porque um botão
            // dentro do PopoverTrigger (que também é botão) é HTML inválido e o
            // clique se perde para o gatilho.
            <span
              role="button"
              tabIndex={0}
              aria-label="remover responsável"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onChange(null); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault(); e.stopPropagation(); onChange(null);
                }
              }}
              style={{ display: 'flex', color: C.t3 }}
            >
              <X size={13} />
            </span>
          ) : (
            <ChevronsUpDown size={13} style={{ color: C.t3 }} />
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent className="p-0 w-64" align="start">
        <Command>
          <CommandInput placeholder="Buscar colaborador…" />
          <CommandList>
            <CommandEmpty>Ninguém encontrado.</CommandEmpty>
            {colaboradores.map((c) => (
              <CommandItem
                key={c.id}
                value={c.name || ''}
                onSelect={() => { onChange(c.name); setAberto(false); }}
                className="flex items-center gap-2"
              >
                <Foto nome={c.name} url={c.avatar_url} />
                <span className="flex-1 truncate text-sm">{c.name}</span>
                {c.area && <span className="text-[10px] uppercase" style={{ color: C.t3 }}>{c.area}</span>}
                {escolhido?.id === c.id && <Check size={14} style={{ color: C.primary }} />}
              </CommandItem>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
