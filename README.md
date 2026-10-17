# Mandate

**Your agent cannot give away more power than you gave it.**

Non-expanding authority for agent delegation chains, on GenLayer.

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
5. An authorized purchase becomes a single-use capability. The market re-checks the whole chain and the budget at every hop at execution time, then pays the vendor from the root's escrow.
6. Any grantor can revoke. Revocation never touches descendants; they die through the chain walk.

## The honest boundary

| Decided in code | Decided by validators |
|-----------------|-----------------------|
| Spend cap never exceeds the parent | Does a changed child mandate preserve every restriction above it (the full chain, not just the parent) |
| Expiry never outlives the parent | Does the vendor's actual catalog item fit the scope and restrictions of every mandate in the chain |
| Categories and vendors only narrow | |
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

## Where validators split

GenLayer validators reach one verdict, but the strongest dissenting argument is stored next to it. Mandate keeps both on-chain for every judged record.

- Mandate text: "Secure node hosting for the launch, plus the add-on Agent A mentioned on our last call."
- First pass: unclear. The hosting fits, but the add-on is undefined, so a careful reader cannot tell whether it is in scope.
- Preserved dissent: one reading says it widens (an unverifiable extra purchase); another says it is narrower (a hosting add-on).
- Forcing pass, run by a bystander: unresolved. Status REFUSED, because authority defaults to not granted.
- Read it yourself: get_mandate("m_6") on the registry.

## Contracts

- Network: GenLayer Studio, chain 61999
- Registry: `0x26d11ddA633434BF879876bd120f2052765b73fB` (contracts/mandate_registry.py, no constructor arguments, deploy first)
- Market: `0x21e6160A6B5166A60B58B5E06C4375d254C81DF8` (contracts/mandate_market.py, constructor: registry_address, issuer, max_supply)
- The registry holds mandates, the vendor catalog and capabilities. It never reads or writes another contract. The market holds the GEN ledger and only reads the registry through views. Zero cross-contract writes, zero setters.
- Disclosure: an earlier market deployment, `0xdBC4C20f76d47a0015D660970a7fDa485152f322`, was abandoned before any use because its constructor stored a registry address with copied whitespace. The market now strips and validates every address it accepts (test_constructor_rejects_malformed_addresses).
- Reading the contracts over RPC: use the checksummed addresses above. A lowercase address returns "Contract not found".

## Verify it yourself

- `pip install -r requirements-test.txt`
- `python -m pytest tests/ -q`
- 61 tests: 33 registry and 18 market run the real contract code in-process; 10 read the live contracts and assert the run above. Zero skips.
- Full property-by-property map: [TESTING.md](TESTING.md)

## Honest limitations

- V1 judges a purchase against the vendor's catalog text. It does not verify that the vendor actually delivered.
- Four fixed action categories: infrastructure, software_license, data_service, marketing. Three hops below the human.
- Time is supplied by the caller and checked against stored expiry. Nothing wakes on its own.
- Validators can be wrong on genuinely ambiguous wording. That is why unclear verdicts are held and unresolved ones default to refusal.
- Prior art: UCAN, macaroons and ZCAP attenuate structured caveats. Mandate keeps those in code and adds plain-language attenuation on top.

## Roadmap

- V2, delivery verification: after a purchase, validators check a contract-fetched delivery receipt against the catalog promise, with clawback from a vendor bond if it falls short.
- Alternative V2, multi-principal roots: two humans authorize together, and every child must narrow both of their mandates at once.
