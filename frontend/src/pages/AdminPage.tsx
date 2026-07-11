import { Routes, Route, Navigate } from 'react-router-dom';
import AdminLayout from '@/admin/AdminLayout';
import AdminDashboard from '@/admin/AdminDashboard';
import AdminMatchDetail from '@/admin/AdminMatchDetail';
import AdminFeedViewer from '@/admin/AdminFeedViewer';
import AdminConfig from '@/admin/AdminConfig';

export default function AdminPage() {
  return (
    <Routes>
      <Route element={<AdminLayout />}>
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="matches/:fixtureId" element={<AdminMatchDetail />} />
        <Route path="feed" element={<AdminFeedViewer />} />
        <Route path="config" element={<AdminConfig />} />
      </Route>
    </Routes>
  );
}
