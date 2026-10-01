// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {TestnetEscrow} from "./TestnetEscrow.sol";

/// @notice A gift link identifies a record, NOT a bearer claim. Only its recipient can claim.
contract CherryGiftEscrow is TestnetEscrow {
    bytes32 public constant CONTRACT_KIND = keccak256("CherryGiftEscrow:v1:testnet");
    enum State { Missing, Funded, Claimed, Reclaimed }
    struct Gift { address sender; address recipient; uint128 amount; uint64 unlockAt; uint64 expiresAt; State state; }
    mapping(bytes32 => Gift) public gifts;
    event GiftFunded(bytes32 indexed id, address indexed sender, address indexed recipient, uint128 amount, uint64 unlockAt, uint64 expiresAt);
    event GiftClaimed(bytes32 indexed id, address indexed recipient, uint128 amount);
    event GiftReclaimed(bytes32 indexed id, address indexed sender, uint128 amount);
    constructor(address token) TestnetEscrow(token) {}

    function createGift(address recipient, uint128 amount, uint64 unlockAt, uint64 expiresAt, bytes32 referenceId)
        external nonReentrant returns (bytes32 id)
    {
        if (unlockAt < block.timestamp || expiresAt <= unlockAt || expiresAt > block.timestamp + MAX_SCHEDULE)
            revert InvalidInput();
        id = _reserve(referenceId, recipient, amount);
        gifts[id] = Gift(msg.sender, recipient, amount, unlockAt, expiresAt, State.Funded);
        _fund(amount);
        emit GiftFunded(id, msg.sender, recipient, amount, unlockAt, expiresAt);
    }
    function claim(bytes32 id) external nonReentrant {
        Gift storage g = gifts[id];
        if (msg.sender != g.recipient) revert Unauthorized();
        if (g.state != State.Funded || block.timestamp < g.unlockAt || block.timestamp >= g.expiresAt) revert NotAvailable();
        g.state = State.Claimed;
        _pay(g.recipient, g.amount);
        emit GiftClaimed(id, g.recipient, g.amount);
    }
    function reclaim(bytes32 id) external nonReentrant {
        Gift storage g = gifts[id];
        if (msg.sender != g.sender) revert Unauthorized();
        if (g.state != State.Funded || block.timestamp < g.expiresAt) revert NotAvailable();
        g.state = State.Reclaimed;
        _pay(g.sender, g.amount);
        emit GiftReclaimed(id, g.sender, g.amount);
    }
}
