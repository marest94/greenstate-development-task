import { lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { App } from './App';
import { TenantProvider } from './TenantProvider';
import { PortalLayout } from './PortalLayout';
import { ErrorScreen } from './ErrorScreen';
import { ApiProblem } from '../lib/api';
import { AuthProvider } from '../features/auth/AuthProvider';
import { RequirePermission } from '../features/auth/RequirePermission';
import { TenantAccountProvider, ForcePasswordChange } from './AccountBoundary';
import { AdminLayout } from './AdminLayout';
import { HostLayout } from '../features/host/HostLayout';
import { AdminLayout as Administration } from '../features/admin/AdminLayout';

const LoginPage = lazy(() => import('../features/auth/LoginPage').then(module => ({ default: module.LoginPage })));
const RegisterPage = lazy(() => import('../features/auth/RegisterPage').then(module => ({ default: module.RegisterPage })));
const AccountPage = lazy(() => import('../features/auth/AccountPage').then(module => ({ default: module.AccountPage })));
const PasswordPage = lazy(() => import('../features/auth/PasswordPage').then(module => ({ default: module.PasswordPage })));
const SavedListingsPage = lazy(() => import('../features/saved/SavedListingsPage').then(module => ({ default: module.SavedListingsPage })));
const ListingsPage = lazy(() => import('../features/host/ListingsPage').then(module => ({ default: module.ListingsPage })));
const ListingForm = lazy(() => import('../features/host/ListingForm').then(module => ({ default: module.ListingForm })));
const PortfolioCalendarPage = lazy(() => import('../features/host/PortfolioCalendarPage').then(module => ({ default: module.PortfolioCalendarPage })));
const CalendarPage = lazy(() => import('../features/host/CalendarPage').then(module => ({ default: module.CalendarPage })));
const BookingsPage = lazy(() => import('../features/host/BookingsPage').then(module => ({ default: module.BookingsPage })));
const TenantsPage = lazy(() => import('../features/admin/TenantsPage').then(module => ({ default: module.TenantsPage })));
const TenantForm = lazy(() => import('../features/admin/TenantForm').then(module => ({ default: module.TenantForm })));
const AccountsPage = lazy(() => import('../features/admin/AccountsPage').then(module => ({ default: module.AccountsPage })));
const SearchPage = lazy(() => import('../features/portal/SearchPage').then(module => ({ default: module.SearchPage })));
const ListingPage = lazy(() => import('../features/portal/ListingPage').then(module => ({ default: module.ListingPage })));
export const router = createBrowserRouter([
  { path: '/', element: <App /> },
  {
    path: '/admin', element: <AuthProvider scope={{ realm: 'platform' }}><ForcePasswordChange><AdminLayout /></ForcePasswordChange></AuthProvider>,
    errorElement: <ErrorScreen error={new ApiProblem({ status: 500, code: 'UNEXPECTED_ERROR', message: 'This page could not be displayed. Please reload and try again.', requestId: '' })} />,
    children: [
      { index: true, element: <RequirePermission><Navigate to="tenants" replace /></RequirePermission> },
      { element: <Administration />, children: [
        { path: 'tenants', element: <TenantsPage /> },
        { path: 'tenants/new', element: <TenantForm mode="create" /> },
        { path: 'tenants/:tenantId', element: <TenantForm mode="edit" /> },
        { path: 'tenants/:tenantId/accounts', element: <AccountsPage /> },
      ] },
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
        { path: 'calendar', element: <PortfolioCalendarPage /> },
        { path: 'listings/new', element: <ListingForm mode="create" /> },
        { path: 'listings/:id', element: <ListingForm mode="edit" /> },
        { path: 'listings/:id/calendar', element: <CalendarPage /> },
        { path: 'bookings', element: <BookingsPage /> },
      ] },
      { path: 'saved', element: <RequirePermission permission="saved-listings:manage"><SavedListingsPage /></RequirePermission> },
      { path: '*', element: <ErrorScreen error={new ApiProblem({ status: 404, code: 'RESOURCE_NOT_FOUND', message: 'The requested page was not found.', requestId: '' })} /> },
    ],
  },
]);
