export type ProviderHealth = {
  name: 'KBB' | 'Edmunds' | 'Market comps';
  urlConfigured: boolean;
  ok: boolean;
  statusCode?: number;
  latencyMs?: number;
  error?: string;
};

function timeoutFetch(url: string, ms: number): Promise<Response> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(url)
      .then((res) => {
        clearTimeout(t);
        resolve(res);
      })
      .catch((err) => {
        clearTimeout(t);
        reject(err);
      });
  });
}

async function ping(name: ProviderHealth['name'], url?: string): Promise<ProviderHealth> {
  if (!url) {
    return { name, urlConfigured: false, ok: false, error: 'Not configured' };
  }
  const started = Date.now();
  try {
    const res = await timeoutFetch(url, 4500);
    const latencyMs = Date.now() - started;
    return {
      name,
      urlConfigured: true,
      ok: res.ok,
      statusCode: res.status,
      latencyMs,
      error: res.ok ? undefined : `HTTP ${res.status}`,
    };
  } catch (e) {
    return {
      name,
      urlConfigured: true,
      ok: false,
      latencyMs: Date.now() - started,
      error: e instanceof Error ? e.message : 'Request failed',
    };
  }
}

export async function checkPricingProvidersHealth(): Promise<ProviderHealth[]> {
  const [kbb, edmunds, comps] = await Promise.all([
    ping('KBB', process.env.EXPO_PUBLIC_KBB_API_URL),
    ping('Edmunds', process.env.EXPO_PUBLIC_EDMUNDS_API_URL),
    ping('Market comps', process.env.EXPO_PUBLIC_MARKET_COMPS_API_URL),
  ]);
  return [kbb, edmunds, comps];
}
