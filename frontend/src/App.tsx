import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { WalletContextProvider } from '@/lib/WalletContext';
import Header from '@/components/Header';
import HomePage from '@/pages/HomePage';

// Admin surface is code-split: wallet-adapter + web3 deps load only for admins.
const AdminPage = lazy(() => import('@/pages/AdminPage'));

function AdminFallback() {
  return (
    <div className="flex items-center justify-center min-h-[50vh] text-sm opacity-60">
      Loading admin…
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter basename="/kicktick">
      <WalletContextProvider>
        <div className="min-h-screen">
          <Header />
          <Suspense fallback={<AdminFallback />}>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/admin" element={
                <AdminPage />
              } />
              <Route path="/admin/*" element={
                <AdminPage />
              } />
            </Routes>
          </Suspense>
        </div>
      </WalletContextProvider>
    </BrowserRouter>
  );
}
