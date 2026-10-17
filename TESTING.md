# Testing Mandate

## What this suite proves

The suite runs 61 tests. 51 run the real contract code in-process (33 registry, 18 market). 10 read the deployed contracts on GenLayer Studio and assert the live proof run. Zero skips.

## How to run

```
pip install -r requirements-test.txt
python -m pytest tests/ -q
python -m pytest tests/test_registry.py tests/test_market.py -q
python -m pytest tests/test_onchain.py -q
```

- `python -m pytest tests/ -q` runs everything, about 3 minutes: the live reads pace themselves under Studio's rate limit.
- `python -m pytest tests/test_registry.py tests/test_market.py -q` runs the in-process files only, about 7 seconds, no network.
- `python -m pytest tests/test_onchain.py -q` runs the live reads only, about 2.5 minutes.
- Note: the first in-process run downloads the GenVM SDK (v0.2.16) and can be silent for several minutes.
- Note: the localnet banner printed by gltest is unrelated. The in-process suite never touches a network.

## How the in-process harness works

- Runner: gltest direct mode, SDK v0.2.16, real contract code executed in-process.
- One contract per process (a GenLayer SDK constraint), so the registry and the market are tested in separate files.
- Validator verdicts: every LLM call is answered by a stub at the ExecPromptTemplate boundary, so tests choose the verdict and assert what the contract does with it. The stub raises on any unexpected call, so every "decided in code" test also proves no LLM was consulted.
- Cross-contract reads: market tests answer the market's registry views with an in-memory FakeRegistry returning exactly what the real registry returns.
- Prompt capture: tests inspect the exact prompt sent to validators (used to prove the full chain and the vendor's catalog text are in it).

## Trust property map

### tests/test_registry.py

| # | Test | Property proved |
|---|------|-----------------|
| 1 | test_issue_root_binds_principal | A root mandate binds the principal as grantor and the chosen agent as grantee. |
| 2 | test_issue_root_rejects_bad_input | The principal cannot issue a malformed root mandate. |
| 3 | test_delegate_by_non_grantee_reverts | Only the mandate's grantee can delegate it. |
| 4 | test_cap_above_parent_reverts_in_code | A child cap above the parent cap is rejected by code, not by the LLM. |
| 5 | test_later_expiry_reverts | A child mandate cannot outlive its parent. |
| 6 | test_category_and_vendor_subset_enforced | Categories and vendors can only narrow, never widen, down the chain. |
| 7 | test_depth_limit | Delegation stops at depth 3. |
| 8 | test_loop_guard | A mandate cannot be delegated back into its own chain. |
| 9 | test_expired_chain_blocks_delegation | No delegation is possible under an expired mandate. |
| 10 | test_identical_text_resolves_by_hash_without_llm | Identical child text is approved by hash alone, with no LLM call. |
| 11 | test_consensus_narrower_activates | A narrower verdict activates the child through the consensus path. |
| 12 | test_consensus_widens_refuses_and_stores_clause | A widens verdict refuses the child, records the clause, and the refused mandate is dead. |
| 13 | test_grandparent_drift_caught | The consensus check sees the whole chain, so drift from the root is caught. |
| 14 | test_unclear_holds_and_held_cannot_act | An unclear verdict holds the child, and a held mandate can neither delegate nor buy. |
| 15 | test_identical_resubmission_reverts_without_new_llm_call | An identical delegation is assessed once; resubmission reverts with no new LLM call. |
| 16 | test_escalate_by_bystander_resolves_held | Anyone can force the final review of a held mandate, and the first-pass record survives. |
| 17 | test_escalate_unresolved_defaults_to_refused | An unresolved escalation refuses the mandate: held authority is not granted. |
| 18 | test_escalate_only_once_and_only_held | Escalation happens once, and only for held mandates. |
| 19 | test_revoke_by_non_grantor_reverts | Only the grantor can revoke a mandate. |
| 20 | test_revoke_mid_chain_kills_descendants_by_chain_walk | Revoking a mid-chain mandate kills descendants through the chain walk without mutating them. |
| 21 | test_revoke_refused_reverts | A refused mandate is final: it cannot be revoked. |
| 22 | test_vendor_and_listing_rules | Only registered vendors list items, each listing immutable with valid fields. |
| 23 | test_request_by_non_grantee_reverts | Only the mandate's grantee can request a capability under it. |
| 24 | test_category_vendor_price_gates_in_code | Category, vendor and price limits are enforced by code before any LLM call. |
| 25 | test_authorized_issues_bound_capability_from_catalog_text | An authorized verdict issues a capability bound to grantee, item and mandate, judged on catalog text. |
| 26 | test_outside_scope_refused_and_cannot_be_retried | A refused item cannot be requested again under the same mandate. |
| 27 | test_held_capability_escalated_by_bystander | Anyone can force the final review of a held capability, at most once. |
| 28 | test_held_capability_unresolved_defaults_to_refused | An unresolved capability escalation refuses the purchase: held authority is not granted. |
| 29 | test_precedent_path_issues_without_llm | Once an item is authorized under a mandate, repeat requests issue by precedent with no LLM call. |
| 30 | test_revoked_ancestor_blocks_capability | A revoked root kills capability requests anywhere below it. |
| 31 | test_parser_tolerates_fences_and_case_but_rejects_unknown | The verdict parser tolerates fences and case, and rejects output without a valid verdict. |
| 32 | test_prompt_injection_markers_are_stripped | Mandate text cannot forge the quoting markers used in the validator prompt. |
| 33 | test_deployer_has_no_power_and_no_setters_exist | The deployer gets no role, and the contract exposes exactly eight write methods. |

### tests/test_market.py

| # | Test | Property proved |
|---|------|-----------------|
| 1 | test_issuer_mint_capped | Minting is issuer-only and hard-capped at max_supply. |
| 2 | test_fund_root_moves_balance_into_escrow | Funding a root moves the principal's balance into the vault and the root's escrow. |
| 3 | test_fund_root_gates | Only the root's grantor, with enough balance, can fund a live root. |
| 4 | test_purchase_pays_vendor_with_exact_conservation | A purchase moves exactly the price from the vault to the vendor and books the spend on the whole chain. |
| 5 | test_purchase_by_anyone_but_grantee_reverts | Only the capability's bound grantee can purchase. |
| 6 | test_non_issued_capability_reverts | Only ISSUED capabilities can purchase; HELD and REFUSED are dead ends. |
| 7 | test_replay_reverts_and_leaves_balances_untouched | A consumed capability cannot be replayed, and the failed replay moves nothing. |
| 8 | test_race_two_capabilities_over_budget_together | Two spending paths under one mandate pass alone, but the second is stopped once the shared cap is hit. |
| 9 | test_sibling_mandates_share_parent_budget | Spending under a sibling mandate also counts against the shared parent's cap. |
| 10 | test_revoked_ancestor_blocks_purchase | A revoked ancestor anywhere in the chain blocks every purchase below it. |
| 11 | test_expired_chain_blocks_purchase | A purchase past the chain's expiry is refused. |
| 12 | test_price_mismatch_reverts | The capability's recorded price must match the catalog price exactly. |
| 13 | test_insufficient_escrow_reverts | A purchase cannot spend more than the root escrowed. |
| 14 | test_refund_rules | Only the principal can refund a root, only once it is dead or expired, and the refund drains it fully. |
| 15 | test_refund_after_expiry | An expired root can be refunded by the principal even while still ACTIVE. |
| 16 | test_conservation_and_no_privileged_roles | Value is conserved through every state change, the deployer has no power, and the write surface is exactly four methods. |
| 17 | test_constructor_rejects_malformed_addresses | The market normalizes a padded address to the real one and refuses to deploy with a malformed registry or issuer address. |
| 18 | test_mint_rejects_malformed_recipient_and_strips_padding | Minting refuses a malformed recipient and normalizes a padded one to the real address. |

### tests/test_onchain.py

| # | Test | Property proved |
|---|------|-----------------|
| 1 | test_live_pair_is_wired | The deployed market points at the deployed registry and mints only for the principal. |
| 2 | test_root_issued_by_principal_and_revoked | The root mandate was granted by the principal to agent A and is now revoked. |
| 3 | test_headline_widening_refused_against_root | The headline widening was refused by consensus, quoting the root's clause with dissent recorded. |
| 4 | test_middle_hop_drift_refused | Both drift attempts under the middle hop were refused, quoting Agent A's clause, not the root's. |
| 5 | test_narrower_delegations_active_with_preserved_dissent | The narrower delegations activated through consensus and still remember their dissent. |
| 6 | test_held_then_bystander_escalation_defaults_to_refused | A bystander forced the final review of a held mandate and the unresolved verdict refused it. |
| 7 | test_catalog_text_judged_outside_scope_and_authorized | The refusal judged the item text while the hosting item authorized, both bound to the same mandate. |
| 8 | test_revocation_kills_descendants_by_chain_walk | Revocation left the descendant records untouched and killed them through the chain walk. |
| 9 | test_purchase_single_use_and_exact_conservation | The capability was consumed exactly once and every minted unit is accounted for. |
| 10 | test_rpc_lookup_requires_checksummed_address | Documents the Studio RPC behavior: contract lookup works with the checksummed address. |

## The honest boundary, and which tests prove it

| Decided in code (no validator call) | Proving test(s) |
|-------------------------------------|-----------------|
| spend cap never exceeds the parent | test_cap_above_parent_reverts_in_code |
| expiry never outlives the parent | test_later_expiry_reverts |
| categories and vendors only narrow | test_category_and_vendor_subset_enforced |
| depth limit of 3 | test_depth_limit |
| no delegation loops | test_loop_guard |
| identical text approved by hash | test_identical_text_resolves_by_hash_without_llm |
| item category, vendor and price checked at every hop | test_category_vendor_price_gates_in_code |
| repeat request for an authorized item issued by precedent | test_precedent_path_issues_without_llm |
| revocation enforced by chain walk | test_revoke_mid_chain_kills_descendants_by_chain_walk, test_revoked_ancestor_blocks_capability |
| budget enforced at execution at every hop | test_race_two_capabilities_over_budget_together, test_sibling_mandates_share_parent_budget |
| single-use capabilities | test_replay_reverts_and_leaves_balances_untouched |

| Decided by validators | Proving test(s) |
|-----------------------|-----------------|
| does a child mandate preserve every restriction above it | test_consensus_widens_refuses_and_stores_clause, test_grandparent_drift_caught, test_headline_widening_refused_against_root, test_middle_hop_drift_refused |
| does the vendor's actual catalog item fit every mandate in the chain | test_authorized_issues_bound_capability_from_catalog_text, test_catalog_text_judged_outside_scope_and_authorized |

## On-chain evidence

Live contracts on GenLayer Studio (chain 61999):

- Registry: 0x26d11ddA633434BF879876bd120f2052765b73fB
- Market: 0x21e6160A6B5166A60B58B5E06C4375d254C81DF8

| Step | Receipt |
|------|---------|
| Widening refused against the root clause (m_2) | https://explorer-studio.genlayer.com/tx/0xdceb781183cc166e324f63bbd88fc1a37bb233c6949816220872d385b19168c1 |
| Ad package refused on the vendor's own text (c_0) | https://explorer-studio.genlayer.com/tx/0xcf7798c96a777bffbce5f0c8c871043a4bedf7002b21711b9dfeae1db6f36307 |
| Hosting purchased, vendor paid 2 GEN (pur_0) | https://explorer-studio.genlayer.com/tx/0xe4aebd069e6f64408ece709c358fb592805c846a68cd0d990a0212219056ba93 |
| Replay of the same capability reverted | https://explorer-studio.genlayer.com/tx/0x6980642b2499790d8144c238cb64e8fe39661b246b609ba9b4c158be1715a986 |
| Held mandate escalated by a bystander, unresolved, refused (m_6) | https://explorer-studio.genlayer.com/tx/0x93bc59c78451eda85ac579809bb7a4d0420529f1b1e0b2a58ce23070ebcde4cb |
| Root revoked by the principal | https://explorer-studio.genlayer.com/tx/0xaa4467509bfbc5f7572dad10441b6e016346a12640dbbbbcf704f38fdd8d2bf8 |
| Request under a revoked chain reverted in code | https://explorer-studio.genlayer.com/tx/0x695ecf8e6e5d8bb39cc8fa467cbb0dcf9f6cb267d9d2230fc9fb913ef2c33dc1 |
| Unspent escrow refunded, conservation exact (18 + 2 + 0 = 20 minted) | https://explorer-studio.genlayer.com/tx/0x8296feaff9f2ebebd87ca2ce770e24a451b31ae46be0f216fd4b2a504897397d |

## Notes for anyone reading the live contracts

- The Studio RPC finds a contract only by its checksummed address. A lowercase address returns "Contract not found". test_rpc_lookup_requires_checksummed_address records this.
- Studio limits reads to 30 per minute. test_onchain.py paces itself and retries once on a rate-limit response.

## What these tests do not prove

- In-process tests choose the validator verdict through the stub. Verdict quality is proven by the live run, not by the in-process suite.
- V1 does not verify that a vendor actually delivered what it sold.
- Time is supplied by the caller and checked against stored expiry. Nothing wakes on its own.
