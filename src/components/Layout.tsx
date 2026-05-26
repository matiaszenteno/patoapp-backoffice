import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export function Layout() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const navCls = ({ isActive }: { isActive: boolean }) =>
    `text-sm font-medium px-3 h-[46px] flex items-center border-b-[1.5px] -mb-px transition-colors ${
      isActive
        ? "text-stone-900 border-stone-900"
        : "text-stone-400 border-transparent hover:text-stone-700"
    }`;

  return (
    <div className="flex flex-col min-h-screen bg-stone-50">
      <header className="border-b border-stone-200 bg-stone-50 px-6 flex items-center h-[46px] shrink-0">
        <span className="text-base mr-5">🐥</span>
        <nav className="flex h-full">
          <NavLink className={navCls} to="/clasificacion">Clasificación</NavLink>
          <NavLink className={navCls} to="/benefits">Beneficios</NavLink>
          <NavLink className={navCls} to="/merchants">Merchants</NavLink>
          <NavLink className={navCls} to="/operaciones">Operaciones</NavLink>
          <NavLink className={navCls} to="/feedback">Feedback</NavLink>
        </nav>
        <div className="flex-1" />
        <button
          className="text-xs text-stone-400 hover:text-stone-700 transition-colors"
          onClick={handleLogout}
          type="button"
        >
          Salir
        </button>
      </header>

      <main className="flex-1 h-[calc(100vh-46px)] overflow-hidden">
        <Outlet />
      </main>
    </div>
  );
}
