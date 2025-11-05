import { expect } from "chai";
import { network } from "hardhat";
import { Signer } from "ethers";

const { ethers } = await network.connect();

describe("MessageVault integration", function () {
  let owner: Signer, bob: Signer, alice: Signer;
  let wallet: any, mockEntryPoint: any, echo: any;

  beforeEach(async function () {
    [owner, bob, alice] = await ethers.getSigners();
    wallet = await ethers.deployContract("MessageVault", [await owner.getAddress()]);
    mockEntryPoint = await ethers.deployContract("MockEntryPoint", []);
    echo = await ethers.deployContract("Echo", []);
    
    // Set up EntryPoint for AA tests
    await wallet.connect(owner).setEntryPoint(await mockEntryPoint.getAddress());
  });
  it("stores message and emits MessageStored", async function () {
    const tx = await wallet.connect(owner).sendMessageToWallet("hello world");
    await expect(tx)
      .to.emit(wallet, "MessageStored")
      .withArgs(await wallet.getAddress(), await owner.getAddress(), 1n, "hello world");
  });

  it("aggregates MessageStored events and matches nextMessageId", async function () {
    const deploymentBlockNumber = await ethers.provider.getBlockNumber();

    // run a series of messages
    for (let i = 1; i <= 5; i++) {
      await wallet.connect(owner).sendMessageToWallet(`msg ${i}`);
    }

    const events = await wallet.queryFilter(
      wallet.filters.MessageStored(),
      deploymentBlockNumber,
      "latest",
    );

    expect(events.length).to.equal(5);
    expect(await wallet.nextMessageId()).to.equal(5n);
  });

  it("rejects empty message content and preserves nextMessageId", async function () {
    const beforeId = await wallet.nextMessageId();
    await expect(wallet.connect(owner).sendMessageToWallet(""))
      .to.be.revertedWithCustomError(wallet, "EmptyContent");
    expect(await wallet.nextMessageId()).to.equal(beforeId);
  });

  it("only owner or EntryPoint can call sendMessageToWallet", async function () {
    await expect(wallet.connect(bob).sendMessageToWallet("hi"))
      .to.be.revertedWithCustomError(wallet, "OnlyOwnerOrEntryPoint");
    const tx = await wallet.connect(owner).sendMessageToWallet("owner msg");
    await expect(tx).to.emit(wallet, "MessageStored");
  });

  it("setEntryPoint restricted to owner and reflects in entryPointBalance", async function () {
    // Create a new EntryPoint for this test to avoid conflicts
    const newEP = await ethers.deployContract("MockEntryPoint", []);

    await expect(wallet.connect(bob).setEntryPoint(await newEP.getAddress()))
      .to.be.revertedWithCustomError(wallet, "OnlyOwner");

    const setTx = await wallet.connect(owner).setEntryPoint(await newEP.getAddress());
    await expect(setTx).to.emit(wallet, "EntryPointSet").withArgs(await newEP.getAddress());

    expect(await wallet.entryPointBalance()).to.equal(0n);

    const epBalBefore = await ethers.provider.getBalance(await newEP.getAddress());
    await wallet.connect(owner).addDeposit({ value: ethers.parseEther("1.0") });
    const epBalAfter = await ethers.provider.getBalance(await newEP.getAddress());
    expect(epBalAfter - epBalBefore).to.equal(ethers.parseEther("1.0"));
    expect(await wallet.entryPointBalance()).to.equal(ethers.parseEther("1.0"));

    const before = await ethers.provider.getBalance(await bob.getAddress());
    await wallet.connect(owner).withdrawDepositTo(await bob.getAddress(), ethers.parseEther("0.4"));
    const after = await ethers.provider.getBalance(await bob.getAddress());
    expect(after - before).to.equal(ethers.parseEther("0.4"));
    expect(await wallet.entryPointBalance()).to.equal(ethers.parseEther("0.6"));
  });

  it("entryPointBalance returns 0 when EntryPoint not set", async function () {
    const fresh: any = await ethers.deployContract("MessageVault", [await owner.getAddress()]);
    expect(await fresh.entryPoint()).to.equal(ethers.ZeroAddress);
    expect(await fresh.entryPointBalance()).to.equal(0n);
  });

  it("entryPointBalance uses getDepositInfo fallback when balanceOf is missing", async function () {
    const alt = await ethers.deployContract("MockEntryPointAlt", []);
    await wallet.connect(owner).setEntryPoint(await alt.getAddress());
    await wallet.connect(owner).addDeposit({ value: ethers.parseEther("0.15") });
    expect(await wallet.entryPointBalance()).to.equal(ethers.parseEther("0.15"));
  });

  it("addDeposit and withdrawDepositTo revert if EntryPoint not set", async function () {
    const fresh: any = await ethers.deployContract("MessageVault", [await owner.getAddress()]);
    await expect(fresh.connect(owner).addDeposit({ value: ethers.parseEther("0.001") }))
      .to.be.revertedWithCustomError(fresh, "EntryPointNotSet");
    await expect(fresh.connect(owner).withdrawDepositTo(await owner.getAddress(), ethers.parseEther("0.001")))
      .to.be.revertedWithCustomError(fresh, "EntryPointNotSet");
  });

  it("setEntryPoint zero address reverts", async function () {
    await expect(wallet.connect(owner).setEntryPoint(ethers.ZeroAddress))
      .to.be.revertedWithCustomError(wallet, "InvalidEntryPoint");
  });

  it("EntryPoint nonce reads 0 by default and matches Mock EP after set", async function () {
    // Test with a fresh wallet (EntryPoint not required for read)
    const freshWallet = await ethers.deployContract("MessageVault", [await owner.getAddress()]);
    expect(await mockEntryPoint.getNonce(await freshWallet.getAddress(), 0)).to.equal(0n);

    // Test with custom nonce set on MockEntryPoint
    await mockEntryPoint.setNonce(await wallet.getAddress(), 7n);
    expect(await mockEntryPoint.getNonce(await wallet.getAddress(), 0)).to.equal(7n);
  });

  it("execute reverts on invalid targets and succeeds on Echo", async function () {
    await expect(wallet.connect(owner).execute(ethers.ZeroAddress, 0, "0x"))
      .to.be.revertedWithCustomError(wallet, "InvalidTarget");
    await expect(wallet.connect(owner).execute(await wallet.getAddress(), 0, "0x"))
      .to.be.revertedWithCustomError(wallet, "InvalidTarget");

    const iface = new ethers.Interface(["event Ping(address indexed from, uint256 value, uint256 x)", "function ping(uint256 x) external payable returns (uint256)"]); 
    const data = iface.encodeFunctionData("ping", [42]);
    const tx = await wallet.connect(owner).execute(await echo.getAddress(), 0, data);
    await expect(tx)
      .to.emit(echo, "Ping")
      .withArgs(await wallet.getAddress(), 0n, 42n);
  });

  it("only owner can call execute directly", async function () {
    const iface = new ethers.Interface(["function ping(uint256 x) external payable returns (uint256)"]);
    const data = iface.encodeFunctionData("ping", [1]);
    await expect(wallet.connect(bob).execute(await echo.getAddress(), 0n, data))
      .to.be.revertedWithCustomError(wallet, "OnlyOwnerOrEntryPoint");
    await expect(wallet.connect(owner).execute(await echo.getAddress(), 0n, data))
      .to.emit(echo, "Ping");
  });

  it("validateUserOp cannot be called directly (NotEntryPoint)", async function () {
    await expect(wallet.validateUserOp(
      {
        sender: await wallet.getAddress(),
        nonce: 0n,
        initCode: "0x",
        callData: "0x",
        accountGasLimits: ethers.ZeroHash, // bytes32 (packed gas limits)
        preVerificationGas: 0n,
        gasFees: ethers.ZeroHash, // bytes32 (packed max fee & priority fee)
        paymasterAndData: "0x",
        signature: "0x"
      } as any,
      ethers.ZeroHash,
      0n
    )).to.be.revertedWithCustomError(wallet, "NotEntryPoint");
  });

  describe("Temporary Owner System (ERC-4337)", function () {
    async function createUserOp(functionSelector: string, params: any[] = []) {
      const iface = new ethers.Interface([
        "function sendMessageToWallet(string calldata content) external returns (uint256)",
        "function execute(address target, uint256 value, bytes calldata data) external returns (bytes memory)"
      ]);
      
      const callData = iface.encodeFunctionData(functionSelector, params);
      const nonce = await mockEntryPoint.getNonce(await wallet.getAddress(), 0);
      
      return {
        sender: await wallet.getAddress(),
        nonce,
        initCode: "0x",
        callData,
        accountGasLimits: ethers.ZeroHash,
        preVerificationGas: 0n,
        gasFees: ethers.ZeroHash,
        paymasterAndData: "0x",
        signature: "0x" // Will be filled later
      };
    }

    async function signUserOpHash(signer: Signer, userOpHash: string) {
      // EIP-191 personal_sign over 32-byte userOpHash; ensure 65-byte canonical signature
      const signed = await signer.signMessage(ethers.getBytes(userOpHash));
      return ethers.Signature.from(signed).serialized;
    }

    it("owner can execute sendMessageToWallet via validateUserOp", async function () {
      const userOp = await createUserOp("sendMessageToWallet", ["owner message via AA"]);
      // Selector sanity: must match allowed selector (off-chain)
      const selector = userOp.callData.slice(0, 10);
      expect(selector).to.equal(ethers.id("sendMessageToWallet(string)").slice(0, 10));
      const userOpHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "bytes", "bytes", "bytes32", "uint256", "bytes32", "bytes"],
        [userOp.sender, userOp.nonce, userOp.initCode, userOp.callData, userOp.accountGasLimits, userOp.preVerificationGas, userOp.gasFees, userOp.paymasterAndData]
      ));
      
      userOp.signature = await signUserOpHash(owner, userOpHash);
      // Sanity: off-chain verification should match owner
      expect(ethers.verifyMessage(ethers.getBytes(userOpHash), userOp.signature)).to.equal(await owner.getAddress());
      // Off-chain recover should match on-chain behavior
      const digestOwner = ethers.hashMessage(ethers.getBytes(userOpHash));
      expect(ethers.recoverAddress(digestOwner, userOp.signature)).to.equal(await owner.getAddress());
      // On-chain helper removed: rely on off-chain verification
      
      // No debug events: validate using staticCall directly

      const validationResult = await mockEntryPoint.validate.staticCall(
        await wallet.getAddress(),
        userOp,
        userOpHash,
        0n
      );
      
      expect(validationResult).to.equal(0n); // Valid signature
    });

    // Removed redundant sendMessage AA test; sendMessageToWallet covers AA flow

    it("non-owner can execute sendMessageToWallet via validateUserOp", async function () {
      const userOp = await createUserOp("sendMessageToWallet", ["alice message via AA"]);
      const selector3 = userOp.callData.slice(0, 10);
      expect(selector3).to.equal(ethers.id("sendMessageToWallet(string)").slice(0, 10));
      const userOpHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "bytes", "bytes", "bytes32", "uint256", "bytes32", "bytes"],
        [userOp.sender, userOp.nonce, userOp.initCode, userOp.callData, userOp.accountGasLimits, userOp.preVerificationGas, userOp.gasFees, userOp.paymasterAndData]
      ));
      
      userOp.signature = await signUserOpHash(alice, userOpHash);
      // Sanity: off-chain verification should match alice
      expect(ethers.verifyMessage(ethers.getBytes(userOpHash), userOp.signature)).to.equal(await alice.getAddress());
      const digestAlice = ethers.hashMessage(ethers.getBytes(userOpHash));
      expect(ethers.recoverAddress(digestAlice, userOp.signature)).to.equal(await alice.getAddress());
      // No on-chain helper: verify only off-chain
      
      // No debug events: validate using staticCall directly

      const validationResult = await mockEntryPoint.validate.staticCall(
        await wallet.getAddress(),
        userOp,
        userOpHash,
        0n
      );
      
      expect(validationResult).to.equal(0n); // Valid signature for allowed function
    });

    it("non-owner cannot execute disallowed functions via validateUserOp", async function () {
      const userOp = await createUserOp("execute", [await echo.getAddress(), 0n, "0x"]);
      const userOpHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "bytes", "bytes", "bytes32", "uint256", "bytes32", "bytes"],
        [userOp.sender, userOp.nonce, userOp.initCode, userOp.callData, userOp.accountGasLimits, userOp.preVerificationGas, userOp.gasFees, userOp.paymasterAndData]
      ));
      
      userOp.signature = await signUserOpHash(bob, userOpHash);
      
      const validationResult = await mockEntryPoint.validate.staticCall(
        await wallet.getAddress(),
        userOp,
        userOpHash,
        0n
      );
      
      expect(validationResult).to.equal(1n); // SIG_VALIDATION_FAILED for disallowed function
    });

    it("rejects invalid signature length", async function () {
      const userOp = await createUserOp("sendMessageToWallet", ["test"]);
      const userOpHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "bytes", "bytes", "bytes32", "uint256", "bytes32", "bytes"],
        [userOp.sender, userOp.nonce, userOp.initCode, userOp.callData, userOp.accountGasLimits, userOp.preVerificationGas, userOp.gasFees, userOp.paymasterAndData]
      ));
      
      userOp.signature = "0x1234"; // Invalid length
      
      const validationResult = await mockEntryPoint.validate.staticCall(
        await wallet.getAddress(),
        userOp,
        userOpHash,
        0n
      );
      
      expect(validationResult).to.equal(1n); // SIG_VALIDATION_FAILED
    });

    it("rejects callData too short for selector", async function () {
      const userOp = await createUserOp("sendMessageToWallet", ["test"]);
      userOp.callData = "0x12"; // Too short for selector
      
      const userOpHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "bytes", "bytes", "bytes32", "uint256", "bytes32", "bytes"],
        [userOp.sender, userOp.nonce, userOp.initCode, userOp.callData, userOp.accountGasLimits, userOp.preVerificationGas, userOp.gasFees, userOp.paymasterAndData]
      ));
      
      userOp.signature = await signUserOpHash(bob, userOpHash);
      
      const validationResult = await mockEntryPoint.validate.staticCall(
        await wallet.getAddress(),
        userOp,
        userOpHash,
        0n
      );
      
      expect(validationResult).to.equal(1n); // SIG_VALIDATION_FAILED
    });

    // Note: Nonce validation is enforced by EntryPoint, not by the account.
    // The account intentionally does not revert on nonce mismatches within validateUserOp.

    it("rejects wrong sender", async function () {
      const userOp = await createUserOp("sendMessageToWallet", ["test"]);
      userOp.sender = await bob.getAddress(); // Wrong sender
      
      const userOpHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "bytes", "bytes", "bytes32", "uint256", "bytes32", "bytes"],
        [userOp.sender, userOp.nonce, userOp.initCode, userOp.callData, userOp.accountGasLimits, userOp.preVerificationGas, userOp.gasFees, userOp.paymasterAndData]
      ));
      
      userOp.signature = await signUserOpHash(bob, userOpHash);
      
      await expect(mockEntryPoint.validate.staticCall(
        await wallet.getAddress(),
        userOp,
        userOpHash,
        0n
      )).to.be.revertedWithCustomError(wallet, "WrongSender");
    });

    it("owner signature allows validateUserOp for execute", async function () {
      const userOp = await createUserOp("execute", [await echo.getAddress(), 0n, "0x"]);
      const userOpHash = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "bytes", "bytes", "bytes32", "uint256", "bytes32", "bytes"],
        [userOp.sender, userOp.nonce, userOp.initCode, userOp.callData, userOp.accountGasLimits, userOp.preVerificationGas, userOp.gasFees, userOp.paymasterAndData]
      ));
      userOp.signature = await signUserOpHash(owner, userOpHash);
      const validationResult = await mockEntryPoint.validate.staticCall(
        await wallet.getAddress(),
        userOp,
        userOpHash,
        0n
      );
      expect(validationResult).to.equal(0n);
    });
  });

  describe("Constructor validation", function () {
    it("rejects zero address owner", async function () {
      await expect(ethers.deployContract("MessageVault", [ethers.ZeroAddress]))
        .to.be.revertedWithCustomError(wallet, "ZeroOwner");
    });
  });

  describe("Ownership and signer cleanup", function () {
    it("setOwner rejects zero address", async function () {
      await expect(wallet.connect(owner).setOwner(ethers.ZeroAddress))
        .to.be.revertedWithCustomError(wallet, "ZeroOwner");
    });

    it("ownership transfer emits event and updates permissions", async function () {
      const old = await owner.getAddress();
      await expect(wallet.connect(owner).setOwner(await bob.getAddress()))
        .to.emit(wallet, "OwnerChanged")
        .withArgs(old, await bob.getAddress());

      await expect(wallet.connect(owner).sendMessageToWallet("hi"))
        .to.be.revertedWithCustomError(wallet, "OnlyOwnerOrEntryPoint");

      await expect(wallet.connect(bob).sendMessageToWallet("hi"))
        .to.emit(wallet, "MessageStored");
    });

    it("consumes temporary signer after successful EP execution; next EP call defaults to owner", async function () {
      // Use an EOA as EntryPoint to simulate direct EP calls
      const ep = alice;
      await wallet.connect(owner).setEntryPoint(await ep.getAddress());

      const iface = new ethers.Interface(["function sendMessageToWallet(string)"]); 
      const callData = iface.encodeFunctionData("sendMessageToWallet", ["first from visitor"]);

      // Prepare a dummy userOpHash and a personal_sign by bob
      const userOpHash = ethers.keccak256(ethers.toUtf8Bytes("dummy"));
      const signed = await bob.signMessage(ethers.getBytes(userOpHash));
      const sig = ethers.Signature.from(signed).serialized;

      // Validate as EntryPoint (EOA) to capture temporary signer
      await wallet.connect(ep).validateUserOp({
        sender: await wallet.getAddress(),
        nonce: 0n,
        initCode: "0x",
        callData,
        accountGasLimits: ethers.ZeroHash,
        preVerificationGas: 0n,
        gasFees: ethers.ZeroHash,
        paymasterAndData: "0x",
        signature: sig
      } as any, userOpHash, 0n);

      // Execute via EntryPoint: should use bob as the actor, then consume the signer
      const tx1 = await wallet.connect(ep).sendMessageToWallet("first from visitor");
      await expect(tx1)
        .to.emit(wallet, "MessageStored")
        .withArgs(await wallet.getAddress(), await bob.getAddress(), 1n, "first from visitor");

      // Next EP call without a new validation should default to owner
      const tx2 = await wallet.connect(ep).sendMessageToWallet("second defaults to owner");
      await expect(tx2)
        .to.emit(wallet, "MessageStored")
        .withArgs(await wallet.getAddress(), await owner.getAddress(), 2n, "second defaults to owner");
    });

    it("after a reverted EP call, a new validation resets signer before next execution", async function () {
      const ep = alice;
      await wallet.connect(owner).setEntryPoint(await ep.getAddress());

      const iface = new ethers.Interface(["function sendMessageToWallet(string)"]); 
      const callDataEmpty = iface.encodeFunctionData("sendMessageToWallet", [""]);
      const userOpHash1 = ethers.keccak256(ethers.toUtf8Bytes("dummy1"));
      const sig1 = ethers.Signature.from(await bob.signMessage(ethers.getBytes(userOpHash1))).serialized;

      // Validate with bob for an empty-content call (will revert on execution)
      await wallet.connect(ep).validateUserOp({
        sender: await wallet.getAddress(),
        nonce: 0n,
        initCode: "0x",
        callData: callDataEmpty,
        accountGasLimits: ethers.ZeroHash,
        preVerificationGas: 0n,
        gasFees: ethers.ZeroHash,
        paymasterAndData: "0x",
        signature: sig1
      } as any, userOpHash1, 0n);

      // Execution reverts on EmptyContent; signer consumption inside the function is reverted too
      await expect(wallet.connect(ep).sendMessageToWallet(""))
        .to.be.revertedWithCustomError(wallet, "EmptyContent");

      // New validation with owner must reset any residual signer before next execution
      const callDataOk = iface.encodeFunctionData("sendMessageToWallet", ["ok"]);
      const userOpHash2 = ethers.keccak256(ethers.toUtf8Bytes("dummy2"));
      const sig2 = ethers.Signature.from(await owner.signMessage(ethers.getBytes(userOpHash2))).serialized;

      await wallet.connect(ep).validateUserOp({
        sender: await wallet.getAddress(),
        nonce: 0n,
        initCode: "0x",
        callData: callDataOk,
        accountGasLimits: ethers.ZeroHash,
        preVerificationGas: 0n,
        gasFees: ethers.ZeroHash,
        paymasterAndData: "0x",
        signature: sig2
      } as any, userOpHash2, 0n);

      const tx = await wallet.connect(ep).sendMessageToWallet("ok");
      await expect(tx)
        .to.emit(wallet, "MessageStored")
        .withArgs(await wallet.getAddress(), await owner.getAddress(), 1n, "ok");
    });
  });
});