// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {FocusBond} from "../src/FocusBond.sol";

contract Deploy is Script {
    function run() external returns (FocusBond fb) {
        address referee = vm.envAddress("REFEREE_ADDRESS");
        uint256 deployerKey = vm.envUint("DEPLOYER_PK");

        vm.startBroadcast(deployerKey);
        fb = new FocusBond(referee);
        vm.stopBroadcast();

        console.log("FocusBond deployed:", address(fb));
        console.log("Referee:", referee);
    }
}
