// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {deployProxy} from "../src/libraries/ProxyDeploy.sol";
import {Test} from "forge-std/Test.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {Basket} from "../src/Basket.sol";
import {BasketFactory} from "../src/BasketFactory.sol";
import {FeeRouter} from "../src/FeeRouter.sol";
import {Grants} from "../src/Grants.sol";
import {InsuranceFund} from "../src/InsuranceFund.sol";
import {NTIRegistry} from "../src/NTIRegistry.sol";
import {Staking} from "../src/Staking.sol";
import {ISwapRouter02Minimal} from "../src/interfaces/IUniswapV3Minimal.sol";

contract BasketMockERC20 is ERC20 {
    constructor(string memory name_, string memory symbol_) ERC20(name_, symbol_) {
        _mint(msg.sender, 1_000_000_000e18);
    }
}

contract BasketMockWETH is ERC20 {
    constructor() ERC20("Wrapped Ether", "WETH") {}
    receive() external payable { deposit(); }
    function deposit() public payable { _mint(msg.sender, msg.value); }
    function withdraw(uint256 wad) external {
        _burn(msg.sender, wad);
        (bool ok,) = payable(msg.sender).call{value: wad}("");
        require(ok, "eth fail");
    }
}

contract BasketMockV3Pool {
    address public token0;
    address public token1;
    uint24 public fee;
    uint128 public liquidity;
    int24 public tick;
    uint16 public cardinality;

    constructor(address t0, address t1, uint24 fee_, uint128 liq_, int24 tick_, uint16 card_) {
        token0 = t0;
        token1 = t1;
        fee = fee_;
        liquidity = liq_;
        tick = tick_;
        cardinality = card_;
    }

    function slot0() external view returns (uint160, int24, uint16, uint16, uint16, uint8, bool) {
        return (79228162514264337593543950336, tick, 0, cardinality, cardinality, 0, true);
    }

    function observe(uint32[] calldata secondsAgos)
        external
        view
        returns (int56[] memory tickCumulatives, uint160[] memory secPerLiq)
    {
        tickCumulatives = new int56[](secondsAgos.length);
        secPerLiq = new uint160[](secondsAgos.length);
        int56 base = 1_000_000_000;
        for (uint256 i = 0; i < secondsAgos.length; i++) {
            tickCumulatives[i] = base - int56(tick) * int56(uint56(secondsAgos[i]));
        }
    }
}

contract BasketMockRouter {
    uint256 public rateBps = 10_000; // 1:1 rate (matching tick 0)
    function setRateBps(uint256 r) external { rateBps = r; }

    function exactInputSingle(ISwapRouter02Minimal.ExactInputSingleParams calldata p)
        external
        payable
        returns (uint256 amountOut)
    {
        IERC20(p.tokenIn).transferFrom(msg.sender, address(this), p.amountIn);
        amountOut = (p.amountIn * rateBps) / 10_000;
        require(amountOut >= p.amountOutMinimum, "router slippage");
        IERC20(p.tokenOut).transfer(p.recipient, amountOut);
    }
}

contract C5BasketTest is Test {
    address internal admin = makeAddr("admin");
    address internal keeper = makeAddr("keeper");
    address internal pauser = makeAddr("pauser");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");

    BasketMockWETH internal weth;
    NTIRegistry internal registry;
    FeeRouter internal feeRouter;
    BasketMockRouter internal router;
    BasketFactory internal factory;
    Basket internal basket;

    BasketMockERC20 internal tokA;
    BasketMockERC20 internal tokB;
    BasketMockERC20 internal tokC;
    BasketMockERC20 internal tokD;
    BasketMockV3Pool internal poolA;
    BasketMockV3Pool internal poolB;
    BasketMockV3Pool internal poolC;
    BasketMockV3Pool internal poolD;

    function _makePool(address token, uint128 liq, uint16 card) internal returns (BasketMockV3Pool) {
        (address t0, address t1) = address(weth) < token
            ? (address(weth), token)
            : (token, address(weth));
        return new BasketMockV3Pool(t0, t1, 3000, liq, 0, card);
    }

    function setUp() public {
        vm.startPrank(admin);
        weth = new BasketMockWETH();
        registry = NTIRegistry(payable(deployProxy(address(new NTIRegistry()), abi.encodeCall(NTIRegistry.initialize, (admin, address(weth))))));
        Staking staking = Staking(payable(deployProxy(address(new Staking()), abi.encodeCall(Staking.initialize, (address(registry), admin, pauser)))));
        InsuranceFund ins = InsuranceFund(payable(deployProxy(address(new InsuranceFund()), abi.encodeCall(InsuranceFund.initialize, (admin)))));
        Grants grants = Grants(payable(deployProxy(address(new Grants()), abi.encodeCall(Grants.initialize, (address(staking), admin, keeper, pauser)))));
        feeRouter = FeeRouter(payable(deployProxy(address(new FeeRouter()), abi.encodeCall(FeeRouter.initialize, (address(registry), address(staking), address(grants), address(ins), admin, keeper, pauser)))));

        router = new BasketMockRouter();
        factory = BasketFactory(payable(deployProxy(address(new BasketFactory()), abi.encodeCall(BasketFactory.initialize, (address(registry), address(router), address(feeRouter), admin, address(new Basket()))))));
        basket = Basket(payable(factory.createBasket(1, "AI Agents Basket", "bAI", admin, keeper, pauser)));

        tokA = new BasketMockERC20("Token A", "TOKA");
        tokB = new BasketMockERC20("Token B", "TOKB");
        tokC = new BasketMockERC20("Token C", "TOKC");
        tokD = new BasketMockERC20("Token D", "TOKD");

        poolA = _makePool(address(tokA), 50 ether, 10);
        poolB = _makePool(address(tokB), 50 ether, 10);
        poolC = _makePool(address(tokC), 50 ether, 10);
        poolD = _makePool(address(tokD), 50 ether, 10);

        tokA.transfer(address(router), 1_000_000e18);
        tokB.transfer(address(router), 1_000_000e18);
        tokC.transfer(address(router), 1_000_000e18);
        tokD.transfer(address(router), 1_000_000e18);

        vm.deal(admin, 100 ether);
        weth.deposit{value: 50 ether}();
        weth.transfer(address(router), 50 ether);

        basket.whitelistToken(address(tokA), address(poolA), 3000);
        basket.whitelistToken(address(tokB), address(poolB), 3000);
        basket.whitelistToken(address(tokC), address(poolC), 3000);

        address[] memory toks = new address[](3);
        toks[0] = address(tokA);
        toks[1] = address(tokB);
        toks[2] = address(tokC);
        uint16[] memory weights = new uint16[](3);
        weights[0] = 4000;
        weights[1] = 3000;
        weights[2] = 3000;
        basket.setInitialAllocation(toks, weights);
        vm.stopPrank();

        vm.deal(alice, 50 ether);
        vm.deal(bob, 50 ether);
    }

    function test_FactoryUniquePerNarrativeAndWhitelistChecks() public {
        assertEq(factory.basketOf(1), address(basket));
        assertEq(factory.basketCount(), 1);

        vm.startPrank(admin);
        vm.expectRevert(abi.encodeWithSelector(BasketFactory.BasketAlreadyExists.selector, 1));
        factory.createBasket(1, "Dup", "DUP", admin, keeper, pauser);

        // Low liquidity pool rejected
        BasketMockV3Pool lowLiqPool = _makePool(address(tokD), 10 ether, 10);
        vm.expectRevert();
        basket.whitelistToken(address(tokD), address(lowLiqPool), 3000);

        // Low cardinality pool rejected
        BasketMockV3Pool lowCardPool = _makePool(address(tokD), 50 ether, 1);
        vm.expectRevert();
        basket.whitelistToken(address(tokD), address(lowCardPool), 3000);
        vm.stopPrank();
    }

    function test_DepositRedeemPauseAndInflationDefense() public {
        // First depositor inflation attack attempt
        vm.prank(alice);
        basket.deposit{value: 1000}(0);

        vm.startPrank(alice);
        weth.deposit{value: 1 ether}();
        weth.transfer(address(basket), 1 ether);
        vm.stopPrank();

        // Virtual offset protects Bob from share inflation rounding attack
        vm.prank(bob);
        uint256 bobShares = basket.deposit{value: 1 ether}(0);
        assertGt(bobShares, 0);

        // Pause blocks deposit, NEVER blocks redeem
        vm.prank(pauser);
        basket.pause();

        vm.prank(bob);
        vm.expectRevert();
        basket.deposit{value: 1 ether}(0);

        uint256 bobEthBefore = bob.balance;
        vm.prank(bob);
        uint256 ethOut = basket.redeem(bobShares, 0.99 ether);
        assertGe(ethOut, 0.99 ether);
        assertEq(bob.balance - bobEthBefore, ethOut);
    }

    function test_MaxTVLAndManagementFeeAccrualToFeeRouter() public {
        vm.prank(alice);
        basket.deposit{value: 5 ether}(0);

        // Exceeding maxTVL (10 ETH) reverts
        vm.prank(bob);
        vm.expectRevert();
        basket.deposit{value: 5.1 ether}(0);

        // Advance 1 year -> 0.5% management fee minted to FeeRouter
        vm.warp(vm.getBlockTimestamp() + 365 days);
        basket.accrueFee();

        uint256 feeShares = basket.balanceOf(address(feeRouter));
        assertApproxEqRel(feeShares, (5 ether * 50) / 10_000, 1e14);

        // FeeRouter keeper redeems fee shares into ETH
        uint256 frBefore = address(feeRouter).balance;
        vm.prank(keeper);
        uint256 redeemedEth = feeRouter.redeemBasketFees(address(basket), feeShares, 0);
        assertGt(redeemedEth, 0.024 ether);
        assertEq(address(feeRouter).balance - frBefore, redeemedEth);
    }

    function test_RebalanceWeightCapTurnoverLimitAndCooldown() public {
        vm.prank(alice);
        basket.deposit{value: 5 ether}(0); // NAV = 5 ETH -> 20% daily turnover cap = 1 ETH

        address[] memory toks = new address[](3);
        toks[0] = address(tokA);
        toks[1] = address(tokB);
        toks[2] = address(tokC);

        // Weight > 40% (4000 bps) rejected
        uint16[] memory badWeights = new uint16[](3);
        badWeights[0] = 5000;
        badWeights[1] = 2500;
        badWeights[2] = 2500;

        Basket.SwapParam[] memory noSwaps = new Basket.SwapParam[](0);
        vm.prank(keeper);
        vm.expectRevert();
        basket.rebalance(toks, badWeights, noSwaps);

        // Turnover > 20% NAV (1.1 ETH > 1 ETH) rejected
        uint16[] memory goodWeights = new uint16[](3);
        goodWeights[0] = 3500;
        goodWeights[1] = 3500;
        goodWeights[2] = 3000;

        Basket.SwapParam[] memory tooBigSwap = new Basket.SwapParam[](1);
        tooBigSwap[0] = Basket.SwapParam({
            tokenIn: address(tokA),
            tokenOut: address(weth),
            amountIn: 1.1 ether,
            minAmountOut: 1.05 ether
        });
        vm.prank(keeper);
        vm.expectRevert();
        basket.rebalance(toks, goodWeights, tooBigSwap);

        // Valid rebalance within 20% turnover succeeds
        Basket.SwapParam[] memory validSwaps = new Basket.SwapParam[](2);
        validSwaps[0] = Basket.SwapParam(address(tokA), address(weth), 0.5 ether, 0.49 ether);
        validSwaps[1] = Basket.SwapParam(address(weth), address(tokB), 0.5 ether, 0.49 ether);

        vm.prank(keeper);
        basket.rebalance(toks, goodWeights, validSwaps);

        // Second rebalance within 24h cooldown reverts
        vm.prank(keeper);
        vm.expectRevert();
        basket.rebalance(toks, goodWeights, noSwaps);

        vm.warp(vm.getBlockTimestamp() + 1 days);
        vm.prank(keeper);
        basket.rebalance(toks, goodWeights, noSwaps);
    }
}
