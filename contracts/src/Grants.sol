// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {AccessControlUpgradeable} from "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {PausableUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import {ReentrancyGuardUpgradeable} from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";

import {IStaking} from "./interfaces/IStaking.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

/// @title Grants
/// @notice Stake-weighted ETH grant rounds funded by 20% of protocol fees.
///         Tracks totalReservedUnclaimed so unclaimed past prizes are never double-counted.
///         Pause only gates round start, proposals, and voting; finalizeRound and claim ALWAYS work.
contract Grants is Initializable, AccessControlUpgradeable, ReentrancyGuardUpgradeable, PausableUpgradeable, UUPSUpgradeable {
    bytes32 public constant KEEPER_ROLE = keccak256("KEEPER_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");

    uint16 public constant QUORUM_BPS = 100; // 1% of snapshot total staked supply
    uint16 public constant MAX_PROPOSAL_SHARE_BPS = 4000; // 40% max of round budget
    uint256 public constant TOP_N = 5;

    struct Round {
        uint256 budget;
        uint64 snapshotBlock;
        uint64 startedAt;
        uint64 endsAt;
        uint256 totalVotes;
        uint256 proposalCount;
        bool finalized;
    }

    struct Proposal {
        address proposer;
        address recipient;
        bytes32 metadataHash;
        uint256 votes;
        uint256 allocation;
        bool claimed;
    }

    IStaking public staking;

    uint256 public minProposalStake;
    uint256 public totalReservedUnclaimed;
    uint256 public currentRoundId;

    mapping(uint256 => Round) public rounds;
    mapping(uint256 => mapping(uint256 => Proposal)) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;

    error ZeroAddress();
    error ZeroAmount();
    error InvalidDuration();
    error PreviousRoundActive();
    error NoAvailableBudget();
    error InvalidBlockNumber();
    error RoundNotActive();
    error RoundNotEnded(uint64 endsAt);
    error RoundAlreadyFinalized();
    error RoundNotFinalized();
    error InsufficientProposalStake(uint256 current, uint256 required);
    error InvalidMetadataHash();
    error AlreadyVoted();
    error InvalidVoteArrays();
    error InvalidProposalId(uint256 proposalId);
    error DuplicateProposalId(uint256 proposalId);
    error ExceedsVotingPower(uint256 totalWeight, uint256 votingPower);
    error NotRecipient();
    error NothingToClaim();
    error AlreadyClaimed();
    error EthTransferFailed();

    event GrantFundsReceived(address indexed sender, uint256 amount);
    event RoundStarted(uint256 indexed roundId, uint256 budget, uint64 snapshotBlock, uint64 endsAt);
    event ProposalSubmitted(
        uint256 indexed roundId,
        uint256 indexed proposalId,
        address indexed proposer,
        address recipient,
        bytes32 metadataHash
    );
    event Voted(uint256 indexed roundId, address indexed voter, uint256[] ids, uint256[] weights);
    event RoundFinalized(uint256 indexed roundId, uint256 totalAllocated, bool quorumMet);
    event GrantClaimed(
        uint256 indexed roundId,
        uint256 indexed proposalId,
        address indexed recipient,
        uint256 amount
    );
    event MinProposalStakeUpdated(uint256 newMinStake);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(address staking_, address admin_, address keeper_, address pauser_) external initializer {
        __AccessControl_init();
        __ReentrancyGuard_init();
        __Pausable_init();
        __UUPSUpgradeable_init();
        minProposalStake = 50_000e18;
        if (
            staking_ == address(0) || admin_ == address(0) || keeper_ == address(0)
                || pauser_ == address(0)
        ) revert ZeroAddress();

        staking = IStaking(staking_);
        _grantRole(DEFAULT_ADMIN_ROLE, admin_);
        _grantRole(KEEPER_ROLE, keeper_);
        _grantRole(PAUSER_ROLE, pauser_);
    }

    receive() external payable {
        emit GrantFundsReceived(msg.sender, msg.value);
    }

    // --- Pause Controls (never gates finalizeRound or claim) ---

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function setMinProposalStake(uint256 newMinStake) external onlyRole(DEFAULT_ADMIN_ROLE) {
        minProposalStake = newMinStake;
        emit MinProposalStakeUpdated(newMinStake);
    }

    // --- Round Lifecycle ---

    function startRound(uint64 voteDuration)
        external
        onlyRole(KEEPER_ROLE)
        whenNotPaused
        returns (uint256 roundId)
    {
        if (voteDuration == 0) revert InvalidDuration();
        if (block.number == 0) revert InvalidBlockNumber();
        if (currentRoundId > 0 && !rounds[currentRoundId].finalized) {
            revert PreviousRoundActive();
        }

        uint256 available = address(this).balance - totalReservedUnclaimed;
        if (available == 0) revert NoAvailableBudget();

        roundId = ++currentRoundId;
        uint64 snap = uint64(block.number - 1);
        uint64 endsAt = uint64(block.timestamp) + voteDuration;

        rounds[roundId] = Round({
            budget: available,
            snapshotBlock: snap,
            startedAt: uint64(block.timestamp),
            endsAt: endsAt,
            totalVotes: 0,
            proposalCount: 0,
            finalized: false
        });

        emit RoundStarted(roundId, available, snap, endsAt);
    }

    function submitProposal(bytes32 metadataHash, address recipient)
        external
        whenNotPaused
        returns (uint256 proposalId)
    {
        if (recipient == address(0)) revert ZeroAddress();
        if (metadataHash == bytes32(0)) revert InvalidMetadataHash();

        uint256 roundId = currentRoundId;
        if (roundId == 0) revert RoundNotActive();
        Round storage r = rounds[roundId];
        if (r.finalized || block.timestamp >= r.endsAt) revert RoundNotActive();

        uint256 st = staking.stakeOf(msg.sender);
        if (st < minProposalStake) revert InsufficientProposalStake(st, minProposalStake);

        proposalId = ++r.proposalCount;
        proposals[roundId][proposalId] = Proposal({
            proposer: msg.sender,
            recipient: recipient,
            metadataHash: metadataHash,
            votes: 0,
            allocation: 0,
            claimed: false
        });

        emit ProposalSubmitted(roundId, proposalId, msg.sender, recipient, metadataHash);
    }

    function vote(uint256 roundId, uint256[] calldata ids, uint256[] calldata weights)
        external
        whenNotPaused
    {
        if (roundId == 0 || roundId > currentRoundId) revert RoundNotActive();
        Round storage r = rounds[roundId];
        if (r.finalized || block.timestamp >= r.endsAt) revert RoundNotActive();
        if (hasVoted[roundId][msg.sender]) revert AlreadyVoted();
        if (ids.length == 0 || ids.length != weights.length) revert InvalidVoteArrays();

        uint256 votingPower = staking.getPastVotes(msg.sender, r.snapshotBlock);
        if (votingPower == 0) revert ExceedsVotingPower(1, 0);

        uint256 sumWeights = 0;
        for (uint256 i = 0; i < ids.length; i++) {
            uint256 pid = ids[i];
            uint256 w = weights[i];
            if (pid == 0 || pid > r.proposalCount) revert InvalidProposalId(pid);
            if (w == 0) revert ZeroAmount();
            for (uint256 j = 0; j < i; j++) {
                if (ids[j] == pid) revert DuplicateProposalId(pid);
            }
            sumWeights += w;
            proposals[roundId][pid].votes += w;
        }

        if (sumWeights > votingPower) revert ExceedsVotingPower(sumWeights, votingPower);

        hasVoted[roundId][msg.sender] = true;
        r.totalVotes += sumWeights;

        emit Voted(roundId, msg.sender, ids, weights);
    }

    function finalizeRound(uint256 roundId) external {
        if (roundId == 0 || roundId > currentRoundId) revert RoundNotActive();
        Round storage r = rounds[roundId];
        if (r.finalized) revert RoundAlreadyFinalized();
        if (block.timestamp < r.endsAt) revert RoundNotEnded(r.endsAt);

        r.finalized = true;

        uint256 pastTotalSupply = staking.getPastTotalSupply(r.snapshotBlock);
        uint256 quorum = Math.mulDiv(pastTotalSupply, QUORUM_BPS, 10_000);

        if (pastTotalSupply == 0 || r.totalVotes == 0 || r.totalVotes < quorum) {
            emit RoundFinalized(roundId, 0, false);
            return;
        }

        // Select up to TOP_N proposals with highest votes > 0 (tie-break: lower proposalId).
        uint256[TOP_N] memory topIds;
        uint256[TOP_N] memory topVotesArr;
        uint256 selected = 0;

        for (uint256 pid = 1; pid <= r.proposalCount; pid++) {
            uint256 v = proposals[roundId][pid].votes;
            if (v == 0) continue;

            uint256 pos = selected;
            if (selected < TOP_N) {
                selected++;
            } else if (v <= topVotesArr[TOP_N - 1]) {
                continue;
            } else {
                pos = TOP_N - 1;
            }

            topIds[pos] = pid;
            topVotesArr[pos] = v;

            while (pos > 0 && topVotesArr[pos] > topVotesArr[pos - 1]) {
                (topVotesArr[pos], topVotesArr[pos - 1]) = (topVotesArr[pos - 1], topVotesArr[pos]);
                (topIds[pos], topIds[pos - 1]) = (topIds[pos - 1], topIds[pos]);
                pos--;
            }
        }

        uint256 sumTopVotes = 0;
        for (uint256 i = 0; i < selected; i++) {
            sumTopVotes += topVotesArr[i];
        }

        uint256 capPerProposal = Math.mulDiv(r.budget, MAX_PROPOSAL_SHARE_BPS, 10_000);
        uint256 totalAllocated = 0;

        for (uint256 i = 0; i < selected; i++) {
            uint256 share = Math.mulDiv(r.budget, topVotesArr[i], sumTopVotes);
            if (share > capPerProposal) share = capPerProposal;
            proposals[roundId][topIds[i]].allocation = share;
            totalAllocated += share;
        }

        totalReservedUnclaimed += totalAllocated;
        emit RoundFinalized(roundId, totalAllocated, true);
    }

    function claim(uint256 roundId, uint256 proposalId) external nonReentrant returns (uint256 amount) {
        Round storage r = rounds[roundId];
        if (!r.finalized) revert RoundNotFinalized();

        Proposal storage p = proposals[roundId][proposalId];
        if (p.recipient == address(0)) revert InvalidProposalId(proposalId);
        if (msg.sender != p.recipient) revert NotRecipient();
        if (p.claimed) revert AlreadyClaimed();
        amount = p.allocation;
        if (amount == 0) revert NothingToClaim();

        p.claimed = true;
        totalReservedUnclaimed -= amount;

        (bool ok,) = payable(p.recipient).call{value: amount}("");
        if (!ok) revert EthTransferFailed();

        emit GrantClaimed(roundId, proposalId, p.recipient, amount);
    }

    function _authorizeUpgrade(address) internal override onlyRole(DEFAULT_ADMIN_ROLE) {}

    /// @dev Reserved storage so later versions can add variables without shifting the layout.
    uint256[50] private __gap;
}
