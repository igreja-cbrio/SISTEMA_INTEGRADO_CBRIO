import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { Link, useLocation, useNavigate } from "react-router-dom";

export type MegaMenuItem = {
  id: number;
  label: string;
  path?: string;
  subMenus?: {
    title: string;
    items: {
      label: string;
      description: string;
      icon: React.ElementType;
      path: string;
      perm?: string;
    }[];
  }[];
};

export interface MegaMenuProps {
  items: MegaMenuItem[];
  role: string | null;
}

export default function MegaMenu({ items, role }: MegaMenuProps) {
  const [openMenu, setOpenMenu] = React.useState<string | null>(null);
  const [isHover, setIsHover] = React.useState<number | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const timeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleEnter = (label: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setOpenMenu(label);
  };

  const handleLeave = () => {
    timeoutRef.current = setTimeout(() => setOpenMenu(null), 150);
  };

  return (
    <nav className="hidden md:block">
      <ul className="flex items-center gap-1">
        {items.map((navItem) => {
          if (navItem.path && !navItem.subMenus) {
            const isActive = location.pathname.startsWith(navItem.path);
            return (
              <li key={navItem.id} className="relative">
                <Link
                  to={navItem.path}
                  onMouseEnter={() => setIsHover(navItem.id)}
                  onMouseLeave={() => setIsHover(null)}
                  className={`px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                    isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {navItem.label}
                </Link>
              </li>
            );
          }

          return (
            <li
              key={navItem.id}
              className="relative"
              onMouseEnter={() => handleEnter(navItem.label)}
              onMouseLeave={handleLeave}
            >
              <button
                onMouseEnter={() => setIsHover(navItem.id)}
                onMouseLeave={() => setIsHover(null)}
                onClick={() => { if (navItem.path) { setOpenMenu(null); navigate(navItem.path); } }}
                className="flex items-center gap-1 px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground rounded-lg transition-colors"
              >
                {navItem.label}
                <ChevronDown className={`h-3.5 w-3.5 transition-transform ${openMenu === navItem.label ? 'rotate-180' : ''}`} />
              </button>

              <AnimatePresence>
                {openMenu === navItem.label && navItem.subMenus && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    transition={{ duration: 0.15 }}
                    className="absolute top-full left-0 mt-1 z-50"
                  >
                    <div className="rounded-xl border border-border bg-card shadow-xl p-4 min-w-[280px]">
                      <div className="flex gap-6">
                        {navItem.subMenus.map((sub) => (
                          <div key={sub.title} className="min-w-[220px]">
                            <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-3">
                              {sub.title}
                            </h4>
                            <ul>
                              {sub.items.map((item) => {
                                const Icon = item.icon;
                                const isActive = location.pathname.startsWith(item.path);
                                return (
                                  <li key={item.path}>
                                    <Link
                                      to={item.path}
                                      onClick={() => setOpenMenu(null)}
                                      className={`flex items-center gap-3 rounded-xl px-3 py-3 transition-colors group ${
                                        isActive ? 'bg-primary/10' : 'hover:bg-accent'
                                      }`}
                                    >
                                      <div className={`rounded-lg p-1.5 ${isActive ? 'bg-primary/20' : 'bg-muted'}`}>
                                        <Icon className={`h-4 w-4 ${isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'}`} />
                                      </div>
                                      <div>
                                        <p className={`text-sm font-medium ${isActive ? 'text-primary' : 'text-foreground'}`}>
                                          {item.label}
                                        </p>
                                        <p className="text-[11px] text-muted-foreground">
                                          {item.description}
                                        </p>
                                      </div>
                                    </Link>
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
