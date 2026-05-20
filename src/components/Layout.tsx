import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export function Layout() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const navCls = ({ isActive }: { isActive: boolean }) =>
    `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
      isActive ? "bg-teal-50 text-teal-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
    }`;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="text-lg font-semibold text-gray-900">🐥 Backoffice</span>
            <nav className="flex gap-1">
              <NavLink className={navCls} to="/benefits">Beneficios</NavLink>
              <NavLink className={navCls} to="/merchants">Merchants</NavLink>
              <NavLink className={navCls} to="/clasificacion">Clasificación</NavLink>
              <NavLink className={navCls} to="/scrapers">Scrapers</NavLink>
              <NavLink className={navCls} to="/pipeline">Pipeline</NavLink>
            </nav>
          </div>
          <button
            className="text-sm text-gray-500 hover:text-gray-800"
            onClick={handleLogout}
            type="button"
          >
            Cerrar sesión
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  );
}
