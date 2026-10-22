export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const formData = options.body instanceof FormData;
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: 'include',
    headers: { ...(formData ? {} : { 'Content-Type': 'application/json' }), ...options.headers },
  });
  const body = await response
    .json()
    .catch(() => ({ message: 'O servidor não respondeu. Verifique sua conexão.' }));
  let result: T;
  if (response.ok) {
    result = body as T;
  } else {
    throw new ApiError(body.message || 'Não foi possível concluir a operação.', response.status);
  }
  return result;
}
