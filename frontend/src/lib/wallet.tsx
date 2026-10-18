import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createAccount, createClient, generatePrivateKey } from "genlayer-js";
import { studionet } from "genlayer-js/chains";
import { CHAIN_ID } from "./contracts";

type GenClient = ReturnType<typeof createClient>;

export type WalletKind = "session" | "metamask";

export interface ActiveWallet {
  kind: WalletKind;
  label: string;
  address: string;
}

export interface SlotWallet {
  label: string;
  privateKey: string;
  address: string;
}

export const SLOT_LABELS = [
  "Principal",
  "Agent A",
  "Agent B",
  "Agent C",
  "Vendor",
  "Bystander",
] as const;

export type SlotLabel = (typeof SLOT_LABELS)[number];

const STORAGE_KEY = "mandate.sessionWallets.v1";
const MM_MESSAGE = "Use a session wallet, or install the GenLayer Snap for MetaMask.";
const CHAIN_ID_HEX = "0x" + CHAIN_ID.toString(16).toLowerCase();
const STUDIO_RPC = "https://studio.genlayer.com/api";

// In-memory mirror so the app keeps working when localStorage is blocked.
const memoryWallets: SlotWallet[] = [];

// Module-level mirror of provider state. writes.ts reads it without hooks.
const walletState: { slots: SlotWallet[]; active: ActiveWallet | null } = {
  slots: [],
  active: null,
};

const sessionClients = new Map<string, GenClient>();
let metamaskClient: { address: string; client: GenClient } | null = null;
let metamaskProvider: InjectedProvider | null = null;

interface InjectedProvider {
  request(args: { method: string; params?: unknown[] | Record<string, unknown> }): Promise<unknown>;
  isMetaMask?: boolean;
}

interface Eip6963ProviderInfo {
  uuid: string;
  name: string;
  icon: string;
  rdns: string;
}

interface Eip6963Detail {
  info: Eip6963ProviderInfo;
  provider: InjectedProvider;
}

const MM_NOT_FOUND = "MetaMask was not found in this browser. Use a session wallet.";
const MM_TIMEOUT =
  "MetaMask did not respond. Open the MetaMask extension, unlock it, and try again, or use a session wallet.";

function ethereum(): InjectedProvider | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { ethereum?: InjectedProvider }).ethereum;
}

async function discoverMetaMask(): Promise<InjectedProvider | null> {
  const eth = ethereum();
  if (eth === undefined) {
    return null;
  }
  const found: InjectedProvider[] = [];
  const onAnnounce = (event: Event): void => {
    const detail = (event as CustomEvent).detail;
    if (!detail || typeof detail !== "object") return;
    const info = (detail as Eip6963Detail).info;
    const provider = (detail as Eip6963Detail).provider;
    if (!info || typeof info.rdns !== "string") return;
    if (!provider || typeof provider.request !== "function") return;
    if (info.rdns === "io.metamask") {
      found.push(provider);
    }
  };
  window.addEventListener("eip6963:announceProvider", onAnnounce);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  await new Promise((resolve) => setTimeout(resolve, 400));
  window.removeEventListener("eip6963:announceProvider", onAnnounce);
  if (found.length > 0) {
    return found[0];
  }
  const raw = eth as unknown as { providers?: InjectedProvider[] };
  if (Array.isArray(raw.providers)) {
    const mm = raw.providers.find((p) => p && p.isMetaMask === true);
    if (mm) {
      return mm;
    }
  }
  if (eth.isMetaMask === true) {
    return eth;
  }
  return null;
}

function withTimeout<T>(task: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(MM_TIMEOUT)), 30_000);
    task.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

function isSlotWallet(value: unknown): value is SlotWallet {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.label === "string" &&
    typeof v.privateKey === "string" &&
    typeof v.address === "string"
  );
}

function loadWallets(): SlotWallet[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSlotWallet);
  } catch {
    return memoryWallets.slice();
  }
}

function persistWallets(list: SlotWallet[]): void {
  memoryWallets.length = 0;
  memoryWallets.push(...list);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // storage blocked: keep the in-memory copy only
  }
}

function sessionClientFor(slot: SlotWallet): GenClient {
  let c = sessionClients.get(slot.label);
  if (!c) {
    c = createClient({
      chain: studionet,
      account: createAccount(slot.privateKey as `0x${string}`),
    });
    sessionClients.set(slot.label, c);
  }
  return c;
}

export function getActiveClient(): GenClient {
  const active = walletState.active;
  if (!active) {
    throw new Error("No active wallet. Create or select a wallet slot first.");
  }
  if (active.kind === "metamask") {
    const eth = metamaskProvider ?? ethereum();
    if (!eth) throw new Error(MM_MESSAGE);
    if (!metamaskClient || metamaskClient.address !== active.address) {
      metamaskClient = {
        address: active.address,
        client: createClient({
          chain: studionet,
          account: active.address as `0x${string}`,
          provider: eth as never,
        }),
      };
    }
    return metamaskClient.client;
  }
  const slot = walletState.slots.find((w) => w.label === active.label);
  if (!slot) {
    throw new Error(`Wallet slot "${active.label}" is missing.`);
  }
  return sessionClientFor(slot);
}

export function getActiveAddressLower(): string {
  const active = walletState.active;
  if (!active) {
    throw new Error("No active wallet. Create or select a wallet slot first.");
  }
  return active.address.toLowerCase();
}

interface WalletContextValue {
  wallets: SlotWallet[];
  active: ActiveWallet | null;
  hasMetaMask: boolean;
  connecting: boolean;
  walletError: string;
  selectWallet(label: SlotLabel): void;
  /** Creates a session wallet. It becomes the signer unless activate is false. Returns its address. */
  createWallet(label: SlotLabel, activate?: boolean): string;
  connectMetaMask(): void;
  activeClient(): GenClient;
}

const WalletContext = createContext<WalletContextValue | null>(null);

async function metamaskAddressFrom(eth: InjectedProvider): Promise<string> {
  let switched = false;
  try {
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN_ID_HEX }],
    });
    switched = true;
  } catch (switchErr) {
    const code = (switchErr as { code?: unknown }).code;
    if (code !== 4902 && code !== -32603) {
      throw switchErr;
    }
    await eth.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: CHAIN_ID_HEX,
          chainName: "GenLayer Studio",
          rpcUrls: [STUDIO_RPC],
          nativeCurrency: { name: "GEN Token", symbol: "GEN", decimals: 18 },
        },
      ],
    });
    await eth.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: CHAIN_ID_HEX }],
    });
    switched = true;
  }
  if (!switched) throw new Error(MM_MESSAGE);
  const accounts = (await eth.request({
    method: "eth_requestAccounts",
    params: [],
  })) as unknown;
  if (!Array.isArray(accounts) || accounts.length === 0 || typeof accounts[0] !== "string") {
    throw new Error(MM_MESSAGE);
  }
  return accounts[0];
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallets, setWallets] = useState<SlotWallet[]>(() => loadWallets());
  const [active, setActive] = useState<ActiveWallet | null>(null);
  const [walletError, setWalletError] = useState("");
  const [connecting, setConnecting] = useState(false);
  const hasMetaMask = Boolean(ethereum());

  useEffect(() => {
    walletState.slots = wallets;
    walletState.active = active;
  }, [wallets, active]);

  const persist = useCallback((next: SlotWallet[]) => {
    setWallets(next);
    walletState.slots = next;
    persistWallets(next);
  }, []);

  const createWallet = useCallback(
    (label: SlotLabel, activate = true) => {
      const privateKey = generatePrivateKey();
      const account = createAccount(privateKey);
      const slot: SlotWallet = { label, privateKey, address: account.address };
      const next = [...walletState.slots.filter((w) => w.label !== label), slot];
      const chosen: ActiveWallet = {
        kind: "session",
        label,
        address: account.address,
      };
      if (activate) {
        walletState.active = chosen;
        setActive(chosen);
      }
      setWalletError("");
      persist(next);
      return account.address;
    },
    [persist]
  );

  const selectWallet = useCallback((label: SlotLabel) => {
    const slot = walletState.slots.find((w) => w.label === label);
    if (!slot) return;
    const chosen: ActiveWallet = {
      kind: "session",
      label: slot.label,
      address: slot.address,
    };
    walletState.active = chosen;
    setActive(chosen);
    setWalletError("");
  }, []);

  const connectMetaMask = useCallback(() => {
    setConnecting(true);
    setWalletError("");
    void (async () => {
      try {
        const provider = await discoverMetaMask();
        if (!provider) {
          setWalletError(MM_NOT_FOUND);
          return;
        }
        metamaskProvider = provider;
        const address = await withTimeout(metamaskAddressFrom(provider));
        const chosen: ActiveWallet = {
          kind: "metamask",
          label: "MetaMask",
          address,
        };
        walletState.active = chosen;
        setActive(chosen);
        setWalletError("");
      } catch (err) {
        console.error(err);
        setWalletError(err instanceof Error && err.message !== "" ? err.message : MM_MESSAGE);
      } finally {
        setConnecting(false);
      }
    })();
  }, []);

  const value = useMemo<WalletContextValue>(
    () => ({
      wallets,
      active,
      hasMetaMask,
      connecting,
      walletError,
      selectWallet,
      createWallet,
      connectMetaMask,
      activeClient: getActiveClient,
    }),
    [wallets, active, hasMetaMask, connecting, walletError, selectWallet, createWallet, connectMetaMask]
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}
