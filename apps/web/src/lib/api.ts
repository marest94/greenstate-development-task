import { ApiErrorSchema, type ApiError } from '@greenstate/contracts';
export class ApiProblem extends Error implements ApiError {
  readonly status: number; readonly code: string; readonly requestId: string;
  readonly fields?: ApiError['fields'];
  constructor(problem: ApiError) {
    super(problem.message); this.name = 'ApiProblem'; this.status = problem.status;
    this.code = problem.code; this.requestId = problem.requestId; this.fields = problem.fields;
  }
}
export const api = {
  async get<T>(path: string, query?: Record<string, unknown>, schema?: { parse: (value: unknown) => T }): Promise<T> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) if (value !== undefined && value !== null) params.set(key, String(value));
    const suffix = params.size ? `?${params}` : '';
    let response: Response;
    try { response = await fetch(`/api/v1${path}${suffix}`, { credentials: 'same-origin', headers: { Accept: 'application/json' } }); }
    catch { throw new ApiProblem({ status: 0, code: 'NETWORK_ERROR', message: 'The rental service could not be reached. Please try again.', requestId: '' }); }
    let body: unknown;
    try { body = await response.json(); } catch { body = null; }
    if (!response.ok) {
      const problem = ApiErrorSchema.safeParse(body);
      throw new ApiProblem(problem.success ? problem.data : { status: response.status, code: 'SERVICE_UNAVAILABLE', message: 'The rental service is currently unavailable. Please try again.', requestId: response.headers.get('x-request-id') ?? '' });
    }
    try { return schema ? schema.parse(body) : body as T; }
    catch { throw new ApiProblem({ status: response.status, code: 'INVALID_RESPONSE', message: 'The rental service returned an invalid response. Please try again.', requestId: response.headers.get('x-request-id') ?? '' }); }
  },
};
