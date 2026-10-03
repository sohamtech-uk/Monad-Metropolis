# Release review: additional blockers found during UI work

The customer redesign is a preview change, not an approval for general availability. See `PRODUCT_EXPERIENCE.md` for the full release checklist.

## Native business sign-in

Google sign-in through the existing Cherry Money bridge is currently web-only. Native clients still use the existing authorised temporary-token path. That fallback is labelled and moved into Advanced connection settings; it is not an acceptable onboarding experience for public customers. Implement a reviewed native OAuth/deep-link flow with server-side session lifecycle and secure return handling before release. The web return now opens the supplier screen immediately and removes its one-time-code/error fragment through the existing exchange handler.

## Dependency advisories

The CI dependency installation for commit `a039c477f49fa51d83af4f003e758b3b92b43f34` (run `37070749582`) reported 57 package advisories: 6 low, 14 moderate, 32 high and 5 critical. This is the install/audit report for the dependency tree, not an assessment that all reported issues are exploitable in the deployed app. No new runtime dependency was added for this redesign.

Before public launch, generate a current advisory inventory, separate production/runtime from development/transitive paths, assess reachability, and update or document each disposition. Do not run a blind forced dependency upgrade on the working payment stack. Re-run native/web, signer, SDK and contract regression tests after changes. Retain review evidence.

## Session memory is not durable recovery

The UI now retains a per-draft submission guard across navigation within the current JavaScript app session and labels its latest receipt as session-only. Neither survives a reload, reinstall or another device. A durable, authenticated payment/execution record and idempotency across devices remain required. Ambiguous transactions must be recovered from their original submission, not automatically resubmitted.

## Demo versus live evidence

The optional 5 USD demo draft is a labelled stored snapshot, not a newly retrieved unpaid instruction. Browser test screenshots use blocked external networking and demonstrate UI/error boundaries, not live provider acceptance. A real passkey ceremony, testnet transaction, live Envio endpoint and verified CRE run must be validated separately. No mainnet transaction was authorised or submitted while implementing these UI changes.
