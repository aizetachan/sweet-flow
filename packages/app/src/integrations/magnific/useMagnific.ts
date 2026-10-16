import { useEffect, useState } from "react";
import { isConnected, onConnectionChange } from "./auth";
import { callTool } from "./mcp";

export interface MagnificAccount {
  connected: boolean;
  name?: string;
  plan?: string;
  credits?: number;
}

/** Last account read, shared by every component; re-read at most once a minute. */
let cached: { at: number; value: MagnificAccount } | null = null;
let loading: Promise<MagnificAccount> | null = null;
const MAX_AGE = 60_000;

async function load(): Promise<MagnificAccount> {
  const [profile, balance] = await Promise.all([callTool("account_profile"), callTool("account_balance")]);
  const p = (profile.data ?? {}) as { displayName?: string; name?: string; email?: string };
  const b = (balance.data ?? {}) as { credits?: { available?: number }; plan?: { productName?: string } };
  return { connected: true, name: p.displayName || p.name || p.email, plan: b.plan?.productName, credits: b.credits?.available };
}

/** This person's Magnific connection, with name, plan and credits once read. */
export function useMagnific(): MagnificAccount {
  const [account, setAccount] = useState<MagnificAccount>(() => (isConnected() ? cached?.value ?? { connected: true } : { connected: false }));
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      if (!isConnected()) {
        cached = null;
        return setAccount({ connected: false });
      }
      if (cached && Date.now() - cached.at < MAX_AGE) return setAccount(cached.value);
      setAccount((a) => (a.connected ? a : { connected: true }));
      loading ??= load()
        .then((value) => ((cached = { at: Date.now(), value }), value))
        .finally(() => (loading = null));
      loading.then((v) => alive && setAccount(v)).catch(() => undefined);
    };
    refresh();
    const off = onConnectionChange(() => {
      cached = null;
      refresh();
    });
    return () => {
      alive = false;
      off();
    };
  }, []);
  return account;
}
