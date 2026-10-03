# Cherry Pay Global: customer experience and release gates

## Design direction

Apply the workshop's product principles rather than adding more sponsor-labelled tabs:

- Port: choose improvements that reduce user friction; reuse the existing official SDKs and templates rather than rebuilding infrastructure.
- Aurora: the customer chooses an outcome; routing belongs behind that outcome. Only advertise the Base USDC → Monad USDC route that this build implements.
- Envio: show a payment's observed progress and evidence, not an invented success animation. Raw HyperSync observations remain provisional.
- The company-building slide: production readiness, support, distribution and a sustainable business model are separate from winning a demo.

This change is a customer-facing redesign of the preview. It is NOT a declaration that the app is audited, regulated, generally available, guaranteed to win, or safe for unrestricted mainnet use.

## Implemented

### Navigation and hierarchy

Home / Pay / Activity / More, with a desktop sidebar and mobile bottom navigation. Home has one primary supplier-payment action, explicit testnet/mainnet route choices and an honest empty state. No fabricated balances, portfolio charts, users, savings or payment successes.

Feature panels are first mounted on demand, then retained so ordinary navigation does not reset a passkey/payment journey. Native safe-area insets are respected and bottom navigation yields to the keyboard. Supplier signing/submission locks top-level navigation while work is pending.

Envio's live workspace remains accessible from Activity and More. Experimental earnings/rewards/gifts are under More and keep their original default-off controls. No request-money, QR, fiat off-ramp or AI action is advertised as working without implementation.

### Supplier journey

Choose a Cherry Money draft → authorise the recipient with Mera → review the exact amount/address/network/reference → explicitly confirm → receive an on-chain receipt → inspect business checks.

Network checking is automatic and retryable, not a separate customer task. The existing Google sign-in and numeric-company-ID fixes are preserved. The customer flow is restricted to Monad Testnet and USD/AUSD drafts; no FX conversion or recipient ownership is inferred.

The new presentation calls the existing `ScopedMeraPaymentSession`, `createPaymentSessionScope` and transfer/correlation methods. It does not change key derivation, the session policy, chain configuration or contract code. The payment reference uses the original draft fingerprint and keccak encoding.

A confirmation screen binds amount, recipient, chain and draft context. The same context and active session are checked again on confirm; the handler uses a synchronous lock to prevent double-click submissions. A known confirmed transfer is not treated as failed when a subsequent balance refresh fails. An ambiguous submission blocks a blind retry in the current composer session. These are UI safeguards, NOT durable server-side idempotency.

### Receipts and evidence

Activity shows the latest confirmed supplier transfer in this application session, not a fabricated account history. Reloading clears the view but does not reverse a transfer.

The receipt separately labels transfer confirmation, business-reference recording and the exact indexed match. It never upgrades those states into an accounting posting or a production CRE attestation. Envio polling and matching continue through the existing read-only component when its detail view is collapsed. Analytics and the non-wallet Mera capability remain available as optional evidence.

### Cross-chain boundary

The existing Aurora SDK flow is retained behind an explicit real-funds entry notice. Opening it does not sign or send. Its fee/cap/route boundaries are still visible. This redesign does not fix all of the underlying Aurora execution-recovery or quote-repricing limitations; see the release gates below.

### Accessibility and resilience

Readable type/spacing, high-contrast primary controls, at least 48px primary buttons, labelled text inputs, selected/disabled/expanded accessibility states, hidden panels excluded from accessibility traversal, selectable complete payment references and a reduced-animation presentation. Errors offer a next action without claiming a missing payment failed. VoiceOver/TalkBack and large dynamic text still require real-device testing.

## Automated validation

- Existing TypeScript/codegen, browser-auth, Aurora and Envio tests remain in CI.
- `tests/payment-experience.test.ts` checks exact decimal parsing, review/context binding, unsupported networks/currencies, zero address, scope cap and truthful receipt labels.
- `scripts/consumer_browser_smoke.py` loads the actual compiled Expo app and local assets. All external requests are blocked; it performs no authentication, passkey ceremony or transfer.
- Browser checks cover Home, truthful activity, real-funds entry consent, disabled network/draft/verification gates, Envio unavailable states, lab controls and 320px/390px layouts.
- Screenshots and a result manifest are uploaded to the `consumer-browser-check` CI artifact. They are offline UI evidence, not live settlement evidence.

## Before public launch — release blockers

1. **Durable payment recovery and idempotency.** Persist an authenticated payment/execution reference before submission. Recover safely after app restart, passkey expiry, device change and a timeout after broadcast. Prevent duplicate business payments across sessions/devices; session memory is insufficient.
2. **Mainnet quote and recipient safety.** Review fees, exact-input vs exact-output meaning, minimum recipient amount, quote expiration/repricing and fund-recovery/cancellation states against Aurora's current SDK. Reconfirm material changes. Add verified payee/address binding. A checksum is not ownership verification.
3. **Real-device acceptance and security review.** Exercise native passkeys/recovery on supported iOS and Android devices plus web browsers; test backgrounding during signing, rejected prompts, no gas, provider outages, chain reorganisation and long-running executions. Review contracts, session policies, proxy boundaries and secret handling before real-customer funds.
4. **Production reconciliation.** Use authenticated, transaction-specific, replay-safe CRE evidence and authorised, idempotent accounting writes. Imported simulation JSON is not production proof. Define destination finality and cross-chain correlation rules, not amount-based matching.
5. **Operational readiness.** Production monitoring, rate/budget limits, alert ownership, support/refund/recovery processes, release/rollback procedures and incident runbooks. Review applicable legal, privacy and product-launch obligations with qualified advisers. Do not advertise guarantees or protections not established for this product.

## Next UX improvements after those blockers

Use an official sponsored-transaction pattern only if compatible with the Mera account/session architecture. Add authenticated account history, verified contacts/payment requests and a unified wallet/session model after their underlying behaviour is implemented. Do not replace a working signer merely to match a template or add another sponsor.

## Demonstration

Open Home → Pay a supplier → select the actual demo business draft → approve the recipient → review and confirm an authorised testnet transfer → show the receipt → expand Envio evidence → open business verification. Demonstrate an outage/partial state honestly rather than replaying a success as live. Show the real-funds Aurora entry separately; never move mainnet funds automatically for the demonstration.

The strongest narrative is one useful payment journey with progressively available proof—not the number of technologies on screen.

## Technical references

- https://reactnative.dev/docs/accessibility
- https://docs.envio.dev/docs/HyperSync/hypersync-query
- https://docs.intents.aurora.dev/llms.txt
- Existing integration runbooks: `ENVIO_LIVE.md`, `AURORA_INTENTS.md`, `CHERRY_MONEY_BRIDGE.md`.
