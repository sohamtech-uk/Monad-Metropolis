import {
  AUSD_ERC20_ABI,
  AUSD_FAUCET_ABI,
  CHERRY_SETTLEMENT_REGISTRY_ABI,
  SessionPolicyViolation,
  createMonadChain,
  emptyPaymentSessionUsage,
  validatePaymentAuthorization,
  type MonadRuntimeConfig,
  type PaymentAuthorizationRequest,
  type PaymentSessionScope,
  type PaymentSessionUsage,
  type SettlementCorrelationResult,
} from "@cherry-metropolis/core";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
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
  | "value-limit"
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

type AusdTransferResult = Readonly<{
  hash: Hex;
  blockNumber: bigint;
  sender: Address;
  recipient: Address;
  amount: bigint;
  senderBalanceBefore: bigint;
  senderBalanceAfter: bigint;
  recipientBalanceBefore: bigint;
  recipientBalanceAfter: bigint;
  submittedAtMs: number;
  confirmedAtMs: number;
  confirmationMs: number;
  transactionUrl: string;
  reference: Hex;
  correlation: SettlementCorrelationResult;
}>;

type FaucetResult = Readonly<{
  hash: Hex;
  blockNumber: bigint;
  account: Address;
  balanceBefore: bigint;
  balanceAfter: bigint;
  transactionUrl: string;
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
    this.validateRequest(request, nowMs);

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

    this.recordUsage(request.amount);

    return Object.freeze({
      signature,
      recoveredAddress: getAddress(recoveredAddress),
      authorizationNumber,
      amount: request.amount,
      signedAtMs: nowMs,
    });
  }

  async sendAusdTransfer(
    config: MonadRuntimeConfig,
    request: PaymentAuthorizationRequest,
    nowMs: number = Date.now(),
  ): Promise<AusdTransferResult> {
    this.validateRequest(request, nowMs);

    if (config.chainId !== this.scope.chainId) {
      throw new SessionPolicyViolation(
        "CHAIN_CHANGED",
        "The configured network no longer matches the approved session.",
      );
    }

    if (getAddress(config.ausdAddress) !== this.scope.asset) {
      throw new SessionPolicyViolation(
        "ASSET_CHANGED",
        "The configured AUSD contract no longer matches the approved session.",
      );
    }

    const chain = createMonadChain(config);
    const transport = http(config.rpcUrl, {
      timeout: 15_000,
      retryCount: 1,
    });
    const publicClient = createPublicClient({ chain, transport });
    const walletClient = createWalletClient({
      account: this.liveAccount.account,
      chain,
      transport,
    });

    const liveChainId = await publicClient.getChainId();
    if (liveChainId !== this.scope.chainId) {
      throw new SessionPolicyViolation(
        "CHAIN_CHANGED",
        "The RPC is connected to a different network. Confirm a new session after fixing the network.",
      );
    }

    const sender = getAddress(this.liveAccount.account.address);
    const recipient = getAddress(request.recipient);

    if (config.settlementRegistryAddress) {
      const alreadyCorrelated = await publicClient.readContract({
        address: config.settlementRegistryAddress,
        abi: CHERRY_SETTLEMENT_REGISTRY_ABI,
        functionName: "hasSettlement",
        args: [sender, request.reference],
      });

      if (alreadyCorrelated) {
        throw new Error(
          "This Cherry Money payment reference is already correlated to a prior settlement. Create or select a new payment draft before sending again.",
        );
      }
    }

    const [senderBalanceBefore, recipientBalanceBefore, nativeBalance] =
      await Promise.all([
        publicClient.readContract({
          address: this.scope.asset,
          abi: AUSD_ERC20_ABI,
          functionName: "balanceOf",
          args: [sender],
        }),
        publicClient.readContract({
          address: this.scope.asset,
          abi: AUSD_ERC20_ABI,
          functionName: "balanceOf",
          args: [recipient],
        }),
        publicClient.getBalance({ address: sender }),
      ]);

    if (senderBalanceBefore < request.amount) {
      throw new Error(
        "Insufficient AUSD for this transfer. Request test AUSD before sending.",
      );
    }

    if (nativeBalance === 0n) {
      throw new Error(
        "This account has no MON for gas. Fund it from the Monad testnet faucet before sending AUSD.",
      );
    }

    const simulation = await publicClient.simulateContract({
      account: this.liveAccount.account,
      address: this.scope.asset,
      abi: AUSD_ERC20_ABI,
      functionName: "transfer",
      args: [recipient, request.amount],
    });

    const submittedAtMs = Date.now();
    const hash = await walletClient.writeContract(simulation.request);

    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      confirmations: 1,
      timeout: 60_000,
    });
    const confirmedAtMs = Date.now();

    if (receipt.status !== "success") {
      throw new Error("The AUSD transfer transaction reverted.");
    }

    const [senderBalanceAfter, recipientBalanceAfter] = await Promise.all([
      publicClient.readContract({
        address: this.scope.asset,
        abi: AUSD_ERC20_ABI,
        functionName: "balanceOf",
        args: [sender],
      }),
      publicClient.readContract({
        address: this.scope.asset,
        abi: AUSD_ERC20_ABI,
        functionName: "balanceOf",
        args: [recipient],
      }),
    ]);

    const correlation = await this.recordSettlementCorrelation(
      config,
      request,
      hash,
    );

    this.recordUsage(request.amount);

    return Object.freeze({
      hash,
      blockNumber: receipt.blockNumber,
      sender,
      recipient,
      amount: request.amount,
      senderBalanceBefore,
      senderBalanceAfter,
      recipientBalanceBefore,
      recipientBalanceAfter,
      submittedAtMs,
      confirmedAtMs,
      confirmationMs: confirmedAtMs - submittedAtMs,
      transactionUrl: config.explorerUrl + "/tx/" + hash,
      reference: request.reference,
      correlation,
    });
  }

  async retrySettlementCorrelation(
    config: MonadRuntimeConfig,
    transfer: Pick<
      AusdTransferResult,
      "hash" | "recipient" | "amount" | "reference"
    >,
  ): Promise<SettlementCorrelationResult> {
    return this.recordSettlementCorrelation(
      config,
      {
        chainId: this.scope.chainId,
        asset: this.scope.asset,
        recipient: transfer.recipient,
        amount: transfer.amount,
        reference: transfer.reference,
      },
      transfer.hash,
    );
  }

  private async recordSettlementCorrelation(
    config: MonadRuntimeConfig,
    request: PaymentAuthorizationRequest,
    paymentTxHash: Hex,
  ): Promise<SettlementCorrelationResult> {
    const registryAddress = config.settlementRegistryAddress;

    if (!registryAddress) {
      return Object.freeze({
        status: "not_configured",
        registryAddress: null,
        paymentReference: request.reference,
        paymentTxHash,
        correlationTxHash: null,
        correlationBlockNumber: null,
        correlationUrl: null,
        error: null,
      });
    }

    if (this.expireIfNeeded(Date.now())) {
      return Object.freeze({
        status: "failed",
        registryAddress,
        paymentReference: request.reference,
        paymentTxHash,
        correlationTxHash: null,
        correlationBlockNumber: null,
        correlationUrl: null,
        error:
          "The Mera session expired after the AUSD payment confirmed and before the correlation transaction could be signed.",
      });
    }

    try {
      const chain = createMonadChain(config);
      const transport = http(config.rpcUrl, {
        timeout: 15_000,
        retryCount: 1,
      });
      const publicClient = createPublicClient({ chain, transport });
      const walletClient = createWalletClient({
        account: this.liveAccount.account,
        chain,
        transport,
      });

      const alreadyRecorded = await publicClient.readContract({
        address: registryAddress,
        abi: CHERRY_SETTLEMENT_REGISTRY_ABI,
        functionName: "hasSettlement",
        args: [getAddress(this.liveAccount.account.address), request.reference],
      });

      if (alreadyRecorded) {
        const existing = await publicClient.readContract({
          address: registryAddress,
          abi: CHERRY_SETTLEMENT_REGISTRY_ABI,
          functionName: "settlementFor",
          args: [
            getAddress(this.liveAccount.account.address),
            request.reference,
          ],
        });

        const [
          existingPaymentTxHash,
          existingPayer,
          existingRecipient,
          existingAsset,
          existingAmount,
        ] = existing;

        const matches =
          existingPaymentTxHash.toLowerCase() ===
            paymentTxHash.toLowerCase() &&
          getAddress(existingPayer) ===
            getAddress(this.liveAccount.account.address) &&
          getAddress(existingRecipient) ===
            getAddress(request.recipient) &&
          getAddress(existingAsset) === getAddress(request.asset) &&
          existingAmount === request.amount;

        if (!matches) {
          throw new Error(
            "This payment reference is already correlated to different settlement data.",
          );
        }

        return Object.freeze({
          status: "confirmed",
          registryAddress,
          paymentReference: request.reference,
          paymentTxHash,
          correlationTxHash: null,
          correlationBlockNumber: null,
          correlationUrl: null,
          error: null,
        });
      }

      const simulation = await publicClient.simulateContract({
        account: this.liveAccount.account,
        address: registryAddress,
        abi: CHERRY_SETTLEMENT_REGISTRY_ABI,
        functionName: "recordSettlement",
        args: [
          request.reference,
          paymentTxHash,
          getAddress(request.recipient),
          getAddress(request.asset),
          request.amount,
        ],
      });

      const correlationTxHash = await walletClient.writeContract(
        simulation.request,
      );
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: correlationTxHash,
        confirmations: 1,
        timeout: 60_000,
      });

      if (receipt.status !== "success") {
        throw new Error("The settlement correlation transaction reverted.");
      }

      return Object.freeze({
        status: "confirmed",
        registryAddress,
        paymentReference: request.reference,
        paymentTxHash,
        correlationTxHash,
        correlationBlockNumber: receipt.blockNumber,
        correlationUrl:
          config.explorerUrl + "/tx/" + correlationTxHash,
        error: null,
      });
    } catch (error) {
      return Object.freeze({
        status: "failed",
        registryAddress,
        paymentReference: request.reference,
        paymentTxHash,
        correlationTxHash: null,
        correlationBlockNumber: null,
        correlationUrl: null,
        error:
          error instanceof Error
            ? error.message
            : "Settlement correlation failed after the AUSD payment confirmed.",
      });
    }
  }

  async requestTestAusd(config: MonadRuntimeConfig): Promise<FaucetResult> {
    if (this.endReason !== null) {
      throw new SessionPolicyViolation(
        "SESSION_EXPIRED",
        "This payment session is closed. Confirm with your passkey to continue.",
      );
    }

    const chain = createMonadChain(config);
    const transport = http(config.rpcUrl, {
      timeout: 15_000,
      retryCount: 1,
    });
    const publicClient = createPublicClient({ chain, transport });
    const walletClient = createWalletClient({
      account: this.liveAccount.account,
      chain,
      transport,
    });

    const liveChainId = await publicClient.getChainId();
    if (liveChainId !== this.scope.chainId) {
      throw new SessionPolicyViolation(
        "CHAIN_CHANGED",
        "The RPC is connected to a different network.",
      );
    }

    const account = getAddress(this.liveAccount.account.address);
    const [balanceBefore, nativeBalance] = await Promise.all([
      publicClient.readContract({
        address: config.ausdAddress,
        abi: AUSD_ERC20_ABI,
        functionName: "balanceOf",
        args: [account],
      }),
      publicClient.getBalance({ address: account }),
    ]);

    if (nativeBalance === 0n) {
      throw new Error(
        "This account needs a small MON balance for gas before it can call the Agora AUSD testnet faucet.",
      );
    }

    const simulation = await publicClient.simulateContract({
      account: this.liveAccount.account,
      address: config.ausdFaucetAddress,
      abi: AUSD_FAUCET_ABI,
      functionName: "requestFunds",
      args: [account],
    });

    const hash = await walletClient.writeContract(simulation.request);
    const receipt = await publicClient.waitForTransactionReceipt({
      hash,
      confirmations: 1,
      timeout: 60_000,
    });

    if (receipt.status !== "success") {
      throw new Error("The Agora AUSD faucet transaction reverted.");
    }

    const balanceAfter = await publicClient.readContract({
      address: config.ausdAddress,
      abi: AUSD_ERC20_ABI,
      functionName: "balanceOf",
      args: [account],
    });

    return Object.freeze({
      hash,
      blockNumber: receipt.blockNumber,
      account,
      balanceBefore,
      balanceAfter,
      transactionUrl: config.explorerUrl + "/tx/" + hash,
    });
  }

  end(reason: SessionEndReason = "manual"): void {
    if (this.endReason !== null) {
      return;
    }

    this.endReason = reason;
    this.liveAccount.end();
  }

  private validateRequest(
    request: PaymentAuthorizationRequest,
    nowMs: number,
  ): void {
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
  }

  private recordUsage(amount: bigint): void {
    const authorizationCount = this.usage.authorizationCount + 1;

    this.usage = Object.freeze({
      authorizationCount,
      cumulativeAmount: this.usage.cumulativeAmount + amount,
    });

    if (authorizationCount >= this.scope.maxAuthorizations) {
      this.end("authorization-limit");
    } else if (this.usage.cumulativeAmount >= this.scope.maxCumulative) {
      this.end("value-limit");
    }
  }
}

export { ScopedMeraPaymentSession };
export type {
  AusdTransferResult,
  FaucetResult,
  ScopedSessionStatus,
  SessionEndReason,
  SignedPaymentAuthorization,
};
