import React, { Suspense } from 'react';
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom';
import { SiteDataProvider } from './context/SiteDataContext';
import { Layout } from './components/layout/Layout';
import { isSecretAdminPathname } from './utils/adminRoute';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';

const AdminAppPage = React.lazy(() => import('./admin/AdminAppPage'));

const SecretRouteOrNotFound: React.FC = () => {
  const { pathname } = useLocation();
  if (!isSecretAdminPathname(pathname)) {
    return <NotFoundPage />;
  }
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#060709] text-slate-300 font-mono text-xs uppercase tracking-wider">
          Loading Restricted Portal...
        </div>
      }
    >
      <AdminAppPage />
    </Suspense>
  );
};

export const AppRoutes: React.FC = () => {
  return (
    <Layout>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="*" element={<SecretRouteOrNotFound />} />
      </Routes>
    </Layout>
  );
};

export function App() {
  return (
    <SiteDataProvider>
      <HashRouter>
        <AppRoutes />
      </HashRouter>
    </SiteDataProvider>
  );
}

export default App;
