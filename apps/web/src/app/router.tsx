import { createBrowserRouter } from 'react-router-dom';
import { App } from './App';
import { TenantProvider } from './TenantProvider';
import { PortalLayout } from './PortalLayout';
import { ErrorScreen } from './ErrorScreen';
import { ApiProblem } from '../lib/api';
import { SearchPage } from '../features/portal/SearchPage';
import { ListingPage } from '../features/portal/ListingPage';
export const router = createBrowserRouter([
  { path: '/', element: <App /> },
  {
    path: '/:slug', element: <TenantProvider><PortalLayout /></TenantProvider>,
    errorElement: <ErrorScreen error={new ApiProblem({ status: 500, code: 'UNEXPECTED_ERROR', message: 'This page could not be displayed. Please reload and try again.', requestId: '' })} />,
    children: [
      { index: true, element: <SearchPage /> },
      { path: 'listings/:id', element: <ListingPage /> },
      { path: '*', element: <ErrorScreen error={new ApiProblem({ status: 404, code: 'RESOURCE_NOT_FOUND', message: 'The requested page was not found.', requestId: '' })} /> },
    ],
  },
]);
