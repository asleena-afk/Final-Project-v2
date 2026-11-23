import { Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import Dashboard from "./pages/Dashboard";
import Projects from "./pages/Projects";
import ProjectPage from "./pages/ProjectPage";
import Team from "./pages/Team";
import Calendar from "./pages/Calendar";
import Logs from "./pages/Logs";
import Meetings from "./pages/Meetings";
import MeetingDetail from "./pages/MeetingDetail";
import Reports from "./pages/Reports";
import { useSession } from "./session";

// Pages for members only send visitors to sign in.
function Private({ children }) {
  const { signedIn, loading } = useSession();
  if (loading) return <p className="muted" style={{ padding: 24 }}>Loading…</p>;
  return signedIn ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const { loading } = useSession();
  if (loading) return <p className="muted" style={{ padding: 24 }}>Loading…</p>;
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/:id" element={<ProjectPage />} />
        <Route path="team" element={<Team />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="reports" element={<Reports />} />
        <Route path="logs" element={<Private><Logs /></Private>} />
        <Route path="meetings" element={<Private><Meetings /></Private>} />
        <Route path="meetings/:id" element={<Private><MeetingDetail /></Private>} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
