import { FhirClientError } from "./fhir.errors";

type FhirMethod = "GET" | "POST" | "PUT";

export interface FhirClient {
  get<TResponse>(path: string): Promise<TResponse>;
  post<TResponse>(path: string, body: unknown): Promise<TResponse>;
  put<TResponse>(path: string, body: unknown): Promise<TResponse>;
}

export interface CreateFhirClientOptions {
  baseUrl: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}

const FHIR_JSON_HEADERS = {
  Accept: "application/fhir+json",
  "Content-Type": "application/fhir+json",
};

async function parseResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return undefined;

  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function normalizeBaseUrl(value: string): URL {
  const normalized = value.trim().replace(/\/$/, "");
  return new URL(`${normalized}/`);
}

function resolveRequestUrl(baseUrl: URL, path: string): URL {
  const candidate = new URL(path.replace(/^\//, ""), baseUrl);

  if (
    candidate.origin !== baseUrl.origin ||
    !candidate.pathname.startsWith(baseUrl.pathname)
  ) {
    throw new Error("FHIR request must stay under the configured endpoint.");
  }

  return candidate;
}

export function createFhirClient(options: CreateFhirClientOptions): FhirClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const fetcher = options.fetcher ?? fetch;
  const timeoutMs = options.timeoutMs ?? 10_000;

  async function request<TResponse>(
    method: FhirMethod,
    path: string,
    body?: unknown,
  ): Promise<TResponse> {
    const requestUrl = resolveRequestUrl(baseUrl, path);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetcher(requestUrl, {
        method,
        headers: FHIR_JSON_HEADERS,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
        signal: controller.signal,
      });
      const parsed = await parseResponse(response);

      if (!response.ok) {
        throw new FhirClientError({
          kind: "http",
          method,
          path,
          status: response.status,
          message: `FHIR request failed with status ${response.status}`,
        });
      }

      return parsed as TResponse;
    } catch (error) {
      if (error instanceof FhirClientError) throw error;

      const timedOut = error instanceof Error && error.name === "AbortError";
      throw new FhirClientError({
        kind: timedOut ? "timeout" : "network",
        method,
        path,
        message: timedOut ? "FHIR request timed out" : "FHIR request failed",
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    get: <TResponse>(path: string) => request<TResponse>("GET", path),
    post: <TResponse>(path: string, body: unknown) =>
      request<TResponse>("POST", path, body),
    put: <TResponse>(path: string, body: unknown) =>
      request<TResponse>("PUT", path, body),
  };
}
