/**
 * Odoo connector — CRM/ERP over Odoo's standard JSON-RPC API
 * (https://www.odoo.com/documentation/latest/developer/reference/external_api.html).
 * Authenticates via `common.login`, then counts CRM leads via
 * `object.execute_kw` to prove real read access — never a fake "connected".
 */
import type { ConnectorStatus } from '@/lib/connectors/types';

type OdooEnv = Record<string, string | undefined>;

async function jsonRpc(baseUrl: string, service: string, method: string, args: unknown[]): Promise<unknown> {
  const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/jsonrpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args }, id: null }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { result?: unknown; error?: { message?: string; data?: { message?: string } } };
  if (body.error) throw new Error(body.error.data?.message ?? body.error.message ?? 'Odoo RPC error');
  return body.result;
}

export async function odooStatus(env: OdooEnv = process.env): Promise<ConnectorStatus> {
  const base = { id: 'odoo', name: 'Odoo (CRM)', kind: 'crm' } as const;
  const url = env.ODOO_URL;
  const db = env.ODOO_DB;
  const username = env.ODOO_USERNAME;
  const apiKey = env.ODOO_API_KEY;
  if (!url || !db || !username || !apiKey) {
    return {
      ...base,
      state: 'not_configured',
      detail: 'Set ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_API_KEY in .env.local.',
    };
  }
  try {
    const uid = await jsonRpc(url, 'common', 'login', [db, username, apiKey]);
    if (!uid || typeof uid !== 'number') throw new Error('authentication rejected');
    const leadCount = await jsonRpc(url, 'object', 'execute_kw', [
      db,
      uid,
      apiKey,
      'crm.lead',
      'search_count',
      [[]],
    ]).catch(() => null);
    return {
      ...base,
      state: 'connected',
      detail:
        typeof leadCount === 'number'
          ? `Authenticated as ${username} · ${leadCount} CRM leads on record`
          : `Authenticated as ${username} (CRM module not reachable)`,
      meta: typeof leadCount === 'number' ? { leads: leadCount } : undefined,
    };
  } catch (err) {
    return {
      ...base,
      state: 'error',
      detail: `Credentials found but login failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
