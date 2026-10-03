export type CherryMoneyClientOptions = Readonly<{
  baseUrl: string;
  bearerToken: string;
  fetchImpl?: typeof fetch;
}>;

export type CherryMoneyGoogleExchangeResult = Readonly<{
  token: string;
  authMethod: "google";
  user: Readonly<{
    company: string;
    currency: string;
    email: string;
    name: string;
    companyId: string;
  }>;
}>;

export type CherryMoneyGoogleExchangeOptions = Readonly<{
  baseUrl: string;
  code: string;
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

  async logout(): Promise<void> {
    await this.request("/api/logout");
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

function buildCherryMoneyGoogleLoginUrl(
  baseUrl: string,
  returnOrigin: string,
): string {
  const apiBase = normaliseHttpsBaseUrl(baseUrl);
  const origin = normaliseReturnOrigin(returnOrigin);
  const url = new URL("/webmcp/google/redirect", apiBase + "/");
  url.searchParams.set("return_origin", origin);
  return url.toString();
}

async function exchangeCherryMoneyGoogleCode({
  baseUrl,
  code,
  fetchImpl = fetch,
}: CherryMoneyGoogleExchangeOptions): Promise<CherryMoneyGoogleExchangeResult> {
  const apiBase = normaliseHttpsBaseUrl(baseUrl);
  const value = code.trim();

  if (!/^[A-Za-z0-9]{64}$/.test(value)) {
    throw new Error("Cherry Money Google sign-in code is invalid.");
  }

  const response = await fetchImpl(apiBase + "/api/webmcp/google/exchange", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code: value }),
  });

  const payload = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;

  if (!response.ok) {
    const message =
      typeof payload.message === "string"
        ? payload.message
        : firstValidationMessage(payload.errors) ??
          "Cherry Money Google sign-in could not be completed.";
    throw new Error(message);
  }

  if (!isRecord(payload.user)) {
    throw new Error("Cherry Money Google sign-in returned an invalid user.");
  }

  return Object.freeze({
    token: requiredString(payload.token, "token"),
    authMethod: "google",
    user: Object.freeze({
      company: requiredString(payload.user.company, "user.company"),
      currency: requiredString(payload.user.currency, "user.currency"),
      email: requiredString(payload.user.email, "user.email"),
      name: requiredString(payload.user.name, "user.name"),
      companyId: requiredIdentifier(payload.user.company_id, "user.company_id"),
    }),
  });
}

function normaliseHttpsBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/$/, "");
  let parsed: URL;

  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error("Cherry Money API base URL must be a valid URL.");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Cherry Money API base URL must use HTTPS.");
  }

  return parsed.origin;
}

function normaliseReturnOrigin(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new Error("Cherry Money return origin is invalid.");
  }

  const localhost =
    parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";

  if (parsed.protocol !== "https:" && !(localhost && parsed.protocol === "http:")) {
    throw new Error("Cherry Money return origin must use HTTPS.");
  }

  return parsed.origin;
}

function firstValidationMessage(value: unknown): string | null {
  if (!isRecord(value)) return null;

  for (const item of Object.values(value)) {
    if (Array.isArray(item)) {
      const first = item.find((message) => typeof message === "string");
      if (typeof first === "string" && first.trim()) return first.trim();
    }
  }

  return null;
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

function requiredIdentifier(value: unknown, label: string): string {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value.toString();
  }

  throw new Error("Cherry Money response is missing " + label + ".");
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

export {
  buildCherryMoneyGoogleLoginUrl,
  exchangeCherryMoneyGoogleCode,
};
