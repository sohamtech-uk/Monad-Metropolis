const SETTLEMENT_ANALYTICS_QUERY = /* GraphQL */ `
  query CherrySettlementAnalytics {
    DailySettlementMetric(order_by: { date: desc }, limit: 30) {
      date
      correlationCount
      verifiedCount
      mismatchCount
      verifiedVolume
    }

    Settlement(
      where: { verified: { _eq: true } }
      order_by: { settledAt: desc }
      limit: 10
    ) {
      id
      paymentReference
      paymentTxHash
      correlationTxHash
      payer
      recipient
      asset
      amount
      settledAt
      registryAddress
    }

    SettlementCorrelation(
      where: { verified: { _eq: false } }
      order_by: { blockTimestamp: desc }
      limit: 10
    ) {
      id
      paymentReference
      paymentTxHash
      correlationTxHash
      payer
      recipient
      amount
      registryAddress
      blockTimestamp
      verificationStatus
      verificationReason
    }
  }
`;

export type EnvioDailySettlementMetric = Readonly<{
  date: string;
  correlationCount: bigint;
  verifiedCount: bigint;
  mismatchCount: bigint;
  verifiedVolume: bigint;
}>;

export type EnvioVerifiedSettlement = Readonly<{
  id: string;
  paymentReference: string;
  paymentTxHash: string;
  correlationTxHash: string;
  payer: string;
  recipient: string;
  asset: string;
  amount: bigint;
  settledAt: bigint;
  registryAddress: string;
}>;

export type EnvioCorrelationDiagnostic = Readonly<{
  id: string;
  paymentReference: string;
  paymentTxHash: string;
  correlationTxHash: string;
  payer: string;
  recipient: string;
  amount: bigint;
  registryAddress: string;
  blockTimestamp: bigint;
  verificationStatus: string;
  verificationReason: string;
}>;

export type EnvioSettlementDashboard = Readonly<{
  daily: readonly EnvioDailySettlementMetric[];
  latestSettlements: readonly EnvioVerifiedSettlement[];
  diagnostics: readonly EnvioCorrelationDiagnostic[];
  totals: Readonly<{
    correlationCount: bigint;
    verifiedCount: bigint;
    mismatchCount: bigint;
    verifiedVolume: bigint;
  }>;
  fetchedAt: string;
}>;

export type EnvioSettlementClientOptions = Readonly<{
  endpoint: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}>;

type GraphqlError = Readonly<{
  message?: unknown;
}>;

type GraphqlResponse = Readonly<{
  data?: unknown;
  errors?: unknown;
}>;

export class EnvioSettlementClient {
  private readonly endpoint: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(options: EnvioSettlementClientOptions) {
    this.endpoint = normaliseGraphqlEndpoint(options.endpoint);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 12_000;

    if (!Number.isFinite(this.timeoutMs) || this.timeoutMs <= 0) {
      throw new Error("Envio GraphQL timeout must be positive.");
    }
  }

  async dashboard(): Promise<EnvioSettlementDashboard> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: SETTLEMENT_ANALYTICS_QUERY,
        }),
        signal: controller.signal,
      });

      const payload = (await response.json().catch(() => ({}))) as GraphqlResponse;

      if (!response.ok) {
        throw new Error(
          "Envio GraphQL request failed with HTTP " +
            response.status.toString() +
            ".",
        );
      }

      if (Array.isArray(payload.errors) && payload.errors.length > 0) {
        const first = payload.errors[0] as GraphqlError;
        throw new Error(
          typeof first?.message === "string"
            ? "Envio GraphQL: " + first.message
            : "Envio GraphQL returned an error.",
        );
      }

      return parseDashboard(payload.data);
    } finally {
      clearTimeout(timer);
    }
  }
}

function parseDashboard(value: unknown): EnvioSettlementDashboard {
  const data = requiredRecord(value, "data");

  const daily = requiredArray(
    data.DailySettlementMetric,
    "DailySettlementMetric",
  ).map((row, index) =>
    parseDailyMetric(requiredRecord(row, "DailySettlementMetric[" + index + "]")),
  );

  const latestSettlements = requiredArray(data.Settlement, "Settlement").map(
    (row, index) =>
      parseSettlement(requiredRecord(row, "Settlement[" + index + "]")),
  );

  const diagnostics = requiredArray(
    data.SettlementCorrelation,
    "SettlementCorrelation",
  ).map((row, index) =>
    parseDiagnostic(
      requiredRecord(row, "SettlementCorrelation[" + index + "]"),
    ),
  );

  const totals = daily.reduce(
    (accumulator, metric) => ({
      correlationCount:
        accumulator.correlationCount + metric.correlationCount,
      verifiedCount: accumulator.verifiedCount + metric.verifiedCount,
      mismatchCount: accumulator.mismatchCount + metric.mismatchCount,
      verifiedVolume: accumulator.verifiedVolume + metric.verifiedVolume,
    }),
    {
      correlationCount: 0n,
      verifiedCount: 0n,
      mismatchCount: 0n,
      verifiedVolume: 0n,
    },
  );

  return Object.freeze({
    daily: Object.freeze(daily),
    latestSettlements: Object.freeze(latestSettlements),
    diagnostics: Object.freeze(diagnostics),
    totals: Object.freeze(totals),
    fetchedAt: new Date().toISOString(),
  });
}

function parseDailyMetric(
  value: Record<string, unknown>,
): EnvioDailySettlementMetric {
  return Object.freeze({
    date: requiredString(value.date, "daily.date"),
    correlationCount: requiredBigInt(
      value.correlationCount,
      "daily.correlationCount",
    ),
    verifiedCount: requiredBigInt(
      value.verifiedCount,
      "daily.verifiedCount",
    ),
    mismatchCount: requiredBigInt(
      value.mismatchCount,
      "daily.mismatchCount",
    ),
    verifiedVolume: requiredBigInt(
      value.verifiedVolume,
      "daily.verifiedVolume",
    ),
  });
}

function parseSettlement(
  value: Record<string, unknown>,
): EnvioVerifiedSettlement {
  return Object.freeze({
    id: requiredString(value.id, "settlement.id"),
    paymentReference: requiredHex(value.paymentReference, "settlement.paymentReference"),
    paymentTxHash: requiredHex(value.paymentTxHash, "settlement.paymentTxHash"),
    correlationTxHash: requiredHex(
      value.correlationTxHash,
      "settlement.correlationTxHash",
    ),
    payer: requiredAddress(value.payer, "settlement.payer"),
    recipient: requiredAddress(value.recipient, "settlement.recipient"),
    asset: requiredAddress(value.asset, "settlement.asset"),
    amount: requiredBigInt(value.amount, "settlement.amount"),
    settledAt: requiredBigInt(value.settledAt, "settlement.settledAt"),
    registryAddress: requiredAddress(
      value.registryAddress,
      "settlement.registryAddress",
    ),
  });
}

function parseDiagnostic(
  value: Record<string, unknown>,
): EnvioCorrelationDiagnostic {
  return Object.freeze({
    id: requiredString(value.id, "diagnostic.id"),
    paymentReference: requiredHex(
      value.paymentReference,
      "diagnostic.paymentReference",
    ),
    paymentTxHash: requiredHex(
      value.paymentTxHash,
      "diagnostic.paymentTxHash",
    ),
    correlationTxHash: requiredHex(
      value.correlationTxHash,
      "diagnostic.correlationTxHash",
    ),
    payer: requiredAddress(value.payer, "diagnostic.payer"),
    recipient: requiredAddress(value.recipient, "diagnostic.recipient"),
    amount: requiredBigInt(value.amount, "diagnostic.amount"),
    registryAddress: requiredAddress(
      value.registryAddress,
      "diagnostic.registryAddress",
    ),
    blockTimestamp: requiredBigInt(
      value.blockTimestamp,
      "diagnostic.blockTimestamp",
    ),
    verificationStatus: requiredString(
      value.verificationStatus,
      "diagnostic.verificationStatus",
    ),
    verificationReason: requiredString(
      value.verificationReason,
      "diagnostic.verificationReason",
    ),
  });
}

function normaliseGraphqlEndpoint(endpoint: string): string {
  const value = endpoint.trim();
  if (!value) {
    throw new Error("Envio GraphQL endpoint is required.");
  }

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Envio GraphQL endpoint must be a valid URL.");
  }

  const localhost =
    parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";

  if (parsed.protocol !== "https:" && !(localhost && parsed.protocol === "http:")) {
    throw new Error(
      "Envio GraphQL endpoint must use HTTPS outside local development.",
    );
  }

  return parsed.toString();
}

function requiredArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    throw new Error("Envio response is missing " + label + ".");
  }
  return value;
}

function requiredRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Envio response has invalid " + label + ".");
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Envio response is missing " + label + ".");
  }
  return value.trim();
}

function requiredBigInt(value: unknown, label: string): bigint {
  if (typeof value === "bigint") {
    return value;
  }

  if (
    (typeof value === "string" && /^-?\d+$/.test(value)) ||
    (typeof value === "number" && Number.isSafeInteger(value))
  ) {
    return BigInt(value);
  }

  throw new Error("Envio response has invalid " + label + ".");
}

function requiredHex(value: unknown, label: string): string {
  const result = requiredString(value, label);
  if (!/^0x[0-9a-fA-F]+$/.test(result)) {
    throw new Error("Envio response has invalid " + label + ".");
  }
  return result;
}

function requiredAddress(value: unknown, label: string): string {
  const result = requiredString(value, label);
  if (!/^0x[0-9a-fA-F]{40}$/.test(result)) {
    throw new Error("Envio response has invalid " + label + ".");
  }
  return result;
}

export { SETTLEMENT_ANALYTICS_QUERY };
