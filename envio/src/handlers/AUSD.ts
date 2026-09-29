import { indexer, type AusdTransfer } from "envio";

indexer.onEvent(
  {
    contract: "AUSD",
    event: "Transfer",
    fields: {
      transaction: ["hash"],
      block: ["timestamp"],
    },
  },
  async ({ event, context }) => {
    const transfer: AusdTransfer = {
      id: event.transaction.hash + "-" + event.logIndex.toString(),
      transactionHash: event.transaction.hash,
      logIndex: event.logIndex,
      from: event.params.from,
      to: event.params.to,
      amount: event.params.value,
      blockNumber: BigInt(event.block.number),
      blockTimestamp: BigInt(event.block.timestamp),
    };

    context.AusdTransfer.set(transfer);
  },
);
