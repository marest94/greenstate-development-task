import { createBrowserRouter, Navigate } from 'react-router-dom';
import { App } from './App';
import { TenantProvider } from './TenantProvider';
import { PortalLayout } from './PortalLayout';
import { ErrorScreen } from './ErrorScreen';
import { ApiProblem } from '../lib/api';
import { AuthProvider } from '../features/auth/AuthProvider';
import { LoginPage } from '../features/auth/LoginPage';
import { RegisterPage } from '../features/auth/RegisterPage';
import { AccountPage } from '../features/auth/AccountPage';
import { PasswordPage } from '../features/auth/PasswordPage';
import { RequirePermission } from '../features/auth/RequirePermission';
import { TenantAccountProvider, ForcePasswordChange } from './AccountBoundary';
import { AdminLayout } from './AdminLayout';
import { SavedListingsPage } from '../features/saved/SavedListingsPage';
import { HostLayout } from '../features/host/HostLayout';
import { ListingsPage } from '../features/host/ListingsPage';
import { ListingForm } from '../features/host/ListingForm';
import { SearchPage } from '../features/portal/SearchPage';
import { ListingPage } from '../features/portal/ListingPage';
export const router = createBrowserRouter([
  { path: '/', element: <App /> },
  {
    path: '/admin', element: <AuthProvider scope={{ realm: 'platform' }}><ForcePasswordChange><AdminLayout /></ForcePasswordChange></AuthProvider>,
    errorElement: <ErrorScreen error={new ApiProblem({ status: 500, code: 'UNEXPECTED_ERROR', message: 'This page could not be displayed. Please reload and try again.', requestId: '' })} />,
    children: [
      { index: true, element: <RequirePermission><AccountPage /></RequirePermission> },
      { path: 'login', element: <LoginPage /> },
      { path: 'account', element: <RequirePermission><AccountPage /></RequirePermission> },
      { path: 'password', element: <PasswordPage /> },
      { path: '*', element: <ErrorScreen error={new ApiProblem({ status: 404, code: 'RESOURCE_NOT_FOUND', message: 'The requested page was not found.', requestId: '' })} /> },
    ],
  },
  {
    path: '/:slug', element: <TenantProvider><TenantAccountProvider><ForcePasswordChange><PortalLayout /></ForcePasswordChange></TenantAccountProvider></TenantProvider>,
    errorElement: <ErrorScreen error={new ApiProblem({ status: 500, code: 'UNEXPECTED_ERROR', message: 'This page could not be displayed. Please reload and try again.', requestId: '' })} />,
    children: [
      { index: true, element: <SearchPage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'account', element: <RequirePermission><AccountPage /></RequirePermission> },
      { path: 'password', element: <PasswordPage /> },
      { path: 'listings/:id', element: <ListingPage /> },
      { path: 'host', element: <HostLayout />, children: [
        { index: true, element: <Navigate to="listings" replace /> },
        { path: 'listings', element: <ListingsPage /> },
        { path: 'listings/new', element: <ListingForm mode="create" /> },
        { path: 'listings/:id', element: <ListingForm mode="edit" /> },
      ] },
      { path: 'saved', element: <RequirePermission permission="saved-listings:manage"><SavedListingsPage /></RequirePermission> },
      { path: '*', element: <ErrorScreen error={new ApiProblem({ status: 404, code: 'RESOURCE_NOT_FOUND', message: 'The requested page was not found.', requestId: '' })} /> },
    ],
  },
]);
