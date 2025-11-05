// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract Echo {
    event Ping(address indexed from, uint256 value, uint256 x);

    function ping(uint256 x) external payable returns (uint256) {
        emit Ping(msg.sender, msg.value, x);
        return x + 1;
    }
}