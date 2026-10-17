import re
from pathlib import Path

import pytest

from conftest import EXPIRY, NOW, MARKET_PATH, FakeRegistry, market_env

_BALANCE_NAMES = ("principal", "agent_a", "agent_b", "agent_c", "agent_d", "agent_e", "vendor", "vendor2", "bystander")


def build_chain(fake, env):
    """m_0 (principal -> agent_a, cap 5) -> m_1 (agent_a -> agent_b, cap 3) -> m_2 (agent_b -> agent_c, cap 3), plus item_0 and capability c_0 bound to m_2."""
    fake.add_mandate("m_0", parent_id="", root_id="m_0", depth="0", grantor=env.hx.principal, grantee=env.hx.agent_a, cap="5", expiry=str(EXPIRY), status="ACTIVE")
    fake.add_mandate("m_1", parent_id="m_0", root_id="m_0", depth="1", grantor=env.hx.agent_a, grantee=env.hx.agent_b, cap="3", expiry=str(EXPIRY), status="ACTIVE")
    fake.add_mandate("m_2", parent_id="m_1", root_id="m_0", depth="2", grantor=env.hx.agent_b, grantee=env.hx.agent_c, cap="3", expiry=str(EXPIRY), status="ACTIVE")
    fake.add_item("item_0", vendor=env.hx.vendor, category="infrastructure", title="Managed node hosting, 30 days", description="Dedicated node hosting.", price="2")
    fake.add_capability("c_0", status="ISSUED", grantee=env.hx.agent_c, item_id="item_0", price="2", mandate_id="m_2")


def mint_and_fund(env, amount=5):
    """Principal mints and funds the root mandate m_0."""
    with env.vm.prank(env.addr.principal):
        env.contract.mint(env.hx.principal, amount)
        env.contract.fund_root("m_0", amount)


def total_of(env):
    """Sum of every address balance plus the vault."""
    total = env.contract.get_vault_balance()
    for name in _BALANCE_NAMES:
        total += env.contract.balance_of(getattr(env.hx, name))
    return total


def snapshot(env):
    """Every balance, the vault, the root escrow, per-mandate spend and the purchase counter."""
    snap = {name: env.contract.balance_of(getattr(env.hx, name)) for name in _BALANCE_NAMES}
    snap["vault"] = env.contract.get_vault_balance()
    snap["escrow_m_0"] = env.contract.get_escrow("m_0")
    snap["spent_m_0"] = env.contract.get_spent("m_0")
    snap["spent_m_1"] = env.contract.get_spent("m_1")
    snap["spent_m_2"] = env.contract.get_spent("m_2")
    snap["purchase_count"] = env.contract.get_purchase_count()
    return snap


# MINTING

def test_issuer_mint_capped():
    """Minting is issuer-only and hard-capped at max_supply."""
    fake = FakeRegistry()
    with market_env(fake, "principal", 100) as env:
        with env.vm.prank(env.addr.principal):
            env.contract.mint(env.hx.principal, 60)
            env.contract.mint(env.hx.principal, 40)
            with pytest.raises(AssertionError):
                env.contract.mint(env.hx.principal, 1)
        with env.vm.prank(env.addr.bystander):
            with pytest.raises(AssertionError):
                env.contract.mint(env.hx.bystander, 1)
        assert env.contract.get_total_minted() == 100
        assert env.llm.calls == 0


# ESCROW

def test_fund_root_moves_balance_into_escrow():
    """Funding a root moves the principal's balance into the vault and the root's escrow."""
    fake = FakeRegistry()
    with market_env(fake, "principal", 100) as env:
        build_chain(fake, env)
        with env.vm.prank(env.addr.principal):
            env.contract.mint(env.hx.principal, 10)
            env.contract.fund_root("m_0", 5)
        assert env.contract.balance_of(env.hx.principal) == 5
        assert env.contract.get_vault_balance() == 5
        assert env.contract.get_escrow("m_0") == 5
        assert env.llm.calls == 0


def test_fund_root_gates():
    """Only the root's grantor, with enough balance, can fund a live root."""
    fake = FakeRegistry()
    with market_env(fake, "principal", 100) as env:
        build_chain(fake, env)
        with env.vm.prank(env.addr.principal):
            env.contract.mint(env.hx.principal, 10)
        with env.vm.prank(env.addr.bystander):
            with pytest.raises(AssertionError):
                env.contract.fund_root("m_0", 5)
        with env.vm.prank(env.addr.agent_a):
            with pytest.raises(AssertionError):
                env.contract.fund_root("m_0", 5)
        with env.vm.prank(env.addr.principal):
            with pytest.raises(AssertionError):
                env.contract.fund_root("m_1", 1)
            with pytest.raises(AssertionError):
                env.contract.fund_root("m_0", 11)
        fake.set_mandate_status("m_0", "REVOKED")
        with env.vm.prank(env.addr.principal):
            with pytest.raises(AssertionError):
                env.contract.fund_root("m_0", 5)
        assert env.llm.calls == 0


# PURCHASES

def test_purchase_pays_vendor_with_exact_conservation():
    """A purchase moves exactly the price from the vault to the vendor and books the spend on the whole chain."""
    fake = FakeRegistry()
    with market_env(fake, "principal", 100) as env:
        build_chain(fake, env)
        mint_and_fund(env)
        with env.vm.prank(env.addr.agent_c):
            purchase_id = env.contract.purchase("c_0", NOW)
        assert purchase_id == "pur_0"
        assert env.contract.balance_of(env.hx.vendor) == 2
        assert env.contract.get_vault_balance() == 3
        assert env.contract.get_escrow("m_0") == 3
        assert env.contract.get_spent("m_0") == 2
        assert env.contract.get_spent("m_1") == 2
        assert env.contract.get_spent("m_2") == 2
        assert env.contract.is_consumed("c_0") is True
        assert env.contract.get_purchase_for_capability("c_0") == "pur_0"
        p = env.contract.get_purchase("pur_0")
        assert p["buyer"] == env.hx.agent_c
        assert p["vendor"] == env.hx.vendor
        assert p["item"] == "item_0"
        assert p["price"] == "2"
        assert p["root"] == "m_0"
        assert p["capability"] == "c_0"
        assert total_of(env) == 5
        assert env.llm.calls == 0


def test_purchase_by_anyone_but_grantee_reverts():
    """Only the capability's bound grantee can purchase."""
    fake = FakeRegistry()
    with market_env(fake, "principal", 100) as env:
        build_chain(fake, env)
        mint_and_fund(env)
        for name in ("principal", "agent_b", "vendor", "bystander"):
            with env.vm.prank(getattr(env.addr, name)):
                with pytest.raises(AssertionError):
                    env.contract.purchase("c_0", NOW)
        assert env.contract.get_vault_balance() == 5
        assert env.llm.calls == 0


def test_non_issued_capability_reverts():
    """Only ISSUED capabilities can purchase; HELD and REFUSED are dead ends."""
    fake = FakeRegistry()
    with market_env(fake, "principal", 100) as env:
        build_chain(fake, env)
        mint_and_fund(env)
        fake.add_capability("c_1", status="HELD", grantee=env.hx.agent_c, item_id="item_0", price="2", mandate_id="m_2")
        fake.add_capability("c_2", status="REFUSED", grantee=env.hx.agent_c, item_id="item_0", price="2", mandate_id="m_2")
        with env.vm.prank(env.addr.agent_c):
            with pytest.raises(AssertionError):
                env.contract.purchase("c_1", NOW)
            with pytest.raises(AssertionError):
                env.contract.purchase("c_2", NOW)
        assert env.llm.calls == 0


def test_replay_reverts_and_leaves_balances_untouched():
    """A consumed capability cannot be replayed, and the failed replay moves nothing."""
    fake = FakeRegistry()
    with market_env(fake, "principal", 100) as env:
        build_chain(fake, env)
        mint_and_fund(env)
        with env.vm.prank(env.addr.agent_c):
            env.contract.purchase("c_0", NOW)
        before = snapshot(env)
        with env.vm.prank(env.addr.agent_c):
            with pytest.raises(AssertionError):
                env.contract.purchase("c_0", NOW)
        assert snapshot(env) == before
        assert env.llm.calls == 0


def test_race_two_capabilities_over_budget_together():
    """Two spending paths under one mandate pass alone, but the second is stopped once the shared cap is hit."""
    fake = FakeRegistry()
    with market_env(fake, "principal", 100) as env:
        build_chain(fake, env)
        mint_and_fund(env)
        fake.add_capability("c_1", status="ISSUED", grantee=env.hx.agent_c, item_id="item_0", price="2", mandate_id="m_2")
        with env.vm.prank(env.addr.agent_c):
            env.contract.purchase("c_0", NOW)
        before = snapshot(env)
        with env.vm.prank(env.addr.agent_c):
            with pytest.raises(AssertionError):
                env.contract.purchase("c_1", NOW)
        assert snapshot(env) == before
        assert env.llm.calls == 0


def test_sibling_mandates_share_parent_budget():
    """Spending under a sibling mandate also counts against the shared parent's cap."""
    fake = FakeRegistry()
    with market_env(fake, "principal", 100) as env:
        build_chain(fake, env)
        mint_and_fund(env)
        fake.add_mandate("m_3", parent_id="m_1", root_id="m_0", depth="2", grantor=env.hx.agent_b, grantee=env.hx.agent_d, cap="3", expiry=str(EXPIRY), status="ACTIVE")
        fake.add_capability("c_1", status="ISSUED", grantee=env.hx.agent_d, item_id="item_0", price="2", mandate_id="m_3")
        with env.vm.prank(env.addr.agent_c):
            env.contract.purchase("c_0", NOW)
        assert env.contract.get_spent("m_1") == 2
        with env.vm.prank(env.addr.agent_d):
            with pytest.raises(AssertionError):
                env.contract.purchase("c_1", NOW)
        assert env.contract.get_spent("m_1") == 2
        assert env.llm.calls == 0


def test_revoked_ancestor_blocks_purchase():
    """A revoked ancestor anywhere in the chain blocks every purchase below it."""
    fake = FakeRegistry()
    with market_env(fake, "principal", 100) as env:
        build_chain(fake, env)
        mint_and_fund(env)
        fake.set_mandate_status("m_1", "REVOKED")
        with env.vm.prank(env.addr.agent_c):
            with pytest.raises(AssertionError):
                env.contract.purchase("c_0", NOW)
        assert env.contract.get_vault_balance() == 5
        assert env.llm.calls == 0


def test_expired_chain_blocks_purchase():
    """A purchase past the chain's expiry is refused."""
    fake = FakeRegistry()
    with market_env(fake, "principal", 100) as env:
        build_chain(fake, env)
        mint_and_fund(env)
        with env.vm.prank(env.addr.agent_c):
            with pytest.raises(AssertionError):
                env.contract.purchase("c_0", EXPIRY + 1)
        assert env.llm.calls == 0


def test_price_mismatch_reverts():
    """The capability's recorded price must match the catalog price exactly."""
    fake = FakeRegistry()
    with market_env(fake, "principal", 100) as env:
        build_chain(fake, env)
        mint_and_fund(env)
        fake.add_capability("c_1", status="ISSUED", grantee=env.hx.agent_c, item_id="item_0", price="1", mandate_id="m_2")
        with env.vm.prank(env.addr.agent_c):
            with pytest.raises(AssertionError):
                env.contract.purchase("c_1", NOW)
        assert env.llm.calls == 0


def test_insufficient_escrow_reverts():
    """A purchase cannot spend more than the root escrowed."""
    fake = FakeRegistry()
    with market_env(fake, "principal", 100) as env:
        build_chain(fake, env)
        with env.vm.prank(env.addr.principal):
            env.contract.mint(env.hx.principal, 1)
            env.contract.fund_root("m_0", 1)
        with env.vm.prank(env.addr.agent_c):
            with pytest.raises(AssertionError):
                env.contract.purchase("c_0", NOW)
        assert env.contract.get_vault_balance() == 1
        assert env.llm.calls == 0


# REFUNDS

def test_refund_rules():
    """Only the principal can refund a root, only once it is dead or expired, and the refund drains it fully."""
    fake = FakeRegistry()
    with market_env(fake, "principal", 100) as env:
        build_chain(fake, env)
        mint_and_fund(env)
        with env.vm.prank(env.addr.agent_c):
            env.contract.purchase("c_0", NOW)
        assert env.contract.get_escrow("m_0") == 3
        with env.vm.prank(env.addr.principal):
            with pytest.raises(AssertionError):
                env.contract.refund_root("m_0", NOW)
        with env.vm.prank(env.addr.bystander):
            with pytest.raises(AssertionError):
                env.contract.refund_root("m_0", NOW)
        fake.set_mandate_status("m_0", "REVOKED")
        with env.vm.prank(env.addr.agent_a):
            with pytest.raises(AssertionError):
                env.contract.refund_root("m_0", NOW)
        with env.vm.prank(env.addr.principal):
            refunded = env.contract.refund_root("m_0", NOW)
        assert refunded == 3
        assert env.contract.balance_of(env.hx.principal) == 3
        assert env.contract.get_escrow("m_0") == 0
        assert env.contract.get_vault_balance() == 0
        with env.vm.prank(env.addr.principal):
            with pytest.raises(AssertionError):
                env.contract.refund_root("m_0", NOW)
        assert env.llm.calls == 0


def test_refund_after_expiry():
    """An expired root can be refunded by the principal even while still ACTIVE."""
    fake = FakeRegistry()
    with market_env(fake, "principal", 100) as env:
        build_chain(fake, env)
        mint_and_fund(env)
        with env.vm.prank(env.addr.principal):
            refunded = env.contract.refund_root("m_0", EXPIRY + 1)
        assert refunded == 5
        assert env.contract.balance_of(env.hx.principal) == 5
        assert env.contract.get_escrow("m_0") == 0
        assert env.contract.get_vault_balance() == 0
        assert env.llm.calls == 0


# CONSERVATION AND NO PRIVILEGED ROLES

def test_conservation_and_no_privileged_roles():
    """Value is conserved through every state change, the deployer has no power, and the write surface is exactly four methods."""
    fake = FakeRegistry()
    with market_env(fake, "principal", 100, deployer="bystander") as env:
        build_chain(fake, env)
        with env.vm.prank(env.addr.principal):
            env.contract.mint(env.hx.principal, 10)
            env.contract.fund_root("m_0", 5)
        assert total_of(env) == 10
        with env.vm.prank(env.addr.agent_c):
            env.contract.purchase("c_0", NOW)
        assert total_of(env) == 10
        fake.set_mandate_status("m_0", "REVOKED")
        with env.vm.prank(env.addr.principal):
            env.contract.refund_root("m_0", NOW)
        assert total_of(env) == 10
        assert env.contract.get_total_minted() == 10
        with env.vm.prank(env.addr.bystander):
            with pytest.raises(AssertionError):
                env.contract.mint(env.hx.bystander, 1)
        assert env.llm.calls == 0
    source = Path(MARKET_PATH).read_text(encoding="utf-8")
    lines = source.splitlines()
    writes = set()
    for i, line in enumerate(lines):
        if "@gl.public.write" in line:
            m = re.match(r"\s*def\s+(\w+)", lines[i + 1])
            writes.add(m.group(1))
    assert writes == {"mint", "fund_root", "purchase", "refund_root"}


# ADDRESS HARDENING

def test_constructor_rejects_malformed_addresses():
    """The market normalizes a padded address to the real one and refuses to deploy with a malformed registry or issuer address."""
    fake = FakeRegistry()
    with market_env(fake, "principal", 100, registry="   0x" + "aa" * 20) as env:
        assert env.contract.get_registry() == "0x" + "aa" * 20
        assert env.llm.calls == 0
    with pytest.raises(AssertionError):
        with market_env(FakeRegistry(), "principal", 100, registry="0x123"):
            pass
    with pytest.raises(AssertionError):
        with market_env(FakeRegistry(), "principal", 100, registry=""):
            pass
    with pytest.raises(AssertionError):
        with market_env(FakeRegistry(), "principal", 100, registry="0x" + "zz" * 20):
            pass
    with pytest.raises(AssertionError):
        with market_env(FakeRegistry(), "not-an-address", 100):
            pass
    with market_env(FakeRegistry(), "principal", 100) as env:
        assert env.contract.get_registry() == "0x" + "aa" * 20
        assert env.llm.calls == 0


def test_mint_rejects_malformed_recipient_and_strips_padding():
    """Minting refuses a malformed recipient and normalizes a padded one to the real address."""
    fake = FakeRegistry()
    with market_env(fake, "principal", 100) as env:
        with env.vm.prank(env.addr.principal):
            with pytest.raises(AssertionError):
                env.contract.mint("0x123", 1)
            with pytest.raises(AssertionError):
                env.contract.mint("", 1)
            env.contract.mint("  " + env.hx.agent_a + "  ", 3)
        assert env.contract.balance_of(env.hx.agent_a) == 3
        assert env.contract.get_total_minted() == 3
        assert env.llm.calls == 0
