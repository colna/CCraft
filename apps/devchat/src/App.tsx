import { Navigate, Route, Routes } from "react-router-dom";
import { BrowserRouter } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { CommitPage } from "./pages/Commit";
import { ChatPage } from "./pages/Chat";
import { DiffViewPage } from "./pages/DiffView";
import { HistoryPage } from "./pages/History";
import { HomePage } from "./pages/Home";
import { ProjectsPage } from "./pages/Projects";
import { SettingsPage } from "./pages/Settings";

export function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/chat/:projectId" element={<ChatPage />} />
          <Route path="/diff" element={<DiffViewPage />} />
          <Route path="/commit" element={<CommitPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
