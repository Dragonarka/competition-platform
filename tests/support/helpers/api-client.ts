const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export interface ApiClientOptions {
  clerkToken?: string;
  judgeToken?: string;
}

export class ApiClient {
  constructor(private readonly opts: ApiClientOptions = {}) {}

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.opts.clerkToken) h['Authorization'] = `Bearer ${this.opts.clerkToken}`;
    return h;
  }

  async trpcQuery<T>(procedure: string, input?: unknown): Promise<T> {
    const url = new URL(`/trpc/${procedure}`, API_URL);
    if (input !== undefined) {
      url.searchParams.set('input', JSON.stringify(input));
    }
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`tRPC query ${procedure} failed: ${res.status} ${res.statusText}`);
    const body = (await res.json()) as { result?: { data?: T }; error?: { message: string } };
    if (body.error) throw new Error(`tRPC query ${procedure} error: ${body.error.message}`);
    return body.result!.data!;
  }

  async trpcMutation<T>(procedure: string, input: unknown): Promise<T> {
    const url = new URL(`/trpc/${procedure}`, API_URL);
    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(input),
    });
    if (!res.ok)
      throw new Error(`tRPC mutation ${procedure} failed: ${res.status} ${res.statusText}`);
    const body = (await res.json()) as { result?: { data?: T }; error?: { message: string } };
    if (body.error) throw new Error(`tRPC mutation ${procedure} error: ${body.error.message}`);
    return body.result!.data!;
  }

  async health(): Promise<boolean> {
    try {
      const res = await fetch(new URL('/health', API_URL));
      return res.ok;
    } catch {
      return false;
    }
  }
}
