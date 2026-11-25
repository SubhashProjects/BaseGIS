export interface NativeSupabaseClient {
  rpc<T = any>(
    functionName: string,
    params?: Record<string, any>
  ): Promise<{ data: T | null; error: any | null }>;

  from(table: string): {
    select(columns?: string): {
      order(
        column: string,
        options?: { ascending?: boolean }
      ): {
        limit(count: number): Promise<{ data: any[] | null; error: any | null }>;
      } & Promise<{ data: any[] | null; error: any | null }>;
    } & Promise<{ data: any[] | null; error: any | null }>;
  };

  functions: {
    invoke<T = any>(
      functionName: string,
      options?: { body?: BodyInit }
    ): Promise<{ data: T | null; error: any | null }>;
  };
}

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.replace(/\/+$/, '');
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const hasSupabase = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase: NativeSupabaseClient | null = hasSupabase
  ? {
      async rpc<T = any>(functionName: string, params?: Record<string, any>) {
        try {
          const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${functionName}`, {
            method: 'POST',
            headers: {
              apikey: supabaseAnonKey!,
              Authorization: `Bearer ${supabaseAnonKey}`,
              'Content-Type': 'application/json',
              Prefer: 'return=representation',
            },
            body: params ? JSON.stringify(params) : '{}',
          });

          if (!res.ok) {
            const errBody = await res.json().catch(() => ({ message: res.statusText }));
            return { data: null, error: errBody };
          }

          const data = (await res.json().catch(() => null)) as T;
          return { data, error: null };
        } catch (err: any) {
          return { data: null, error: err };
        }
      },

      from(table: string) {
        return {
          select(columns = '*') {
            let orderQuery = '';
            let limitQuery = '';

            const execute = async () => {
              try {
                const params = new URLSearchParams();
                params.set('select', columns);
                if (orderQuery) params.set('order', orderQuery);
                if (limitQuery) params.set('limit', limitQuery);

                const res = await fetch(`${supabaseUrl}/rest/v1/${table}?${params.toString()}`, {
                  headers: {
                    apikey: supabaseAnonKey!,
                    Authorization: `Bearer ${supabaseAnonKey}`,
                  },
                });

                if (!res.ok) {
                  const errBody = await res.json().catch(() => ({ message: res.statusText }));
                  return { data: null, error: errBody };
                }

                const data = (await res.json().catch(() => [])) as any[];
                return { data, error: null };
              } catch (err: any) {
                return { data: null, error: err };
              }
            };

            const order = (column: string, options?: { ascending?: boolean }) => {
              const dir = options?.ascending === false ? 'desc' : 'asc';
              orderQuery = `${column}.${dir}`;

              const limit = (count: number) => {
                limitQuery = String(count);
                return execute();
              };

              const promise = execute();
              return Object.assign(promise, { limit });
            };

            const promise = execute();
            return Object.assign(promise, { order });
          },
        };
      },

      functions: {
        async invoke<T = any>(functionName: string, options?: { body?: BodyInit }) {
          try {
            const headers: Record<string, string> = {
              apikey: supabaseAnonKey!,
              Authorization: `Bearer ${supabaseAnonKey}`,
            };
            if (options?.body && !(options.body instanceof FormData)) {
              headers['Content-Type'] = 'application/json';
            }

            const res = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
              method: 'POST',
              headers,
              body: options?.body,
            });

            if (!res.ok) {
              const errBody = await res.json().catch(() => ({ message: res.statusText }));
              return { data: null, error: errBody };
            }

            const data = (await res.json().catch(() => null)) as T;
            return { data, error: null };
          } catch (err: any) {
            return { data: null, error: err };
          }
        },
      },
    }
  : null;
