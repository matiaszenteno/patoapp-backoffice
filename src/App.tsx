import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { BenefitsList } from "./pages/BenefitsList";
import { BenefitEdit } from "./pages/BenefitEdit";
import { Merchants } from "./pages/Merchants";
import { Clasificacion } from "./pages/Clasificacion";
import { Operaciones } from "./pages/Operaciones";
import { Feedback } from "./pages/Feedback";
import { Inicio } from "./pages/Inicio";
import { Metricas } from "./pages/Metricas";
import { Logs } from "./pages/Logs";
import { Notificaciones } from "./pages/Notificaciones";

export default function App() {
  return (
    <BrowserRouter basename="/patoapp-backoffice">
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate replace to="/inicio" />} />
          <Route path="/inicio" element={<Inicio />} />
          <Route path="/clasificacion" element={<Clasificacion />} />
          <Route path="/benefits" element={<BenefitsList />} />
          <Route path="/benefits/new" element={<BenefitEdit />} />
          <Route path="/benefits/:id" element={<BenefitEdit />} />
          <Route path="/merchants" element={<Merchants />} />
          <Route path="/operaciones" element={<Operaciones />} />
          <Route path="/feedback" element={<Feedback />} />
          <Route path="/metricas" element={<Metricas />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/notificaciones" element={<Notificaciones />} />
          <Route path="/scrapers" element={<Navigate replace to="/operaciones" />} />
          <Route path="/pipeline" element={<Navigate replace to="/operaciones" />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
