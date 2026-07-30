------------------------------- MODULE Idempotency -------------------------------
VARIABLES seen_keys, balance

Init == seen_keys = {} /\ balance = 0

DO(key, amount) ==
  /\ key \notin seen_keys
  /\ seen_keys' = seen_keys \cup {key}
  /\ balance' = balance + amount

DO_again(key, amount) ==
  /\ key \in seen_keys
  /\ UNCHANGED <<seen_keys, balance>>

Next == \E k \in STRING, a \in NAT: DO(k,a) \/ DO_again(k,a)

THEOREM NoDoubleCharge == []~(balance' > balance + amount)
