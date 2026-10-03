import { useEffect, useMemo, useRef, useState } from "react";
import { AppState, Linking, Text, TextInput, View } from "react-native";
import type { CherryMoneyPaymentDraft } from "@cherry-metropolis/cherry-money-client";
import { createPaymentSessionScope, MonadReadClient, type AusdBalance, type NativeBalance, type MonadRuntimeConfig } from "@cherry-metropolis/core";
import { formatUnits, getAddress, keccak256, toBytes, zeroAddress } from "viem";
import { createMeraLiveAccount, recoverMeraLiveAccount, describeMeraError, type MeraAccountIdentity } from "../mera/account";
import { ScopedMeraPaymentSession, type AusdTransferResult } from "../mera/scopedSession";
import { createPaymentReview, draftKey, sameReview, type PaymentReview } from "./model";
import { Action, Badge, Detail, Disclosure, Notice, ui } from "./ui";

type Props = {
  runtimeConfig: MonadRuntimeConfig; paymentDraft: CherryMoneyPaymentDraft;
  onIdentity: (identity: MeraAccountIdentity) => void;
  onTransferSettled: (result: AusdTransferResult) => void;
  onBusyChange: (busy: boolean) => void;
};
// Memory-only guard survives screen/draft changes. It is NOT durable idempotency:
// an authenticated server-side execution record is still required before launch.
// Store public identity/result only, never a live account, signer or secret.
const attemptedDrafts = new Map<string, {
  key: string; identity: MeraAccountIdentity; transfer: AusdTransferResult | null;
}>();

/** Customer presentation over the existing scoped Mera adapter. No alternative signer or relay. */
export function SupplierPaymentComposer({ runtimeConfig, paymentDraft, onIdentity, onTransferSettled, onBusyChange }: Props) {
  const client = useMemo(() => new MonadReadClient(runtimeConfig), [runtimeConfig]);
  const session = useRef<ScopedMeraPaymentSession | null>(null);
  const lock = useRef(false);
  const mounted = useRef(true);
  const [recipient, setRecipient] = useState("");
  const [identity, setIdentity] = useState<MeraAccountIdentity | null>(null);
  const [ausd, setAusd] = useState<AusdBalance | null>(null);
  const [mon, setMon] = useState<NativeBalance | null>(null);
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [expires, setExpires] = useState(0);
  const [review, setReview] = useState<PaymentReview | null>(null);
  const [transfer, setTransfer] = useState<AusdTransferResult | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [faucetHash, setFaucetHash] = useState("");
  const key = draftKey(paymentDraft);
  const amount = paymentDraft.amount.toFixed(2);
  const currentKey = useRef(key); currentKey.current = key;

  useEffect(() => { onBusyChange(pending !== ""); }, [pending, onBusyChange]);
  useEffect(() => {
    mounted.current = true;
    const tick = () => setExpires(session.current?.status().active ? session.current.status().remainingMs : 0);
    const timer = setInterval(tick, 1000);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        session.current?.end("background"); setExpires(0); setReview(null);
        setNotice("For your security, authorisation ended when the app left the foreground. Check any submitted payment before continuing.");
      }
    });
    return () => { mounted.current = false; clearInterval(timer); subscription.remove(); session.current?.end("replaced"); };
  }, []);
  useEffect(() => {
    session.current?.end("replaced"); session.current = null;
    setReview(null); setTransfer(null); setUncertain(false); setExpires(0);
    setRecipient(""); setIdentity(null); setAusd(null); setMon(null); setError(""); setNotice(""); setFaucetHash("");
    const previous = attemptedDrafts.get(paymentDraft.id);
    if (previous) {
      setIdentity(previous.identity); onIdentity(previous.identity);
      if (previous.key === key && previous.transfer) {
        setTransfer(previous.transfer); setRecipient(previous.transfer.recipient); onTransferSettled(previous.transfer);
        setNotice("This draft already has a confirmed transfer in this app session. Review its receipt instead of paying again.");
      } else {
        setUncertain(true);
        setNotice("A submission already exists for this draft in this app session. Check the original transaction before another attempt.");
      }
    }
  }, [key, paymentDraft.id, onIdentity, onTransferSettled]);

  async function balances(address: string) {
    const [nextAusd, nextMon] = await Promise.all([client.ausdBalance(address), client.nativeBalance(address)]);
    if (mounted.current) { setAusd(nextAusd); setMon(nextMon); }
  }
  async function work(name: string, task: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true; setPending(name); setError("");
    try { await task(); }
    catch (cause) { if (mounted.current) setError(describeMeraError(cause)); }
    finally { lock.current = false; if (mounted.current) { setPending(""); setExpires(session.current?.status().active ? session.current.status().remainingMs : 0); } }
  }
  function validatedRecipient() {
    const address = getAddress(recipient.trim());
    if (address === zeroAddress) throw new Error("Enter the supplier's address, not the zero address.");
    if (runtimeConfig.chainId !== 10143) throw new Error("This supplier preview only supports Monad Testnet.");
    return address;
  }
  function makeReview() {
    const maximum = session.current?.scope.maxPerPayment;
    if (maximum === undefined) throw new Error("Use your passkey to authorise this recipient first.");
    return createPaymentReview({ draft: paymentDraft, recipient, amount, chainId: runtimeConfig.chainId,
      decimals: runtimeConfig.ausdDecimals, maximum });
  }
  async function connect(create: boolean) {
    if (transfer || uncertain || attemptedDrafts.has(paymentDraft.id)) return;
    const requestKey = key;
    await work("passkey", async () => {
      const address = validatedRecipient();
      session.current?.end("replaced"); session.current = null; setReview(null);
      const live = await (create ? createMeraLiveAccount() : recoverMeraLiveAccount());
      if (!mounted.current || currentKey.current !== requestKey || AppState.currentState === "background") {
        live.end();
        if (mounted.current) setNotice("Return to the payment screen and use your passkey again. Nothing was sent.");
        return;
      }
      try {
        const scope = createPaymentSessionScope({ chainId: runtimeConfig.chainId, asset: runtimeConfig.ausdAddress,
          recipient: address, assetDecimals: runtimeConfig.ausdDecimals, nowMs: Date.now(), reference: keccak256(toBytes(key)) });
        const next = new ScopedMeraPaymentSession(live, scope); session.current = next;
        setIdentity(next.identity); onIdentity(next.identity); setNotice("Recipient authorised. Review the amount before sending.");
      } catch (cause) { live.end(); throw cause; }
      await balances(live.identity.address);
    });
  }
  function reviewPayment() {
    setError("");
    try {
      if (!session.current?.status().active || transfer || uncertain || attemptedDrafts.has(paymentDraft.id)) {
        throw new Error("A fresh passkey authorisation is required. Do not repeat a submitted payment.");
      }
      const next = makeReview();
      if (!ausd || ausd.raw < next.amount || !mon || mon.raw <= 0n) throw new Error("Check your test AUSD and MON balances before continuing.");
      setReview(next);
    } catch (cause) { setError(describeMeraError(cause)); }
  }
  async function confirmPayment() {
    if (!review || transfer || uncertain || lock.current || attemptedDrafts.has(paymentDraft.id)) return;
    const approved = review;
    const draftId = paymentDraft.id;
    await work("send", async () => {
      const active = session.current;
      if (!active?.status().active || !sameReview(approved, makeReview())) {
        setReview(null); throw new Error("Authorisation or payment details changed. Please review the payment again.");
      }
      // Record uncertainty before invoking the existing submission path. A rerender
      // or choosing this draft again must not offer another send in this JS session.
      attemptedDrafts.set(draftId, { key: approved.draftKey, identity: active.identity, transfer: null });
      try {
        const result = await active.sendAusdTransfer(runtimeConfig, { chainId: approved.chainId,
          asset: runtimeConfig.ausdAddress, recipient: approved.recipient, amount: approved.amount, reference: approved.reference });
        attemptedDrafts.set(draftId, { key: approved.draftKey, identity: active.identity, transfer: result });
        if (!mounted.current || currentKey.current !== approved.draftKey) return;
        setTransfer(result); setReview(null); onTransferSettled(result);
        setNotice("Your transfer is confirmed. Business verification continues separately; do not send it again.");
      } catch {
        setUncertain(true); setReview(null);
        throw new Error("We could not establish the payment outcome. Do not send again. Check the sender's transaction history or contact support.");
      }
      // A balance-refresh failure must never turn an already-confirmed payment into a failed payment.
      try { await balances(active.identity.address); }
      catch { setNotice("Transfer confirmed. The balance refresh is unavailable; your on-chain receipt is still shown below."); }
    });
  }
  async function fund() {
    if (transfer || uncertain) return;
    await work("fund", async () => {
      const active = session.current;
      if (runtimeConfig.chainId !== 10143 || !active?.status().active) throw new Error("A testnet passkey authorisation is required.");
      const result = await active.requestTestAusd(runtimeConfig);
      setFaucetHash(result.hash); setNotice("Test AUSD received. This is faucet funding, not a supplier payment.");
      await balances(result.account);
    });
  }
  async function correlate() {
    if (!transfer) return;
    await work("reference", async () => {
      const active = session.current;
      if (!active?.status().active) throw new Error("The reference could not be retried because the passkey session expired. Your transfer is already confirmed; do not resend it.");
      const correlation = await active.retrySettlementCorrelation(runtimeConfig, transfer);
      const next = Object.freeze({ ...transfer, correlation });
      attemptedDrafts.set(paymentDraft.id, { key, identity: active.identity, transfer: next });
      setTransfer(next); onTransferSettled(next);
    });
  }
  const authorised = expires > 0;
  const busy = pending !== "";
  const blocked = transfer !== null || uncertain;

  return <View style={ui.card} testID="supplier-composer">
    <View style={ui.row}><Badge tone="warning">Monad Testnet · no real funds</Badge><Badge>Passkey approval</Badge></View>
    <Text accessibilityRole="header" style={ui.heading}>{review ? "Review before you send" : transfer ? "Transfer completed" : "Pay " + paymentDraft.payee}</Text>
    <Detail label="Amount" value={amount + " AUSD"} />
    <Detail label="Reference" value={paymentDraft.reference || paymentDraft.id} />
    {review ? <View style={{ gap: 16 }}>
      <Detail label="To" value={review.recipient} selectable />
      <Detail label="Network" value="Monad Testnet · chain 10143" />
      <Detail label="Network fees" value="Paid separately in test MON. Not included in the AUSD amount." />
      <Notice warning>Confirm the address with your supplier. Approval may create a transfer and a separate reference-recording transaction. On-chain confirmation does not mark the Cherry Money draft paid.</Notice>
      {!authorised ? <Notice warning>Authorisation expired. Go back and use your passkey again.</Notice> : null}
      <Action label={pending === "send" ? "Submitting payment…" : "Confirm " + review.formatted + " AUSD payment"}
        onPress={() => void confirmPayment()} disabled={!authorised || blocked} loading={pending === "send"} testID="confirm-supplier-payment" />
      <Action secondary label="Back to payment details" disabled={busy} onPress={() => setReview(null)} />
    </View> : !blocked ? <View style={{ gap: 14 }}>
      <Text style={ui.label}>Supplier's Monad Testnet address</Text>
      <TextInput accessibilityLabel="Supplier testnet address" autoCapitalize="none" autoCorrect={false}
        value={recipient} placeholder="0x…" style={ui.input} editable={!busy && !authorised} onChangeText={(value) => { setRecipient(value); setReview(null); }} />
      <Text style={ui.small}>Check this address with {paymentDraft.payee}. A selected draft does not establish ownership of an address.</Text>
      {!authorised ? <>
        <Action label={pending === "passkey" ? "Waiting for your passkey…" : "Use existing passkey"} disabled={busy || !recipient.trim()} loading={pending === "passkey"} onPress={() => void connect(false)} />
        <Action secondary label="Create a passkey" disabled={busy || !recipient.trim()} onPress={() => void connect(true)} />
        <Text style={ui.small}>Your passkey authorises this recipient and business reference. Nothing is sent until you review and confirm.</Text>
      </> : <>
        <Badge tone="success">Recipient authorised</Badge>
        <Detail label="Available test AUSD" value={ausd ? ausd.formatted + " AUSD" : "Not yet loaded"} />
        <Detail label="Network-fee balance" value={mon ? mon.formatted + " MON" : "Not yet loaded"} />
        <Action label="Review payment" onPress={reviewPayment} disabled={busy || !ausd || !mon || mon.raw <= 0n} />
        <Action secondary label="Change recipient / end authorisation" disabled={busy} onPress={() => {
          session.current?.end("manual"); setExpires(0); setReview(null); setNotice("Authorisation ended. Use your passkey again for a different recipient.");
        }} />
      </>}
      {identity ? <Disclosure title="Test funding and wallet details" defaultOpen={authorised && (!ausd || ausd.raw === 0n || !mon || mon.raw === 0n)}>
        <Text selectable style={ui.mono}>{identity.address}</Text>
        <Notice warning>The preview currently requires test MON for network fees. Gas sponsorship is not yet available.</Notice>
        <Action secondary label="Refresh balances" disabled={busy} loading={pending === "refresh"} onPress={() => void work("refresh", () => balances(identity.address))} />
        <Action secondary label="Get test AUSD" disabled={busy || !authorised || !mon || mon.raw === 0n} loading={pending === "fund"} onPress={() => void fund()} />
        {faucetHash ? <Text selectable style={ui.mono}>Faucet transaction: {faucetHash}</Text> : null}
      </Disclosure> : null}
    </View> : null}
    {transfer ? <Notice>The transfer is confirmed. Use the receipt below. Further payment submission is locked for this draft in this app session.</Notice> : null}
    {transfer && transfer.correlation.status !== "confirmed" ? <>
      <Notice warning>Your transfer succeeded, but its business reference needs attention. Do not repeat the transfer.</Notice>
      <Action secondary label="Retry reference only — not the payment" disabled={busy || !authorised} loading={pending === "reference"} onPress={() => void correlate()} />
    </> : null}
    {uncertain && identity ? <>
      <Notice warning>A submission needs review. Sending is locked in this app session to reduce duplicate-payment risk. Check this wallet's activity before any further attempt.</Notice>
      <Text selectable style={ui.mono}>{identity.address}</Text>
      <Action secondary label="Open sender transaction history" onPress={() => void Linking.openURL("https://testnet.monadscan.com/address/" + identity.address).catch(() => setError("The explorer could not be opened. Copy the address above."))} />
    </> : null}
    {notice ? <Notice>{notice}</Notice> : null}
    {error ? <Notice warning>{error}</Notice> : null}
    {session.current ? <Disclosure title="Authorisation limits">
      <Detail label="Recipient-specific session" value={formatUnits(session.current.scope.maxPerPayment, runtimeConfig.ausdDecimals) + " AUSD maximum per payment"} />
      <Detail label="Time remaining" value={Math.ceil(expires / 1000) + " seconds"} />
      <Text style={ui.small}>The existing Mera session controls the network, asset, recipient, reference and usage limits. No signing keys are stored by this screen.</Text>
    </Disclosure> : null}
  </View>;
}
