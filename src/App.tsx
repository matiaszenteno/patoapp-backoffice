import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { BenefitsList } from "./pages/BenefitsList";
import { BenefitEdit } from "./pages/BenefitEdit";
import { Merchants } from "./pages/Merchants";
import { Clasificacion } from "./pages/Clasificacion";
import { Scrapers } from "./pages/Scrapers";
import { Pipeline } from "./pages/Pipeline";

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
          <Route index element={<Navigate replace to="/benefits" />} />
          <Route path="/benefits" element={<BenefitsList />} />
          <Route path="/benefits/new" element={<BenefitEdit />} />
          <Route path="/benefits/:id" element={<BenefitEdit />} />
          <Route path="/merchants" element={<Merchants />} />
          <Route path="/scrapers" element={<Scrapers />} />
          <Route path="/pipeline" element={<Pipeline />} />
          <Route path="/clasificacion" element={<Clasificacion />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
