import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { invalidateCache } from "./rpc";
import { initialStore, refreshLive, type Store } from "./store";

interface StoreContextValue {
  store: Store;
  refreshing: boolean;
  lastRefreshed: Date | null;
  error: string;
  refresh(): void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [store, setStore] = useState<Store>(() => initialStore());
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [error, setError] = useState("");
  const storeRef = useRef<Store>(store);
  const runRef = useRef(0);

  const refresh = useCallback(() => {
    runRef.current += 1;
    const run = runRef.current;
    invalidateCache();
    setRefreshing(true);
    setError("");
    refreshLive(storeRef.current)
      .then((next) => {
        if (run !== runRef.current) return;
        storeRef.current = next;
        setStore(next);
        setLastRefreshed(new Date());
      })
      .catch((e: unknown) => {
        if (run !== runRef.current) return;
        console.error(e);
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (run === runRef.current) setRefreshing(false);
      });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <StoreContext.Provider value={{ store, refreshing, lastRefreshed, error, refresh }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore(): StoreContextValue {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used within StoreProvider");
  return ctx;
}
