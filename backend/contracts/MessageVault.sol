// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IAccount} from "@account-abstraction/contracts/interfaces/IAccount.sol";
import {IEntryPoint} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {PackedUserOperation} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract MessageVault is IAccount, ReentrancyGuard {
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;
    
    // ERC-4337 validation constants
    uint256 constant SIG_VALIDATION_FAILED = 1;
    // Custom errors
    error OnlyOwner();
    error NotEntryPoint();
    error OnlyOwnerOrEntryPoint();
    error InvalidTarget();
    error InvalidEntryPoint();
    error EntryPointNotSet();
    error WrongSender();
    error EmptyContent();
    error ExecuteFailed();
    error ZeroOwner();

    address public owner;
    IEntryPoint public entryPoint;
    uint256 public nextMessageId;
    // Temporary signer captured during AA validation; consumed during immediate execution
    address private _lastValidatedSigner;

    // Allowed selector for non-owner signatures validated by EntryPoint
    bytes4 private constant SELECTOR_SEND_MESSAGE_TO_WALLET = bytes4(keccak256("sendMessageToWallet(string)"));

    /// @dev Consumes the temporary signer only when called by EntryPoint.
    function _consumeValidatedSignerIfEntryPoint() internal returns (address signer) {
        if (msg.sender == address(entryPoint)) {
            signer = _lastValidatedSigner;
            if (_lastValidatedSigner != address(0)) {
                _lastValidatedSigner = address(0);
            }
        } else {
            signer = address(0);
        }
    }

    /// @dev Returns true for the approved selector invoked by non-owners.
    function _isAllowedSelector(bytes4 selector) internal pure returns (bool) {
        return selector == SELECTOR_SEND_MESSAGE_TO_WALLET;
    }

    /// @dev Recovers signer from a personal_sign (EIP-191) over a 32-byte userOpHash.
    function _recoverPersonalSign(bytes calldata signature, bytes32 userOpHash) internal pure returns (address) {
        // Validate length: standard ECDSA is 65 bytes (r,s,v).
        if (signature.length != 65) {
            return address(0);
        }
        // Only personal_sign validation (EIP-191).
        return userOpHash.toEthSignedMessageHash().recover(signature);
    }

    /// @dev Extracts the inner function selector (first 4 bytes) from calldata.
    function _getSelector(bytes calldata callData) internal pure returns (bytes4) {
        if (callData.length < 4) {
            return bytes4(0);
        }
        // Read the first 4 bytes of the payload directly from calldata.
        uint32 s;
        assembly {
            // First 4 bytes at callData.offset are the inner selector
            s := shr(224, calldataload(callData.offset))
        }
        return bytes4(s);
    }

    //

    event OwnerChanged(address indexed oldOwner, address indexed newOwner);
    event MessageStored(address indexed recipient, address indexed sender, uint256 indexed id, string content);
    event EntryPointSet(address indexed newEntryPoint);
    

    constructor(address _owner) {
        if (_owner == address(0)) revert ZeroOwner();
        owner = _owner;
    }

    modifier onlyOwner() {
        if (msg.sender != owner) revert OnlyOwner();
        _;
    }

    modifier onlyEntryPoint() {
        if (msg.sender != address(entryPoint)) revert NotEntryPoint();
        _;
    }

    modifier onlyOwnerOrEntryPoint() {
        if (!(msg.sender == owner || msg.sender == address(entryPoint))) revert OnlyOwnerOrEntryPoint();
        _;
    }

    function setOwner(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroOwner();
        emit OwnerChanged(owner, newOwner);
        owner = newOwner;
    }

    /// @notice Send a message to this wallet.
    /// @dev Callable by the owner or by EntryPoint (AA). For EntryPoint calls,
    ///      the temporary validated signer (if any) will be treated as the actor.
    function sendMessageToWallet(string calldata content) external onlyOwnerOrEntryPoint returns (uint256 id) {
        address epSigner = _consumeValidatedSignerIfEntryPoint();
        address actor = msg.sender == address(entryPoint)
            ? (epSigner == address(0) ? owner : epSigner)
            : msg.sender;
        id = _storeMessage(actor, content);
    }

    /// @dev Increments `nextMessageId` and emits events. No on-chain persistence of message details; rely on events for indexing.
    function _storeMessage(address from, string calldata content) private returns (uint256 id) {
        if (bytes(content).length == 0) revert EmptyContent();
        id = ++nextMessageId;
        // No on-chain storage of message details; rely on events for off-chain indexing.
        emit MessageStored(address(this), from, id, content);
    }

    /// @notice Execute an arbitrary call from the wallet.
    /// @dev Disallows calls to zero address and to the wallet itself. Callable by
    ///      the owner or by EntryPoint.
    /// @dev Delegatecall intentionally not supported to avoid storage corruption.
    function execute(address target, uint256 value, bytes calldata data) external onlyOwnerOrEntryPoint nonReentrant returns (bytes memory result) {
        if (target == address(0) || target == address(this)) revert InvalidTarget();
        (bool ok, bytes memory res) = target.call{value: value}(data);
        if (!ok) revert ExecuteFailed();
        return res;
    }

    receive() external payable {}

    /// @notice Set the EntryPoint contract used for ERC-4337 operations.
    /// @dev Only callable by the owner.
    function setEntryPoint(address ep) external onlyOwner {
        if (ep == address(0)) revert InvalidEntryPoint();
        entryPoint = IEntryPoint(ep);
        emit EntryPointSet(ep);
    }

    /// @notice Deposit ETH to EntryPoint for this wallet.
    /// @dev Only callable by the owner. Requires EntryPoint to be set.
    function addDeposit() external payable onlyOwner {
        if (address(entryPoint) == address(0)) revert EntryPointNotSet();
        entryPoint.depositTo{value: msg.value}(address(this));
    }

    /// @notice Withdraw ETH from EntryPoint to a recipient address.
    /// @dev Only callable by the owner. Requires EntryPoint to be set.
    function withdrawDepositTo(address payable to, uint256 amount) external onlyOwner {
        if (address(entryPoint) == address(0)) revert EntryPointNotSet();
        entryPoint.withdrawTo(to, amount);
    }

    /// @notice ERC-4337 validation for this smart account.
    /// @dev Accepts only personal_sign (EIP-191) signatures over `userOpHash`. EIP-1271 is not implemented.
    ///      Non-owner signatures may only invoke `sendMessageToWallet(string)`. The validated signer
    ///      is captured for immediate execution and then cleared.
    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 /*missingAccountFunds*/
    ) external override onlyEntryPoint returns (uint256 validationData) {
        // Clear residual signer state before validating this operation.
        if (_lastValidatedSigner != address(0)) {
            _lastValidatedSigner = address(0);
        }
        if (address(entryPoint) == address(0)) revert EntryPointNotSet();
        if (userOp.sender != address(this)) revert WrongSender();

        // EntryPoint validates the nonce; this function does not call EntryPoint.

        // Validate selector and signature (EIP-191 only) and capture temporary signer.
        bytes4 selector = _getSelector(userOp.callData);
        if (selector == bytes4(0)) {
            // callData too short.
            return SIG_VALIDATION_FAILED;
        }
        address signer = _recoverPersonalSign(userOp.signature, userOpHash);
        if (signer == address(0)) {
            // Invalid signature (length or recovery).
            return SIG_VALIDATION_FAILED;
        }
        bool isOwnerSig = (signer == owner);
        bool allowed = isOwnerSig || _isAllowedSelector(selector);
        if (!allowed) {
            return SIG_VALIDATION_FAILED;
        }
        // Save temporary signer for immediate use during execution.
        _lastValidatedSigner = signer;

        // Read-only mode: ignore missingAccountFunds. A paymaster must cover all gas.

        // Return 0 for valid signature with no time range restrictions.
        return 0;
    }

    /// @notice Read the wallet's deposit in EntryPoint.
    /// @dev Tries multiple interfaces for robustness across different EntryPoint builds.
    function entryPointBalance() external view returns (uint256) {
        address ep = address(entryPoint);
        if (ep == address(0)) return 0;
        // Attempt 1: balanceOf(address)
        (bool ok1, bytes memory res1) = ep.staticcall(abi.encodeWithSignature("balanceOf(address)", address(this)));
        if (ok1 && res1.length >= 32) {
            return abi.decode(res1, (uint256));
        }
        // Attempt 2: getDepositInfo(address) and read the first field (deposit)
        (bool ok2, bytes memory res2) = ep.staticcall(abi.encodeWithSignature("getDepositInfo(address)", address(this)));
        if (ok2 && res2.length >= 32) {
            uint256 deposit;
            assembly {
                deposit := mload(add(res2, 32))
            }
            return deposit;
        }
        return 0;
    }
    

}


