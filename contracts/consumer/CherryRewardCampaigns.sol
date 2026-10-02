// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {TestnetEscrow} from "./TestnetEscrow.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice TESTNET merchant-funded cashback. A designated verifier attests purchases.
/// It cannot mint funds, withdraw campaign money or direct rewards to another payer.
/// A signed voucher is not a reservation: claims are bounded by funded remaining budget.
contract CherryRewardCampaigns is TestnetEscrow, EIP712 {
    bytes32 public constant CONTRACT_KIND = keccak256("CherryRewardCampaigns:v1:testnet");
    bytes32 public constant VOUCHER_TYPEHASH = keccak256("RewardVoucher(bytes32 campaignId,bytes32 paymentTxHash,uint32 logIndex,address payer,uint128 purchaseAmount,uint64 paidAt,uint64 validUntil)");
    struct Campaign {
        address merchant; address verifier; uint128 remaining; uint128 minimum;
        uint128 cap; uint16 bps; uint32 maxClaimsPerPayer; uint64 startsAt; uint64 endsAt; uint64 claimUntil;
    }
    struct RewardVoucher { bytes32 campaignId; bytes32 paymentTxHash; uint32 logIndex; address payer; uint128 purchaseAmount; uint64 paidAt; uint64 validUntil; }
    mapping(bytes32 => Campaign) public campaigns;
    mapping(bytes32 => bool) public consumedPayments;
    mapping(bytes32 => mapping(address => uint32)) public payerClaims;
    event CampaignFunded(bytes32 indexed id, address indexed merchant, address indexed verifier, uint128 budget);
    event RewardPaid(bytes32 indexed campaignId, bytes32 indexed paymentTxHash, address indexed payer, uint32 logIndex, uint128 amount);
    event CampaignClosed(bytes32 indexed id, address indexed merchant, uint128 refund);
    constructor(address token) TestnetEscrow(token) EIP712("Cherry Pay Testnet Rewards", "1") {}

    function createCampaign(address verifier, uint128 budget, uint128 minimum, uint128 cap, uint16 bps, uint32 maxClaimsPerPayer,
        uint64 startsAt, uint64 endsAt, uint64 claimUntil, bytes32 referenceId) external nonReentrant returns (bytes32 id)
    {
        if (verifier == address(0) || verifier == msg.sender || minimum == 0 || cap == 0 || cap > budget || bps == 0 || bps > 10000
            || maxClaimsPerPayer == 0 || startsAt < block.timestamp || endsAt <= startsAt || claimUntil <= endsAt
            || claimUntil > block.timestamp + MAX_SCHEDULE) revert InvalidInput();
        id = _reserve(referenceId, verifier, budget);
        campaigns[id] = Campaign(msg.sender, verifier, budget, minimum, cap, bps, maxClaimsPerPayer, startsAt, endsAt, claimUntil);
        _fund(budget);
        emit CampaignFunded(id, msg.sender, verifier, budget);
    }
    function claim(RewardVoucher calldata v, bytes calldata signature) external nonReentrant {
        Campaign storage c = campaigns[v.campaignId];
        if (msg.sender != v.payer || v.payer == c.merchant) revert Unauthorized();
        if (c.verifier == address(0) || v.paymentTxHash == bytes32(0) || v.paidAt < c.startsAt || v.paidAt >= c.endsAt || v.paidAt > block.timestamp
            || v.validUntil <= block.timestamp || v.validUntil > c.claimUntil || block.timestamp >= c.claimUntil
            || v.purchaseAmount < c.minimum || payerClaims[v.campaignId][v.payer] >= c.maxClaimsPerPayer) revert NotAvailable();
        bytes32 digest = _hashTypedDataV4(keccak256(abi.encode(VOUCHER_TYPEHASH, v.campaignId, v.paymentTxHash, v.logIndex, v.payer, v.purchaseAmount, v.paidAt, v.validUntil)));
        if (ECDSA.recover(digest, signature) != c.verifier) revert Unauthorized();
        // The same token-transfer log cannot earn twice, including across campaigns.
        bytes32 key = keccak256(abi.encode(v.paymentTxHash, v.logIndex));
        if (consumedPayments[key]) revert DuplicateReference();
        uint128 reward = uint128(Math.min(Math.mulDiv(v.purchaseAmount, c.bps, 10000), c.cap));
        if (reward == 0 || reward > c.remaining) revert NotAvailable();
        consumedPayments[key] = true;
        payerClaims[v.campaignId][v.payer] += 1;
        c.remaining -= reward;
        _pay(v.payer, reward);
        emit RewardPaid(v.campaignId, v.paymentTxHash, v.payer, v.logIndex, reward);
    }
    function closeCampaign(bytes32 id) external nonReentrant {
        Campaign storage c = campaigns[id];
        if (msg.sender != c.merchant) revert Unauthorized();
        if (block.timestamp < c.claimUntil || c.remaining == 0) revert NotAvailable();
        uint128 refund = c.remaining;
        c.remaining = 0;
        _pay(c.merchant, refund);
        emit CampaignClosed(id, c.merchant, refund);
    }
}
