import {
  SessionPolicyViolation,
  emptyPaymentSessionUsage,
  validatePaymentAuthorization,
  type PaymentAuthorizationRequest,
  type PaymentSessionScope,
  type PaymentSessionUsage,
} from "@cherry-metropolis/core";
import {
  getAddress,
  recoverTypedDataAddress,
  type Address,
  type Hex,
} from "viem";

import type { MeraLiveAccount } from "./account";

type SessionEndReason =
  | "manual"
  | "expired"
  | "background"
  | "authorization-limit"
  | "replaced";

type ScopedSessionStatus = Readonly<{
  active: boolean;
  endReason: SessionEndReason | null;
  remainingMs: number;
  authorizationCount: number;
  cumulativeAmount: bigint;
}>;

type SignedPaymentAuthorization = Readonly<{
  signature: Hex;
  recoveredAddress: Address;
  authorizationNumber: number;
  amount: bigint;
  signedAtMs: number;
}>;

const PAYMENT_AUTHORIZATION_TYPES = {
  PaymentAuthorization: [
    { name: "payer", type: "address" },
    { name: "recipient", type: "address" },
    { name: "asset", type: "address" },
    { name: "amount", type: "uint256" },
    { name: "reference", type: "bytes32" },
    { name: "sessionExpiresAt", type: "uint256" },
    { name: "authorizationNumber", type: "uint256" },
  ],
} as const;

class ScopedMeraPaymentSession {
  readonly identity: MeraLiveAccount["identity"];
  readonly scope: PaymentSessionScope;

  private readonly liveAccount: MeraLiveAccount;
  private usage: PaymentSessionUsage = emptyPaymentSessionUsage();
  private endReason: SessionEndReason | null = null;

  constructor(liveAccount: MeraLiveAccount, scope: PaymentSessionScope) {
    if (
      getAddress(liveAccount.identity.address) !==
      getAddress(liveAccount.account.address)
    ) {
      liveAccount.end();
      throw new Error("Mera session address does not match the derived account.");
    }

    this.liveAccount = liveAccount;
    this.identity = liveAccount.identity;
    this.scope = scope;
  }

  status(nowMs: number = Date.now()): ScopedSessionStatus {
    this.expireIfNeeded(nowMs);

    return Object.freeze({
      active: this.endReason === null,
      endReason: this.endReason,
      remainingMs: Math.max(0, this.scope.expiresAtMs - nowMs),
      authorizationCount: this.usage.authorizationCount,
      cumulativeAmount: this.usage.cumulativeAmount,
    });
  }

  expireIfNeeded(nowMs: number = Date.now()): boolean {
    if (this.endReason === null && nowMs >= this.scope.expiresAtMs) {
      this.end("expired");
      return true;
    }

    return this.endReason === "expired";
  }

  async authorizePayment(
    request: PaymentAuthorizationRequest,
    nowMs: number = Date.now(),
  ): Promise<SignedPaymentAuthorization> {
    if (this.endReason !== null) {
      throw new SessionPolicyViolation(
        "SESSION_EXPIRED",
        "This payment session is closed. Confirm with your passkey to open a new session.",
      );
    }

    try {
      validatePaymentAuthorization(this.scope, this.usage, request, nowMs);
    } catch (error) {
      if (
        error instanceof SessionPolicyViolation &&
        (error.code === "SESSION_EXPIRED" ||
          error.code === "AUTHORIZATION_LIMIT_REACHED")
      ) {
        this.end(
          error.code === "SESSION_EXPIRED"
            ? "expired"
            : "authorization-limit",
        );
      }
      throw error;
    }

    const authorizationNumber = this.usage.authorizationCount + 1;
    const typedData = {
      domain: {
        name: "Cherry Pay Global",
        version: "1",
        chainId: this.scope.chainId,
        verifyingContract: this.scope.asset,
      },
      types: PAYMENT_AUTHORIZATION_TYPES,
      primaryType: "PaymentAuthorization" as const,
      message: {
        payer: this.liveAccount.account.address,
        recipient: getAddress(request.recipient),
        asset: getAddress(request.asset),
        amount: request.amount,
        reference: request.reference,
        sessionExpiresAt: BigInt(Math.floor(this.scope.expiresAtMs / 1_000)),
        authorizationNumber: BigInt(authorizationNumber),
      },
    };

    const signature = await this.liveAccount.account.signTypedData(typedData);
    const recoveredAddress = await recoverTypedDataAddress({
      ...typedData,
      signature,
    });

    if (
      getAddress(recoveredAddress) !==
      getAddress(this.liveAccount.account.address)
    ) {
      this.end("manual");
      throw new Error("Mera signature did not recover the expected account.");
    }

    this.usage = Object.freeze({
      authorizationCount,
      cumulativeAmount: this.usage.cumulativeAmount + request.amount,
    });

    return Object.freeze({
      signature,
      recoveredAddress: getAddress(recoveredAddress),
      authorizationNumber,
      amount: request.amount,
      signedAtMs: nowMs,
    });
  }

  end(reason: SessionEndReason = "manual"): void {
    if (this.endReason !== null) {
      return;
    }

    this.endReason = reason;
    this.liveAccount.end();
  }
}

export { ScopedMeraPaymentSession };
export type {
  ScopedSessionStatus,
  SessionEndReason,
  SignedPaymentAuthorization,
};
