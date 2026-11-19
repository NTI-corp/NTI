// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {BuybackAdapterV3} from "../src/BuybackAdapterV3.sol";
import {BuybackAdapterV4} from "../src/BuybackAdapterV4.sol";
import {FeeRouter} from "../src/FeeRouter.sol";
import {Grants} from "../src/Grants.sol";
import {InsuranceFund} from "../src/InsuranceFund.sol";
import {NTIRegistry} from "../src/NTIRegistry.sol";
import {NTITestToken} from "../src/NTITestToken.sol";
import {Staking} from "../src/Staking.sol";
import {ISwapRouter02Minimal} from "../src/interfaces/IUniswapV3Minimal.sol";

contract MockWETH is ERC20 {
    constructor() ERC20("Wrapped Ether", "WETH") {}
    receive() external payable { deposit(); }
    function deposit() public payable { _mint(msg.sender, msg.value); }
    function withdraw(uint256 wad) external {
        _burn(msg.sender, wad);
        (bool ok,) = payable(msg.sender).call{value: wad}("");
        require(ok, "eth fail");
    }
}

contract MockV3Pool {
    address public token0;
    address public token1;
    uint24 public fee;
    uint128 public liquidity;
    int24 public currentTick;
    uint16 public obsCardinality;

    constructor(address t0, address t1, uint24 fee_, uint128 liq_, int24 tick_, uint16 card_) {
        token0 = t0;
        token1 = t1;
        fee = fee_;
        liquidity = liq_;
        currentTick = tick_;
        obsCardinality = card_;
    }

    function setTick(int24 t) external { currentTick = t; }

    function slot0()
        external
        view
        returns (uint160, int24, uint16, uint16, uint16, uint8, bool)
    {
        return (79228162514264337593543950336, currentTick, 0, obsCardinality, obsCardinality, 0, true);
    }

    function observe(uint32[] calldata secondsAgos)
        external
        view
        returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s)
    {
        tickCumulatives = new int56[](secondsAgos.length);
        secondsPerLiquidityCumulativeX128s = new uint160[](secondsAgos.length);
        // tickCumulatives[1] - tickCumulatives[0] == currentTick * (secondsAgos[0] - secondsAgos[1])
        int56 base = 1_000_000_000;
        for (uint256 i = 0; i < secondsAgos.length; i++) {
            tickCumulatives[i] = base - int56(currentTick) * int56(uint56(secondsAgos[i]));
        }
    }
}

contract MockV3Factory {
    mapping(bytes32 => address) public pools;
    function setPool(address a, address b, uint24 fee, address pool) external {
        pools[keccak256(abi.encodePacked(a, b, fee))] = pool;
        pools[keccak256(abi.encodePacked(b, a, fee))] = pool;
    }
    function getPool(address a, address b, uint24 fee) external view returns (address) {
        return pools[keccak256(abi.encodePacked(a, b, fee))];
    }
}

contract MockSwapRouter02 {
    uint256 public rateBps = 10_000; // 100% of 1:1 rate (tick 0)

    function setRateBps(uint256 r) external { rateBps = r; }

    function exactInputSingle(ISwapRouter02Minimal.ExactInputSingleParams calldata p)
        external
        payable
        returns (uint256 amountOut)
    {
        IERC20(p.tokenIn).transferFrom(msg.sender, address(this), p.amountIn);
        amountOut = (p.amountIn * rateBps) / 10_000;
        require(amountOut >= p.amountOutMinimum, "slippage");
        IERC20(p.tokenOut).transfer(p.recipient, amountOut);
    }
}

contract MockPermit2 {
    mapping(address => mapping(address => mapping(address => uint160))) public allowance;
    function approve(address token, address spender, uint160 amount, uint48) external {
        allowance[msg.sender][token][spender] = amount;
    }
}

contract MockStateView {
    mapping(bytes32 => uint160) public prices;
    function setPrice(bytes32 poolId, uint160 sqrtPriceX96) external { prices[poolId] = sqrtPriceX96; }
    function getSlot0(bytes32 poolId) external view returns (uint160, int24, uint24, uint24) {
        return (prices[poolId], 0, 0, 0);
    }
}

contract MockUniversalRouter211 {
    uint256 public rateBps = 10_000;
    function setRateBps(uint256 r) external { rateBps = r; }

    function execute(bytes calldata commands, bytes[] calldata inputs, uint256 deadline) external payable {
        require(block.timestamp <= deadline, "expired");
        require(commands.length == 1 && commands[0] == 0x10, "bad cmd");
        (, bytes[] memory params) = abi.decode(inputs[0], (bytes, bytes[]));
        (address currencyIn, uint256 amountIn) = abi.decode(params[1], (address, uint256));
        (address tokenOut, uint256 minOut) = abi.decode(params[2], (address, uint256));

        if (currencyIn == address(0)) {
            require(msg.value == amountIn, "eth mismatch");
        } else {
            IERC20(currencyIn).transferFrom(msg.sender, address(this), amountIn);
        }
        uint256 out = (amountIn * rateBps) / 10_000;
        require(out >= minOut, "v4 slippage");
        IERC20(tokenOut).transfer(msg.sender, out);
    }
}

contract C3FeeBuybackTest is Test {
    address internal admin = makeAddr("admin");
    address internal keeper = makeAddr("keeper");
    address internal pauser = makeAddr("pauser");
    address internal staker = makeAddr("staker");
    address internal ponsHook = makeAddr("ponsHook");

    MockWETH internal weth;
    NTIRegistry internal registry;
    NTITestToken internal nti;
    Staking internal staking;
    InsuranceFund internal insurance;
    Grants internal grants;
    FeeRouter internal feeRouter;

    MockV3Factory internal v3Factory;
    MockV3Pool internal v3Pool;
    MockSwapRouter02 internal v3Router;
    BuybackAdapterV3 internal adapterV3;

    MockPermit2 internal permit2;
    MockStateView internal stateView;
    MockUniversalRouter211 internal uRouter;
    BuybackAdapterV4 internal adapterV4;

    function setUp() public {
        vm.startPrank(admin);
        weth = new MockWETH();
        registry = new NTIRegistry(admin, address(weth));
        nti = new NTITestToken(admin);
        staking = new Staking(address(registry), admin, pauser);
        insurance = new InsuranceFund(admin);
        grants = new Grants(address(staking), admin, keeper, pauser);
        feeRouter = new FeeRouter(
            address(registry),
            address(staking),
            address(grants),
            address(insurance),
            admin,
            keeper,
            pauser
        );

        registry.setStaking(address(staking));
        registry.setNti(address(nti));

        // V3 setup (tick 0 => 1:1 price)
        v3Factory = new MockV3Factory();
        (address t0, address t1) = address(weth) < address(nti)
            ? (address(weth), address(nti))
            : (address(nti), address(weth));
        v3Pool = new MockV3Pool(t0, t1, 3000, 50 ether, 0, 10);
        v3Factory.setPool(address(weth), address(nti), 3000, address(v3Pool));
        v3Router = new MockSwapRouter02();
        adapterV3 = new BuybackAdapterV3(address(weth), address(v3Router), address(v3Factory), 3000);
        nti.transfer(address(v3Router), 10_000_000e18);

        // V4 setup
        permit2 = new MockPermit2();
        stateView = new MockStateView();
        uRouter = new MockUniversalRouter211();
        adapterV4 = new BuybackAdapterV4(
            address(weth), address(uRouter), address(permit2), address(stateView), ponsHook
        );
        nti.transfer(address(uRouter), 10_000_000e18);

        nti.transfer(staker, 1_000_000e18);
        vm.stopPrank();
    }

    function test_InsuranceFundAdminOnlyWithdraw() public {
        vm.deal(address(this), 2 ether);
        (bool ok,) = payable(address(insurance)).call{value: 2 ether}("");
        assertTrue(ok);
        assertEq(address(insurance).balance, 2 ether);

        vm.prank(keeper);
        vm.expectRevert();
        insurance.withdraw(payable(keeper), 1 ether);

        address payable recipient = payable(makeAddr("recipient"));
        vm.prank(admin);
        insurance.withdraw(recipient, 1.5 ether);
        assertEq(recipient.balance, 1.5 ether);
        assertEq(address(insurance).balance, 0.5 ether);
    }

    function test_FeeRouterSplitAndZeroStakerBufferFlush() public {
        // Send 10 ETH while totalActiveStaked == 0
        vm.deal(address(this), 10 ether);
        (bool ok,) = payable(address(feeRouter)).call{value: 10 ether}("");
        assertTrue(ok);

        feeRouter.distribute();

        assertEq(feeRouter.buybackPool(), 4 ether);
        assertEq(feeRouter.pendingStakingETH(), 3 ether);
        assertEq(address(grants).balance, 2 ether);
        assertEq(address(insurance).balance, 1 ether);
        assertEq(address(staking).balance, 0);

        // Staker stakes -> next distribute() flushes pendingStakingETH even with 0 new ETH!
        vm.startPrank(staker);
        nti.approve(address(staking), 100_000e18);
        staking.stake(100_000e18);
        vm.stopPrank();

        feeRouter.distribute();
        assertEq(feeRouter.pendingStakingETH(), 0);
        assertEq(address(staking).balance, 3 ether);
        assertEq(staking.pendingReward(staker), 3 ether);
    }

    function test_BuybackV3GuardsCooldownMaxPerCallAndTwapSlippage() public {
        vm.deal(address(this), 2 ether);
        (bool ok,) = payable(address(feeRouter)).call{value: 2 ether}("");
        assertTrue(ok);
        feeRouter.distribute(); // buybackPool = 0.8 ETH

        // Blocked until buybackAdapter set
        vm.prank(keeper);
        vm.expectRevert(FeeRouter.BuybackNotReady.selector);
        feeRouter.executeBuyback(0.1 ether, 0.09 ether, block.timestamp + 100, "");

        vm.prank(admin);
        registry.setBuybackAdapter(address(adapterV3));

        // Exceeds maxPerCall (0.2 ETH)
        vm.prank(keeper);
        vm.expectRevert();
        feeRouter.executeBuyback(0.25 ether, 0.2 ether, block.timestamp + 100, "");

        // Excessive slippage (> 3% below TWAP) reverts in adapter
        v3Router.setRateBps(9600); // 4% slippage
        vm.prank(keeper);
        vm.expectRevert();
        feeRouter.executeBuyback(0.2 ether, 0.1 ether, block.timestamp + 100, "");

        // Within 3% slippage (2% slip) succeeds and burns to 0xdead
        v3Router.setRateBps(9800);
        uint256 burnBefore = nti.balanceOf(registry.burnAddress());
        vm.prank(keeper);
        uint256 burned = feeRouter.executeBuyback(0.2 ether, 0.19 ether, block.timestamp + 100, "");
        assertEq(burned, 0.196 ether);
        assertEq(nti.balanceOf(registry.burnAddress()) - burnBefore, 0.196 ether);
        assertEq(feeRouter.buybackPool(), 0.6 ether);

        // Cooldown blocks immediate second call
        vm.prank(keeper);
        vm.expectRevert();
        feeRouter.executeBuyback(0.1 ether, 0.09 ether, block.timestamp + 100, "");

        // Succeeds after 5 minutes
        uint256 tNext = vm.getBlockTimestamp() + 5 minutes;
        vm.warp(tNext);
        vm.prank(keeper);
        feeRouter.executeBuyback(0.1 ether, 0.09 ether, tNext + 100, "");
        assertEq(feeRouter.buybackPool(), 0.5 ether);
    }

    function test_BuybackV4NativePoolAndSlippageAndHookValidation() public {
        vm.deal(address(this), 2 ether);
        (bool ok,) = payable(address(feeRouter)).call{value: 2 ether}("");
        assertTrue(ok);
        feeRouter.distribute(); // buybackPool = 0.8 ETH

        vm.prank(admin);
        registry.setBuybackAdapter(address(adapterV4));

        // Native ETH (address(0)) / NTI Pons V2 pool
        BuybackAdapterV4.PoolKey[] memory keys = new BuybackAdapterV4.PoolKey[](1);
        keys[0] = BuybackAdapterV4.PoolKey({
            currency0: address(0),
            currency1: address(nti),
            fee: 10000,
            tickSpacing: 200,
            hooks: ponsHook
        });
        bytes32 poolId = keccak256(abi.encode(keys[0]));
        stateView.setPrice(poolId, 79228162514264337593543950336); // sqrtPriceX96 = 1.0

        bytes memory route = abi.encode(keys);

        // Wrong hook rejected
        BuybackAdapterV4.PoolKey[] memory badKeys = new BuybackAdapterV4.PoolKey[](1);
        badKeys[0] = keys[0];
        badKeys[0].hooks = makeAddr("wrongHook");
        vm.prank(keeper);
        vm.expectRevert(BuybackAdapterV4.InvalidRoute.selector);
        feeRouter.executeBuyback(0.2 ether, 0.19 ether, block.timestamp + 100, abi.encode(badKeys));

        // > 3% spot slippage rejected
        uRouter.setRateBps(9600);
        vm.prank(keeper);
        vm.expectRevert();
        feeRouter.executeBuyback(0.2 ether, 0.1 ether, block.timestamp + 100, route);

        // Valid swap executes and burns NTI
        uRouter.setRateBps(9900);
        uint256 burnBefore = nti.balanceOf(registry.burnAddress());
        vm.prank(keeper);
        uint256 burned = feeRouter.executeBuyback(0.2 ether, 0.19 ether, block.timestamp + 100, route);
        assertEq(burned, 0.198 ether);
        assertEq(nti.balanceOf(registry.burnAddress()) - burnBefore, 0.198 ether);
    }

    function test_FeeRouterPauseBlocksBuybackNotDistribute() public {
        vm.prank(admin);
        registry.setBuybackAdapter(address(adapterV3));

        vm.prank(pauser);
        feeRouter.pause();

        vm.deal(address(this), 1 ether);
        (bool ok,) = payable(address(feeRouter)).call{value: 1 ether}("");
        assertTrue(ok);

        // distribute MUST work while paused
        feeRouter.distribute();
        assertEq(feeRouter.buybackPool(), 0.4 ether);

        // executeBuyback MUST revert while paused
        vm.prank(keeper);
        vm.expectRevert();
        feeRouter.executeBuyback(0.1 ether, 0.09 ether, block.timestamp + 100, "");
    }
}
