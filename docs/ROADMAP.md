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

### P0
- Mera onboarding/recovery
- AUSD balance
- AUSD send/receive
- real Monad transaction
- usable mobile payment flow
- final demo

### P1
- Cherry Money invoice/payment-draft integration
- CRE orchestration
- deterministic reconciliation evidence bound to the source Cherry Money payment draft

### P2
- Envio indexing and analytics
- Mera PRF non-wallet capability

### P3
- additional rail-routing intelligence
- additional cross-chain experimentation
- additional AI features

Do not sacrifice a stable P0/P1 demo to add optional sponsor functionality.

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
