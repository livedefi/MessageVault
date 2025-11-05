// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.23;

contract MockEntryPointAlt {
    mapping(address => uint256) public balances;

    struct DepositInfo {
        uint256 deposit;
        bool staked;
        uint112 stake;
        uint32 unstakeDelaySec;
        uint48 withdrawTime;
    }

    function depositTo(address account) external payable {
        balances[account] += msg.value;
    }

    function withdrawTo(address account, uint256 amount) external {
        require(balances[msg.sender] >= amount, "insufficient");
        balances[msg.sender] -= amount;
        (bool ok, ) = account.call{value: amount}("");
        require(ok, "withdraw failed");
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
}