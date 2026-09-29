import {
  getAddress,
  parseUnits,
  type Address,
  type Hex,
} from "viem";

const DEFAULT_SESSION_TTL_MS = 5 * 60 * 1_000;
const DEFAULT_MAX_AUTHORIZATIONS = 3;
const DEFAULT_MAX_PER_PAYMENT = "500";
const DEFAULT_MAX_CUMULATIVE = "1000";

type PaymentSessionScope = Readonly<{
  chainId: number;
  asset: Address;
  recipient: Address;
  assetDecimals: number;
  openedAtMs: number;
  expiresAtMs: number;
  maxPerPayment: bigint;
  maxCumulative: bigint;
  maxAuthorizations: number;
  reference: Hex | null;
}>;

type PaymentSessionUsage = Readonly<{
  authorizationCount: number;
  cumulativeAmount: bigint;
}>;

type PaymentAuthorizationRequest = Readonly<{
  chainId: number;
  asset: Address;
  recipient: Address;
  amount: bigint;
  reference: Hex;
}>;

type SessionPolicyViolationCode =
  | "SESSION_EXPIRED"
  | "CHAIN_CHANGED"
  | "ASSET_CHANGED"
  | "RECIPIENT_CHANGED"
  | "REFERENCE_CHANGED"
  | "AMOUNT_INVALID"
  | "PAYMENT_LIMIT_EXCEEDED"
  | "CUMULATIVE_LIMIT_EXCEEDED"
  | "AUTHORIZATION_LIMIT_REACHED";

class SessionPolicyViolation extends Error {
  readonly code: SessionPolicyViolationCode;
  readonly requiresPasskey = true;

  constructor(code: SessionPolicyViolationCode, message: string) {
    super(message);
    this.name = "SessionPolicyViolation";
    this.code = code;
  }
}

function createPaymentSessionScope(options: {
  chainId: number;
  asset: string;
  recipient: string;
  assetDecimals: number;
  nowMs?: number;
  ttlMs?: number;
  maxPerPayment?: string;
  maxCumulative?: string;
  maxAuthorizations?: number;
  reference?: Hex;
}): PaymentSessionScope {
  const nowMs = options.nowMs ?? Date.now();
  const ttlMs = options.ttlMs ?? DEFAULT_SESSION_TTL_MS;
  const maxAuthorizations =
    options.maxAuthorizations ?? DEFAULT_MAX_AUTHORIZATIONS;

  if (!Number.isInteger(options.chainId) || options.chainId <= 0) {
    throw new Error("Session chain ID must be a positive integer.");
  }

  if (
    !Number.isInteger(options.assetDecimals) ||
    options.assetDecimals < 0 ||
    options.assetDecimals > 36
  ) {
    throw new Error("Asset decimals must be an integer between 0 and 36.");
  }

  if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
    throw new Error("Session TTL must be positive.");
  }

  if (!Number.isInteger(maxAuthorizations) || maxAuthorizations <= 0) {
    throw new Error("Session authorization count must be positive.");
  }

  const maxPerPayment = parseUnits(
    options.maxPerPayment ?? DEFAULT_MAX_PER_PAYMENT,
    options.assetDecimals,
  );
  const maxCumulative = parseUnits(
    options.maxCumulative ?? DEFAULT_MAX_CUMULATIVE,
    options.assetDecimals,
  );

  if (maxCumulative < maxPerPayment) {
    throw new Error("Session cumulative limit cannot be below its per-payment limit.");
  }

  return Object.freeze({
    chainId: options.chainId,
    asset: getAddress(options.asset),
    recipient: getAddress(options.recipient),
    assetDecimals: options.assetDecimals,
    openedAtMs: nowMs,
    expiresAtMs: nowMs + ttlMs,
    maxPerPayment,
    maxCumulative,
    maxAuthorizations,
    reference: options.reference ?? null,
  });
}

function validatePaymentAuthorization(
  scope: PaymentSessionScope,
  usage: PaymentSessionUsage,
  request: PaymentAuthorizationRequest,
  nowMs: number = Date.now(),
): void {
  if (nowMs >= scope.expiresAtMs) {
    throw new SessionPolicyViolation(
      "SESSION_EXPIRED",
      "This payment session expired. Confirm with your passkey to open a new session.",
    );
  }

  if (request.chainId !== scope.chainId) {
    throw new SessionPolicyViolation(
      "CHAIN_CHANGED",
      "The network changed. Confirm the new network with your passkey.",
    );
  }

  if (getAddress(request.asset) !== scope.asset) {
    throw new SessionPolicyViolation(
      "ASSET_CHANGED",
      "The payment asset changed. Confirm the new asset with your passkey.",
    );
  }

  if (getAddress(request.recipient) !== scope.recipient) {
    throw new SessionPolicyViolation(
      "RECIPIENT_CHANGED",
      "The recipient changed. Confirm the new recipient with your passkey.",
    );
  }

  if (
    scope.reference !== null &&
    request.reference.toLowerCase() !== scope.reference.toLowerCase()
  ) {
    throw new SessionPolicyViolation(
      "REFERENCE_CHANGED",
      "The Cherry Money payment context changed. Confirm the new payment draft with your passkey.",
    );
  }

  if (request.amount <= 0n) {
    throw new SessionPolicyViolation(
      "AMOUNT_INVALID",
      "Payment amount must be greater than zero.",
    );
  }

  if (request.amount > scope.maxPerPayment) {
    throw new SessionPolicyViolation(
      "PAYMENT_LIMIT_EXCEEDED",
      "This payment exceeds the session limit. Confirm a higher limit with your passkey.",
    );
  }

  if (usage.cumulativeAmount + request.amount > scope.maxCumulative) {
    throw new SessionPolicyViolation(
      "CUMULATIVE_LIMIT_EXCEEDED",
      "This payment exceeds the session total. Confirm a new session with your passkey.",
    );
  }

  if (usage.authorizationCount >= scope.maxAuthorizations) {
    throw new SessionPolicyViolation(
      "AUTHORIZATION_LIMIT_REACHED",
      "This session has used all prompt-free approvals. Confirm a new session with your passkey.",
    );
  }

  if (!/^0x[0-9a-fA-F]{64}$/.test(request.reference)) {
    throw new Error("Payment reference must be a 32-byte hex value.");
  }
}

function emptyPaymentSessionUsage(): PaymentSessionUsage {
  return Object.freeze({
    authorizationCount: 0,
    cumulativeAmount: 0n,
  });
}

export {
  DEFAULT_MAX_AUTHORIZATIONS,
  DEFAULT_MAX_CUMULATIVE,
  DEFAULT_MAX_PER_PAYMENT,
  DEFAULT_SESSION_TTL_MS,
  SessionPolicyViolation,
  createPaymentSessionScope,
  emptyPaymentSessionUsage,
  validatePaymentAuthorization,
};
export type {
  PaymentAuthorizationRequest,
  PaymentSessionScope,
  PaymentSessionUsage,
  SessionPolicyViolationCode,
};
