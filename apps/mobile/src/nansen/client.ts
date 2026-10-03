export type NansenPaymentIntelligence = Readonly<{
  source: "Nansen API";
  chain: "monad";
  address: string;
  generated_at: string;
  window_days: number;
  portfolio: Readonly<{
    assets_returned: number;
    observed_value_usd: number;
    top_assets: readonly Readonly<{ symbol: string; value_usd: number }>[];
  }>;
  activity: Readonly<{
    transactions_returned: number;
    last_activity_at: string | null;
    labelled_counterparties: readonly string[];
  }>;
  relationships: Readonly<{
    returned: number;
    items: readonly Readonly<{
      relation: string;
      label: string;
      address: string;
      observed_at: string;
    }>[];
  }>;
  endpoints: readonly string[];
  notice: string;
}>;

export const NANSEN_PROXY_BASE =
  process.env.EXPO_PUBLIC_NANSEN_PROXY_URL ??
  "https://cherrymoney.co.uk/api/nansen/payment-intelligence/";

export function validEvmAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value.trim());
}

export async function loadNansenPaymentIntelligence(
  address: string,
  signal?: AbortSignal,
): Promise<NansenPaymentIntelligence> {
  const normalized = address.trim();

  if (!validEvmAddress(normalized)) {
    throw new Error("Enter a valid recipient wallet before checking Nansen.");
  }

  const response = await fetch(
    NANSEN_PROXY_BASE + encodeURIComponent(normalized),
    {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
      ...(signal ? { signal } : {}),
    },
  );

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      body && typeof body.message === "string"
        ? body.message
        : "Nansen recipient intelligence is unavailable.";
    throw new Error(message);
  }

  if (
    !body ||
    body.source !== "Nansen API" ||
    body.chain !== "monad" ||
    typeof body.address !== "string" ||
    !body.portfolio ||
    !body.activity ||
    !body.relationships
  ) {
    throw new Error("Nansen returned an unexpected payment-intelligence response.");
  }

  return body as NansenPaymentIntelligence;
}
