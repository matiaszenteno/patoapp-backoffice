import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { BenefitsList } from "./pages/BenefitsList";
import { BenefitEdit } from "./pages/BenefitEdit";
import { Locations } from "./pages/Locations";
import { Review } from "./pages/Review";

export default function App() {
  return (
    <BrowserRouter>
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
          <Route path="/locations" element={<Locations />} />
          <Route path="/review" element={<Review />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
