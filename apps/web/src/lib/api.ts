import { ApiErrorSchema, type ApiError } from '@greenstate/contracts';
export class ApiProblem extends Error implements ApiError {
  readonly status: number; readonly code: string; readonly requestId: string;
  readonly fields?: ApiError['fields'];
  constructor(problem: ApiError, readonly retryAfter?: number) {
    super(problem.message); this.name = 'ApiProblem'; this.status = problem.status;
    this.code = problem.code; this.requestId = problem.requestId; this.fields = problem.fields;
  }
}
type Schema<T> = { parse: (value: unknown) => T };
// Capture the account generation when a request starts, so late failures cannot sign out a newer account.
type ProblemCapture = (path: string) => ((problem: ApiProblem) => void) | undefined;
const authenticationProblems = new Set<ProblemCapture>();
export function subscribeAuthenticationProblems(capture: ProblemCapture) { authenticationProblems.add(capture); return () => { authenticationProblems.delete(capture); }; }
async function send<T>(path: string, options: RequestInit, schema?: Schema<T>): Promise<T> {
  const handlers = [...authenticationProblems].map(capture => capture(path));
  let response: Response;
  try { response = await fetch(`/api/v1${path}`, options); }
  catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiProblem({ status: 0, code: 'NETWORK_ERROR', message: 'The rental service could not be reached. Please try again.', requestId: '' });
  }
  let body: unknown;
  try { body = response.status === 204 ? undefined : await response.json(); } catch { body = null; }
  if (!response.ok) {
    const parsed = ApiErrorSchema.safeParse(body); const retry = Number(response.headers.get('Retry-After'));
    const problem = new ApiProblem(parsed.success ? parsed.data : { status: response.status, code: 'SERVICE_UNAVAILABLE', message: 'The rental service is currently unavailable. Please try again.', requestId: response.headers.get('x-request-id') ?? '' }, Number.isFinite(retry) && retry > 0 ? retry : undefined);
    if (problem.status === 401 || problem.code === 'PASSWORD_CHANGE_REQUIRED') for (const handler of handlers) handler?.(problem);
    throw problem;
  }
  try { return schema ? schema.parse(body) : body as T; }
  catch { throw new ApiProblem({ status: response.status, code: 'INVALID_RESPONSE', message: 'The rental service returned an invalid response. Please try again.', requestId: response.headers.get('x-request-id') ?? '' }); }
}
function mutation(method: string) {
  return <T = void>(path: string, body?: unknown, schema?: Schema<T>, signal?: AbortSignal): Promise<T> => send(path, {
    method, credentials: 'same-origin', headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Requested-By': 'greenstate-web' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }), ...(signal ? { signal } : {}),
  }, schema);
}
export const api = {
  get<T>(path: string, query?: Record<string, unknown>, schema?: Schema<T>, signal?: AbortSignal): Promise<T> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) if (value !== undefined && value !== null) params.set(key, String(value));
    const suffix = params.size ? `?${params}` : '';
    return send(`${path}${suffix}`, { credentials: 'same-origin', headers: { Accept: 'application/json' }, ...(signal ? { signal } : {}) }, schema);
  },
  post: mutation('POST'), put: mutation('PUT'), patch: mutation('PATCH'), delete: mutation('DELETE'),
};
