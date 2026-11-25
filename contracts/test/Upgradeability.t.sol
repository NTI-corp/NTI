// SPDX-License-Identifier: MIT
pragma solidity 0.8.26;

import {Test} from "forge-std/Test.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {IAccessControl} from "@openzeppelin/contracts/access/IAccessControl.sol";

import {deployProxy} from "../src/libraries/ProxyDeploy.sol";
import {Basket} from "../src/Basket.sol";
import {BasketFactory} from "../src/BasketFactory.sol";
import {ConfigRegistry} from "../src/ConfigRegistry.sol";
import {NTIRegistry} from "../src/NTIRegistry.sol";

/// @dev A "next version" used only to prove an upgrade keeps state and can add behaviour.
contract ConfigRegistryV2 is ConfigRegistry {
    function version() external pure returns (uint256) {
        return 2;
    }
}

contract BasketV2 is Basket {
    function version() external pure returns (uint256) {
        return 2;
    }
}

contract UpgradeabilityTest is Test {
    address internal admin = makeAddr("admin");
    address internal stranger = makeAddr("stranger");

    function _configRegistry() internal returns (ConfigRegistry cfg, address impl) {
        impl = address(new ConfigRegistry());
        cfg = ConfigRegistry(payable(deployProxy(impl, abi.encodeCall(ConfigRegistry.initialize, (admin)))));
    }

    function test_the_admin_can_upgrade_and_state_survives() public {
        (ConfigRegistry cfg,) = _configRegistry();
        bytes32 hash = keccak256("config-v1");
        vm.prank(admin);
        cfg.setConfig(hash, 10, 1);

        address v2 = address(new ConfigRegistryV2());
        vm.prank(admin);
        UUPSUpgradeable(address(cfg)).upgradeToAndCall(v2, "");

        (bytes32 active, uint8 count) = cfg.active(1);
        assertEq(active, hash);
        assertEq(count, 10);
        assertEq(ConfigRegistryV2(address(cfg)).version(), 2);
        assertTrue(cfg.hasRole(0x00, admin));
    }

    function test_nobody_else_can_upgrade() public {
        (ConfigRegistry cfg,) = _configRegistry();
        address v2 = address(new ConfigRegistryV2());
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, stranger, bytes32(0))
        );
        UUPSUpgradeable(address(cfg)).upgradeToAndCall(v2, "");
    }

    function test_a_proxy_cannot_be_initialized_twice_and_the_implementation_cannot_be_initialized() public {
        (ConfigRegistry cfg, address impl) = _configRegistry();
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        cfg.initialize(stranger);
        vm.expectRevert(Initializable.InvalidInitialization.selector);
        ConfigRegistry(impl).initialize(stranger);
    }

    function test_an_upgrade_to_something_that_is_not_a_uups_implementation_is_refused() public {
        (ConfigRegistry cfg,) = _configRegistry();
        address notUups = address(new NTIRegistryNoUUPS());
        vm.prank(admin);
        vm.expectRevert();
        UUPSUpgradeable(address(cfg)).upgradeToAndCall(notUups, "");
    }

    function test_the_registry_is_upgradeable_only_by_its_owner() public {
        NTIRegistry impl = new NTIRegistry();
        NTIRegistry reg = NTIRegistry(
            payable(deployProxy(address(impl), abi.encodeCall(NTIRegistry.initialize, (admin, makeAddr("weth")))))
        );
        address next = address(new NTIRegistry());
        vm.prank(stranger);
        vm.expectRevert();
        UUPSUpgradeable(address(reg)).upgradeToAndCall(next, "");
        vm.prank(admin);
        UUPSUpgradeable(address(reg)).upgradeToAndCall(next, "");
        assertEq(reg.owner(), admin);
    }

    function test_every_basket_follows_the_factory_beacon() public {
        BasketFactory factory = BasketFactory(
            payable(
                deployProxy(
                    address(new BasketFactory()),
                    abi.encodeCall(
                        BasketFactory.initialize, (makeAddr("registry"), makeAddr("router"), makeAddr("fees"), admin, address(new Basket()))
                    )
                )
            )
        );
        vm.startPrank(admin);
        address a = factory.createBasket(1, "Basket A", "bA", admin, makeAddr("keeper"), makeAddr("pauser"));
        address b = factory.createBasket(2, "Basket B", "bB", admin, makeAddr("keeper"), makeAddr("pauser"));
        address v2 = address(new BasketV2());
        factory.upgradeBasketImplementation(v2);
        vm.stopPrank();

        assertEq(BasketV2(payable(a)).version(), 2);
        assertEq(BasketV2(payable(b)).version(), 2);
        assertEq(Basket(payable(a)).narrativeId(), 1);
        assertEq(Basket(payable(b)).narrativeId(), 2);
        assertEq(factory.basketImplementation(), v2);

        address another = address(new BasketV2());
        vm.prank(stranger);
        vm.expectRevert();
        factory.upgradeBasketImplementation(another);
    }
}

/// @dev Has no proxiableUUID(): upgrading to it must be refused so a proxy can never be bricked.
contract NTIRegistryNoUUPS {
    function hello() external pure returns (uint256) {
        return 1;
    }
}
