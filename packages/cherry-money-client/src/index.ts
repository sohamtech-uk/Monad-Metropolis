export type CherryMoneyClientOptions = Readonly<{
  baseUrl: string;
  bearerToken: string;
  fetchImpl?: typeof fetch;
}>;

export type CherryMoneyCompany = Readonly<{
  id: string;
  name: string;
  currency: string;
}>;

export type CherryMoneyPaymentDraft = Readonly<{
  id: string;
  payee: string;
  amount: number;
  reference: string;
  purpose: string;
  currency: string;
  status: "draft_only";
  createdAt: string | null;
  moneyMoved: false;
  source: "cherry-money-production";
}>;

export type CherryMoneyBootstrap = Readonly<{
  connected: true;
  source: "cherry-money-production";
  company: CherryMoneyCompany;
  paymentDrafts: readonly CherryMoneyPaymentDraft[];
  capabilities: Readonly<Record<string, unknown>>;
  generatedAt: string;
}>;

export type CreatePaymentDraftInput = Readonly<{
  payee: string;
  amount: string | number;
  reference?: string;
  purpose?: string;
}>;

export type CreatePaymentDraftResult = Readonly<{
  draft: CherryMoneyPaymentDraft;
  moneyMoved: false;
  paymentExecuted: false;
  requiresHumanApproval: true;
  idempotent: boolean;
}>;

export class CherryMoneyClient {
  private readonly baseUrl: string;
  private readonly bearerToken: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: CherryMoneyClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.bearerToken = options.bearerToken.trim();
    this.fetchImpl = options.fetchImpl ?? fetch;

    if (!this.baseUrl.startsWith("https://")) {
      throw new Error("Cherry Money API base URL must use HTTPS.");
    }

    if (!this.bearerToken) {
      throw new Error("A Cherry Money bearer token is required.");
    }
  }

  async status(): Promise<Record<string, unknown>> {
    return this.request("/api/webmcp/status");
  }

  async bootstrap(): Promise<CherryMoneyBootstrap> {
    const raw = await this.request("/api/webmcp/bootstrap");
    return parseBootstrap(raw);
  }

  async createPaymentDraft(
    input: CreatePaymentDraftInput,
  ): Promise<CreatePaymentDraftResult> {
    const raw = await this.request("/api/webmcp/payment-drafts", {
      method: "POST",
      body: JSON.stringify(input),
    });

    if (!isRecord(raw.draft)) {
      throw new Error("Cherry Money did not return a payment draft.");
    }

    return Object.freeze({
      draft: parsePaymentDraft(raw.draft),
      moneyMoved: false,
      paymentExecuted: false,
      requiresHumanApproval: true,
      idempotent: raw.idempotent === true,
    });
  }

  private async request(
    path: string,
    init: RequestInit = {},
  ): Promise<Record<string, unknown>> {
    const response = await this.fetchImpl(this.baseUrl + path, {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: "Bearer " + this.bearerToken,
        ...init.headers,
      },
    });

    const payload = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    if (!response.ok) {
      const message =
        typeof payload.message === "string"
          ? payload.message
          : "Cherry Money request failed with HTTP " +
            response.status.toString() +
            ".";
      throw new Error(message);
    }

    return payload;
  }
}

function parseBootstrap(value: Record<string, unknown>): CherryMoneyBootstrap {
  if (
    value.connected !== true ||
    value.source !== "cherry-money-production" ||
    !isRecord(value.company)
  ) {
    throw new Error("Cherry Money returned an unexpected workspace response.");
  }

  const company = Object.freeze({
    id: requiredString(value.company.id, "company.id"),
    name: requiredString(value.company.name, "company.name"),
    currency: requiredString(value.company.currency, "company.currency"),
  });

  const rawDrafts = Array.isArray(value.paymentDrafts)
    ? value.paymentDrafts
    : [];

  const paymentDrafts = rawDrafts
    .filter(isRecord)
    .map(parsePaymentDraft);

  return Object.freeze({
    connected: true,
    source: "cherry-money-production",
    company,
    paymentDrafts,
    capabilities: isRecord(value.capabilities)
      ? Object.freeze({ ...value.capabilities })
      : Object.freeze({}),
    generatedAt:
      typeof value.generatedAt === "string" ? value.generatedAt : "",
  });
}

function parsePaymentDraft(
  value: Record<string, unknown>,
): CherryMoneyPaymentDraft {
  if (
    value.status !== "draft_only" ||
    value.source !== "cherry-money-production" ||
    value.moneyMoved !== false
  ) {
    throw new Error("Cherry Money payment draft failed its safety contract.");
  }

  const amount = Number(value.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Cherry Money payment draft has an invalid amount.");
  }

  return Object.freeze({
    id: requiredString(value.id, "draft.id"),
    payee: requiredString(value.payee, "draft.payee"),
    amount,
    reference:
      typeof value.reference === "string" ? value.reference : "",
    purpose:
      typeof value.purpose === "string" ? value.purpose : "",
    currency: requiredString(value.currency, "draft.currency"),
    status: "draft_only",
    createdAt:
      typeof value.createdAt === "string" ? value.createdAt : null,
    moneyMoved: false,
    source: "cherry-money-production",
  });
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Cherry Money response is missing " + label + ".");
  }

  return value.trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
