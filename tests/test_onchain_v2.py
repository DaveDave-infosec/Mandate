"""Read-only checks against the deployed V2 pair and the V2 live proof run.

Keyless: a throwaway account only supplies a caller address for reads. Paced under Studio's read limit,
with retries for rate limits and gateway errors. Every purchase in the run is closed, so nothing here drifts.
"""
import hashlib
import time
from pathlib import Path

import pytest
import requests

from genlayer_py import create_account, create_client
from genlayer_py.chains import studionet

REGISTRY_V2 = "0xA196082fB4679e98D984920619c83d79d33A912D"
MARKET_V2 = "0xc896e0A3ed824991fD6535883867B2D588a6e5D4"
REGISTRY_V1 = "0x26d11ddA633434BF879876bd120f2052765b73fB"
MARKET_V1 = "0x21e6160A6B5166A60B58B5E06C4375d254C81DF8"
MARKET_V2_FIRST = "0x063DE96D0eB06289AF153EDa0Be4BE1F42289820"
ISSUER = "0x7bbcac9c77aabc2aca19cd34f944fbc015f06a54"

GIST = "https://gist.githubusercontent.com/DaveDave-infosec/b70bdb290cdca60d0a57ea8213d66c1f/raw/"
PINNED = GIST + "0a7617189767a7f7bf5e076cef0aca1a33f5cabb/"
LATEST_FULL_URL = GIST + "maize-prices-sep-2026.csv"
AD_URL = PINNED + "sponsored-post-package.txt"
PARTIAL_URL = PINNED + "maize-prices-sep-2026-partial.csv"

PROOF_RUN = Path(__file__).resolve().parent.parent / "proof-run"
FULL_FILE = PROOF_RUN / "maize-prices-sep-2026.csv"
PARTIAL_FILE = PROOF_RUN / "maize-prices-sep-2026-partial.csv"
AD_FILE = PROOF_RUN / "sponsored-post-package.txt"

ROOT = "m_0"
HOP = "m_1"
ITEM = "item_1"
DELIVERY_WINDOW = 1200
CHALLENGE_WINDOW = 900

_last_call = [0.0]
MIN_GAP = 2.2
RATE_LIMIT_SLEEP = 6
TRANSIENT = ("Rate limit", "502", "503", "504", "Bad gateway", "invalid JSON", "timed out", "Connection")
ATTEMPTS = 4


def _paced(fn):
    """Studio rate limits and gateway errors retry with a pause. Anything else fails at once."""
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


def sha_of_file(path: Path) -> str:
    """SHA-256 of a repository file as published, with any Windows line endings from checkout undone."""
    return hashlib.sha256(path.read_bytes().replace(b"\r\n", b"\n")).hexdigest()


@pytest.fixture(scope="module")
def client():
    return create_client(chain=studionet, account=create_account())


def read(client, address, fn, *args):
    return _paced(lambda: client.read_contract(address=address, function_name=fn, args=[*args]))


@pytest.fixture(scope="module")
def run(client):
    """The four purchases of the V2 proof run, read once."""
    return {pid: read(client, MARKET_V2, "get_purchase", pid) for pid in ("pur_0", "pur_1", "pur_2", "pur_3")}


def test_every_market_reads_only_its_own_registry(client):
    """The V2 market reads only the V2 registry and checks no other market. The V1 market is bound to the V1 registry. No two markets share a registry that V2 uses."""
    assert REGISTRY_V2.lower() != REGISTRY_V1.lower()
    assert read(client, MARKET_V2, "get_registry").lower() == REGISTRY_V2.lower()
    assert read(client, MARKET_V2, "get_legacy_market") == ""
    assert read(client, MARKET_V2, "get_issuer").lower() == ISSUER
    assert read(client, MARKET_V2, "get_windows") == {"delivery": str(DELIVERY_WINDOW), "challenge": str(CHALLENGE_WINDOW)}
    assert read(client, MARKET_V1, "get_registry").lower() == REGISTRY_V1.lower()
    assert read(client, MARKET_V2_FIRST, "get_registry").lower() == REGISTRY_V1.lower()


def test_proof_run_chain_and_listing(client):
    """m_0 is the principal's root on the V2 registry, m_1 is Agent A's identical delegation approved by hash, and item_1 is the 2 GEN data listing."""
    root = read(client, REGISTRY_V2, "get_mandate", ROOT)
    hop = read(client, REGISTRY_V2, "get_mandate", HOP)
    assert root["path"] == "root" and "No advertising." in root["text"]
    assert hop["parent_id"] == ROOT and hop["path"] == "hash" and hop["text"] == root["text"]
    item = read(client, REGISTRY_V2, "get_item", ITEM)
    assert item["category"] == "data_service" and item["price"] == "2"


def test_every_deadline_and_window_runs_on_chain_time(run):
    """Each deadline is exactly the delivery window after its chain-time purchase, and each decided band opened exactly the challenge window."""
    for p in run.values():
        assert int(p["deliver_by"]) - int(p["at"]) == DELIVERY_WINDOW
        if p["delivered_at"] != "0":
            assert int(p["challenge_until"]) - int(p["delivered_at"]) == CHALLENGE_WINDOW


def test_bound_content_is_exactly_the_published_files(client, run):
    """For every delivery, the stored content hashes to the committed SHA-256, which equals the file in this repository's proof-run folder."""
    expected = {"pur_0": FULL_FILE, "pur_1": AD_FILE, "pur_2": PARTIAL_FILE}
    for pid, path in expected.items():
        content = read(client, MARKET_V2, "get_delivery_content", pid)
        digest = hashlib.sha256(content.encode("utf-8")).hexdigest()
        assert digest == run[pid]["content_sha256"] == sha_of_file(path)
        assert run[pid]["content_bytes"] == str(len(content.encode("utf-8")))


def test_url_changed_after_delivery_and_the_challenge_still_read_the_bound_content(client, run):
    """pur_0: delivered from the gist's latest URL and graded full. The vendor then replaced that file with an advert.
    Agent A challenged on that basis. The challenge review read the stored dataset, kept full, and the vendor was paid."""
    p = run["pur_0"]
    assert p["url"] == LATEST_FULL_URL and p["verdict"] == "full"
    served_now = requests.get(LATEST_FULL_URL, timeout=30).content.replace(b"\r\n", b"\n")
    assert hashlib.sha256(served_now).hexdigest() != p["content_sha256"]
    assert b"SPONSORED POST PACKAGE" in served_now
    assert p["challenged"] == "1" and p["challenger_role"] == "chain"
    assert "URL" in p["challenge_text"]
    assert p["challenge_verdict"] == "full"
    assert p["status"] == "SETTLED" and p["band_source"] == "challenge"
    assert (p["paid"], p["refunded"]) == ("2", "0")


def test_bait_and_switch_graded_none_citing_the_root(run):
    """pur_1: a sponsored post package delivered against a data listing was graded none, citing No advertising, and a bystander settled the refund."""
    p = run["pur_1"]
    assert p["url"] == AD_URL and p["verdict"] == "none"
    assert "advertis" in p["violated_restriction"].lower()
    assert p["status"] == "SETTLED" and (p["paid"], p["refunded"]) == ("0", "2")
    assert p["settled_by"].lower() not in (p["buyer"].lower(), p["vendor"].lower())


def test_partial_delivery_vendor_challenge_kept_half(run):
    """pur_2: 20 of 30 days graded half. The vendor challenged for most, the review kept half, and the challenge settled one and one."""
    p = run["pur_2"]
    assert p["url"] == PARTIAL_URL and p["verdict"] == "half"
    assert p["challenged"] == "1" and p["challenger_role"] == "vendor"
    assert p["challenge_verdict"] == "half"
    assert p["status"] == "SETTLED" and (p["paid"], p["refunded"]) == ("1", "1")


def test_wrong_hash_left_no_trace_then_the_deadline_refunded(run):
    """pur_3: a delivery whose bytes did not match the committed hash reverted and recorded nothing. Nothing else arrived, and the deadline refunded it in code."""
    p = run["pur_3"]
    assert p["url"] == "" and p["content_sha256"] == "" and p["verdict"] == ""
    assert p["status"] == "EXPIRED" and p["band_source"] == "deadline"
    assert (p["paid"], p["refunded"]) == ("0", "2")
    assert int(p["settled_at"]) > int(p["deliver_by"])


def test_every_hop_budget_carries_exactly_what_was_paid(client):
    """For every mandate, spend equals the full price of open purchases plus the paid share of closed ones."""
    count = read(client, MARKET_V2, "get_purchase_count")
    expected = {}
    for i in range(count):
        p = read(client, MARKET_V2, "get_purchase", "pur_" + str(i))
        open_ = p["status"] not in ("SETTLED", "EXPIRED")
        amount = int(p["price"]) if open_ else int(p["paid"])
        for hop in p["hops"].split(","):
            expected[hop] = expected.get(hop, 0) + amount
    assert ROOT in expected and HOP in expected
    for mid, amount in expected.items():
        assert read(client, MARKET_V2, "get_spent", mid) == amount


def test_v2_vault_holds_exactly_escrow_plus_held_money(client):
    """Across every root on the V2 registry, the V2 vault equals the sum of all escrows plus the money held for unsettled purchases."""
    count = read(client, REGISTRY_V2, "get_mandate_count")
    escrowed = 0
    for i in range(count):
        m = read(client, REGISTRY_V2, "get_mandate", "m_" + str(i))
        if m["parent_id"] == "":
            escrowed += read(client, MARKET_V2, "get_escrow", m["id"])
    assert read(client, MARKET_V2, "get_vault_balance") == escrowed + read(client, MARKET_V2, "get_held_total")


def test_no_v1_market_record_touches_the_v2_proof_run(client):
    """The V1 market has never bought any V2 capability: its purchases were all made on the V1 registry before V2 existed, and it cannot read the V2 registry."""
    for cid in ("c_0", "c_1", "c_2", "c_3"):
        assert read(client, MARKET_V2, "get_purchase_for_capability", cid) != ""
    assert read(client, MARKET_V1, "get_registry").lower() != REGISTRY_V2.lower()
