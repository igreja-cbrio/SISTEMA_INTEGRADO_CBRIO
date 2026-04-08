"use client";

import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bell, CalendarDays, ChevronRight, DollarSign,
  FolderKanban, HandHelping, Heart, LogOut, Map,
  Megaphone, Tag, Truck, UserCheck, Users, UsersRound, BookOpen,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import React from "react";

const sidebarVariants = {
  open: { width: "15rem" },
  closed: { width: "3.5rem" },
};

const labelVariants = {
  open: { opacity: 1, x: 0, display: "block" },
  closed: { opacity: 0, x: -10, transitionEnd: { display: "none" } },
};

const transitionProps = {
  type: "tween" as const,
  ease: "easeOut",
  duration: 0.2,
};

interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  roles?: string[];
}

interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
  roles?: string[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    id: "admin",
    label: "Administrativo",
    roles: ["admin", "diretor"],
    items: [
      { label: "RH", path: "/admin/rh", icon: Users },
      { label: "Financeiro", path: "/admin/financeiro", icon: DollarSign },
      { label: "Logística", path: "/admin/logistica", icon: Truck },
      { label: "Patrimônio", path: "/admin/patrimonio", icon: Tag },
    ],
  },
  {
    id: "projetos",
    label: "Projetos e Eventos",
    items: [
      { label: "Eventos", path: "/eventos", icon: CalendarDays },
      { label: "Projetos", path: "/projetos", icon: FolderKanban, roles: ["admin", "diretor"] },
      { label: "Expansão", path: "/expansao", icon: Map, roles: ["admin", "diretor"] },
    ],
  },
  {
    id: "ministerial",
    label: "Ministerial",
    roles: ["admin", "diretor"],
    items: [
      { label: "Integração", path: "/ministerial/integracao", icon: UserCheck },
      { label: "Grupos", path: "/ministerial/grupos", icon: UsersRound },
      { label: "Cuidados", path: "/ministerial/cuidados", icon: Heart },
      { label: "Voluntariado", path: "/ministerial/voluntariado", icon: HandHelping },
      { label: "Membresia", path: "/ministerial/membresia", icon: BookOpen },
    ],
  },
  {
    id: "criativo",
    label: "Criativo",
    roles: ["admin", "diretor"],
    items: [
      { label: "Marketing", path: "/criativo/marketing", icon: Megaphone },
    ],
  },
];

export function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [openGroups, setOpenGroups] = useState(["admin", "projetos", "ministerial", "criativo"]);
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, role, signOut } = useAuth();
  const [notificationCount] = useState(0);

  const pathname = location.pathname;

  const toggleGroup = (id: string) => {
    setOpenGroups((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]
    );
  };

  async function handleSignOut() {
    await signOut();
    navigate("/login");
  }

  const initials = (profile?.name || "??")
    .split(" ")
    .map((n: string) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <motion.aside
      variants={sidebarVariants}
      animate={isCollapsed ? "closed" : "open"}
      transition={transitionProps}
      className="fixed left-0 top-0 z-40 h-screen border-r border-sidebar-border bg-sidebar flex flex-col overflow-hidden"
      onMouseEnter={() => setIsCollapsed(false)}
      onMouseLeave={() => setIsCollapsed(true)}
    >
      <div className="flex flex-col h-full">
        {/* Logo */}
        <div className="flex items-center gap-3 px-3 py-4 border-b border-sidebar-border">
          <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground font-bold text-sm shrink-0">
            C
          </div>
          <motion.span variants={labelVariants} className="text-sm font-bold text-foreground whitespace-nowrap">
            CBRio ERP
          </motion.span>
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 py-2">
          <div className="px-2 space-y-1">
            {NAV_GROUPS.map((group) => {
              if (group.roles && !group.roles.includes(role || "")) return null;
              const isExpanded = openGroups.includes(group.id);

              return (
                <div key={group.id} className="space-y-0.5">
                  <button
                    onClick={() => !isCollapsed && toggleGroup(group.id)}
                    className={cn(
                      "flex h-7 w-full items-center gap-1.5 rounded-md transition-colors hover:bg-sidebar-accent",
                      isCollapsed ? "justify-center px-0" : "pl-4 pr-2"
                    )}
                  >
                    <motion.span variants={labelVariants} className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground">
                      {group.label}
                    </motion.span>
                    <motion.span variants={labelVariants}>
                      <ChevronRight className={cn("h-3 w-3 text-sidebar-foreground transition-transform", isExpanded && "rotate-90")} />
                    </motion.span>
                  </button>

                  <AnimatePresence>
                    {(isExpanded || isCollapsed) && (
                      <div className="space-y-0.5">
                        {group.items.map((item) => {
                          if (item.roles && !item.roles.includes(role || "")) return null;
                          const Icon = item.icon;
                          const basePath = item.path.split("?")[0];
                          const isActive = pathname.startsWith(basePath);

                          return (
                            <Link
                              key={item.path}
                              to={item.path}
                              className={cn(
                                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                                isCollapsed && "justify-center px-0",
                                isActive
                                  ? "bg-primary/10 text-primary font-medium"
                                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                              )}
                            >
                              <Icon className={cn("h-4 w-4 shrink-0", isActive ? "text-primary" : "")} />
                              <motion.span variants={labelVariants} className="truncate">
                                {item.label}
                              </motion.span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {/* Notifications */}
        <Link to="/admin/notificacao-regras" className={cn("flex items-center gap-3 px-3 py-2 mx-2 rounded-lg hover:bg-sidebar-accent transition-colors relative", isCollapsed && "justify-center px-0")}>
          <Bell className="h-4 w-4 text-sidebar-foreground shrink-0" />
          {notificationCount > 0 && (
            <span className="absolute top-1 left-6 h-4 w-4 rounded-full bg-primary text-[9px] font-bold text-primary-foreground flex items-center justify-center cbrio-badge-pulse">
              {notificationCount > 9 ? '9+' : notificationCount}
            </span>
          )}
          <motion.span variants={labelVariants} className="text-sm text-sidebar-foreground">
            Notificações
          </motion.span>
        </Link>

        {/* User footer */}
        <div className={cn("flex items-center gap-3 px-3 py-3 border-t border-sidebar-border", isCollapsed && "justify-center px-2")}>
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="bg-primary/20 text-primary text-xs font-bold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <motion.div variants={labelVariants} className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{profile?.name || "—"}</p>
            <p className="text-[10px] text-muted-foreground">{profile?.role || ""}</p>
          </motion.div>
          <motion.button variants={labelVariants} onClick={handleSignOut} className="p-1.5 rounded-md hover:bg-sidebar-accent transition-colors" title="Sair">
            <LogOut className="h-4 w-4 text-sidebar-foreground" />
          </motion.button>
        </div>
      </div>
    </motion.aside>
  );
}
