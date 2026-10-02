import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  CherryMoneyClient,
  buildCherryMoneyGoogleLoginUrl,
  exchangeCherryMoneyGoogleCode,
  type CherryMoneyBootstrap,
  type CherryMoneyPaymentDraft,
} from "@cherry-metropolis/cherry-money-client";

type PendingAction = "load" | "create" | "google" | "disconnect" | null;

const PLACEHOLDER_COLOR = "#94a3b8";

const WEB_DEMO_DRAFT: CherryMoneyPaymentDraft = Object.freeze({
  id: "e37fd383-ed0e-4db3-975d-ea489115072b",
  payee: "Berlin Design Demo GmbH",
  amount: 5,
  reference: "METROPOLIS-E2E-001",
  purpose: "Monad AUSD end-to-end test",
  currency: "USD",
  status: "draft_only",
  createdAt: null,
  moneyMoved: false,
  source: "cherry-money-production",
});

type CherryMoneyDraftCardProps = {
  defaultBaseUrl: string;
  selectedDraftId: string | null;
  onSelectDraft: (draft: CherryMoneyPaymentDraft | null) => void;
  onConnected?: () => void;
};

export function CherryMoneyDraftCard({
  defaultBaseUrl,
  selectedDraftId,
  onSelectDraft,
  onConnected,
}: CherryMoneyDraftCardProps) {
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

  const client = useMemo(() => {
    if (!token.trim()) return null;
    try {
      return new CherryMoneyClient({
        baseUrl,
        bearerToken: token,
      });
    } catch {
      return null;
    }
  }, [baseUrl, token]);

  async function connectWithToken(
    nextToken: string,
    source: "manual" | "google",
  ) {
    const nextClient = new CherryMoneyClient({
      baseUrl,
      bearerToken: nextToken,
    });
    const next = await nextClient.bootstrap();

    setToken(nextToken);
    setWorkspace(next);
    setError(null);
    setNotice(
      source === "google"
        ? "Signed in to Cherry Money with Google. The API token is held only in this page's memory."
        : "Cherry Money connection established.",
    );
    onConnected?.();

    if (selectedDraftId) {
      const selected = next.paymentDrafts.find(
        (draft) => draft.id === selectedDraftId,
      );
      if (!selected) onSelectDraft(null);
    }
  }

  async function loadWorkspace() {
    setPending("load");
    setError(null);
    setNotice(null);

    try {
      await connectWithToken(token, "manual");
    } catch (caught) {
      setWorkspace(null);
      onSelectDraft(null);
      const message =
        caught instanceof Error ? caught.message : "Unable to load Cherry Money.";
      setError(
        /not signed in|sign in to continue|unauthenticated/i.test(message)
          ? "This Cherry Money token is expired or invalid. Sign in with Google or paste a new temporary token."
          : message,
      );
    } finally {
      setPending(null);
    }
  }

  useEffect(() => {
    if (Platform.OS !== "web" || typeof globalThis.location === "undefined") {
      return;
    }

    const hash = globalThis.location.hash;

    if (!hash.startsWith("#google-auth=") && !hash.startsWith("#google-error=")) {
      return;
    }

    const raw = hash.slice(hash.indexOf("=") + 1);
    globalThis.history?.replaceState(
      null,
      "",
      globalThis.location.pathname + globalThis.location.search,
    );

    if (hash.startsWith("#google-error=")) {
      try {
        setError(decodeURIComponent(raw));
      } catch {
        setError("Cherry Money Google sign-in could not be completed.");
      }
      return;
    }

    setPending("google");
    setError(null);
    setNotice("Completing secure Cherry Money sign-in…");

    void exchangeCherryMoneyGoogleCode({
      baseUrl,
      code: raw,
    })
      .then((result) => connectWithToken(result.token, "google"))
      .catch((caught: unknown) => {
        setWorkspace(null);
        onSelectDraft(null);
        setError(
          caught instanceof Error
            ? caught.message
            : "Cherry Money Google sign-in could not be completed.",
        );
      })
      .finally(() => {
        setPending(null);
      });
  }, []);

  function startGoogleSignIn() {
    if (Platform.OS !== "web" || typeof globalThis.location === "undefined") {
      setError("Google sign-in is available in the Cherry Pay web app.");
      return;
    }

    try {
      setError(null);
      setNotice("Opening Cherry Money secure Google sign-in…");
      const loginUrl = buildCherryMoneyGoogleLoginUrl(
        baseUrl,
        globalThis.location.origin,
      );
      globalThis.location.assign(loginUrl);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to start Cherry Money Google sign-in.",
      );
    }
  }

  async function createDraft() {
    if (!client) {
      setError("Connect to Cherry Money first.");
      return;
    }

    setPending("create");
    setError(null);

    try {
      const result = await client.createPaymentDraft({
        payee,
        amount,
        reference,
        purpose,
      });

      const nextWorkspace = workspace
        ? Object.freeze({
            ...workspace,
            paymentDrafts: [
              result.draft,
              ...workspace.paymentDrafts.filter(
                (draft) => draft.id !== result.draft.id,
              ),
            ],
          })
        : null;

      if (nextWorkspace) setWorkspace(nextWorkspace);
      onSelectDraft(result.draft);
      setPayee("");
      setAmount("");
      setReference("");
      setPurpose("");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to create Cherry Money payment draft.",
      );
    } finally {
      setPending(null);
    }
  }

  async function disconnect() {
    setPending("disconnect");
    try {
      await client?.logout();
    } catch {
      // The local session is cleared even if the server token is already invalid.
    } finally {
      setToken("");
      setWorkspace(null);
      setError(null);
      setNotice(null);
      onSelectDraft(null);
      setPending(null);
    }
  }

  return (
    <View style={styles.card}>
      <Text style={styles.eyebrow}>CHERRY MONEY BUSINESS CONTEXT</Text>
      <Text style={styles.title}>Bind a real Cherry Money payment draft.</Text>
      <Text style={styles.body}>
        The Metropolis app reads the authenticated WebMCP bridge. On web, use
        Cherry Money's Google sign-in; the resulting API token stays only in
        page memory and is never written to browser storage or disk.
      </Text>

      {Platform.OS === "web" ? (
        <View style={styles.demoPanel}>
          <Text style={styles.demoEyebrow}>JUDGE / MENTOR DEMO</Text>
          <Text style={styles.demoTitle}>Start with the verified hackathon draft.</Text>
          <Text style={styles.muted}>
            This selects the existing METROPOLIS-E2E-001 draft snapshot without
            exposing a Cherry Money bearer token in the browser. CRE still
            verifies the same reference against the live Cherry Money source.
          </Text>
          <ActionButton
            disabled={selectedDraftId === WEB_DEMO_DRAFT.id}
            label={
              selectedDraftId === WEB_DEMO_DRAFT.id
                ? "Demo draft selected ✓"
                : "Use 5 USD → 5 AUSD demo draft"
            }
            onPress={() => {
              setError(null);
              onSelectDraft(WEB_DEMO_DRAFT);
            }}
            primary
          />
          <Text style={styles.demoNote}>
            For a clean on-chain rerun, use a fresh Mera payer if this payment
            reference was already correlated by the recovered account.
          </Text>
        </View>
      ) : null}

      <Text style={styles.sectionHeading}>
        {Platform.OS === "web" ? "Live Cherry Money connection (optional)" : "Live Cherry Money connection"}
      </Text>

      {Platform.OS === "web" && !workspace ? (
        <View style={styles.authPanel}>
          <Text style={styles.authTitle}>Sign in to Cherry Money</Text>
          <Text style={styles.muted}>
            Use the Google account already linked to the Cherry Money demo
            company. Cherry Money returns a short-lived one-time browser code;
            this page exchanges it for an in-memory Sanctum token.
          </Text>
          <ActionButton
            disabled={pending !== null}
            label={
              pending === "google"
                ? "Completing Google sign-in…"
                : "Continue with Google"
            }
            onPress={startGoogleSignIn}
            primary
          />
        </View>
      ) : null}

      <Text style={styles.label}>Cherry Money API</Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        editable={pending === null}
        onChangeText={setBaseUrl}
        style={styles.input}
        value={baseUrl}
      />

      <Text style={styles.label}>
        {Platform.OS === "web"
          ? "Temporary API token (advanced fallback)"
          : "Temporary API token"}
      </Text>
      <TextInput
        autoCapitalize="none"
        autoCorrect={false}
        editable={pending === null}
        onChangeText={setToken}
        placeholder="Paste a fresh Sanctum bearer token"
        secureTextEntry
        style={styles.input}
        value={token}
      />

      <View style={styles.actions}>
        <ActionButton
          disabled={pending !== null || !token.trim()}
          label={pending === "load" ? "Loading…" : "Load Cherry Money drafts"}
          onPress={() => void loadWorkspace()}
          primary
        />
        {workspace ? (
          <ActionButton
            disabled={pending !== null}
            label={pending === "disconnect" ? "Disconnecting…" : "Disconnect"}
            onPress={() => void disconnect()}
          />
        ) : null}
      </View>

      {pending === "load" ? <ActivityIndicator /> : null}

      {workspace ? (
        <>
          <View style={styles.workspace}>
            <Row label="Company" value={workspace.company.name} />
            <Row label="Currency" value={workspace.company.currency} />
            <Row
              label="Drafts"
              value={workspace.paymentDrafts.length.toString()}
            />
          </View>

          <Text style={styles.label}>Existing payment drafts</Text>
          {workspace.paymentDrafts.length === 0 ? (
            <Text style={styles.muted}>
              No active WebMCP payment drafts yet.
            </Text>
          ) : (
            workspace.paymentDrafts.map((draft) => {
              const selected = draft.id === selectedDraftId;
              return (
                <Pressable
                  accessibilityRole="button"
                  key={draft.id}
                  onPress={() => onSelectDraft(draft)}
                  style={[
                    styles.draft,
                    selected ? styles.draftSelected : null,
                  ]}
                >
                  <Text style={styles.draftTitle}>
                    {draft.payee} · {draft.currency}{" "}
                    {draft.amount.toFixed(2)}
                  </Text>
                  <Text style={styles.draftMeta}>
                    {draft.reference || "No reference"} · {draft.id}
                  </Text>
                  {draft.purpose ? (
                    <Text style={styles.draftPurpose}>{draft.purpose}</Text>
                  ) : null}
                  <Text style={styles.safe}>
                    Draft only · no money moved in Cherry Money
                  </Text>
                </Pressable>
              );
            })
          )}

          <View style={styles.divider} />

          <Text style={styles.label}>Create a Cherry Money payment draft</Text>
          <Text style={styles.muted}>
            This uses Cherry Money's existing safe draft-only endpoint. It does
            not authorise or execute a payment.
          </Text>

          <TextInput
            onChangeText={setPayee}
            placeholder="Payee / supplier"
            placeholderTextColor={PLACEHOLDER_COLOR}
            style={styles.input}
            value={payee}
          />
          <TextInput
            keyboardType="decimal-pad"
            onChangeText={setAmount}
            placeholder={"Amount in " + workspace.company.currency}
            placeholderTextColor={PLACEHOLDER_COLOR}
            style={styles.input}
            value={amount}
          />
          <TextInput
            onChangeText={setReference}
            placeholder="Reference"
            placeholderTextColor={PLACEHOLDER_COLOR}
            style={styles.input}
            value={reference}
          />
          <TextInput
            onChangeText={setPurpose}
            placeholder="Purpose"
            placeholderTextColor={PLACEHOLDER_COLOR}
            style={styles.input}
            value={purpose}
          />

          <ActionButton
            disabled={
              pending !== null ||
              !payee.trim() ||
              !amount.trim() ||
              !client
            }
            label={
              pending === "create"
                ? "Creating draft…"
                : "Create and select payment draft"
            }
            onPress={() => void createDraft()}
            primary
          />

          {pending === "create" ? <ActivityIndicator /> : null}
        </>
      ) : null}

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.note}>
        Current Cherry Money bridge exposes bounded payment drafts, not supplier
        bank details or payment execution. That boundary is intentionally
        preserved here.
      </Text>
    </View>
  );
}

function ActionButton({
  disabled,
  label,
  onPress,
  primary = false,
}: {
  disabled: boolean;
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonSecondary,
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={primary ? styles.buttonPrimaryText : styles.buttonSecondaryText}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 18,
    gap: 12,
    padding: 18,
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
  },
  body: {
    fontSize: 14,
    lineHeight: 20,
  },
  label: {
    fontSize: 12,
    fontWeight: "700",
  },
  sectionHeading: {
    fontSize: 14,
    fontWeight: "700",
    marginTop: 4,
  },
  authPanel: {
    backgroundColor: "#f8fafc",
    borderColor: "#e2e8f0",
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  authTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  demoPanel: {
    backgroundColor: "#f0fdf4",
    borderColor: "#bbf7d0",
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  demoEyebrow: {
    color: "#166534",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1,
  },
  demoTitle: {
    color: "#14532d",
    fontSize: 16,
    fontWeight: "700",
  },
  demoNote: {
    color: "#166534",
    fontSize: 11,
    lineHeight: 17,
  },
  muted: {
    color: "#64748b",
    fontSize: 13,
    lineHeight: 19,
  },
  input: {
    borderColor: "#cbd5e1",
    borderRadius: 12,
    borderWidth: 1,
    color: "#0f172a",
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  actions: {
    gap: 10,
  },
  button: {
    alignItems: "center",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  buttonPrimary: {
    backgroundColor: "#111827",
  },
  buttonSecondary: {
    backgroundColor: "#ffffff",
    borderColor: "#111827",
    borderWidth: 1,
  },
  buttonPrimaryText: {
    color: "#ffffff",
    fontWeight: "700",
  },
  buttonSecondaryText: {
    color: "#111827",
    fontWeight: "700",
  },
  disabled: {
    opacity: 0.45,
  },
  pressed: {
    opacity: 0.8,
  },
  workspace: {
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    gap: 8,
    padding: 12,
  },
  row: {
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  value: {
    flexShrink: 1,
    fontSize: 13,
    textAlign: "right",
  },
  draft: {
    borderColor: "#e2e8f0",
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  draftSelected: {
    borderColor: "#111827",
    borderWidth: 2,
  },
  draftTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  draftMeta: {
    color: "#475569",
    fontFamily: "monospace",
    fontSize: 11,
  },
  draftPurpose: {
    color: "#475569",
    fontSize: 12,
  },
  safe: {
    color: "#166534",
    fontSize: 11,
    fontWeight: "600",
  },
  divider: {
    backgroundColor: "#e2e8f0",
    height: 1,
    marginVertical: 4,
  },
  notice: {
    color: "#166534",
    fontSize: 13,
    lineHeight: 19,
  },
  error: {
    color: "#b91c1c",
    fontSize: 13,
    lineHeight: 19,
  },
  note: {
    color: "#475569",
    fontSize: 12,
    lineHeight: 18,
  },
});
