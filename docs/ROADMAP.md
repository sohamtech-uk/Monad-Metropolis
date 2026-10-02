# Monad Metropolis Delivery Roadmap

**Submission deadline:** 14 October 2026 at 04:59 BST  
**Internal submission target:** 14 October 2026 at 01:00 BST

| Date | Milestone | Exit criterion |
|---|---|---|
| 29 Sep | Phase 1 — repository + Monad/AUSD foundation | Mobile app reads live Monad status and AUSD balance |
| 30 Sep | Mera passkey account layer | Same Monad account reconstructs from the same passkey |
| 1 Oct | Mera scoped signing sessions | Prompt-free scoped session works with clear expiry/re-prompt UX |
| 2 Oct | Agora AUSD payment MVP | Mera onboarding → AUSD balance → send/receive → Monad confirmation |
| 3 Oct | Cherry Money invoice integration | Real Cherry Money payment draft maps to Monad payment context |
| 4 Oct | Settlement event/contract | Privacy-safe business settlement event emitted on Monad |
| 5 Oct | Chainlink CRE | Successful CRE simulation orchestrates Monad + Cherry Money API |
| 6 Oct | Reconciliation evidence | CRE produces deterministic reconciliation evidence for the correct Cherry Money payment draft |
| 7 Oct | Envio HyperIndex | Live Monad settlement data is indexed and queryable |
| 8 Oct | Settlement analytics | Envio data powers transaction history and analytics |
| 9 Oct | Mera PRF non-wallet feature | Same passkey reproduces a namespaced encryption key cross-device |
| 10 Oct | End-to-end integration | One complete flow works repeatedly without mocks in the qualifying path |
| 11 Oct | UX polish | Demo feels like fintech, not a crypto wallet |
| 12 Oct | Testing + public docs | Sponsor deliverables and evidence are complete |
| 13 Oct | Code freeze + recording | Final demo and submission package ready |
| 14 Oct | Submit | Submission complete before 01:00 BST internal target |

## Priority

See [BOUNTY_TARGETS.md](./BOUNTY_TARGETS.md) for the selected sponsor-bounty evidence plan.

### P0 — preserve the qualifying path
- Mera onboarding/recovery
- AUSD balance
- AUSD send/receive
- real Monad transaction
- usable mobile payment flow
- Cherry Money payment-draft binding
- CRE deterministic reconciliation evidence
- final demo

### P1 — selected bounty/UX work
- Aurora Intents: one reliable any-chain-to-Monad payment/funding route
- sponsored/gas UX using supported Monad mobile patterns where it does not destabilise Mera
- visible live Envio HyperSync evidence around the qualifying payment
- contract source verification and explorer evidence
- bounty-specific screenshots/runbooks/evidence

### P2
- Envio indexing and analytics
- Mera PRF non-wallet capability
- consumer earnings/rewards/gifts after the core payment path remains stable

### P3
- additional rail-routing intelligence
- broader cross-chain coverage beyond the one Aurora demo route
- additional AI features

Do not sacrifice the stable qualifying payment + reconciliation path to add sponsor functionality.

## Hackathon accounting boundary

The Metropolis qualifying path ends at independently verified reconciliation evidence:

```text
AUSD settlement on Monad
   ↓
Envio + registry verification
   ↓
Chainlink CRE
   ↓
deterministic reconciliation evidence
   ↓
Judge Mode proof
```

The hackathon client does **not** mark a production Cherry Money invoice paid or post to
the accounting ledger. Cherry Money does not yet expose a dedicated blockchain-settlement
callback, and reusing an unrelated reconciliation endpoint would weaken the safety boundary.

The production follow-on is explicit and separate:

```text
verified CRE reconciliation evidence
   ↓
reviewed + authenticated + idempotent settlement callback
   ↓
Cherry Money invoice / ledger / reconciliation update
```

## Rail strategy

Cherry Pay remains multi-rail:

```text
Cherry Pay
   ├── Open Banking / PISP
   ├── Stellar
   └── Monad / AUSD
```

Monad/AUSD is the qualifying Metropolis/Agora transaction. Stellar remains part of the
broader Cherry Money cross-border architecture and is not replaced by this project.
