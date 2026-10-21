# Testing Mandate

## What this suite proves

The suite runs 101 tests. 79 run the real contract code in-process: 33 registry, 18 V1 market and 28 V2 market cases. 22 read the deployed contracts on GenLayer Studio: 11 assert the V1 live proof run and 11 assert the V2 live proof run, with ledger invariants that hold across every chain. Zero skips.

## How to run

```
pip install -r requirements-test.txt
python -m pytest tests/ -q
python -m pytest tests/test_registry.py tests/test_market.py tests/test_market_v2.py -q
python -m pytest tests/test_onchain.py tests/test_onchain_v2.py -q
```

- `python -m pytest tests/ -q` runs everything, about 5.5 minutes: the live reads pace themselves under Studio's rate limit.
- The in-process line runs the three in-process files only, about 12 seconds, no network.
- The live line runs the on-chain reads only, about 5 minutes.
- Note: the first in-process run downloads the GenVM SDK (v0.2.16) and can be silent for several minutes.
- Note: the localnet banner printed by gltest is unrelated. The in-process suite never touches a network.

## How the in-process harness works

- Runner: gltest direct mode, SDK v0.2.16, real contract code executed in-process.
- One contract per process (a GenLayer SDK constraint), so the registry and each market are tested in separate files.
- V2 chain time: tests set the transaction timestamp the contract reads, then move it forward to cross deadlines and windows. The contract never receives a time from the caller.
- V2 deliveries: the delivery URL is answered by a web mock, so tests choose the delivered content and inspect the exact case validators receive.
- Validator verdicts: every LLM call is answered by a stub at the ExecPromptTemplate boundary, so tests choose the verdict and assert what the contract does with it. The stub raises on any unexpected call, so every "decided in code" test also proves no LLM was consulted.
- Cross-contract reads: market tests answer the market's registry views with an in-memory FakeRegistry returning exactly what the real registry returns. For V2 it also answers the V1 market's is_consumed.
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

### tests/test_market_v2.py

| # | Test | Property proved |
|---|------|-----------------|
| 1 | test_purchase_holds_money_and_charges_every_hop | A purchase moves the price out of escrow into held money. The vendor is not paid yet. No validator is asked. |
| 2 | test_purchase_gates | Grantee only, issued only, single use, exact price, enough escrow, every hop live and within budget. |
| 3 | test_purchase_checks_expiry_against_chain_time | The market reads time from the transaction, so a caller cannot buy under an expired chain by naming an earlier time. |
| 4 | test_capability_used_in_v1_market_cannot_be_bought_again | The V2 market asks the V1 market before buying, so no capability is ever bought twice across markets. |
| 5 | test_validators_read_the_fetched_content_and_the_whole_chain | The case carries every mandate root first, the vendor's listing, and the content fetched from the URL. |
| 6 | test_delivered_content_cannot_forge_quote_markers | Marker sequences inside the delivered content are stripped, so the content cannot close its own quote. |
| 7 | test_full_band_pays_vendor_only_after_the_challenge_window | A full verdict opens the challenge window. Settling early reverts. After it closes, anyone settles and the vendor is paid. |
| 8-10 | test_partial_bands_split_exactly_and_restore_every_hop (most, half, none) | The vendor gets the band's share. The rest returns to the root escrow and to every hop's budget. |
| 11 | test_rounding_never_creates_or_destroys_money | An odd price under a partial band floors the vendor share. Paid plus refunded always equals the price. |
| 12 | test_deliver_gates | Vendor only, https only, no spaces or quotes, before the deadline, and once. |
| 13 | test_unreachable_delivery_url_reverts_and_the_vendor_can_retry | A URL that does not return content reverts the whole delivery, so the vendor can deliver again. |
| 14 | test_delivery_after_deadline_reverts | The delivery deadline is checked against chain time. |
| 15 | test_unclear_holds_and_anyone_forces_a_band | Unclear holds the money. Any wallet forces one final review, which opens the window. |
| 16 | test_unresolved_forcing_review_pays_nothing | An unresolved forcing review becomes the none band. Doubt never moves money to the vendor. |
| 17 | test_a_middle_agent_challenges_a_full_band_down_to_none | Any wallet in the chain may challenge once. Validators re-read the delivery with the challenge as quoted data, and the result settles at once. |
| 18 | test_the_vendor_challenges_a_half_band_up_to_full | The vendor has the same single voice, in the other direction. |
| 19 | test_unresolved_challenge_pays_nothing | A challenge review that cannot decide pays the vendor nothing. |
| 20 | test_challenge_gates | Outsiders cannot challenge, the vendor cannot challenge a full band, grounds have a length, and the window closes. |
| 21 | test_chain_cannot_challenge_none_and_only_one_challenge_ever | Nothing is paid under none, so only the vendor may challenge it, and after one challenge the purchase is settled. |
| 22 | test_challenge_window_is_exact_on_chain_time | Settling at the last second of the window reverts. One second later it settles. |
| 23 | test_missed_deadline_refunds_in_code | After the deadline anyone expires the purchase. Full refund, budgets restored, no validator asked, no late delivery. |
| 24 | test_refund_root_never_touches_held_money | A revoked root refunds only its escrow. Money held for a purchase stays until that purchase settles. |
| 25 | test_refund_root_uses_chain_time | An unrevoked root refunds only once chain time is past its expiry. |
| 26 | test_vault_equals_escrow_plus_held_across_a_mixed_lifecycle | Through purchases, a delivery, a challenge, an expiry and a settle, the vault always equals escrow plus held money. |
| 27 | test_write_surface_is_pinned_and_takes_no_caller_time | Nine write methods, no owner, no setter, and not one write method accepts a time from the caller. |
| 28 | test_constructor_validates_addresses_and_windows | The V2 market refuses a malformed legacy market address and stores its windows. |

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
| 9 | test_purchase_single_use_and_exact_conservation | The capability was consumed exactly once, and the closed chain's spend and escrow are final. |
| 10 | test_vault_holds_exactly_the_sum_of_all_escrows | Across every chain on the live contracts, the vault holds exactly what roots have in escrow. |
| 11 | test_rpc_lookup_requires_checksummed_address | Documents the Studio RPC behavior: contract lookup works with the checksummed address. |

### tests/test_onchain_v2.py

| # | Test | Property proved |
|---|------|-----------------|
| 1 | test_v2_market_is_wired_to_the_registry_and_the_v1_market | The V2 market reads the live registry, checks the V1 market for used capabilities, and mints only for the issuer. |
| 2 | test_proof_run_chain_and_listing | m_9 is the principal's root, m_10 is Agent A's identical delegation approved by hash, and item_4 is a data listing. |
| 3 | test_every_deadline_and_window_runs_on_chain_time | Each deadline is exactly the delivery window after its chain-time purchase, and each decided band opened exactly the challenge window. |
| 4 | test_honest_delivery_graded_full_and_settled_by_a_bystander | pur_0: validators fetched the full CSV and graded it full. A wallet that is neither buyer nor vendor settled it. |
| 5 | test_bait_and_switch_graded_none_citing_the_root | pur_1: a sponsored post package delivered against a data listing was graded none, citing No advertising, and fully refunded. |
| 6 | test_partial_delivery_split_exactly | pur_2: 20 of 30 days graded half. The vendor got half the price and the rest went back. |
| 7 | test_vendor_challenge_reviewed_and_settled_at_once | pur_3: the vendor challenged half for most. Validators re-read the delivery, kept half, and the challenge settled the money. |
| 8 | test_missed_deadline_refunded_in_code | pur_4: never delivered. After the deadline it was expired with a full refund and no validator verdict on record. |
| 9 | test_every_hop_budget_carries_exactly_what_was_paid | For every mandate, spend equals the full price of open purchases plus the paid share of closed ones. |
| 10 | test_v2_vault_holds_exactly_escrow_plus_held_money | Across every root, the V2 vault equals the sum of all escrows plus the money held for unsettled purchases. |
| 11 | test_capability_bought_in_v1_is_not_bought_in_v2 | c_1 was bought in the V1 proof run, and the V2 market has no purchase for it. |

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
| single-use capabilities | test_replay_reverts_and_leaves_balances_untouched, test_capability_used_in_v1_market_cannot_be_bought_again |
| V2: price held at purchase, never paid on purchase | test_purchase_holds_money_and_charges_every_hop |
| V2: delivery deadline and challenge window on chain time | test_delivery_after_deadline_reverts, test_challenge_window_is_exact_on_chain_time, test_every_deadline_and_window_runs_on_chain_time |
| V2: vendor share plus refund equals the price, every hop restored | test_partial_bands_split_exactly_and_restore_every_hop, test_rounding_never_creates_or_destroys_money, test_every_hop_budget_carries_exactly_what_was_paid |
| V2: missed deadline refunds in full | test_missed_deadline_refunds_in_code, test_missed_deadline_refunded_in_code |

| Decided by validators | Proving test(s) |
|-----------------------|-----------------|
| does a child mandate preserve every restriction above it | test_consensus_widens_refuses_and_stores_clause, test_grandparent_drift_caught, test_headline_widening_refused_against_root, test_middle_hop_drift_refused |
| does the vendor's actual catalog item fit every mandate in the chain | test_authorized_issues_bound_capability_from_catalog_text, test_catalog_text_judged_outside_scope_and_authorized |
| V2: how much did the delivery deliver, and does it break any mandate | test_validators_read_the_fetched_content_and_the_whole_chain, test_honest_delivery_graded_full_and_settled_by_a_bystander, test_bait_and_switch_graded_none_citing_the_root, test_partial_delivery_split_exactly |
| V2: does a written challenge change the band | test_a_middle_agent_challenges_a_full_band_down_to_none, test_the_vendor_challenges_a_half_band_up_to_full, test_vendor_challenge_reviewed_and_settled_at_once |

## On-chain evidence

Live contracts on GenLayer Studio (chain 61999):

- Registry: 0x26d11ddA633434BF879876bd120f2052765b73fB
- Market V2: 0x063DE96D0eB06289AF153EDa0Be4BE1F42289820 (the V2 run is asserted record by record in tests/test_onchain_v2.py)
- Market V1: 0x21e6160A6B5166A60B58B5E06C4375d254C81DF8

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
- Studio limits reads to 30 per minute. Both live files pace themselves, and retry rate limits and gateway errors (502, 503, 504) up to four times. A wrong value or a contract assertion still fails at once.

## What these tests do not prove

- In-process tests choose the validator verdict through the stub. Verdict quality is proven by the live run, not by the in-process suite.
- In-process V2 tests choose the delivered content through a web mock. That validators really fetch and read the vendor's URL is proven by the V2 live run.
- The registry still takes a time from the caller for its own expiry checks. The V2 market re-checks every expiry on chain time before money moves. Nothing wakes on its own: deadlines are enforced when someone calls settle or expire.
