// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

import {INTIRegistry} from "./interfaces/INTIRegistry.sol";
import {ISwapRouter02Minimal, IUniswapV3PoolMinimal} from "./interfaces/IUniswapV3Minimal.sol";
import {IWETH} from "./interfaces/IWETH.sol";
import {UniswapV3TwapLib} from "./libraries/UniswapV3TwapLib.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @title Basket
/// @notice ERC-20 narrative token vault backed by governance-whitelisted Uniswap V3 tokens.
///         Uses 30-min V3 TWAP NAV pricing, virtual-offset share minting (anti-inflation),
///         40% max weight, 20% max daily NAV turnover, 3% max slippage, and 0.5%/yr mgmt fee.
///         Pause only halts deposit() and rebalance(); redeem() ALWAYS stays open.
contract Basket is Initializable, ERC20Upgradeable, AccessControlUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable, UUPSUpgradeable {
    using SafeERC20 for IERC20;

    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint32 public constant TWAP_WINDOW = 1800; // 30 minutes
    uint16 public constant MAX_WEIGHT_BPS = 4000; // 40%
    uint16 public constant MAX_DAILY_TURNOVER_BPS = 2000; // 20%
    uint16 public constant MAX_SLIPPAGE_BPS = 300; // 3%
    uint16 public constant MGMT_FEE_BPS = 50; // 0.5% / yr
    uint64 public constant REBALANCE_COOLDOWN = 1 days;
    uint256 public constant VIRTUAL_SHARES = 1e6;
    uint256 public constant VIRTUAL_ASSETS = 1e6;

    struct TokenConfig {
        bool whitelisted;
        address pool;
        uint24 fee;
    }

    struct SwapParam {
        address tokenIn;
        address tokenOut;
        uint256 amountIn;
        uint256 minAmountOut;
    }

    uint8 public narrativeId;
    INTIRegistry public registry;
    ISwapRouter02Minimal public swapRouter02;
    address public feeRouter;

    uint256 public maxTVL;
    uint128 public minPoolLiquidity;
    uint64 public lastFeeAccrual;
    uint64 public lastRebalanceAt;

    mapping(address => TokenConfig) public tokenConfigs;
    address[] private _constituentTokens;
    uint16[] private _targetWeightsBps;

    error ZeroAddress();
    error ZeroAmount();
    error InvalidPool();
    error InsufficientPoolLiquidity(uint128 actual, uint128 required);
    error InsufficientObservationCardinality(uint16 actual);
    error AllocationNotConfigured();
    error InvalidWeights();
    error DuplicateToken(address token);
    error TokenNotWhitelisted(address token);
    error WeightExceedsCap(address token, uint16 weightBps);
    error MaxTVLExceeded(uint256 projectedNav, uint256 cap);
    error SlippageExceeded(uint256 actual, uint256 minimum);
    error InsufficientShares();
    error RebalanceCooldownActive(uint64 nextAvailableAt);
    error InvalidSwapPair(address tokenIn, address tokenOut);
    error TurnoverLimitExceeded(uint256 turnover, uint256 maxAllowed);
    error NonZeroRemovedTokenBalance(address token, uint256 balance);
    error EthTransferFailed();

    event TokenWhitelisted(address indexed token, address indexed pool, uint24 fee);
    event TokenDelisted(address indexed token);
    event AllocationSet(address[] tokens, uint16[] weightsBps);
    event Deposited(address indexed account, uint256 ethIn, uint256 addedNav, uint256 sharesMinted);
    event Redeemed(address indexed account, uint256 sharesBurned, uint256 ethOut);
    event Rebalanced(address[] tokens, uint16[] weightsBps, uint256 navBefore, uint256 navAfter);
    event ManagementFeeAccrued(uint256 feeShares);
    event RiskLimitsUpdated(uint256 maxTVL, uint128 minPoolLiquidity);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        uint8 narrativeId_,
        string memory name_,
        string memory symbol_,
        address registry_,
        address swapRouter02_,
        address feeRouter_,
        address admin_,
        address keeper_,
        address pauser_
    ) external initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();
        __UUPSUpgradeable_init();
        __ERC20_init(name_, symbol_);
        maxTVL = 10 ether;
        minPoolLiquidity = 20 ether;
        if (
            registry_ == address(0) || swapRouter02_ == address(0) || feeRouter_ == address(0)
                || admin_ == address(0) || keeper_ == address(0) || pauser_ == address(0)
        ) revert ZeroAddress();

        narrativeId = narrativeId_;
        registry = INTIRegistry(registry_);
        swapRouter02 = ISwapRouter02Minimal(swapRouter02_);
        feeRouter = feeRouter_;
        lastFeeAccrual = uint64(block.timestamp);

        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(KEEPER_ROLE, keeper_);
        _grantRole(PAUSER_ROLE, pauser_);
    }

    receive() external payable {}

    // --- Pause Controls (only gates deposit & rebalance; redeem ALWAYS stays open) ---

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    // --- Governance Configuration ---

    function setRiskLimits(uint256 maxTVL_, uint128 minPoolLiquidity_)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        if (maxTVL_ == 0) revert ZeroAmount();
        maxTVL = maxTVL_;
        minPoolLiquidity = minPoolLiquidity_;
        emit RiskLimitsUpdated(maxTVL_, minPoolLiquidity_);
    }

    /// @notice Whitelists a token paired with WETH on Uniswap V3 after verifying liquidity and 30m TWAP.
    function whitelistToken(address token, address pool, uint24 fee)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        address wethAddr = registry.weth();
        if (token == address(0) || token == wethAddr || pool == address(0)) revert ZeroAddress();

        IUniswapV3PoolMinimal v3Pool = IUniswapV3PoolMinimal(pool);
        address t0 = v3Pool.token0();
        address t1 = v3Pool.token1();
        bool matchesPair = (t0 == token && t1 == wethAddr) || (t0 == wethAddr && t1 == token);
        if (!matchesPair) revert InvalidPool();

        uint128 liq = v3Pool.liquidity();
        if (liq < minPoolLiquidity) revert InsufficientPoolLiquidity(liq, minPoolLiquidity);

        (,,, uint16 cardinality,,,) = v3Pool.slot0();
        if (cardinality < 2) revert InsufficientObservationCardinality(cardinality);

        // Confirm 30-minute TWAP observation succeeds on-chain.
        UniswapV3TwapLib.getTwapTick(pool, TWAP_WINDOW);

        tokenConfigs[token] = TokenConfig({whitelisted: true, pool: pool, fee: fee});
        emit TokenWhitelisted(token, pool, fee);
    }

    function delistToken(address token) external onlyRole(DEFAULT_ADMIN_ROLE) {
        tokenConfigs[token].whitelisted = false;
        emit TokenDelisted(token);
    }

    /// @notice Sets target weights (used for initial configuration before deposits).
    function setInitialAllocation(address[] calldata tokens, uint16[] calldata weightsBps)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        _validateWeights(tokens, weightsBps);
        _ensureNoOrphanedBalances(tokens);
        _constituentTokens = tokens;
        _targetWeightsBps = weightsBps;
        emit AllocationSet(tokens, weightsBps);
    }

    // --- Views ---

    function constituents()
        external
        view
        returns (address[] memory tokens, uint16[] memory weightsBps)
    {
        return (_constituentTokens, _targetWeightsBps);
    }

    /// @notice Computes total basket NAV denominated in WETH using 30-minute V3 TWAPs.
    function totalNavWeth() public view returns (uint256 nav) {
        address wethAddr = registry.weth();
        nav = IERC20(wethAddr).balanceOf(address(this)) + address(this).balance;

        uint256 len = _constituentTokens.length;
        for (uint256 i = 0; i < len; i++) {
            address token = _constituentTokens[i];
            uint256 bal = IERC20(token).balanceOf(address(this));
            if (bal > 0) {
                TokenConfig storage cfg = tokenConfigs[token];
                int24 twapTick = UniswapV3TwapLib.getTwapTick(cfg.pool, TWAP_WINDOW);
                nav += UniswapV3TwapLib.getQuoteAtTick(twapTick, bal, token, wethAddr);
            }
        }
    }

    function accrueFee() external {
        _accrueManagementFee();
    }

    // --- User Entry & Exit ---

    function deposit(uint256 minSharesOut)
        external
        payable
        whenNotPaused
        nonReentrant
        returns (uint256 shares)
    {
        if (msg.value == 0) revert ZeroAmount();
        uint256 len = _constituentTokens.length;
        if (len == 0) revert AllocationNotConfigured();

        _accrueManagementFee();

        // address(this).balance already includes msg.value during a payable call.
        uint256 navBefore = totalNavWeth() - msg.value;
        if (navBefore + msg.value > maxTVL) revert MaxTVLExceeded(navBefore + msg.value, maxTVL);

        address wethAddr = registry.weth();
        IWETH(wethAddr).deposit{value: msg.value}();

        uint256 remainingWeth = msg.value;
        for (uint256 i = 0; i < len; i++) {
            uint256 legWeth =
                i == len - 1 ? remainingWeth : Math.mulDiv(msg.value, _targetWeightsBps[i], 10_000);
            if (legWeth == 0) continue;
            remainingWeth -= legWeth;
            _swapExactInWithTwapGuard(wethAddr, _constituentTokens[i], legWeth, 0);
        }

        uint256 navAfter = totalNavWeth();
        uint256 addedNav = navAfter > navBefore ? navAfter - navBefore : 0;
        if (addedNav == 0) revert ZeroAmount();

        // Virtual offset defends against first-depositor share-inflation attacks.
        shares = Math.mulDiv(addedNav, totalSupply() + VIRTUAL_SHARES, navBefore + VIRTUAL_ASSETS);
        if (shares == 0 || shares < minSharesOut) revert SlippageExceeded(shares, minSharesOut);

        _mint(msg.sender, shares);
        emit Deposited(msg.sender, msg.value, addedNav, shares);
    }

    /// @notice Burns `shares`, sells proportional underlying balances to WETH/ETH, and sends ETH to caller.
    ///         NEVER gated by pause.
    function redeem(uint256 shares, uint256 minEthOut) external nonReentrant returns (uint256 ethOut) {
        if (shares == 0) revert ZeroAmount();
        if (balanceOf(msg.sender) < shares) revert InsufficientShares();

        _accrueManagementFee();

        uint256 supply = totalSupply();
        _burn(msg.sender, shares);

        address wethAddr = registry.weth();
        uint256 idleWeth = IERC20(wethAddr).balanceOf(address(this));
        uint256 wethOut = Math.mulDiv(idleWeth, shares, supply);

        uint256 len = _constituentTokens.length;
        for (uint256 i = 0; i < len; i++) {
            address token = _constituentTokens[i];
            uint256 tokBal = IERC20(token).balanceOf(address(this));
            uint256 sellAmt = Math.mulDiv(tokBal, shares, supply);
            if (sellAmt > 0) {
                wethOut += _swapExactInWithTwapGuard(token, wethAddr, sellAmt, 0);
            }
        }

        if (wethOut < minEthOut) revert SlippageExceeded(wethOut, minEthOut);

        if (wethOut > 0) {
            IWETH(wethAddr).withdraw(wethOut);
            (bool ok,) = payable(msg.sender).call{value: wethOut}("");
            if (!ok) revert EthTransferFailed();
        }

        ethOut = wethOut;
        emit Redeemed(msg.sender, shares, ethOut);
    }

    // --- Keeper Rebalance ---

    function rebalance(
        address[] calldata tokens,
        uint16[] calldata weightsBps,
        SwapParam[] calldata swaps
    ) external onlyRole(KEEPER_ROLE) whenNotPaused nonReentrant {
        if (
            lastRebalanceAt != 0
                && block.timestamp < uint256(lastRebalanceAt) + REBALANCE_COOLDOWN
        ) {
            revert RebalanceCooldownActive(lastRebalanceAt + REBALANCE_COOLDOWN);
        }

        _validateWeights(tokens, weightsBps);
        _accrueManagementFee();

        uint256 navBefore = totalNavWeth();
        uint256 maxTurnover = Math.mulDiv(navBefore, MAX_DAILY_TURNOVER_BPS, 10_000);
        address wethAddr = registry.weth();

        uint256 sellTurnoverWeth = 0;
        uint256 buyTurnoverWeth = 0;

        for (uint256 i = 0; i < swaps.length; i++) {
            SwapParam calldata s = swaps[i];
            if (s.amountIn == 0) revert ZeroAmount();

            if (s.tokenIn == wethAddr) {
                if (!tokenConfigs[s.tokenOut].whitelisted) revert TokenNotWhitelisted(s.tokenOut);
                buyTurnoverWeth += s.amountIn;
                if (buyTurnoverWeth > maxTurnover) {
                    revert TurnoverLimitExceeded(buyTurnoverWeth, maxTurnover);
                }
                _swapExactInWithTwapGuard(wethAddr, s.tokenOut, s.amountIn, s.minAmountOut);
            } else if (s.tokenOut == wethAddr) {
                TokenConfig storage cfg = tokenConfigs[s.tokenIn];
                if (cfg.pool == address(0)) revert InvalidSwapPair(s.tokenIn, s.tokenOut);
                int24 twapTick = UniswapV3TwapLib.getTwapTick(cfg.pool, TWAP_WINDOW);
                uint256 estWeth =
                    UniswapV3TwapLib.getQuoteAtTick(twapTick, s.amountIn, s.tokenIn, wethAddr);
                sellTurnoverWeth += estWeth;
                if (sellTurnoverWeth > maxTurnover) {
                    revert TurnoverLimitExceeded(sellTurnoverWeth, maxTurnover);
                }
                _swapExactInWithTwapGuard(s.tokenIn, wethAddr, s.amountIn, s.minAmountOut);
            } else {
                revert InvalidSwapPair(s.tokenIn, s.tokenOut);
            }
        }

        _ensureNoOrphanedBalances(tokens);

        _constituentTokens = tokens;
        _targetWeightsBps = weightsBps;
        lastRebalanceAt = uint64(block.timestamp);

        emit Rebalanced(tokens, weightsBps, navBefore, totalNavWeth());
    }

    // --- Internal Helpers ---

    function _accrueManagementFee() internal {
        uint64 nowTs = uint64(block.timestamp);
        uint256 elapsed = nowTs - lastFeeAccrual;
        lastFeeAccrual = nowTs;
        if (elapsed == 0) return;

        uint256 supply = totalSupply();
        if (supply == 0) return;

        uint256 feeShares = Math.mulDiv(supply, uint256(MGMT_FEE_BPS) * elapsed, 10_000 * 365 days);
        if (feeShares > 0) {
            _mint(feeRouter, feeShares);
            emit ManagementFeeAccrued(feeShares);
        }
    }

    function _validateWeights(address[] calldata tokens, uint16[] calldata weightsBps) internal view {
        uint256 len = tokens.length;
        if (len == 0 || len != weightsBps.length) revert InvalidWeights();

        uint256 sumWeights = 0;
        for (uint256 i = 0; i < len; i++) {
            address t = tokens[i];
            if (!tokenConfigs[t].whitelisted) revert TokenNotWhitelisted(t);
            uint16 w = weightsBps[i];
            if (w == 0) revert InvalidWeights();
            if (w > MAX_WEIGHT_BPS) revert WeightExceedsCap(t, w);
            for (uint256 j = 0; j < i; j++) {
                if (tokens[j] == t) revert DuplicateToken(t);
            }
            sumWeights += w;
        }
        if (sumWeights != 10_000) revert InvalidWeights();
    }

    function _ensureNoOrphanedBalances(address[] calldata newTokens) internal view {
        uint256 oldLen = _constituentTokens.length;
        for (uint256 i = 0; i < oldLen; i++) {
            address oldTok = _constituentTokens[i];
            bool stillPresent = false;
            for (uint256 j = 0; j < newTokens.length; j++) {
                if (newTokens[j] == oldTok) {
                    stillPresent = true;
                    break;
                }
            }
            if (!stillPresent) {
                uint256 bal = IERC20(oldTok).balanceOf(address(this));
                if (bal > 0) revert NonZeroRemovedTokenBalance(oldTok, bal);
            }
        }
    }

    function _swapExactInWithTwapGuard(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 callerMinOut
    ) internal returns (uint256 amountOut) {
        address wethAddr = registry.weth();
        address nonWeth = tokenIn == wethAddr ? tokenOut : tokenIn;
        TokenConfig storage cfg = tokenConfigs[nonWeth];

        int24 twapTick = UniswapV3TwapLib.getTwapTick(cfg.pool, TWAP_WINDOW);
        uint256 twapQuote = UniswapV3TwapLib.getQuoteAtTick(twapTick, amountIn, tokenIn, tokenOut);
        uint256 twapFloor = Math.mulDiv(twapQuote, 10_000 - MAX_SLIPPAGE_BPS, 10_000);
        uint256 minOut = callerMinOut > twapFloor ? callerMinOut : twapFloor;

        uint256 outBefore = IERC20(tokenOut).balanceOf(address(this));
        IERC20(tokenIn).forceApprove(address(swapRouter02), amountIn);

        swapRouter02.exactInputSingle(
            ISwapRouter02Minimal.ExactInputSingleParams({
                tokenIn: tokenIn,
                tokenOut: tokenOut,
                fee: cfg.fee,
                recipient: address(this),
                amountIn: amountIn,
                amountOutMinimum: minOut,
                sqrtPriceLimitX96: 0
            })
        );

        IERC20(tokenIn).forceApprove(address(swapRouter02), 0);

        amountOut = IERC20(tokenOut).balanceOf(address(this)) - outBefore;
        if (amountOut < minOut) revert SlippageExceeded(amountOut, minOut);
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

    /// @dev Reserved storage so later versions can add variables without shifting the layout.
    uint256[50] private __gap;
}
