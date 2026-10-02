// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {TestnetEscrow} from "./TestnetEscrow.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";

/// @notice Prefunded test earnings, not a payroll/tax implementation.
/// Cancellation refunds ONLY unvested funds; vested earnings remain withdrawable forever.
contract CherryEarningsStream is TestnetEscrow {
    bytes32 public constant CONTRACT_KIND = keccak256("CherryEarningsStream:v1:testnet");
    struct Stream {
        address sender; address recipient; uint128 total; uint128 withdrawn;
        uint64 startAt; uint64 endAt; bool cancellable; bool cancelled; uint128 vestedOnCancel;
    }
    mapping(bytes32 => Stream) public streams;
    event StreamFunded(bytes32 indexed id, address indexed sender, address indexed recipient, uint128 total, uint64 startAt, uint64 endAt, bool cancellable);
    event EarningsWithdrawn(bytes32 indexed id, address indexed recipient, uint128 amount, uint128 cumulativeWithdrawn);
    event StreamCancelled(bytes32 indexed id, address indexed sender, uint128 vested, uint128 refunded);
    constructor(address token) TestnetEscrow(token) {}

    function createStream(address recipient, uint128 total, uint64 startAt, uint64 duration, bool cancellable, bytes32 referenceId)
        external nonReentrant returns (bytes32 id)
    {
        if (startAt == 0) startAt = uint64(block.timestamp);
        if (startAt < block.timestamp || duration == 0 || duration > MAX_SCHEDULE || uint256(startAt) + duration > block.timestamp + MAX_SCHEDULE)
            revert InvalidInput();
        id = _reserve(referenceId, recipient, total);
        uint64 endAt = startAt + duration;
        streams[id] = Stream(msg.sender, recipient, total, 0, startAt, endAt, cancellable, false, 0);
        _fund(total);
        emit StreamFunded(id, msg.sender, recipient, total, startAt, endAt, cancellable);
    }
    function vested(bytes32 id) public view returns (uint128) {
        Stream storage s = streams[id];
        if (s.cancelled) return s.vestedOnCancel;
        if (block.timestamp <= s.startAt) return 0;
        if (block.timestamp >= s.endAt) return s.total;
        return uint128(Math.mulDiv(s.total, block.timestamp - s.startAt, s.endAt - s.startAt));
    }
    function withdrawable(bytes32 id) public view returns (uint128) {
        return vested(id) - streams[id].withdrawn;
    }
    function withdraw(bytes32 id) external nonReentrant {
        Stream storage s = streams[id];
        if (msg.sender != s.recipient) revert Unauthorized();
        uint128 amount = withdrawable(id);
        if (amount == 0) revert NotAvailable();
        s.withdrawn += amount;
        _pay(s.recipient, amount);
        emit EarningsWithdrawn(id, s.recipient, amount, s.withdrawn);
    }
    function cancel(bytes32 id) external nonReentrant {
        Stream storage s = streams[id];
        if (msg.sender != s.sender) revert Unauthorized();
        if (!s.cancellable || s.cancelled || block.timestamp >= s.endAt) revert NotAvailable();
        uint128 earned = vested(id);
        uint128 refund = s.total - earned;
        s.vestedOnCancel = earned;
        s.cancelled = true;
        _pay(s.sender, refund);
        emit StreamCancelled(id, s.sender, earned, refund);
    }
}
