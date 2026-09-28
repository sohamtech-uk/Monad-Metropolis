export type CherryMoneyClientOptions = Readonly<{
  baseUrl: string;
  bearerToken: string;
  fetchImpl?: typeof fetch;
}>;

export type CherryMoneyBootstrap = Readonly<Record<string, unknown>>;

export type SupplierPaymentDraftInput = Readonly<{
  purchase_invoice_id: string | number;
  bank_account_id?: string | number;
  amount?: string | number;
}>;

export class CherryMoneyClient {
  private readonly baseUrl: string;
  private readonly bearerToken: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: CherryMoneyClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.bearerToken = options.bearerToken;
    this.fetchImpl = options.fetchImpl ?? fetch;

    if (!this.baseUrl.startsWith("https://")) {
      throw new Error("Cherry Money API base URL must use HTTPS.");
    }

    if (!this.bearerToken.trim()) {
      throw new Error("A Cherry Money bearer token is required.");
    }
  }

  async status(): Promise<Record<string, unknown>> {
    return this.request("/api/webmcp/status");
  }

  async bootstrap(): Promise<CherryMoneyBootstrap> {
    return this.request("/api/webmcp/bootstrap");
  }

  async createSupplierPaymentDraft(
    input: SupplierPaymentDraftInput,
  ): Promise<Record<string, unknown>> {
    return this.request("/api/webmcp/payment-drafts", {
      method: "POST",
      body: JSON.stringify(input),
    });
  }

  private async request(
    path: string,
    init: RequestInit = {},
  ): Promise<Record<string, unknown>> {
    const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.bearerToken}`,
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
          : `Cherry Money request failed with HTTP ${response.status}.`;
      throw new Error(message);
    }

    return payload;
  }
}
