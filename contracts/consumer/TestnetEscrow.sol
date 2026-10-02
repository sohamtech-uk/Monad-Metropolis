// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @dev Experimental, non-upgradeable escrow. No administrator or sweep function.
/// Only the configured non-rebasing/non-fee AUSD asset is supported. No native MON accepted.
abstract contract TestnetEscrow is ReentrancyGuard {
    using SafeERC20 for IERC20;
    IERC20 public immutable asset;
    uint256 public totalLiability;
    uint256 public constant MAX_SCHEDULE = 365 days;
    error TestnetOnly();
    error InvalidInput();
    error Unauthorized();
    error NotAvailable();
    error DuplicateReference();
    error UnsupportedToken();
    mapping(bytes32 => bool) private usedReferences;

    constructor(address token) {
        if (block.chainid != 10143 && block.chainid != 31337) revert TestnetOnly();
        if (token.code.length == 0) revert InvalidInput();
        asset = IERC20(token);
    }

    function recordId(address sender, bytes32 referenceId) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), sender, referenceId));
    }

    function _reserve(bytes32 referenceId, address recipient, uint128 amount) internal returns (bytes32 id) {
        if (referenceId == bytes32(0) || recipient == address(0) || recipient == msg.sender || amount == 0)
            revert InvalidInput();
        id = recordId(msg.sender, referenceId);
        if (usedReferences[id]) revert DuplicateReference();
        usedReferences[id] = true;
    }

    function _fund(uint256 amount) internal {
        uint256 beforeBalance = asset.balanceOf(address(this));
        asset.safeTransferFrom(msg.sender, address(this), amount);
        if (asset.balanceOf(address(this)) != beforeBalance + amount) revert UnsupportedToken();
        totalLiability += amount;
    }

    function _pay(address recipient, uint256 amount) internal {
        if (amount == 0) return;
        totalLiability -= amount;
        asset.safeTransfer(recipient, amount);
    }
}
