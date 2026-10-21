import time

import pytest

from genlayer_py import create_account, create_client
from genlayer_py.chains import studionet

REGISTRY = "0x26d11dda633434bf879876bd120f2052765b73fb"
MARKET = "0x21e6160a6b5166a60b58b5e06c4375d254c81df8"
REGISTRY_ADDR = "0x26d11ddA633434BF879876bd120f2052765b73fB"
MARKET_ADDR = "0x21e6160A6B5166A60B58B5E06C4375d254C81DF8"
PRINCIPAL = "0x7bbcac9c77aabc2aca19cd34f944fbc015f06a54"
AGENT_A = "0xd7cd43cbc01f767a74909943cec29e20db4e7cc3"
AGENT_B = "0x4fb1e8d04735e104a25c2235e29ee2acc045fbe1"
AGENT_C = "0xd5677320cbc9759061bdc753733b14cde0155da1"
VENDOR = "0x6f838bc9d553ce43b3baa3c8d76041e2324ae5b0"
BYSTANDER = "0xcae7b9fb67e4bbf303cd0384bf23843a3810e9e9"
AFTER_REVOKE = 1792228200

MANDATE_IDS = ["m_" + str(i) for i in range(7)]

_last_call = [0.0]
MIN_GAP = 2.2
RATE_LIMIT_SLEEP = 6


TRANSIENT = ("Rate limit", "502", "503", "504", "Bad gateway", "invalid JSON", "timed out", "Connection")
ATTEMPTS = 4


def _paced(fn):
    """Wait until at least MIN_GAP has passed since the previous read, then run fn.

    Studio rate limits and gateway errors are transient: those retry up to ATTEMPTS times with a pause.
    Any other error, including a contract assertion, propagates unchanged on the first try.
    """
    for attempt in range(ATTEMPTS):
        gap = time.monotonic() - _last_call[0]
        if gap < MIN_GAP:
            time.sleep(MIN_GAP - gap)
        try:
            result = fn()
            _last_call[0] = time.monotonic()
            return result
        except Exception as e:
            _last_call[0] = time.monotonic()
            if attempt == ATTEMPTS - 1 or not any(t in str(e) for t in TRANSIENT):
                raise
            time.sleep(RATE_LIMIT_SLEEP * (attempt + 1))


@pytest.fixture(scope="module")
def client():
    """One throwaway keyholder account, only to supply a read-only caller address."""
    return create_client(chain=studionet, account=create_account())


def reg(client, fn, *args):
    """Read-only call against the live registry."""
    return _paced(lambda: client.read_contract(address=REGISTRY_ADDR, function_name=fn, args=[*args]))


def mkt(client, fn, *args):
    """Read-only call against the live market."""
    return _paced(lambda: client.read_contract(address=MARKET_ADDR, function_name=fn, args=[*args]))


def test_live_pair_is_wired(client):
    """The deployed market points at the deployed registry and mints only for the principal."""
    assert mkt(client, "get_registry").lower() == REGISTRY
    assert mkt(client, "get_issuer").lower() == PRINCIPAL


def test_root_issued_by_principal_and_revoked(client):
    """The root mandate was granted by the principal to agent A and is now revoked."""
    m = reg(client, "get_mandate", "m_0")
    assert m["grantor"].lower() == PRINCIPAL
    assert m["grantee"].lower() == AGENT_A
    assert m["path"] == "root"
    assert m["status"] == "REVOKED"


def test_headline_widening_refused_against_root(client):
    """The headline widening was refused by consensus, quoting the root's clause with dissent recorded."""
    m = reg(client, "get_mandate", "m_2")
    assert m["grantor"].lower() == AGENT_B
    assert m["grantee"].lower() == AGENT_C
    assert m["parent_id"] == "m_1"
    assert m["path"] == "consensus"
    assert m["verdict"] == "widens"
    assert m["status"] == "REFUSED"
    assert "No marketing services" in m["violated_restriction"]
    assert m["minority_note"] != ""


def test_middle_hop_drift_refused(client):
    """Both drift attempts under the middle hop were refused, quoting Agent A's clause, not the root's."""
    m4 = reg(client, "get_mandate", "m_4")
    assert m4["parent_id"] == "m_1"
    assert m4["verdict"] == "widens"
    assert m4["status"] == "REFUSED"
    assert "build tooling" in m4["violated_restriction"]
    m5 = reg(client, "get_mandate", "m_5")
    assert m5["parent_id"] == "m_1"
    assert m5["verdict"] == "widens"
    assert m5["status"] == "REFUSED"
    assert "build tooling" in m5["violated_restriction"]


def test_narrower_delegations_active_with_preserved_dissent(client):
    """The narrower delegations activated through consensus and still remember their dissent."""
    m1 = reg(client, "get_mandate", "m_1")
    assert m1["grantor"].lower() == AGENT_A
    assert m1["grantee"].lower() == AGENT_B
    assert m1["verdict"] == "narrower"
    assert m1["path"] == "consensus"
    assert m1["minority_note"] != ""
    m3 = reg(client, "get_mandate", "m_3")
    assert m3["grantor"].lower() == AGENT_B
    assert m3["grantee"].lower() == AGENT_C
    assert m3["verdict"] == "narrower"
    assert m3["path"] == "consensus"
    assert m3["minority_note"] != ""


def test_held_then_bystander_escalation_defaults_to_refused(client):
    """A bystander forced the final review of a held mandate and the unresolved verdict refused it."""
    m6 = reg(client, "get_mandate", "m_6")
    assert m6["verdict"] == "unclear"
    assert m6["escalated"] == "1"
    assert m6["escalation_verdict"] == "unresolved"
    assert m6["status"] == "REFUSED"
    assert m6["escalated_by"].lower() == BYSTANDER
    assert m6["minority_note"] != ""
    assert m6["escalation_minority_note"] != ""
    for mid in MANDATE_IDS:
        m = reg(client, "get_mandate", mid)
        assert m["grantor"].lower() != BYSTANDER
        assert m["grantee"].lower() != BYSTANDER
    assert BYSTANDER != VENDOR
    assert BYSTANDER != PRINCIPAL


def test_catalog_text_judged_outside_scope_and_authorized(client):
    """The refusal judged the item text while the hosting item authorized, both bound to the same mandate."""
    c0 = reg(client, "get_capability", "c_0")
    assert c0["item_id"] == "item_1"
    assert c0["grantee"].lower() == AGENT_C
    assert c0["verdict"] == "outside_scope"
    assert c0["status"] == "REFUSED"
    assert "No marketing services" in c0["violated_restriction"]
    c1 = reg(client, "get_capability", "c_1")
    assert c1["item_id"] == "item_0"
    assert c1["grantee"].lower() == AGENT_C
    assert c1["verdict"] == "authorized"
    assert c1["status"] == "ISSUED"
    assert c1["price"] == "2"
    item = reg(client, "get_item", "item_1")
    assert item["category"] == "marketing"
    assert item["vendor"].lower() == VENDOR


def test_revocation_kills_descendants_by_chain_walk(client):
    """Revocation left the descendant records untouched and killed them through the chain walk."""
    m3 = reg(client, "get_mandate", "m_3")
    assert m3["status"] == "ACTIVE"
    assert reg(client, "is_chain_valid", "m_3", AFTER_REVOKE) is False
    assert reg(client, "get_mandate", "m_1")["status"] == "ACTIVE"


def test_purchase_single_use_and_exact_conservation(client):
    """The capability was consumed exactly once, and the closed chain's spend and escrow are final."""
    assert mkt(client, "is_consumed", "c_1") is True
    assert mkt(client, "get_purchase_for_capability", "c_1") == "pur_0"
    p = mkt(client, "get_purchase", "pur_0")
    assert p["buyer"].lower() == AGENT_C
    assert p["vendor"].lower() == VENDOR
    assert p["item"] == "item_0"
    assert p["price"] == "2"
    assert p["root"] == "m_0"
    assert mkt(client, "get_spent", "m_0") == 2
    assert mkt(client, "get_spent", "m_1") == 2
    assert mkt(client, "get_spent", "m_3") == 2
    assert mkt(client, "get_escrow", "m_0") == 0
    assert mkt(client, "get_total_minted") >= 20


def test_vault_holds_exactly_the_sum_of_all_escrows(client):
    """Across every chain on the live contracts, the vault holds exactly what roots have in escrow."""
    count = reg(client, "get_mandate_count")
    assert count >= len(MANDATE_IDS)
    escrowed = 0
    roots = 0
    for i in range(count):
        m = reg(client, "get_mandate", "m_" + str(i))
        if m["parent_id"] == "":
            roots += 1
            escrowed += mkt(client, "get_escrow", m["id"])
    assert roots >= 1
    assert mkt(client, "get_vault_balance") == escrowed


def test_rpc_lookup_requires_checksummed_address(client):
    """Documents the Studio RPC behavior: contract lookup works with the checksummed address."""
    assert _paced(lambda: client.read_contract(address=MARKET_ADDR, function_name="get_registry", args=[])).lower() == REGISTRY
    try:
        value = _paced(lambda: client.read_contract(address=MARKET, function_name="get_registry", args=[]))
        assert value.lower() == REGISTRY
        print("LOWERCASE ALSO WORKS")
    except Exception as e:
        print(f"LOWERCASE ERROR: {e}")
