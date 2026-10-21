export const REGISTRY_ADDRESS = "0x26d11ddA633434BF879876bd120f2052765b73fB";
/** The V2 market: payment waits for validators to read the delivery. Every write goes here. */
export const MARKET_ADDRESS = "0x063DE96D0eB06289AF153EDa0Be4BE1F42289820";
/** The V1 market: paid on purchase. Kept for its record, and checked by V2 so no capability is bought twice. */
export const MARKET_V1_ADDRESS = "0x21e6160A6B5166A60B58B5E06C4375d254C81DF8";
export const CHAIN_ID = 61999;

const EXPLORER = "https://explorer-studio.genlayer.com";
export function txUrl(hash: string): string {
  return EXPLORER + "/tx/" + hash;
}
export function addressUrl(addr: string): string {
  return EXPLORER + "/address/" + addr;
}

export const CATEGORIES = [
  "infrastructure",
  "software_license",
  "data_service",
  "marketing",
] as const;

export const RECEIPTS = {
  widening: "0xdceb781183cc166e324f63bbd88fc1a37bb233c6949816220872d385b19168c1",
  adRefusal:
    "0xcf7798c96a777bffbce5f0c8c871043a4bedf7002b21711b9dfeae1db6f36307",
  purchase:
    "0xe4aebd069e6f64408ece709c358fb592805c846a68cd0d990a0212219056ba93",
  replay: "0x6980642b2499790d8144c238cb64e8fe39661b246b609ba9b4c158be1715a986",
  bystanderEscalation:
    "0x93bc59c78451eda85ac579809bb7a4d0420529f1b1e0b2a58ce23070ebcde4cb",
  revoke: "0xaa4467509bfbc5f7572dad10441b6e016346a12640dbbbbcf704f38fdd8d2bf8",
  revokedRequest:
    "0x695ecf8e6e5d8bb39cc8fa467cbb0dcf9f6cb267d9d2230fc9fb913ef2c33dc1",
  refund: "0x8296feaff9f2ebebd87ca2ce770e24a451b31ae46be0f216fd4b2a504897397d",
} as const;

export const REPO_URL = "https://github.com/DaveDave-infosec/Mandate";

export const KNOWN_ACTORS: Record<string, string> = {
  "0x7bbcac9c77aabc2aca19cd34f944fbc015f06a54": "Principal",
  "0xd7cd43cbc01f767a74909943cec29e20db4e7cc3": "Agent A",
  "0x4fb1e8d04735e104a25c2235e29ee2acc045fbe1": "Agent B",
  "0xd5677320cbc9759061bdc753733b14cde0155da1": "Agent C",
  "0x6f838bc9d553ce43b3baa3c8d76041e2324ae5b0": "NodeWorks Cloud",
  "0xcae7b9fb67e4bbf303cd0384bf23843a3810e9e9": "Bystander",
};

export const LIVE_RUN_ROOT = "m_0";

/** The market's issuer: the only address that can mint GEN. */
export const ISSUER = "0x7bbcac9c77aabc2aca19cd34f944fbc015f06a54";
