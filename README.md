# Mandate

**Your agent cannot give away more power than you gave it.**

Non-expanding authority for agent delegation chains, on GenLayer.

**Live app:** https://mandate-genlayer.vercel.app (the console is at [/console](https://mandate-genlayer.vercel.app/console), with a [guide](https://mandate-genlayer.vercel.app/guide)).

**V2: payment waits for validators to read the delivery.** A purchase holds the price. The vendor commits a SHA-256 of what it delivers; validators fetch it once, check it, and store it on-chain, and every review reads that stored copy. They grade it full, most, half or none against the vendor's own listing and every mandate in the chain. Code splits the money exactly. Any wallet in the chain, or the vendor, gets one written challenge. Every deadline and window runs on chain time. V2 runs on its own registry, so no capability or budget is shared with any other market. See [V2](#v2-delivery-verification).

## The problem

- Agents are starting to hire other agents. A human signs the first instruction. By the third hop, nobody has checked whether a sub-mandate quietly added authority.
- Capability systems such as UCAN, macaroons and ZCAP attenuate structured caveats: amounts, expiry, resource lists. They cannot tell whether a plain-language sub-mandate preserves the restrictions of the one above it.
- Mandate closes that gap. Code checks the numbers. GenLayer validators check the words.
- Without GenLayer, either one operator decides which delegations are valid, or plain-language restrictions go unenforced.

## How it works

1. A human issues a root mandate in plain language, with structured caveats: a spend cap, an expiry, allowed categories, allowed vendors. The human funds it in escrow.
2. The agent holding a mandate can delegate a narrower one to another agent, up to 3 hops below the human.
3. Every delegation passes code checks first. If the text is identical to the parent, it is approved by hash with no validator call. If the text changed, validators read the whole chain from the root down and decide: narrower, widens, or unclear.
4. To buy something, an agent names a catalog item id. The item text comes from the vendor's listing on-chain, never from the agent asking. Validators decide whether that item fits every mandate in the chain: authorized, outside_scope, or unclear.
5. An authorized purchase becomes a single-use capability. The market re-checks the whole chain and the budget at every hop on chain time, charges every hop, and holds the price out of the root's escrow. Nobody is paid yet.
6. The vendor submits one URL and the SHA-256 of the file. Validators fetch it once, agree on the exact bytes, check the hash and store the content on-chain. Every review reads that stored copy and grades it: full, most, half or none. A delivery that breaks any restriction in any mandate is none, even when it matches the listing. Unclear is held until anyone forces a final review.
7. A decided band is open to one written challenge for a fixed window: from any wallet in the chain arguing for a lower band, or from the vendor arguing for a higher one. Validators re-read the delivery with the challenge as quoted argument and must decide, which settles at once. With no challenge, anyone settles after the window. A missed delivery deadline refunds everything in code.
8. Any grantor can revoke. Revocation never touches descendants; they die through the chain walk.

## The honest boundary

| Decided in code | Decided by validators |
|-----------------|-----------------------|
| Spend cap never exceeds the parent | Does a changed child mandate preserve every restriction above it (the full chain, not just the parent) |
| Expiry never outlives the parent | Does the vendor's actual catalog item fit the scope and restrictions of every mandate in the chain |
| Categories and vendors only narrow | V2: how much of its listing did the vendor actually deliver, read from the delivery itself, and does the delivery break any mandate in the chain |
| Price held at purchase, never paid on purchase (V2) | V2: does a written challenge, checked against the delivery, change the band |
| Delivery deadline and challenge window on chain time (V2) | |
| Vendor share plus refund always equals the price, every hop restored (V2) | |
| Missed delivery deadline refunds in full (V2) | |
| Delivered bytes must match the vendor's committed SHA-256 (V2) | |
| Each market reads only its own registry, so nothing is shared across purchase paths (V2) | |
| Depth limit of 3 | |
| No delegation loops | |
| Identical text approved by hash | |
| Item category, vendor and price checked at every hop | |
| Repeat request for an already authorized item issued by precedent | |
| Revocation enforced by chain walk | |
| Budget enforced at execution at every hop | |
| Capabilities are single use | |

Every code row is backed by a test that also proves no validator was consulted. See TESTING.md.

## Safety rules

- Unclear verdicts are HELD, never approved. A held mandate cannot delegate or buy.
- Anyone can escalate a held record once. The forcing pass must decide, and "unresolved" defaults to REFUSED: authority is not granted.
- Nobody, including the deployer, can approve a delegation or issue a capability by hand. There is no setter. The write surface is pinned by tests: 8 methods on the registry, 4 on the market.
- The requesting agent never describes its purchase. Validators judge the vendor's own listing.
- Mandate and catalog text are passed to validators as quoted data, with the quoting markers stripped from the text so they cannot be forged.
- An identical delegation or a refused item cannot be resubmitted to farm a different verdict.
- V2: an unclear delivery holds the money. An unresolved forcing review or challenge review pays the vendor nothing.
- V2: a challenge is passed to validators as an argument, never as evidence. They check each claim against the stored delivery.
- V2: a delivery is bound to the vendor's committed SHA-256. Bytes that do not match revert. Every review reads the stored copy, never the URL again.
- V2: one delivery and one challenge per purchase. The write surface of the V2 market is pinned at nine methods, and not one of them accepts a time from the caller.

## Live proof run

Run on GenLayer Studio (chain 61999) on 17 October 2026. Every row is readable on-chain and asserted by tests/test_onchain.py.

| # | Step | Record | Outcome | Receipt |
|---|------|--------|---------|---------|
| 1 | Human issues the root to Agent A: "Buy development infrastructure for the testnet launch, up to 5 GEN. No marketing services. Never send funds to personal wallets." | m_0 | ACTIVE, funded with 5 GEN | |
| 2 | Agent A delegates to B: "Handle hosting and build tooling for the launch." | m_1 | narrower, ACTIVE | |
| 3 | Agent B tries: "Handle hosting, and also help the project grow its audience." | m_2 | widens, REFUSED. Violated: "No marketing services." | [tx](https://explorer-studio.genlayer.com/tx/0xdceb781183cc166e324f63bbd88fc1a37bb233c6949816220872d385b19168c1) |
| 4 | Agent B delegates properly: "Secure node hosting for the launch." | m_3 | narrower, ACTIVE | |
| 5 | Agent C asks for the "Ad campaign package" (category marketing, allowed in code at every hop) | c_0 | outside_scope, REFUSED on the vendor's own description | [tx](https://explorer-studio.genlayer.com/tx/0xcf7798c96a777bffbce5f0c8c871043a4bedf7002b21711b9dfeae1db6f36307) |
| 6 | Agent C asks for "Managed node hosting, 30 days" and buys it | c_1, pur_0 | authorized, purchased, vendor paid 2 GEN | [tx](https://explorer-studio.genlayer.com/tx/0xe4aebd069e6f64408ece709c358fb592805c846a68cd0d990a0212219056ba93) |
| 7 | Agent C replays the same capability | c_1 | reverted: "capability already used", nothing moved | [tx](https://explorer-studio.genlayer.com/tx/0x6980642b2499790d8144c238cb64e8fe39661b246b609ba9b4c158be1715a986) |
| 8 | A bystander with no role escalates a held mandate | m_6 | unclear, then unresolved, REFUSED | [tx](https://explorer-studio.genlayer.com/tx/0x93bc59c78451eda85ac579809bb7a4d0420529f1b1e0b2a58ce23070ebcde4cb) |
| 9 | The human revokes the root | m_0 | REVOKED. m_3 still reads ACTIVE, yet is_chain_valid("m_3") is false | [tx](https://explorer-studio.genlayer.com/tx/0xaa4467509bfbc5f7572dad10441b6e016346a12640dbbbbcf704f38fdd8d2bf8) |
| 10 | Agent C requests under the dead chain | m_3 | reverted in code: "chain contains an inactive mandate" | [tx](https://explorer-studio.genlayer.com/tx/0x695ecf8e6e5d8bb39cc8fa467cbb0dcf9f6cb267d9d2230fc9fb913ef2c33dc1) |
| 11 | The human reclaims unspent escrow | m_0 | 3 GEN refunded. Principal 18 + vendor 2 + vault 0 = 20 minted | [tx](https://explorer-studio.genlayer.com/tx/0x8296feaff9f2ebebd87ca2ce770e24a451b31ae46be0f216fd4b2a504897397d) |

Drift is caught at every hop, not only against the root. Two further attempts under Agent A's mandate (m_4: a public landing page; m_5: helping testers get started) were refused citing Agent A's own clause, "Handle hosting and build tooling for the launch."

## A second run, entirely from the console

On 18 October 2026 a fresh chain was driven end to end from the web console, using browser session wallets and MetaMask. Every record is readable on the registry.

| Step | Record | Outcome |
|------|--------|---------|
| A human issues a root: "Buy research data for the market report, up to 3 GEN. No advertising. Only reputable data providers." | m_7 | ACTIVE |
| Agent A tries: "Buy research data for the market report, and run a small promoted post to announce it." | m_8 | widens, REFUSED. Violated: "No advertising." |
| A new vendor, Northfield Data, registers and lists a licensed consumer electronics dataset | item_3 | listed, immutable |
| Agent A asks to buy it | c_2 | authorized on the vendor's own listing, with the dissent that reputation cannot be verified from a listing alone |
| Agent A tries to buy before the escrow is funded | c_2 | reverted: "root escrow insufficient", nothing moved |
| The issuer mints, the principal funds the escrow, Agent A buys | pur_1 | vendor paid 2 GEN from the root's escrow |

## V2: delivery verification

V1 judged the vendor's listing and paid the moment an agent bought. Nothing checked what the vendor delivered. V2 closes that gap with three mechanisms in a new market, on a registry of its own.

1. **Validators read the delivery, bound to stable content.** The price is held at purchase. The vendor submits one URL and the SHA-256 of the file. Validators fetch it once and must agree on the exact bytes (`strict_eq`), which must hash to the commitment, or the delivery reverts with nothing recorded. The content is stored on-chain. The first review, any forcing review and any challenge all read that stored copy, never the URL again, so a changed or unavailable URL changes nothing. Deliveries are capped at 16000 bytes so the stored copy and its hash cover all of it.
2. **Partial settlement.** Bands are full (100%), most (75%), half (50%) and none (0%). Code pays the vendor its share and returns the rest to the root's escrow and to every hop's budget. Paid plus refunded always equals the price.
3. **The chain gets a voice, on chain time.** A decided band opens a challenge window. Any wallet in the chain can argue the band down, and the vendor can argue it up, once per purchase. Validators treat the challenge as an argument, never as evidence. Every deadline, window and expiry in the market uses the transaction's own timestamp, set by consensus.

**One registry per market.** The deployed V1 market can never be changed, and it is bound by its constructor to the V1 registry. V2 therefore runs on a fresh registry that only the V2 market reads. No capability, mandate or budget is shared between any two markets, in either direction. Tests drive both markets against two registries at distinct addresses: buying in V2 and then attempting V1, and the reverse, each fail to find or charge anything in the other.

### V2 live proof run

Run from the deployed console on 22 October 2026, on the V2 registry. Root m_0 (Principal to Agent A): "Buy research data for the market report, up to 10 GEN. No advertising." m_1 is Agent A's identical delegation to Agent B, approved by hash. The vendor, Northfield Grain Data, listed item_1: a CSV of daily maize prices for four regions, every day of September 2026, 120 rows, at 2 GEN. The delivered files are in [proof-run/](proof-run), byte for byte, and on a [gist](https://gist.github.com/DaveDave-infosec/b70bdb290cdca60d0a57ea8213d66c1f). Every row is asserted by tests/test_onchain_v2.py, including that each stored delivery hashes to the matching file in proof-run/.

| Purchase | Delivered | What happened | Money |
|----------|-----------|---------------|-------|
| pur_0 (c_0) | the full 120-row CSV from the gist's **latest** URL. Bound SHA-256 `5135467b...a88f9`, 2,489 bytes | **full**: "contains exactly 120 data rows and follows the specified column format. There are no advertising materials." The vendor then replaced the file at that URL with an advert ([screenshot](proof-run/binding-url-now-serves-an-ad.png)). Agent A challenged: "The file at the delivered URL is now a sponsored post package ... Open the URL and see for yourself." The challenge review read the **stored** CSV, quoted its rows, and kept **full**. Dissent: "the delivered data clearly refutes this." ([screenshot](proof-run/binding-challenge-kept-full.png)) | the challenge settled it at once: 2 GEN to the vendor |
| pur_1 (c_1) | a sponsored post package. Bound `2832ddd1...dd72d24` | **none**: "an advertising/sponsored post package, not a CSV of daily maize prices. It violates the explicit 'No advertising' restriction in both mandates." | settled by a bystander: 2 GEN back to escrow and every hop |
| pur_2 (c_2) | 1 to 20 September only, 80 rows. Bound `72d63402...ecc4f` | **half**: "lacks a substantial portion of the listed 120 rows." The vendor challenged for most, citing the dissent. The review re-read the stored file and kept **half**: "40 of the promised 120 rows and one-third of the period are missing; that is a major gap." | the challenge settled it: 1 GEN to the vendor, 1 GEN back |
| pur_3 (c_3) | the full CSV's URL with the partial file's hash | reverted in code: "delivered content does not match the committed SHA-256 hash". Nothing recorded, no validator asked. Nothing else was delivered | expired by a bystander after the deadline: 2 GEN back, decided in code |

V2 registry: [`0xA196082fB4679e98D984920619c83d79d33A912D`](https://explorer-studio.genlayer.com/address/0xA196082fB4679e98D984920619c83d79d33A912D). V2 market: [`0xc896e0A3ed824991fD6535883867B2D588a6e5D4`](https://explorer-studio.genlayer.com/address/0xc896e0A3ed824991fD6535883867B2D588a6e5D4). Windows on this testnet deployment: 20 minutes to deliver, 15 minutes to challenge.

### What changed after review

The first V2 market (`0x063DE96D0eB06289AF153EDa0Be4BE1F42289820`, run of 21 October) re-fetched the delivery URL at every review and shared the V1 registry with the V1 market. A steward asked for deliveries bound to stable, verifiable content across every review, and for single use and spending enforced across both purchase paths. Both are fixed above, with regression tests, and the run was repeated on the fixed pair. The first V2 market is superseded and unused by the app.

## Where validators split

GenLayer validators reach one verdict, but the strongest dissenting argument is stored next to it. Mandate keeps both on-chain for every judged record.

- Mandate text: "Secure node hosting for the launch, plus the add-on Agent A mentioned on our last call."
- First pass: unclear. The hosting fits, but the add-on is undefined, so a careful reader cannot tell whether it is in scope.
- Preserved dissent: one reading says it widens (an unverifiable extra purchase); another says it is narrower (a hosting add-on).
- Forcing pass, run by a bystander: unresolved. Status REFUSED, because authority defaults to not granted.
- Read it yourself: get_mandate("m_6") on the registry.

## Contracts

- Network: GenLayer Studio, chain 61999
- V2 registry: `0xA196082fB4679e98D984920619c83d79d33A912D` (contracts/mandate_registry.py, no constructor arguments). Read only by the V2 market.
- V2 market: `0xc896e0A3ed824991fD6535883867B2D588a6e5D4` (contracts/mandate_market_v2.py, constructor: registry_address, legacy_market, issuer, max_supply, delivery_window, challenge_window; deployed with the V2 registry, an empty legacy market, the issuer, 1000, 1200 and 900). Every console write goes here.
- V1 registry: `0x26d11ddA633434BF879876bd120f2052765b73fB` and V1 market: `0x21e6160A6B5166A60B58B5E06C4375d254C81DF8` (contracts/mandate_market.py, constructor: registry_address, issuer, max_supply). The V1 proof run, kept as its record. The V1 market is bound to the V1 registry.
- Superseded: the first V2 market, `0x063DE96D0eB06289AF153EDa0Be4BE1F42289820`, on the V1 registry. See [What changed after review](#what-changed-after-review).
- The registry holds mandates, the vendor catalog and capabilities. It never reads or writes another contract. Each market holds its own GEN ledger and only reads its own registry, through views. Zero cross-contract writes, zero setters.
- Disclosure: an earlier market deployment, `0xdBC4C20f76d47a0015D660970a7fDa485152f322`, was abandoned before any use because its constructor stored a registry address with copied whitespace. The market now strips and validates every address it accepts (test_constructor_rejects_malformed_addresses).
- Reading the contracts over RPC: use the checksummed addresses above. A lowercase address returns "Contract not found".

## Verify it yourself

- `pip install -r requirements-test.txt`
- `python -m pytest tests/ -q`
- 109 tests: 33 registry, 18 V1 market and 36 V2 market cases run the real contract code in-process; 11 read the live contracts and assert the V1 run, and 11 more assert the V2 run: registry isolation, chain-time windows, every stored delivery hashing to the published file, the URL-changed challenge, every hop's spend, and the V2 vault holding exactly escrow plus held money. Zero skips.
- Full property-by-property map: [TESTING.md](TESTING.md)

## Honest limitations

- A delivery is capped at 16000 bytes, so the stored copy and its hash always cover all of it. Larger deliverables would need splitting.
- GEN is a whole-number unit, so a partial band rounds the vendor's share down. Paid plus refunded always equals the price.
- The registry still takes a time from the caller when it records a delegation or a request. The V2 market re-checks every expiry on chain time before any money moves.
- The testnet windows are short so a run fits in one sitting: 20 minutes to deliver, 15 to challenge.
- Four fixed action categories: infrastructure, software_license, data_service, marketing. Three hops below the human.
- Validators can be wrong on genuinely ambiguous wording. That is why unclear verdicts are held, unresolved ones refuse, and an unresolved delivery pays nothing.
- Only the issuer can mint GEN on this testnet deployment.
- Prior art: UCAN, macaroons and ZCAP attenuate structured caveats. Mandate keeps those in code and adds plain-language attenuation on top.

## Roadmap

- Vendor bonds: a vendor stakes GEN with each listing, slashed to the buyer's root when a delivery is graded none.
- Multi-principal roots: two humans authorize together, and every child must narrow both of their mandates at once.
- Chain time in the registry too, so delegation and request expiry checks also stop trusting the caller.
