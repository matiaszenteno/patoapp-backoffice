import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import duckLogo from "../assets/pato-duck.svg";

type IconProps = { className?: string };

const HomeIcon = ({ className }: IconProps) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d="M3 11.5 12 4l9 7.5" /><path d="M5 10v10h14V10" />
  </svg>
);
const TagIcon = ({ className }: IconProps) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d="M3 7v5l9 9 7-7-9-9H5a2 2 0 0 0-2 2Z" /><circle cx="7.5" cy="9.5" r="1.2" />
  </svg>
);
const GiftIcon = ({ className }: IconProps) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d="M4 9h16v3H4z" /><path d="M5 12v8h14v-8" /><path d="M12 9v11" /><path d="M12 9S9 3 6.5 5 8 9 12 9Zm0 0s3-6 5.5-4S16 9 12 9Z" />
  </svg>
);
const StoreIcon = ({ className }: IconProps) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d="M4 9 5 4h14l1 5a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-3 0Z" /><path d="M5 10v10h14V10" />
  </svg>
);
const CogIcon = ({ className }: IconProps) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="3" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3M4.9 4.9l2.1 2.1m10 10 2.1 2.1m0-14.2-2.1 2.1m-10 10L4.9 19.1" />
  </svg>
);
const ChatIcon = ({ className }: IconProps) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d="M4 5h16v11H8l-4 4z" />
  </svg>
);
const ChartIcon = ({ className }: IconProps) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d="M4 20V4" /><path d="M4 20h16" /><path d="M8 16v-4m4 4V8m4 8v-6" />
  </svg>
);
const ListIcon = ({ className }: IconProps) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d="M8 6h12M8 12h12M8 18h12" /><path d="M4 6h.01M4 12h.01M4 18h.01" />
  </svg>
);
const ChevronIcon = ({ className }: IconProps) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d="m15 6-6 6 6 6" />
  </svg>
);

const NAV_ITEMS = [
  { to: "/inicio", label: "Inicio", icon: HomeIcon },
  { to: "/clasificacion", label: "Clasificación", icon: TagIcon },
  { to: "/benefits", label: "Beneficios", icon: GiftIcon },
  { to: "/merchants", label: "Merchants", icon: StoreIcon },
  { to: "/operaciones", label: "Operaciones", icon: CogIcon },
  { to: "/feedback", label: "Feedback", icon: ChatIcon },
  { to: "/metricas", label: "Métricas", icon: ChartIcon },
  { to: "/logs", label: "Logs", icon: ListIcon },
];

const COLLAPSE_KEY = "backoffice.sidebarCollapsed";

export function Layout() {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === "1");
  const [userIdentifier, setUserIdentifier] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setUserIdentifier(data.session?.user.email ?? data.session?.user.id ?? null);
    });
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      return next;
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `group flex items-center gap-3 rounded-md h-9 px-2.5 text-sm font-medium transition-colors ${
      collapsed ? "justify-center" : ""
    } ${
      isActive
        ? "bg-stone-200 text-stone-900"
        : "text-stone-500 hover:bg-stone-200/60 hover:text-stone-800"
    }`;

  return (
    <div className="flex h-screen bg-stone-50">
      <aside
        className={`shrink-0 border-r border-stone-200 bg-stone-100 flex flex-col transition-[width] duration-200 ${
          collapsed ? "w-14" : "w-56"
        }`}
      >
        {/* Top: logo + collapse toggle */}
        <div className={`flex items-center h-[52px] px-3 ${collapsed ? "justify-center" : "justify-between"}`}>
          {!collapsed && (
            <div className="flex items-center gap-2 min-w-0">
              <img alt="patoapp" className="h-6 w-6 shrink-0" src={duckLogo} />
              <span className="text-sm font-semibold text-stone-700 truncate">Backoffice</span>
            </div>
          )}
          <button
            aria-label={collapsed ? "Expandir menú" : "Colapsar menú"}
            className="shrink-0 rounded-md p-1.5 text-stone-400 hover:bg-stone-200 hover:text-stone-700 transition-colors"
            onClick={toggleCollapsed}
            type="button"
          >
            <ChevronIcon className={`h-4 w-4 transition-transform ${collapsed ? "rotate-180" : ""}`} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-2 flex flex-col gap-0.5">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink className={linkCls} key={to} title={collapsed ? label : undefined} to={to}>
              <Icon className="h-[18px] w-[18px] shrink-0" />
              {!collapsed && <span className="truncate">{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Bottom: user + logout */}
        <div className="border-t border-stone-200 p-2">
          {collapsed ? (
            <button
              aria-label="Cerrar sesión"
              className="flex w-full items-center justify-center rounded-md h-9 text-stone-400 hover:bg-stone-200 hover:text-stone-700 transition-colors"
              onClick={handleLogout}
              title={userIdentifier ? `${userIdentifier} · Cerrar sesión` : "Cerrar sesión"}
              type="button"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-stone-200 text-xs font-semibold text-stone-600">
                {(userIdentifier ?? "?").charAt(0).toUpperCase()}
              </span>
            </button>
          ) : (
            <div className="flex flex-col gap-1.5 px-1">
              <span className="text-xs text-stone-500 truncate" title={userIdentifier ?? undefined}>
                {userIdentifier ?? "—"}
              </span>
              <button
                className="self-start text-xs text-stone-400 hover:text-stone-700 transition-colors"
                onClick={handleLogout}
                type="button"
              >
                Cerrar sesión
              </button>
            </div>
          )}
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
