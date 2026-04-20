import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '@/lib/utils'
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
}

const PAGES: SearchItem[] = [
  { label: 'Dashboard', description: 'Página inicial', path: '/', icon: LayoutDashboard, category: 'Geral' },
  { label: 'Meu Perfil', description: 'Seus dados e configurações', path: '/perfil', icon: User, category: 'Geral' },
  { label: 'Solicitações', description: 'TI, compras, reembolsos e infraestrutura', path: '/solicitacoes', icon: ClipboardList, category: 'Geral' },
  { label: 'Recursos Humanos', description: 'Colaboradores, treinamentos e férias', path: '/admin/rh', icon: Users, category: 'Administrativo' },
  { label: 'Financeiro', description: 'Contas, transações e reembolsos', path: '/admin/financeiro', icon: DollarSign, category: 'Administrativo' },
  { label: 'Logística', description: 'Fornecedores, compras e pedidos', path: '/admin/logistica', icon: Truck, category: 'Administrativo' },
  { label: 'Patrimônio', description: 'Bens, localizações e inventário', path: '/admin/patrimonio', icon: Tag, category: 'Administrativo' },
  { label: 'Assistente IA', description: 'Agentes de auditoria e análise', path: '/assistente-ia', icon: Bot, category: 'Administrativo' },
  { label: 'Eventos', description: 'Gestão de eventos da igreja', path: '/eventos', icon: CalendarDays, category: 'Projetos e Eventos' },
  { label: 'Projetos', description: 'Acompanhamento de projetos', path: '/projetos', icon: FolderKanban, category: 'Projetos e Eventos' },
  { label: 'Planejamento', description: 'Visão consolidada PMO', path: '/planejamento', icon: FolderKanban, category: 'Projetos e Eventos' },
  { label: 'Expansão', description: 'Metas de expansão', path: '/expansao', icon: Map, category: 'Projetos e Eventos' },
  { label: 'Membresia', description: 'Cadastro e trilha dos valores', path: '/ministerial/membresia', icon: BookOpen, category: 'Ministerial' },
  { label: 'Cuidados', description: 'Capelania, aconselhamento e Jornada 180', path: '/ministerial/cuidados', icon: Heart, category: 'Ministerial' },
]

export function CommandSearch() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const filtered = query.trim()
    ? PAGES.filter(p =>
        p.label.toLowerCase().includes(query.toLowerCase()) ||
        p.description.toLowerCase().includes(query.toLowerCase()) ||
        p.category.toLowerCase().includes(query.toLowerCase())
      )
    : PAGES

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
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="flex items-start justify-center pt-[20vh]">
        <div
          className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-2xl overflow-hidden"
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
