// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
/// @dev Local test fixture only; never deployed by the testnet deployment script.
contract ConsumerTestToken is ERC20 {
    bool public fee;
    bool public fail;
    address public callbackTarget;
    bytes public callbackData;
    bytes4 public callbackError;
    constructor() ERC20("LOCAL TEST ONLY", "TEST") {}
    function decimals() public pure override returns(uint8) { return 6; }
    function mint(address to, uint256 amount) external { _mint(to, amount); }
    function setFee(bool value) external { fee = value; }
    function setFail(bool value) external { fail = value; }
    function setCallback(address target, bytes calldata data) external { callbackTarget = target; callbackData = data; }
    function transfer(address to, uint256 amount) public override returns (bool) {
        if (fail) return false;
        return super.transfer(to, amount);
    }
    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (fail) return false;
        return super.transferFrom(from, to, amount);
    }
    function _update(address from,address to,uint256 amount) internal override {
        if (fee && from != address(0) && to != address(0) && amount > 0) {
            super._update(from, address(0), 1);
            super._update(from, to, amount - 1);
        } else super._update(from, to, amount);
        if (callbackTarget != address(0)) {
            (bool success, bytes memory result) = callbackTarget.call(callbackData);
            if (!success && result.length >= 4) callbackError = bytes4(result);
        }
    }
}
