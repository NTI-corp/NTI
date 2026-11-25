// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Script} from "forge-std/Script.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {TimelockController} from "@openzeppelin/contracts/governance/TimelockController.sol";

import {Dispute} from "../src/Dispute.sol";
import {NarrativeMarket} from "../src/NarrativeMarket.sol";
import {NTIRegistry} from "../src/NTIRegistry.sol";
import {OracleCommit} from "../src/OracleCommit.sol";
import {Staking} from "../src/Staking.sol";

/// @title HandoverMainnet
/// @notice Step 7 of the mainnet runbook. IRREVERSIBLE. Moves DEFAULT_ADMIN_ROLE on every protocol contract
///         from the deployer to the 48 hour Timelock, transfers the registry (Ownable2Step, the Safe must
///         then call acceptOwnership) to the Safe, and drops the deployer's admin right on the Timelock.
///
///         Run it only when the governor can really pass proposals (enough stake for the 4% quorum): after
///         this script nobody can change a contract except through a governance proposal.
///
///         Env: HANDOVER_CONFIRM=TRANSFER_ADMIN_TO_TIMELOCK, SAFE_ADDRESS, DEPLOY_MANIFEST (optional).
contract HandoverMainnet is Script {
    bytes32 internal constant ADMIN = 0x00;

    function run() external {
        require(block.chainid == 4663, "mainnet only");
        require(
            keccak256(bytes(vm.envString("HANDOVER_CONFIRM"))) == keccak256("TRANSFER_ADMIN_TO_TIMELOCK"),
            "HANDOVER_CONFIRM must be TRANSFER_ADMIN_TO_TIMELOCK"
        );

        string memory manifest = vm.readFile(vm.envOr("DEPLOY_MANIFEST", string("deployments/4663.json")));
        TimelockController timelock = TimelockController(payable(vm.parseJsonAddress(manifest, ".timelock")));
        address governor = vm.parseJsonAddress(manifest, ".governor");
        NTIRegistry registry = NTIRegistry(vm.parseJsonAddress(manifest, ".registry"));
        address safe = vm.envAddress("SAFE_ADDRESS");
        address deployer = _broadcaster();

        AccessControl[10] memory targets = [
            AccessControl(vm.parseJsonAddress(manifest, ".staking")),
            AccessControl(vm.parseJsonAddress(manifest, ".configRegistry")),
            AccessControl(vm.parseJsonAddress(manifest, ".oracleCommit")),
            AccessControl(vm.parseJsonAddress(manifest, ".dispute")),
            AccessControl(vm.parseJsonAddress(manifest, ".insuranceFund")),
            AccessControl(vm.parseJsonAddress(manifest, ".grants")),
            AccessControl(vm.parseJsonAddress(manifest, ".feeRouter")),
            AccessControl(vm.parseJsonAddress(manifest, ".narrativeMarket")),
            AccessControl(vm.parseJsonAddress(manifest, ".basketFactory")),
            AccessControl(vm.parseJsonAddress(manifest, ".kolRegistry"))
        ];

        // Preconditions: everything that must be final is final before the keys are given up.
        require(safe.code.length > 0, "SAFE_ADDRESS is not a contract");
        require(registry.owner() == deployer, "broadcaster is not the registry owner");
        require(registry.frozen(), "attach the token and freeze the registry first");
        require(OracleCommit(vm.parseJsonAddress(manifest, ".oracleCommit")).timingsLocked(), "oracle timings");
        require(Dispute(vm.parseJsonAddress(manifest, ".dispute")).timingsLocked(), "dispute timings");
        require(Staking(vm.parseJsonAddress(manifest, ".staking")).timingsLocked(), "staking timings");
        require(
            NarrativeMarket(vm.parseJsonAddress(manifest, ".narrativeMarket")).timingsLocked(), "market timings"
        );
        require(timelock.hasRole(timelock.PROPOSER_ROLE(), governor), "governor is not a proposer");
        require(timelock.hasRole(timelock.CANCELLER_ROLE(), governor), "governor is not a canceller");
        for (uint256 i = 0; i < targets.length; i++) {
            require(targets[i].hasRole(ADMIN, deployer), "deployer is not admin of a target");
        }

        vm.startBroadcast();
        for (uint256 i = 0; i < targets.length; i++) {
            targets[i].grantRole(ADMIN, address(timelock));
            targets[i].renounceRole(ADMIN, deployer);
        }
        registry.transferOwnership(safe);
        timelock.renounceRole(ADMIN, deployer);
        vm.stopBroadcast();

        for (uint256 i = 0; i < targets.length; i++) {
            require(targets[i].hasRole(ADMIN, address(timelock)), "check: timelock is not admin");
            require(!targets[i].hasRole(ADMIN, deployer), "check: deployer is still admin");
        }
        require(registry.pendingOwner() == safe, "check: registry transfer not pending");
        require(!timelock.hasRole(ADMIN, deployer), "check: deployer still admins the timelock");
    }

    /// @dev Test seam: under `forge script` the broadcaster is msg.sender; harnesses override it.
    function _broadcaster() internal view virtual returns (address) {
        return msg.sender;
    }
}
