import {
  indexer,
  type DailySettlementMetric,
  type Settlement,
  type SettlementCorrelation,
  type SettlementCounterparty,
  type SettlementRoute,
} from "envio";

type SettlementVerificationStatus =
  | "Verified"
  | "RegistryUnconfigured"
  | "RegistryMismatch"
  | "AssetMismatch"
  | "TransferMissing"
  | "PayerMismatch"
  | "RecipientMismatch"
  | "AmountMismatch";

const AUSD_ADDRESS =
  "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC".toLowerCase();

const SETTLEMENT_REGISTRY_ADDRESS =
  "0xdcB418C6e719C40c8e1F9B446cD850330219EEFf".toLowerCase();

function normalise(value: string): string {
  return value.toLowerCase();
}

function utcDate(timestampSeconds: number): string {
  return new Date(timestampSeconds * 1_000).toISOString().slice(0, 10);
}

indexer.onEvent(
  {
    contract: "CherrySettlementRegistry",
    event: "BusinessPaymentCorrelated",
    wildcard: true,
    fields: {
      transaction: ["hash"],
      block: ["timestamp"],
    },
  },
  async ({ event, context }) => {
    const paymentReference = event.params.paymentReference;
    const paymentTxHash = event.params.paymentTxHash;
    const payer = normalise(event.params.payer);
    const recipient = normalise(event.params.recipient);
    const asset = normalise(event.params.asset);
    const registryAddress = normalise(event.srcAddress);
    const expectedRegistry = SETTLEMENT_REGISTRY_ADDRESS;

    const transfers = await context.AusdTransfer.getWhere({
      transactionHash: { _eq: paymentTxHash },
    });

    const exactTransfer = transfers.find(
      (transfer) =>
        normalise(transfer.from) === payer &&
        normalise(transfer.to) === recipient &&
        transfer.amount === event.params.amount,
    );

    let verificationStatus: SettlementVerificationStatus = "Verified";
    let verificationReason = "AUSD transfer matches the trusted registry correlation.";

    if (registryAddress !== expectedRegistry) {
      verificationStatus = "RegistryMismatch";
      verificationReason =
        "Event signature matched, but the emitting contract is not the configured Cherry settlement registry.";
    } else if (asset !== AUSD_ADDRESS) {
      verificationStatus = "AssetMismatch";
      verificationReason =
        "Correlation asset does not match the configured Agora AUSD contract.";
    } else if (transfers.length === 0) {
      verificationStatus = "TransferMissing";
      verificationReason =
        "No indexed AUSD Transfer event was found for the referenced payment transaction.";
    } else if (!transfers.some((transfer) => normalise(transfer.from) === payer)) {
      verificationStatus = "PayerMismatch";
      verificationReason =
        "Referenced AUSD transaction exists, but no transfer is from the correlated payer.";
    } else if (
      !transfers.some(
        (transfer) =>
          normalise(transfer.from) === payer &&
          normalise(transfer.to) === recipient,
      )
    ) {
      verificationStatus = "RecipientMismatch";
      verificationReason =
        "Referenced AUSD transaction exists, but recipient does not match the correlation.";
    } else if (!exactTransfer) {
      verificationStatus = "AmountMismatch";
      verificationReason =
        "Referenced AUSD transfer exists, but amount does not match the correlation.";
    }

    const verified = verificationStatus === "Verified";
    const correlationId =
      event.transaction.hash + "-" + event.logIndex.toString();

    const correlation: SettlementCorrelation = {
      id: correlationId,
      paymentReference,
      paymentTxHash,
      correlationTxHash: event.transaction.hash,
      payer,
      recipient,
      asset,
      amount: event.params.amount,
      registryAddress,
      contractRecordedAt: event.params.recordedAt,
      blockNumber: BigInt(event.block.number),
      blockTimestamp: BigInt(event.block.timestamp),
      trustedRegistry: registryAddress === expectedRegistry,
      verified,
      verificationStatus,
      verificationReason,
      transferId: exactTransfer?.id,
    };

    context.SettlementCorrelation.set(correlation);

    const date = utcDate(event.block.timestamp);
    const daily =
      (await context.DailySettlementMetric.get(date)) ??
      ({
        id: date,
        date,
        correlationCount: 0n,
        verifiedCount: 0n,
        mismatchCount: 0n,
        verifiedVolume: 0n,
      } satisfies DailySettlementMetric);

    context.DailySettlementMetric.set({
      ...daily,
      correlationCount: daily.correlationCount + 1n,
      verifiedCount: daily.verifiedCount + (verified ? 1n : 0n),
      mismatchCount: daily.mismatchCount + (verified ? 0n : 1n),
      verifiedVolume:
        daily.verifiedVolume + (verified ? event.params.amount : 0n),
    });

    if (!verified || !exactTransfer) {
      context.log.warn("Settlement correlation did not verify", {
        paymentReference,
        paymentTxHash,
        verificationStatus,
        registryAddress,
      });
      return;
    }

    const settlementId = payer + ":" + paymentReference;

    const settlement: Settlement = {
      id: settlementId,
      paymentReference,
      paymentTxHash,
      correlationTxHash: event.transaction.hash,
      transferId: exactTransfer.id,
      payer,
      recipient,
      asset,
      amount: event.params.amount,
      registryAddress,
      paymentBlockNumber: exactTransfer.blockNumber,
      correlationBlockNumber: BigInt(event.block.number),
      settledAt: BigInt(event.block.timestamp),
      verified: true,
    };

    context.Settlement.set(settlement);

    const settledAt = BigInt(event.block.timestamp);

    if (payer === recipient) {
      const counterparty =
        (await context.SettlementCounterparty.get(payer)) ??
        ({
          id: payer,
          address: payer,
          sentCount: 0n,
          receivedCount: 0n,
          totalSent: 0n,
          totalReceived: 0n,
          firstSeenAt: settledAt,
          lastSeenAt: settledAt,
        } satisfies SettlementCounterparty);

      context.SettlementCounterparty.set({
        ...counterparty,
        sentCount: counterparty.sentCount + 1n,
        receivedCount: counterparty.receivedCount + 1n,
        totalSent: counterparty.totalSent + event.params.amount,
        totalReceived: counterparty.totalReceived + event.params.amount,
        lastSeenAt: settledAt,
      });
    } else {
      const [payerCounterparty, recipientCounterparty] = await Promise.all([
        context.SettlementCounterparty.get(payer),
        context.SettlementCounterparty.get(recipient),
      ]);

      context.SettlementCounterparty.set({
        ...(payerCounterparty ?? {
          id: payer,
          address: payer,
          sentCount: 0n,
          receivedCount: 0n,
          totalSent: 0n,
          totalReceived: 0n,
          firstSeenAt: settledAt,
          lastSeenAt: settledAt,
        }),
        sentCount: (payerCounterparty?.sentCount ?? 0n) + 1n,
        totalSent:
          (payerCounterparty?.totalSent ?? 0n) + event.params.amount,
        lastSeenAt: settledAt,
      });

      context.SettlementCounterparty.set({
        ...(recipientCounterparty ?? {
          id: recipient,
          address: recipient,
          sentCount: 0n,
          receivedCount: 0n,
          totalSent: 0n,
          totalReceived: 0n,
          firstSeenAt: settledAt,
          lastSeenAt: settledAt,
        }),
        receivedCount: (recipientCounterparty?.receivedCount ?? 0n) + 1n,
        totalReceived:
          (recipientCounterparty?.totalReceived ?? 0n) + event.params.amount,
        lastSeenAt: settledAt,
      });
    }

    const routeId = payer + "->" + recipient;
    const route =
      (await context.SettlementRoute.get(routeId)) ??
      ({
        id: routeId,
        payer,
        recipient,
        paymentCount: 0n,
        totalVolume: 0n,
        firstSeenAt: settledAt,
        lastSeenAt: settledAt,
      } satisfies SettlementRoute);

    context.SettlementRoute.set({
      ...route,
      paymentCount: route.paymentCount + 1n,
      totalVolume: route.totalVolume + event.params.amount,
      lastSeenAt: settledAt,
    });

    context.log.info("Verified Cherry AUSD settlement indexed", {
      paymentReference,
      paymentTxHash,
      payer,
      recipient,
      amount: event.params.amount.toString(),
    });
  },
);
