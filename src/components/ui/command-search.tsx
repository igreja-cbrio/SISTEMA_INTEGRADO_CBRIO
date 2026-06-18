import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { useAuth } from '@/contexts/AuthContext'
import { navItemAllowed } from '@/lib/menuAccess'
import {
  Search, Users, DollarSign, Truck, Tag, CalendarDays,
  FolderKanban, BookOpen, ClipboardList, Bot, User,
  LayoutDashboard, Map, UserCheck, UsersRound, Heart,
  HandHelping, Megaphone,
} from 'lucide-react'

interface SearchItem {
  label: string
  description: string
  path: string
  icon: React.ElementType
  category: string
  // Gate de permissão · mesmas chaves do NAV_ITEMS (ver src/lib/menuAccess).
  // Sem perm/module = público. Mantém a busca ⌘K em sincronia com o menu.
  perm?: string
  module?: string
  moduleMin?: number
}

// Gates espelham o ModuleGuard das rotas (src/App.tsx) · igual ao menu.
const PAGES: SearchItem[] = [
  { label: 'Dashboard', description: 'Página inicial', path: '/', icon: LayoutDashboard, category: 'Geral' },
  { label: 'Meu Perfil', description: 'Seus dados e configurações', path: '/perfil', icon: User, category: 'Geral' },
  { label: 'Solicitações', description: 'TI, compras, reembolsos e infraestrutura', path: '/solicitacoes', icon: ClipboardList, category: 'Geral', perm: 'isColaborador' },
  { label: 'Recursos Humanos', description: 'Colaboradores, treinamentos e férias', path: '/admin/rh', icon: Users, category: 'Administrativo', perm: 'canRH' },
  { label: 'Financeiro', description: 'Contas, transações e reembolsos', path: '/admin/financeiro', icon: DollarSign, category: 'Administrativo', perm: 'canFinanceiro' },
  { label: 'Logística', description: 'Fornecedores, compras e pedidos', path: '/admin/logistica', icon: Truck, category: 'Administrativo', perm: 'canLogistica' },
  { label: 'Patrimônio', description: 'Bens, localizações e inventário', path: '/admin/patrimonio', icon: Tag, category: 'Administrativo', perm: 'canPatrimonio' },
  { label: 'Assistente IA', description: 'Agentes de auditoria e análise', path: '/assistente-ia', icon: Bot, category: 'Administrativo', perm: 'canIA' },
  { label: 'Eventos', description: 'Gestão de eventos da igreja', path: '/eventos', icon: CalendarDays, category: 'Projetos e Eventos', perm: 'canAgenda' },
  { label: 'Projetos', description: 'Acompanhamento de projetos', path: '/projetos', icon: FolderKanban, category: 'Projetos e Eventos', perm: 'canProjetos' },
  { label: 'Gestão Anual', description: 'Próximo ano e resultados · eventos e projetos', path: '/planejamento', icon: FolderKanban, category: 'Projetos e Eventos' },
  { label: 'Planejamento Estratégico', description: 'Plano plurianual · Expansão 2026–2029', path: '/expansao', icon: Map, category: 'Projetos e Eventos', module: 'expansao' },
  { label: 'Membresia', description: 'Cadastro e trilha dos valores', path: '/ministerial/membresia', icon: BookOpen, category: 'Ministerial', perm: 'canMembresia' },
  { label: 'Cuidados', description: 'Capelania, aconselhamento e Jornada 180', path: '/ministerial/cuidados', icon: Heart, category: 'Ministerial', module: 'cuidados' },
  { label: 'Next - Batismo', description: 'Check de pessoas · liga inscrição ao membro e funde duplicados', path: '/next-batismo', icon: Users, category: 'Ministerial', module: 'next-batismo' },
]

export function CommandSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const auth = useAuth()

  // Só lista as páginas que o usuário consegue de fato abrir (mesma regra do menu).
  const visiblePages = PAGES.filter(p => navItemAllowed(p, auth as Record<string, unknown>))

  const filtered = query.trim()
    ? visiblePages.filter(p =>
        p.label.toLowerCase().includes(query.toLowerCase()) ||
        p.description.toLowerCase().includes(query.toLowerCase()) ||
        p.category.toLowerCase().includes(query.toLowerCase())
      )
    : visiblePages

  const handleOpen = useCallback(() => {
    setOpen(true)
    setQuery('')
    setSelectedIndex(0)
    setTimeout(() => inputRef.current?.focus(), 50)
  }, [])

  const handleClose = useCallback(() => {
    setOpen(false)
    setQuery('')
  }, [])

  const handleSelect = useCallback((item: SearchItem) => {
    navigate(item.path)
    handleClose()
  }, [navigate, handleClose])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        if (open) handleClose()
        else handleOpen()
      }
      if (e.key === 'Escape' && open) handleClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, handleOpen, handleClose])

  useEffect(() => {
    if (!open) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedIndex(i => Math.min(i + 1, filtered.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedIndex(i => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' && filtered[selectedIndex]) {
        handleSelect(filtered[selectedIndex])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, filtered, selectedIndex, handleSelect])

  useEffect(() => { setSelectedIndex(0) }, [query])

  useEffect(() => {
    if (!open || !listRef.current) return
    const selected = listRef.current.querySelector('[data-selected="true"]')
    selected?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex, open])

  if (!open) return null

  const items: Array<{ type: 'header'; category: string } | { type: 'item'; item: SearchItem; flatIdx: number }> = []
  let lastCategory = ''
  let flatIdx = 0
  for (const item of filtered) {
    if (!query.trim() && item.category !== lastCategory) {
      items.push({ type: 'header', category: item.category })
      lastCategory = item.category
    }
    items.push({ type: 'item', item, flatIdx: flatIdx++ })
  }

  return (
    <div className="fixed inset-0 z-[999]" onClick={handleClose}>
      <div className="absolute inset-0 bg-black/70" />
      <div className="relative flex items-start justify-center pt-[20vh]">
        <div
          className="w-full max-w-lg rounded-2xl border border-border shadow-2xl overflow-hidden"
          style={{ background: 'var(--cbrio-card)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <input
              ref={inputRef}
              className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              placeholder="Buscar página..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">ESC</kbd>
          </div>
          <div ref={listRef} className="max-h-80 overflow-y-auto p-2">
            {filtered.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-6">Nenhum resultado encontrado</p>
            ) : (
              items.map((entry, i) => {
                if (entry.type === 'header') {
                  return (
                    <div key={`h-${i}`} className="px-3 py-1.5 mt-1">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                        {entry.category}
                      </span>
                    </div>
                  )
                }
                const { item, flatIdx: idx } = entry
                const Icon = item.icon
                const isSelected = idx === selectedIndex
                return (
                  <div
                    key={item.path}
                    data-selected={isSelected}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors",
                      isSelected ? "bg-accent" : "hover:bg-accent/50"
                    )}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setSelectedIndex(idx)}
                  >
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.label}</p>
                      <p className="text-[11px] text-muted-foreground">{item.description}</p>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
