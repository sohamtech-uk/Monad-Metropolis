// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title CherrySettlementRegistry
/// @notice Records a privacy-safe correlation between an already-confirmed
///         on-chain payment transaction and an opaque Cherry Money payment
///         reference. This contract does not custody funds and does not assert
///         that the referenced payment transaction is valid. Off-chain
///         verification (Envio / CRE / Cherry Money) must verify the payment
///         transaction independently before accounting state changes.
contract CherrySettlementRegistry {
    struct SettlementCorrelation {
        bytes32 paymentTxHash;
        address payer;
        address recipient;
        address asset;
        uint256 amount;
        uint64 recordedAt;
    }

    error EmptyPaymentReference();
    error EmptyPaymentTransactionHash();
    error InvalidRecipient();
    error InvalidAsset();
    error InvalidAmount();
    error ReferenceAlreadyRecorded(bytes32 paymentReference);

    mapping(bytes32 => SettlementCorrelation) private correlations;

    event BusinessPaymentCorrelated(
        bytes32 indexed paymentReference,
        bytes32 indexed paymentTxHash,
        address indexed payer,
        address recipient,
        address asset,
        uint256 amount,
        uint64 recordedAt
    );

    function recordSettlement(
        bytes32 paymentReference,
        bytes32 paymentTxHash,
        address recipient,
        address asset,
        uint256 amount
    ) external {
        if (paymentReference == bytes32(0)) revert EmptyPaymentReference();
        if (paymentTxHash == bytes32(0)) revert EmptyPaymentTransactionHash();
        if (recipient == address(0)) revert InvalidRecipient();
        if (asset == address(0)) revert InvalidAsset();
        if (amount == 0) revert InvalidAmount();

        bytes32 key = correlationKey(msg.sender, paymentReference);

        if (correlations[key].paymentTxHash != bytes32(0)) {
            revert ReferenceAlreadyRecorded(paymentReference);
        }

        uint64 recordedAt = uint64(block.timestamp);

        correlations[key] = SettlementCorrelation({
            paymentTxHash: paymentTxHash,
            payer: msg.sender,
            recipient: recipient,
            asset: asset,
            amount: amount,
            recordedAt: recordedAt
        });

        emit BusinessPaymentCorrelated(
            paymentReference,
            paymentTxHash,
            msg.sender,
            recipient,
            asset,
            amount,
            recordedAt
        );
    }

    function hasSettlement(
        address payer,
        bytes32 paymentReference
    ) external view returns (bool) {
        return correlations[correlationKey(payer, paymentReference)].paymentTxHash
            != bytes32(0);
    }

    function settlementFor(
        address payer,
        bytes32 paymentReference
    )
        external
        view
        returns (
            bytes32 paymentTxHash,
            address recordedPayer,
            address recipient,
            address asset,
            uint256 amount,
            uint64 recordedAt
        )
    {
        SettlementCorrelation storage correlation =
            correlations[correlationKey(payer, paymentReference)];

        return (
            correlation.paymentTxHash,
            correlation.payer,
            correlation.recipient,
            correlation.asset,
            correlation.amount,
            correlation.recordedAt
        );
    }

    function correlationKey(
        address payer,
        bytes32 paymentReference
    ) public pure returns (bytes32) {
        return keccak256(abi.encodePacked(payer, paymentReference));
    }
}
