import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { getToken, setToken as persistToken, clearToken } from '@/store/session';

/**
 * App-wide auth state. Drives the root navigator: a present token routes the
 * user into the authenticated tabs, its absence into the freemium funnel.
 */
interface SessionValue {
  token: string | null;
  ready: boolean;
  signIn: (token: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | undefined>(undefined);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    getToken().then((t) => {
      setTokenState(t);
      setReady(true);
    });
  }, []);

  const signIn = useCallback(async (t: string) => {
    await persistToken(t);
    setTokenState(t);
  }, []);

  const signOut = useCallback(async () => {
    await clearToken();
    setTokenState(null);
  }, []);

  return <SessionContext.Provider value={{ token, ready, signIn, signOut }}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
