import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { WalletContextProvider } from '@/lib/WalletContext';
import Header from '@/components/Header';
import HomePage from '@/pages/HomePage';
import AdminPage from '@/pages/AdminPage';
import { AdminAuthGuard } from '@/admin/AdminAuthGuard';
import { WebSocketProvider } from '@/admin/WebSocketProvider';

export default function App() {
  return (
    <BrowserRouter>
      <WalletContextProvider>
        <div className="min-h-screen">
          <Header />
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/admin" element={
              <AdminAuthGuard>
                <WebSocketProvider>
                  <AdminPage />
                </WebSocketProvider>
              </AdminAuthGuard>
            } />
            <Route path="/admin/*" element={
              <AdminAuthGuard>
                <WebSocketProvider>
                  <AdminPage />
                </WebSocketProvider>
              </AdminAuthGuard>
            } />
          </Routes>
        </div>
      </WalletContextProvider>
    </BrowserRouter>
  );
}
