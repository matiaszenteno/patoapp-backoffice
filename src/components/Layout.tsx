import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export function Layout() {
  const navigate = useNavigate();
  const [reviewCount, setReviewCount] = useState(0);

  useEffect(() => {
    supabase
      .from("scraped_benefits_raw")
      .select("id", { count: "exact", head: true })
      .eq("processing_status", "needs_review")
      .then(({ count }) => setReviewCount(count ?? 0));
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-6 py-3">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <div className="flex items-center gap-6">
            <span className="text-lg font-semibold text-gray-900">🐥 Backoffice</span>
            <nav className="flex gap-1">
              <NavLink
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-teal-50 text-teal-700"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  }`
                }
                to="/benefits"
              >
                Beneficios
              </NavLink>
              <NavLink
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-teal-50 text-teal-700"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  }`
                }
                to="/locations"
              >
                Ubicaciones
              </NavLink>
              <NavLink
                className={({ isActive }) =>
                  `flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-teal-50 text-teal-700"
                      : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
                  }`
                }
                to="/review"
              >
                Revisión
                {reviewCount > 0 && (
                  <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-700">
                    {reviewCount}
                  </span>
                )}
              </NavLink>
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
