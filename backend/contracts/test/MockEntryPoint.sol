// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IAccount} from "@account-abstraction/contracts/interfaces/IAccount.sol";
import {PackedUserOperation} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";

contract MockEntryPoint {
    mapping(address => uint256) public balances;
    mapping(address => uint256) public nonces;

    struct DepositInfo {
        uint256 deposit;
        bool staked;
        uint112 stake;
        uint32 unstakeDelaySec;
        uint48 withdrawTime;
    }

    event Deposited(address indexed account, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);

    function balanceOf(address account) external view returns (uint256) {
        return balances[account];
    }

    function getDepositInfo(address account) external view returns (DepositInfo memory info) {
        info = DepositInfo({
            deposit: balances[account],
            staked: false,
            stake: 0,
            unstakeDelaySec: 0,
            withdrawTime: 0
        });
    }

    function depositTo(address account) external payable {
        balances[account] += msg.value;
        emit Deposited(account, msg.value);
    }

    function withdrawTo(address payable to, uint256 amount) external {
        require(amount <= address(this).balance, "insufficient EP balance");
        require(amount <= balances[msg.sender], "insufficient recorded");
        balances[msg.sender] -= amount;
        to.transfer(amount);
        emit Withdrawn(to, amount);
    }

    function setNonce(address account, uint256 newNonce) external {
        nonces[account] = newNonce;
    }

    function getNonce(address account, uint192 key) external view returns (uint256) {
        if (key == 0) {
            return nonces[account];
        }
        return 0;
    }

    function validate(
        address account,
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 missingAccountFunds
    ) external returns (uint256) {
        return IAccount(account).validateUserOp(userOp, userOpHash, missingAccountFunds);
    }
}