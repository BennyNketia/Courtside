import { CSSProperties } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { ChatScreen } from './features/chat/ChatScreen';
import { DashboardScreen } from './features/dashboard/DashboardScreen';
import { TraceScreen } from './features/traces/TraceScreen';
import { colors } from './theme';

const layoutStyle: CSSProperties = {
  display: 'flex',
  minHeight: '100vh',
  background: colors.bg0,
  color: colors.text2,
};

const mainStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  minWidth: 0,
  background: colors.bg0,
};

export function App() {
  return (
    <div style={layoutStyle}>
      <Sidebar />
      <main style={mainStyle}>
        <Routes>
          <Route path="/" element={<ChatScreen />} />
          <Route path="/dashboard" element={<DashboardScreen />} />
          <Route path="/traces/:runId" element={<TraceScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
