import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

/**
 * Pull the server's own `message` out of an error thrown by throwIfResNotOk.
 *
 * That function formats failures as `<status>: <raw body>`, and the body is
 * normally the JSON a route returned — so `error.message` is a string like
 *   400: {"message":"Student gender is required","errors":[...]}
 * Rendering it directly, which every onError handler in AdminOrganizations was
 * doing, shows the status code and the raw JSON to the admin.
 *
 * Lives next to throwIfResNotOk on purpose: this parses exactly what that
 * formats, and the two have to agree.
 *
 * Returns null — not a fallback string — when there is nothing worth showing, so
 * the caller supplies its own localized default. Deliberately refuses a
 * non-JSON body that is long or looks like markup: a proxy's HTML 502 page is
 * worse than a generic message.
 */
export function serverErrorMessage(error: unknown): string | null {
  if (!(error instanceof Error) || !error.message) return null;

  const withoutStatus = error.message.match(/^\d{3}: ([\s\S]*)$/);
  const body = (withoutStatus ? withoutStatus[1] : error.message).trim();
  if (!body) return null;

  if (body.startsWith("{")) {
    try {
      const parsed = JSON.parse(body);
      const message = parsed?.message;
      return typeof message === "string" && message.trim() ? message.trim() : null;
    } catch {
      return null;
    }
  }

  return body.length <= 200 && !body.startsWith("<") ? body : null;
}

function getCsrfToken(): string | null {
  const match = document.cookie.match(/csrf_token=([^;]+)/);
  return match ? match[1] : null;
}

function getAcceptLanguage(): string {
  try {
    const stored = localStorage.getItem("fp_language");
    return stored === "ar" ? "ar" : "en";
  } catch {
    return "en";
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const headers: Record<string, string> = {};
  
  if (data) {
    headers["Content-Type"] = "application/json";
  }
  
  const csrfToken = getCsrfToken();
  if (csrfToken && !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) {
    headers["x-csrf-token"] = csrfToken;
  }

  headers["Accept-Language"] = getAcceptLanguage();
  
  const res = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
      headers: { "Accept-Language": getAcceptLanguage() },
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes — prevents stale data; use Infinity per-query for truly static data
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
