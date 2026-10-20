import datetime
import json
import os
import sys
from contextlib import contextmanager
from pathlib import Path
from types import SimpleNamespace

from gltest.direct import VMContext, create_test_addresses, deploy_contract

SDK = "v0.2.16"

# Windows shim: the runner deletes temp files Windows still holds open.
_orig_unlink = os.unlink


def _safe_unlink(path, *args, **kwargs):
    try:
        return _orig_unlink(path, *args, **kwargs)
    except PermissionError:
        pass


os.unlink = _safe_unlink

REGISTRY_PATH = str(Path(__file__).resolve().parent.parent / "contracts" / "mandate_registry.py")
MARKET_PATH = str(Path(__file__).resolve().parent.parent / "contracts" / "mandate_market.py")
MARKET_V2_PATH = str(Path(__file__).resolve().parent.parent / "contracts" / "mandate_market_v2.py")

NOW = 1_000_000
EXPIRY = 2_000_000


def hexaddr(b) -> str:
    return "0x" + bytes(b).hex()


class LLMStub:
    """FIFO queue of LLM response strings.

    calls: total number of LLM requests seen.
    captured: raw request payloads, in order.
    An LLM call arriving with an empty queue raises AssertionError,
    which makes any "no LLM on this path" test automatic.
    """

    def __init__(self):
        self._queue = []
        self.calls = 0
        self.captured = []

    def push(self, response: str) -> None:
        self._queue.append(response)

    def next(self, payload) -> str:
        self.calls += 1
        self.captured.append(payload)
        if not self._queue:
            raise AssertionError("unexpected LLM call")
        return self._queue.pop(0)


def verdict(v: str, violated: str = "", reasoning: str = "stub reasoning", minority: str = "stub dissent") -> str:
    return json.dumps({
        "verdict": v,
        "violated_restriction": violated,
        "reasoning": reasoning,
        "minority_note": minority,
    })


class FakeRegistry:
    """In-memory stand-in for MandateRegistry, answering the market's view calls.

    Every value is a string, exactly what the real registry returns.
    """

    def __init__(self):
        self.mandates = {}
        self.items = {}
        self.capabilities = {}
        self.vendor_names = {}
        self.legacy_consumed = set()   # capability ids the V1 market already used

    # setup helpers
    def add_mandate(self, mid, parent_id="", root_id=None, depth="0", grantor="", grantee="", cap="0", expiry="0", status="ACTIVE", text="Mandate text."):
        self.mandates[mid] = {
            "text": text,
            "id": mid,
            "parent_id": parent_id,
            "root_id": mid if root_id is None else root_id,
            "depth": str(depth),
            "grantor": grantor,
            "grantee": grantee,
            "cap": str(cap),
            "expiry": str(expiry),
            "status": status,
        }

    def set_mandate_status(self, mid, status):
        self.mandates[mid]["status"] = status

    def add_item(self, iid, vendor="", category="infrastructure", title="item", description="desc", price="0"):
        self.items[iid] = {
            "id": iid,
            "vendor": vendor,
            "category": category,
            "title": title,
            "description": description,
            "price": str(price),
        }

    def add_capability(self, cid, status="ISSUED", grantee="", item_id="", price="0", mandate_id=""):
        self.capabilities[cid] = {
            "id": cid,
            "status": status,
            "grantee": grantee,
            "item_id": item_id,
            "price": str(price),
            "mandate_id": mandate_id,
        }

    # view methods called by the market contract
    def get_mandate(self, mandate_id):
        return self.mandates[mandate_id]

    def get_chain(self, mandate_id):
        ids = []
        cur = mandate_id
        while True:
            m = self.mandates[cur]
            ids.append(cur)
            if m["parent_id"] == "":
                break
            cur = m["parent_id"]
        ids.reverse()
        return [self.mandates[i] for i in ids]

    def get_capability(self, capability_id):
        return self.capabilities[capability_id]

    def get_item(self, item_id):
        return self.items[item_id]

    def get_vendor(self, addr):
        return self.vendor_names.get(addr.lower(), "")

    # answered for the V1 (legacy) market, whose only call is is_consumed
    def is_consumed(self, capability_id):
        return capability_id in self.legacy_consumed


def make_hook(llm_stub, fake):
    """Build a vm._gl_call_hook.

    Handles exactly two request kinds:
    - "ExecPromptTemplate" (LLM): answered from llm_stub, returns calldata {"ok": str}.
    - "CallContract" (cross-contract view): dispatched to fake, returns 0x00 + calldata(result).
    Anything else returns None so the runner handles it normally.
    """

    def hook(vm, request):
        if not isinstance(request, dict):
            return None
        if "ExecPromptTemplate" in request:
            response = llm_stub.next(request["ExecPromptTemplate"])
            from genlayer.py import calldata  # lazy: importable only after first deploy
            return calldata.encode({"ok": response})
        if "CallContract" in request:
            if fake is None:
                raise AssertionError("unexpected cross-contract call")
            call = request["CallContract"]
            method = call["calldata"]["method"]
            args = call["calldata"].get("args", [])
            result = getattr(fake, method)(*args)
            from genlayer.py import calldata  # lazy: importable only after first deploy
            return bytes([0]) + calldata.encode(result)
        return None

    return hook


_ADDRESS_NAMES = ("principal", "agent_a", "agent_b", "agent_c", "agent_d", "agent_e", "vendor", "vendor2", "bystander")


def _make_addresses():
    raws = create_test_addresses(len(_ADDRESS_NAMES))
    addr = SimpleNamespace(**{name: raws[i] for i, name in enumerate(_ADDRESS_NAMES)})
    hx = SimpleNamespace(**{name: hexaddr(raws[i]) for i, name in enumerate(_ADDRESS_NAMES)})
    return addr, hx


@contextmanager
def registry_env(deployer="principal"):
    """Fresh VM, registry deployed, hook installed.

    env.vm, env.llm, env.addr.<name> (raw, for prank), env.hx.<name> ("0x..." str), env.contract
    """
    vm = VMContext()
    with vm.activate():
        addr, hx = _make_addresses()
        vm.sender = getattr(addr, deployer)
        llm = LLMStub()
        vm._gl_call_hook = make_hook(llm, None)
        contract = deploy_contract(REGISTRY_PATH, vm, sdk_version=SDK)
        yield SimpleNamespace(vm=vm, llm=llm, addr=addr, hx=hx, contract=contract)


@contextmanager
def market_env(fake, issuer, max_supply, deployer="principal", registry=None):
    """Fresh VM, market deployed against a FakeRegistry, hook installed.

    issuer: an env address name ("principal", ...) or any "0x..." hex string.
    The registry address is a dummy valid address: every registry read is
    answered by the fake through the hook.
    """
    vm = VMContext()
    with vm.activate():
        addr, hx = _make_addresses()
        vm.sender = getattr(addr, deployer)
        llm = LLMStub()
        vm._gl_call_hook = make_hook(llm, fake)
        issuer_hx = getattr(hx, issuer, issuer)
        registry_hx = "0x" + "aa" * 20 if registry is None else registry
        contract = deploy_contract(MARKET_PATH, vm, registry_hx, issuer_hx, max_supply, sdk_version=SDK)
        yield SimpleNamespace(vm=vm, llm=llm, addr=addr, hx=hx, contract=contract, issuer=issuer_hx, registry=registry_hx)


def set_chain_time(env, ts: int) -> None:
    """Set the transaction timestamp the contract reads as chain time."""
    iso = datetime.datetime.fromtimestamp(int(ts), datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000000Z")
    env.vm.warp(iso)
    gl_mod = sys.modules.get("genlayer.gl")
    if gl_mod is not None and getattr(gl_mod, "message_raw", None) is not None:
        gl_mod.message_raw["datetime"] = iso


DELIVERY_WINDOW = 3600
CHALLENGE_WINDOW = 1800


@contextmanager
def market_v2_env(fake, issuer="principal", max_supply=1000, legacy=None, deployer="principal", now=NOW):
    """Fresh VM, V2 market deployed against a FakeRegistry, chain time set to now.

    legacy: None for a dummy V1 market address answered by the fake, "" for none.
    """
    vm = VMContext()
    with vm.activate():
        addr, hx = _make_addresses()
        vm.sender = getattr(addr, deployer)
        llm = LLMStub()
        vm._gl_call_hook = make_hook(llm, fake)
        issuer_hx = getattr(hx, issuer, issuer)
        registry_hx = "0x" + "aa" * 20
        legacy_hx = "0x" + "bb" * 20 if legacy is None else legacy
        env = SimpleNamespace(vm=vm, llm=llm, addr=addr, hx=hx, issuer=issuer_hx, registry=registry_hx, legacy=legacy_hx)
        set_chain_time(env, now)
        env.contract = deploy_contract(MARKET_V2_PATH, vm, registry_hx, legacy_hx, issuer_hx, max_supply, DELIVERY_WINDOW, CHALLENGE_WINDOW, sdk_version=SDK)
        set_chain_time(env, now)
        yield env


def band(v: str, violated: str = "", reasoning: str = "stub reasoning", minority: str = "stub dissent", evidence: str = "stub evidence") -> str:
    return json.dumps({
        "verdict": v,
        "violated_restriction": violated,
        "reasoning": reasoning,
        "minority_note": minority,
        "evidence": evidence,
    })
