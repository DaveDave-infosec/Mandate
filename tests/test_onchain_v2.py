"""Read-only checks against the deployed V2 market and the V2 live proof run.

Keyless: a throwaway account only supplies a caller address for reads. Paced under Studio's read limit.
Records from the proof run are final, so these assertions do not drift as people use the console.
"""
import time

import pytest

from genlayer_py import create_account, create_client
from genlayer_py.chains import studionet

REGISTRY_ADDR = "0x26d11ddA633434BF879876bd120f2052765b73fB"
MARKET_V1_ADDR = "0x21e6160A6B5166A60B58B5E06C4375d254C81DF8"
MARKET_V2_ADDR = "0x063DE96D0eB06289AF153EDa0Be4BE1F42289820"
ISSUER = "0x7bbcac9c77aabc2aca19cd34f944fbc015f06a54"

GIST = "https://gist.githubusercontent.com/DaveDave-infosec/b70bdb290cdca60d0a57ea8213d66c1f/raw/0a7617189767a7f7bf5e076cef0aca1a33f5cabb/"
FULL_URL = GIST + "maize-prices-sep-2026.csv"
PARTIAL_URL = GIST + "maize-prices-sep-2026-partial.csv"
AD_URL = GIST + "sponsored-post-package.txt"

ROOT = "m_9"
HOP = "m_10"
ITEM = "item_4"
DELIVERY_WINDOW = 900
CHALLENGE_WINDOW = 600

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
    return create_client(chain=studionet, account=create_account())


def reg(client, fn, *args):
    return _paced(lambda: client.read_contract(address=REGISTRY_ADDR, function_name=fn, args=[*args]))


def v1(client, fn, *args):
    return _paced(lambda: client.read_contract(address=MARKET_V1_ADDR, function_name=fn, args=[*args]))


def v2(client, fn, *args):
    return _paced(lambda: client.read_contract(address=MARKET_V2_ADDR, function_name=fn, args=[*args]))


@pytest.fixture(scope="module")
def run(client):
    """The five purchases of the V2 proof run, read once."""
    return {pid: v2(client, "get_purchase", pid) for pid in ("pur_0", "pur_1", "pur_2", "pur_3", "pur_4")}


def test_v2_market_is_wired_to_the_registry_and_the_v1_market(client):
    """The V2 market reads the live registry, checks the V1 market for used capabilities, and mints only for the issuer."""
    assert v2(client, "get_registry").lower() == REGISTRY_ADDR.lower()
    assert v2(client, "get_legacy_market").lower() == MARKET_V1_ADDR.lower()
    assert v2(client, "get_issuer").lower() == ISSUER
    assert v2(client, "get_windows") == {"delivery": str(DELIVERY_WINDOW), "challenge": str(CHALLENGE_WINDOW)}


def test_proof_run_chain_and_listing(client):
    """m_9 is the principal's root, m_10 is Agent A's identical delegation approved by hash, and item_4 is a data listing."""
    root = reg(client, "get_mandate", ROOT)
    hop = reg(client, "get_mandate", HOP)
    assert root["path"] == "root" and "No advertising." in root["text"]
    assert hop["parent_id"] == ROOT and hop["path"] == "hash" and hop["text"] == root["text"]
    item = reg(client, "get_item", ITEM)
    assert item["category"] == "data_service" and item["price"] == "2"


def test_every_deadline_and_window_runs_on_chain_time(run):
    """Each purchase's deadline is exactly the delivery window after its chain-time purchase, and each decided band opened exactly the challenge window."""
    for p in run.values():
        assert int(p["deliver_by"]) - int(p["at"]) == DELIVERY_WINDOW
        if p["delivered_at"] != "0":
            assert int(p["challenge_until"]) - int(p["delivered_at"]) == CHALLENGE_WINDOW


def test_honest_delivery_graded_full_and_settled_by_a_bystander(run):
    """pur_0: validators fetched the full CSV and graded it full. A wallet that is neither buyer nor vendor settled it."""
    p = run["pur_0"]
    assert p["url"] == FULL_URL and p["verdict"] == "full"
    assert p["status"] == "SETTLED" and p["band"] == "full"
    assert (p["paid"], p["refunded"]) == ("2", "0")
    assert p["evidence"] != "" and p["minority_note"] != ""
    assert p["settled_by"].lower() not in (p["buyer"].lower(), p["vendor"].lower())


def test_bait_and_switch_graded_none_citing_the_root(run):
    """pur_1: a sponsored post package delivered against a data listing was graded none, citing No advertising, and fully refunded."""
    p = run["pur_1"]
    assert p["url"] == AD_URL and p["verdict"] == "none"
    assert "advertis" in p["violated_restriction"].lower()
    assert p["status"] == "SETTLED" and (p["paid"], p["refunded"]) == ("0", "2")


def test_partial_delivery_split_exactly(run):
    """pur_2: 20 of 30 days graded half. The vendor got half the price and the rest went back."""
    p = run["pur_2"]
    assert p["url"] == PARTIAL_URL and p["verdict"] == "half"
    assert p["status"] == "SETTLED" and (p["paid"], p["refunded"]) == ("1", "1")


def test_vendor_challenge_reviewed_and_settled_at_once(run):
    """pur_3: the vendor challenged half for most. Validators re-read the delivery with the grounds as quoted argument, kept half, and the challenge settled the money."""
    p = run["pur_3"]
    assert p["url"] == PARTIAL_URL and p["verdict"] == "half"
    assert p["challenged"] == "1" and p["challenger_role"] == "vendor"
    assert p["challenger"].lower() == p["vendor"].lower()
    assert p["challenge_text"] != "" and p["challenge_reasoning"] != ""
    assert p["challenge_verdict"] == "half"
    assert p["status"] == "SETTLED" and p["band_source"] == "challenge"
    assert (p["paid"], p["refunded"]) == ("1", "1")


def test_missed_deadline_refunded_in_code(run):
    """pur_4: never delivered. After the deadline it was expired with a full refund and no validator verdict on record."""
    p = run["pur_4"]
    assert p["url"] == "" and p["verdict"] == ""
    assert p["status"] == "EXPIRED" and p["band_source"] == "deadline"
    assert (p["paid"], p["refunded"]) == ("0", "2")
    assert int(p["settled_at"]) > int(p["deliver_by"])


def test_every_hop_budget_carries_exactly_what_was_paid(client):
    """For every mandate, spend equals the full price of open purchases plus the paid share of closed ones. Refunds really restored every hop."""
    count = v2(client, "get_purchase_count")
    expected = {}
    for i in range(count):
        p = v2(client, "get_purchase", "pur_" + str(i))
        open_ = p["status"] not in ("SETTLED", "EXPIRED")
        amount = int(p["price"]) if open_ else int(p["paid"])
        for hop in p["hops"].split(","):
            expected[hop] = expected.get(hop, 0) + amount
    assert ROOT in expected and HOP in expected
    for mid, amount in expected.items():
        assert v2(client, "get_spent", mid) == amount


def test_v2_vault_holds_exactly_escrow_plus_held_money(client):
    """Across every root, the V2 vault equals the sum of all escrows plus the money held for unsettled purchases."""
    count = reg(client, "get_mandate_count")
    escrowed = 0
    for i in range(count):
        m = reg(client, "get_mandate", "m_" + str(i))
        if m["parent_id"] == "":
            escrowed += v2(client, "get_escrow", m["id"])
    assert v2(client, "get_vault_balance") == escrowed + v2(client, "get_held_total")


def test_capability_bought_in_v1_is_not_bought_in_v2(client):
    """c_1 was bought in the V1 proof run. The V2 market has no purchase for it, and V2 asks V1 before buying."""
    assert v1(client, "is_consumed", "c_1") is True
    assert v2(client, "get_purchase_for_capability", "c_1") == ""
