import { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import { CherryMoneyClient, buildCherryMoneyGoogleLoginUrl, exchangeCherryMoneyGoogleCode,
  type CherryMoneyBootstrap, type CherryMoneyPaymentDraft } from "@cherry-metropolis/cherry-money-client";
import { Action, Badge, Detail, Disclosure, Notice, palette, ui } from "./experience/ui";

type PendingAction = "load" | "create" | "google" | "disconnect" | null;
const WEB_DEMO_DRAFT: CherryMoneyPaymentDraft = Object.freeze({
  id: "e37fd383-ed0e-4db3-975d-ea489115072b", payee: "Berlin Design Demo GmbH", amount: 5,
  reference: "METROPOLIS-E2E-001", purpose: "Monad AUSD end-to-end test", currency: "USD",
  status: "draft_only", createdAt: null, moneyMoved: false, source: "cherry-money-production",
});
type Props = {
  defaultBaseUrl: string; selectedDraftId: string | null;
  onSelectDraft: (draft: CherryMoneyPaymentDraft | null) => void; onConnected?: () => void;
};

export function CherryMoneyDraftCard({ defaultBaseUrl, selectedDraftId, onSelectDraft, onConnected }: Props) {
  const [baseUrl, setBaseUrl] = useState(defaultBaseUrl);
  const [token, setToken] = useState("");
  const [workspace, setWorkspace] = useState<CherryMoneyBootstrap | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [payee, setPayee] = useState("");
  const [amount, setAmount] = useState("");
  const [reference, setReference] = useState("");
  const [purpose, setPurpose] = useState("");
  const operationLock = useRef(false);
  const client = useMemo(() => {
    if (!token.trim()) return null;
    try { return new CherryMoneyClient({ baseUrl, bearerToken: token }); } catch { return null; }
  }, [baseUrl, token]);

  async function connectWithToken(nextToken: string, source: "manual" | "google") {
    const nextClient = new CherryMoneyClient({ baseUrl, bearerToken: nextToken });
    const next = await nextClient.bootstrap();
    setToken(nextToken); setWorkspace(next); setError(null);
    setNotice(source === "google" ? "Signed in to Cherry Money with Google." : "Cherry Money connection established.");
    onConnected?.();
    if (selectedDraftId) {
      const selected = next.paymentDrafts.find((draft) => draft.id === selectedDraftId);
      if (!selected) onSelectDraft(null);
    }
  }
  async function loadWorkspace() {
    if (operationLock.current) return;
    operationLock.current = true; setPending("load"); setError(null); setNotice(null);
    try { await connectWithToken(token, "manual"); }
    catch (caught) {
      setWorkspace(null); onSelectDraft(null);
      const message = caught instanceof Error ? caught.message : "Unable to load Cherry Money.";
      setError(/not signed in|sign in to continue|unauthenticated/i.test(message)
        ? "This connection has expired. Sign in again or replace the temporary token in Advanced connection settings."
        : message);
    } finally { operationLock.current = false; setPending(null); }
  }
  useEffect(() => {
    if (Platform.OS !== "web" || typeof globalThis.location === "undefined") return;
    const hash = globalThis.location.hash;
    if (!hash.startsWith("#google-auth=") && !hash.startsWith("#google-error=")) return;
    const raw = hash.slice(hash.indexOf("=") + 1);
    globalThis.history?.replaceState(null, "", globalThis.location.pathname + globalThis.location.search);
    if (hash.startsWith("#google-error=")) {
      try { setError(decodeURIComponent(raw)); }
      catch { setError("Cherry Money Google sign-in could not be completed."); }
      return;
    }
    operationLock.current = true; setPending("google"); setError(null); setNotice("Completing secure Cherry Money sign-in…");
    void exchangeCherryMoneyGoogleCode({ baseUrl, code: raw })
      .then((result) => connectWithToken(result.token, "google"))
      .catch((caught: unknown) => {
        setWorkspace(null); onSelectDraft(null);
        setError(caught instanceof Error ? caught.message : "Cherry Money Google sign-in could not be completed.");
      }).finally(() => { operationLock.current = false; setPending(null); });
  }, []);
  function startGoogleSignIn() {
    if (operationLock.current) return;
    if (Platform.OS !== "web" || typeof globalThis.location === "undefined") {
      setError("Google sign-in is currently available in the Cherry Pay web app."); return;
    }
    try {
      setError(null); setNotice("Opening Cherry Money secure Google sign-in…");
      const loginUrl = buildCherryMoneyGoogleLoginUrl(baseUrl, globalThis.location.origin);
      globalThis.location.assign(loginUrl);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to start Cherry Money Google sign-in."); }
  }
  async function createDraft() {
    if (!client) { setError("Connect to Cherry Money first."); return; }
    if (operationLock.current) return;
    operationLock.current = true; setPending("create"); setError(null);
    try {
      const result = await client.createPaymentDraft({ payee, amount, reference, purpose });
      const nextWorkspace = workspace ? Object.freeze({ ...workspace,
        paymentDrafts: [result.draft, ...workspace.paymentDrafts.filter((draft) => draft.id !== result.draft.id)] }) : null;
      if (nextWorkspace) setWorkspace(nextWorkspace);
      onSelectDraft(result.draft); setPayee(""); setAmount(""); setReference(""); setPurpose("");
      setNotice("Payment draft saved in Cherry Money. No payment has been sent.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to create Cherry Money payment draft."); }
    finally { operationLock.current = false; setPending(null); }
  }
  async function disconnect() {
    if (operationLock.current) return;
    operationLock.current = true; setPending("disconnect");
    try { await client?.logout(); } catch { /* Clear the local session even if revocation is unavailable. */ }
    finally {
      setToken(""); setWorkspace(null); setError(null); setNotice(null); onSelectDraft(null);
      operationLock.current = false; setPending(null);
    }
  }
  const busy = pending !== null;
  const selected = workspace?.paymentDrafts.find((draft) => draft.id === selectedDraftId);
  return <View style={ui.card}>
    <Text style={ui.eyebrow}>YOUR BUSINESS PAYMENT</Text>
    <Text accessibilityRole="header" style={ui.heading}>{workspace ? "Choose a payment draft" : "Connect Cherry Money"}</Text>
    <Text style={ui.body}>Bring the supplier, amount and reference into your payment. Choosing a draft does not authorise a transfer.</Text>
    {!workspace && Platform.OS === "web" ? <>
      <Action label={pending === "google" ? "Completing Google sign-in…" : "Continue with Google"}
        disabled={busy} loading={pending === "google"} onPress={startGoogleSignIn} />
      <Text style={ui.small}>Use the Google account linked to your Cherry Money workspace. You will return here after signing in.</Text>
    </> : null}
    {!workspace && Platform.OS !== "web" ? <Notice>Native business sign-in is still being prepared. Use an authorised temporary connection below, or the web app for Google sign-in.</Notice> : null}
    {workspace ? <>
      <View style={ui.row}><Badge tone="success">Workspace connected</Badge><Text style={ui.label}>{workspace.company.name}</Text></View>
      <View style={ui.row}>
        <Action secondary label="Refresh drafts" disabled={busy} loading={pending === "load"} onPress={() => void loadWorkspace()} />
        <Action secondary label="Disconnect workspace" disabled={busy} loading={pending === "disconnect"} onPress={() => void disconnect()} />
      </View>
      {workspace.paymentDrafts.length === 0 ? <Notice>No active payment drafts yet. Create a draft below to get started.</Notice> :
        workspace.paymentDrafts.map((draft) => {
          const isSelected = draft.id === selectedDraftId;
          return <Pressable key={draft.id} accessibilityRole="button"
            accessibilityLabel={"Select " + draft.payee + ", " + draft.currency + " " + draft.amount.toFixed(2)}
            accessibilityState={{ selected: isSelected, disabled: busy }} disabled={busy}
            onPress={() => onSelectDraft(draft)} style={{ borderWidth: isSelected ? 2 : 1,
              borderColor: isSelected ? palette.cherry : palette.line, backgroundColor: isSelected ? "#FFF8FA" : palette.surface,
              borderRadius: 14, padding: 16, gap: 7, minHeight: 64 }}>
            <View style={ui.row}><Text style={[ui.label, ui.grow]}>{draft.payee}</Text><Text style={ui.label}>{draft.currency} {draft.amount.toFixed(2)}</Text></View>
            <Text style={ui.small}>{draft.reference || "No reference"}</Text>
            {draft.purpose ? <Text style={ui.small}>{draft.purpose}</Text> : null}
            <Badge tone={isSelected ? "success" : "neutral"}>{isSelected ? "Selected" : "Draft only"}</Badge>
          </Pressable>;
        })}
      <Disclosure title="Create a new payment draft">
        <Notice>This saves a draft in your Cherry Money workspace. It does not transfer funds or mark an invoice paid.</Notice>
        <Field label="Supplier name" value={payee} setValue={setPayee} disabled={busy} />
        <Field label={"Amount in " + workspace.company.currency} value={amount} setValue={setAmount} disabled={busy} decimal />
        <Field label="Business reference" value={reference} setValue={setReference} disabled={busy} />
        <Field label="Payment purpose" value={purpose} setValue={setPurpose} disabled={busy} />
        <Action label="Save and select draft" disabled={busy || !payee.trim() || !amount.trim() || !client}
          loading={pending === "create"} onPress={() => void createDraft()} />
      </Disclosure>
    </> : null}
    {selected ? <Notice>Selected: {selected.payee} · {selected.currency} {selected.amount.toFixed(2)} · {selected.reference || selected.id}</Notice> : null}
    {Platform.OS === "web" ? <Disclosure title="Try the testnet demo draft">
      <Badge tone="warning">Saved demo snapshot</Badge>
      <Text style={ui.body}>Berlin Design Demo GmbH · 5 USD · METROPOLIS-E2E-001</Text>
      <Text style={ui.small}>This is the existing demonstration draft snapshot, not a newly fetched payment instruction or proof that it remains unpaid. Business verification must still check its source.</Text>
      <Action secondary disabled={busy || selectedDraftId === WEB_DEMO_DRAFT.id}
        label={selectedDraftId === WEB_DEMO_DRAFT.id ? "Demo draft selected ✓" : "Use 5 USD → 5 AUSD demo draft"}
        onPress={() => { setError(null); onSelectDraft(WEB_DEMO_DRAFT); }} />
      <Notice warning>Do not repeat an already-funded payment to rerun a demonstration. Check the original transaction and reference first.</Notice>
    </Disclosure> : null}
    {selectedDraftId === WEB_DEMO_DRAFT.id && !selected ? <Notice>Demo snapshot selected · Berlin Design Demo GmbH · 5 USD. No live draft fetch is implied.</Notice> : null}
    <Disclosure title="Advanced connection settings" defaultOpen={Platform.OS !== "web"}>
      <Text style={ui.small}>For authorised testing only. Temporary credentials stay in this app's memory and are not written to browser storage or disk.</Text>
      <Field label="Cherry Money API endpoint" value={baseUrl} setValue={setBaseUrl} disabled={busy || workspace !== null} />
      <Field label="Temporary API token" value={token} setValue={setToken} disabled={busy || workspace !== null} secret />
      <Action secondary label="Load Cherry Money drafts" disabled={busy || !token.trim()} loading={pending === "load"} onPress={() => void loadWorkspace()} />
      {workspace ? <Text style={ui.small}>Disconnect before changing the connection.</Text> : null}
    </Disclosure>
    {notice ? <Notice>{notice}</Notice> : null}
    {error ? <Notice warning>{error}</Notice> : null}
    <Text style={ui.small}>Cherry Money remains the system of record. You will check the recipient address and approve the payment separately.</Text>
  </View>;
}
function Field({ label, value, setValue, disabled, secret = false, decimal = false }: {
  label: string; value: string; setValue: (value: string) => void; disabled: boolean; secret?: boolean; decimal?: boolean;
}) {
  return <View style={{ gap: 6 }}><Text style={ui.label}>{label}</Text>
    <TextInput accessibilityLabel={label} value={value} onChangeText={setValue} editable={!disabled}
      secureTextEntry={secret} autoCapitalize="none" autoCorrect={false} keyboardType={decimal ? "decimal-pad" : "default"}
      style={ui.input} />
  </View>;
}
