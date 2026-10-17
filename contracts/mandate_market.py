# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *

VAULT_KEY = "__vault__"


class MandateMarket(gl.Contract):
    registry: str
    issuer: str
    max_supply: u256
    total_minted: u256
    balances: TreeMap[str, u256]      # address -> balance, plus VAULT_KEY
    escrow: TreeMap[str, u256]        # root mandate id -> escrowed amount
    spent: TreeMap[str, u256]         # mandate id -> cumulative spent through this market
    consumed: TreeMap[str, str]       # capability id -> purchase id (presence means consumed)
    purchase_count: u256
    p_capability: TreeMap[str, str]   # purchase id -> capability id
    p_buyer: TreeMap[str, str]
    p_vendor: TreeMap[str, str]
    p_item: TreeMap[str, str]
    p_price: TreeMap[str, u256]
    p_root: TreeMap[str, str]
    p_at: TreeMap[str, u256]

    def __init__(self, registry_address: str, issuer: str, max_supply: int):
        reg = registry_address.strip().lower()
        iss = issuer.strip().lower()
        assert self._valid_addr(reg), "invalid registry address"
        assert self._valid_addr(iss), "invalid issuer address"
        self.registry = reg
        self.issuer = iss
        self.max_supply = u256(int(max_supply))
        self.total_minted = u256(0)
        self.purchase_count = u256(0)

    def _valid_addr(self, a: str) -> bool:
        if len(a) != 42 or not a.startswith("0x"):
            return False
        hex_digits = "0123456789abcdef"
        for ch in a[2:].lower():
            if ch not in hex_digits:
                return False
        return True

    @gl.public.write
    def mint(self, to: str, amount: int) -> None:
        caller = gl.message.sender_address.as_hex.lower()
        assert caller == self.issuer, "only issuer may mint"
        assert amount > 0, "amount must be positive"
        amt = u256(int(amount))
        assert u256(int(self.total_minted) + int(amt)) <= self.max_supply, "max supply exceeded"
        to_addr = to.strip().lower()
        assert self._valid_addr(to_addr), "invalid recipient address"
        self.balances[to_addr] = u256(int(self.balances.get(to_addr, u256(0))) + int(amt))
        self.total_minted = u256(int(self.total_minted) + int(amt))

    @gl.public.write
    def fund_root(self, root_id: str, amount: int) -> None:
        caller = gl.message.sender_address.as_hex.lower()
        m = gl.get_contract_at(Address(self.registry)).view().get_mandate(root_id)
        assert m["depth"] == "0", "not a root mandate"
        assert m["status"] == "ACTIVE", "root not active"
        assert caller == m["grantor"].lower(), "only the principal may fund this root"
        assert amount > 0, "amount must be positive"
        amt = u256(int(amount))
        caller_balance = u256(int(self.balances.get(caller, u256(0))))
        assert int(caller_balance) >= int(amt), "insufficient balance"
        self.balances[caller] = u256(int(caller_balance) - int(amt))
        self.balances[VAULT_KEY] = u256(int(self.balances.get(VAULT_KEY, u256(0))) + int(amt))
        self.escrow[root_id] = u256(int(self.escrow.get(root_id, u256(0))) + int(amt))

    @gl.public.write
    def purchase(self, capability_id: str, now: int) -> str:
        caller = gl.message.sender_address.as_hex.lower()
        registry = gl.get_contract_at(Address(self.registry))
        cap = registry.view().get_capability(capability_id)
        assert cap["status"] == "ISSUED", "capability not issued"
        assert caller == cap["grantee"].lower(), "only the bound grantee may purchase"
        assert capability_id not in self.consumed, "capability already used"
        item = registry.view().get_item(cap["item_id"])
        price = u256(int(cap["price"]))
        assert u256(int(item["price"])) == price, "price mismatch"
        chain = registry.view().get_chain(cap["mandate_id"])
        assert len(chain) > 0, "empty chain"
        for hop in chain:
            assert hop["status"] == "ACTIVE", "chain contains an inactive mandate"
            assert now <= int(hop["expiry"]), "chain contains an expired mandate"
            hop_spent = u256(int(self.spent.get(hop["id"], u256(0))))
            assert u256(int(hop_spent) + int(price)) <= u256(int(hop["cap"])), "budget exceeded at a mandate in the chain"
        root_id = chain[0]["id"]
        escrowed = u256(int(self.escrow.get(root_id, u256(0))))
        assert int(escrowed) >= int(price), "root escrow insufficient"
        vault_before = u256(int(self.balances.get(VAULT_KEY, u256(0))))
        assert int(vault_before) >= int(price), "vault insufficient"
        vendor = item["vendor"].lower()
        vendor_before = u256(int(self.balances.get(vendor, u256(0))))
        self.escrow[root_id] = u256(int(escrowed) - int(price))
        self.balances[VAULT_KEY] = u256(int(vault_before) - int(price))
        self.balances[vendor] = u256(int(vendor_before) + int(price))
        for hop in chain:
            self.spent[hop["id"]] = u256(int(self.spent.get(hop["id"], u256(0))) + int(price))
        assert int(self.balances[VAULT_KEY]) == int(vault_before) - int(price) and int(self.balances[vendor]) == int(vendor_before) + int(price), "conservation failed"
        purchase_id = "pur_" + str(int(self.purchase_count))
        self.purchase_count = u256(int(self.purchase_count) + 1)
        self.p_capability[purchase_id] = capability_id
        self.p_buyer[purchase_id] = caller
        self.p_vendor[purchase_id] = vendor
        self.p_item[purchase_id] = item["id"]
        self.p_price[purchase_id] = price
        self.p_root[purchase_id] = root_id
        self.p_at[purchase_id] = u256(int(now))
        self.consumed[capability_id] = purchase_id
        return purchase_id

    @gl.public.write
    def refund_root(self, root_id: str, now: int) -> int:
        caller = gl.message.sender_address.as_hex.lower()
        m = gl.get_contract_at(Address(self.registry)).view().get_mandate(root_id)
        assert m["depth"] == "0", "not a root mandate"
        assert caller == m["grantor"].lower(), "only the principal may refund"
        assert m["status"] == "REVOKED" or now > int(m["expiry"]), "root still live"
        amount = u256(int(self.escrow.get(root_id, u256(0))))
        assert int(amount) > 0, "nothing to refund"
        self.escrow[root_id] = u256(0)
        vault = u256(int(self.balances.get(VAULT_KEY, u256(0))))
        assert int(vault) >= int(amount), "vault insufficient"
        self.balances[VAULT_KEY] = u256(int(vault) - int(amount))
        self.balances[caller] = u256(int(self.balances.get(caller, u256(0))) + int(amount))
        return int(amount)

    @gl.public.view
    def balance_of(self, addr: str) -> int:
        return int(self.balances.get(addr.strip().lower(), u256(0)))

    @gl.public.view
    def get_vault_balance(self) -> int:
        return int(self.balances.get(VAULT_KEY, u256(0)))

    @gl.public.view
    def get_escrow(self, root_id: str) -> int:
        return int(self.escrow.get(root_id, u256(0)))

    @gl.public.view
    def get_spent(self, mandate_id: str) -> int:
        return int(self.spent.get(mandate_id, u256(0)))

    @gl.public.view
    def is_consumed(self, capability_id: str) -> bool:
        return capability_id in self.consumed

    @gl.public.view
    def get_purchase_for_capability(self, capability_id: str) -> str:
        return self.consumed.get(capability_id, "")

    @gl.public.view
    def get_purchase(self, purchase_id: str) -> dict:
        return {
            "capability": self.p_capability.get(purchase_id, ""),
            "buyer": self.p_buyer.get(purchase_id, ""),
            "vendor": self.p_vendor.get(purchase_id, ""),
            "item": self.p_item.get(purchase_id, ""),
            "price": str(int(self.p_price.get(purchase_id, u256(0)))),
            "root": self.p_root.get(purchase_id, ""),
            "at": str(int(self.p_at.get(purchase_id, u256(0)))),
        }

    @gl.public.view
    def get_purchase_count(self) -> int:
        return int(self.purchase_count)

    @gl.public.view
    def get_total_minted(self) -> int:
        return int(self.total_minted)

    @gl.public.view
    def get_max_supply(self) -> int:
        return int(self.max_supply)

    @gl.public.view
    def get_registry(self) -> str:
        return self.registry

    @gl.public.view
    def get_issuer(self) -> str:
        return self.issuer
