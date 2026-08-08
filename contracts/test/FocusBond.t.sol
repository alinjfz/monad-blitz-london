// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {FocusBond} from "../src/FocusBond.sol";

/// @dev Rejects every incoming transfer, to prove one hostile member cannot
///      freeze anyone else's settlement.
contract RejectingReceiver {
    receive() external payable {
        revert("no thanks");
    }

    function joinCircle(FocusBond fb, uint256 id, uint256 stake) external {
        fb.join{value: stake}(id);
    }

    function submit(FocusBond fb, uint256 id, bytes32 h) external {
        fb.submitProof(id, h);
    }
}

contract FocusBondTest is Test {
    FocusBond fb;

    uint256 refereeKey = 0xA11CE;
    address referee;

    address alice = address(0xA1);
    address bob = address(0xB0);
    address cara = address(0xCA);
    address dan = address(0xDA);

    uint256 stake = 1 ether;
    uint64 roundSeconds = 60;
    uint64 challengeSeconds = 30;

    bytes32 realProof = keccak256("sent-application-email.png");
    bytes32 fakeProof = keccak256("cat.png");

    function setUp() public {
        referee = vm.addr(refereeKey);
        fb = new FocusBond(referee);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(cara, 100 ether);
        vm.deal(dan, 100 ether);
    }

    // ------------------------------------------------------------- helpers

    function _threePersonCircle() internal returns (uint256 id) {
        vm.prank(alice);
        id = fb.createCircle{value: stake}(stake, "Blitz Lock-In", roundSeconds, challengeSeconds);
        vm.prank(bob);
        fb.join{value: stake}(id);
        vm.prank(cara);
        fb.join{value: stake}(id);
        vm.prank(alice);
        fb.start(id);
    }

    function _sign(uint256 id, address member, bytes32 proofHash, bool pass) internal view returns (bytes memory) {
        bytes32 digest = fb.verdictDigest(id, member, proofHash, pass);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(refereeKey, digest);
        return abi.encodePacked(r, s, v);
    }

    function _afterChallengeWindow(uint256 id) internal {
        (,,,,, uint64 challengeEndsAt,,,) = fb.getCircle(id);
        vm.warp(challengeEndsAt + 1);
    }

    // --------------------------------------------------------------- paths

    /// Everyone completes: stakes come back, streaks rise, no money changes hands.
    function test_happyPath_allComplete() public {
        uint256 id = _threePersonCircle();

        vm.prank(alice);
        fb.submitProof(id, realProof);
        vm.prank(bob);
        fb.submitProof(id, realProof);
        vm.prank(cara);
        fb.submitProof(id, realProof);

        uint256 beforeBal = alice.balance;
        _afterChallengeWindow(id);
        fb.settle(id);

        assertEq(alice.balance, beforeBal + stake, "stake returned");
        (uint32 streak,,,,,) = fb.stats(alice);
        assertEq(streak, 1);
        assertEq(address(fb).balance, 0, "contract retains nothing");
    }

    /// The demo beat: Cara is slashed, her stake splits between Alice and Bob.
    function test_misserPaysCompleters() public {
        uint256 id = _threePersonCircle();

        vm.prank(alice);
        fb.submitProof(id, realProof);
        vm.prank(bob);
        fb.submitProof(id, realProof);
        vm.prank(cara);
        fb.breakFocus(id);

        uint256 aliceBefore = alice.balance;
        uint256 bobBefore = bob.balance;
        uint256 caraBefore = cara.balance;

        _afterChallengeWindow(id);
        fb.settle(id);

        assertEq(alice.balance, aliceBefore + stake + stake / 2, "stake plus half of Cara's");
        assertEq(bob.balance, bobBefore + stake + stake / 2);
        assertEq(cara.balance, caraBefore, "misser gets nothing back");

        (uint32 caraStreak,,, uint32 caraMissed,, uint256 caraLost) = fb.stats(cara);
        assertEq(caraStreak, 0);
        assertEq(caraMissed, 1);
        assertEq(caraLost, stake);

        (,,,, uint256 aliceEarned,) = _stats(alice);
        assertEq(aliceEarned, stake / 2);
        assertEq(address(fb).balance, 0);
    }

    /// A referee fail verdict slashes just like a self-reported break.
    function test_aiFailSlashes() public {
        uint256 id = _threePersonCircle();

        vm.prank(alice);
        fb.submitProof(id, realProof);
        vm.prank(bob);
        fb.submitProof(id, realProof);
        vm.prank(cara);
        fb.submitProof(id, fakeProof);

        fb.attest(id, cara, false, _sign(id, cara, fakeProof, false));
        assertFalse(fb.isCompleter(id, cara), "AI-failed is not a completer");

        uint256 aliceBefore = alice.balance;
        _afterChallengeWindow(id);
        fb.settle(id);

        assertEq(alice.balance, aliceBefore + stake + stake / 2);
        assertEq(address(fb).balance, 0);
    }

    /// A referee pass is a shield: the accuser loses the bond to the accused.
    function test_falseChallenge_bondGoesToAccused() public {
        uint256 id = _threePersonCircle();

        vm.prank(alice);
        fb.submitProof(id, realProof);
        vm.prank(bob);
        fb.submitProof(id, realProof);
        vm.prank(cara);
        fb.submitProof(id, realProof);

        fb.attest(id, alice, true, _sign(id, alice, realProof, true));

        (,,,, uint64 endsAt,,,,) = fb.getCircle(id);
        vm.warp(endsAt + 1);

        vm.prank(cara);
        fb.challenge{value: stake}(id, alice);

        assertTrue(fb.isCompleter(id, alice), "verified check-in survives a challenge");

        uint256 aliceBefore = alice.balance;
        _afterChallengeWindow(id);
        fb.settle(id);

        // Alice keeps her stake and collects Cara's forfeited bond.
        assertEq(alice.balance, aliceBefore + stake + stake, "stake back plus the bond");
        assertEq(address(fb).balance, 0);
    }

    /// An unattested check-in loses to a challenge, and the accuser is refunded.
    function test_successfulChallenge_slashesUnverified() public {
        uint256 id = _threePersonCircle();

        vm.prank(alice);
        fb.submitProof(id, realProof);
        vm.prank(bob);
        fb.submitProof(id, realProof);
        vm.prank(cara);
        fb.submitProof(id, fakeProof);

        (,,,, uint64 endsAt,,,,) = fb.getCircle(id);
        vm.warp(endsAt + 1);

        vm.prank(alice);
        fb.challenge{value: stake}(id, cara);
        assertFalse(fb.isCompleter(id, cara));

        uint256 aliceBefore = alice.balance;
        _afterChallengeWindow(id);
        fb.settle(id);

        // Bond refunded, own stake back, plus half of Cara's slashed stake.
        assertEq(alice.balance, aliceBefore + stake + stake + stake / 2);
        assertEq(address(fb).balance, 0);
    }

    /// Nobody completes: refund everyone, reset every streak, move no money.
    function test_collectiveFail_refundsEveryone() public {
        uint256 id = _threePersonCircle();

        vm.prank(alice);
        fb.breakFocus(id);
        vm.prank(bob);
        fb.breakFocus(id);
        // Cara simply never checks in.

        uint256 aliceBefore = alice.balance;
        uint256 caraBefore = cara.balance;

        _afterChallengeWindow(id);
        fb.settle(id);

        assertEq(alice.balance, aliceBefore + stake);
        assertEq(cara.balance, caraBefore + stake);
        assertEq(address(fb).balance, 0);
    }

    /// Odd pot with two completers: the dust must not be stuck in the contract.
    function test_dustGoesToHighestStreak() public {
        // Give Alice a streak of 1 from an earlier circle.
        uint256 first = _threePersonCircle();
        vm.prank(alice);
        fb.submitProof(first, realProof);
        vm.prank(bob);
        fb.submitProof(first, realProof);
        vm.prank(cara);
        fb.submitProof(first, realProof);
        _afterChallengeWindow(first);
        fb.settle(first);

        // Fresh circle with an odd stake so the split leaves 1 wei of dust.
        uint256 oddStake = 3;
        vm.prank(alice);
        uint256 id = fb.createCircle{value: oddStake}(oddStake, "odd", roundSeconds, challengeSeconds);
        vm.prank(bob);
        fb.join{value: oddStake}(id);
        vm.prank(dan);
        fb.join{value: oddStake}(id);
        vm.prank(alice);
        fb.start(id);

        vm.prank(alice);
        fb.submitProof(id, realProof);
        vm.prank(dan);
        fb.submitProof(id, realProof);
        vm.prank(bob);
        fb.breakFocus(id);

        uint256 aliceBefore = alice.balance;
        uint256 danBefore = dan.balance;
        _afterChallengeWindow(id);
        fb.settle(id);

        // pot = 3, two completers: share 1 each, dust 1 to the higher streak (Alice).
        assertEq(alice.balance, aliceBefore + oddStake + 1 + 1);
        assertEq(dan.balance, danBefore + oddStake + 1);
        assertEq(address(fb).balance, 0, "dust never sticks");
    }

    /// One member with a reverting fallback must not block the others.
    function test_hostileReceiver_doesNotBlockSettlement() public {
        RejectingReceiver hostile = new RejectingReceiver();
        vm.deal(address(hostile), 10 ether);

        vm.prank(alice);
        uint256 id = fb.createCircle{value: stake}(stake, "hostile", roundSeconds, challengeSeconds);
        hostile.joinCircle(fb, id, stake);
        vm.prank(alice);
        fb.start(id);

        vm.prank(alice);
        fb.submitProof(id, realProof);
        hostile.submit(fb, id, realProof);

        uint256 aliceBefore = alice.balance;
        _afterChallengeWindow(id);
        fb.settle(id);

        assertEq(alice.balance, aliceBefore + stake, "Alice still gets paid");
        assertEq(fb.withdrawable(address(hostile)), stake, "hostile payout deferred");
        assertEq(address(fb).balance, stake, "only the deferred amount remains");
    }

    // ---------------------------------------------------------------- guards

    function test_abortRefundsBeforeStart() public {
        vm.prank(alice);
        uint256 id = fb.createCircle{value: stake}(stake, "aborted", roundSeconds, challengeSeconds);
        vm.prank(bob);
        fb.join{value: stake}(id);

        uint256 aliceBefore = alice.balance;
        vm.prank(alice);
        fb.abort(id);

        assertEq(alice.balance, aliceBefore + stake);
        assertEq(address(fb).balance, 0);
    }

    function test_cannotJoinAfterStart() public {
        uint256 id = _threePersonCircle();
        vm.prank(dan);
        vm.expectRevert(FocusBond.AlreadyStarted.selector);
        fb.join{value: stake}(id);
    }

    function test_cannotStartAlone() public {
        vm.prank(alice);
        uint256 id = fb.createCircle{value: stake}(stake, "solo", roundSeconds, challengeSeconds);
        vm.prank(alice);
        vm.expectRevert(FocusBond.TooFewMembers.selector);
        fb.start(id);
    }

    function test_cannotSettleTwice() public {
        uint256 id = _threePersonCircle();
        vm.prank(alice);
        fb.submitProof(id, realProof);
        _afterChallengeWindow(id);
        fb.settle(id);
        vm.expectRevert(FocusBond.AlreadySettled.selector);
        fb.settle(id);
    }

    function test_forgedRefereeSignatureRejected() public {
        uint256 id = _threePersonCircle();
        vm.prank(cara);
        fb.submitProof(id, fakeProof);

        bytes32 digest = fb.verdictDigest(id, cara, fakeProof, true);
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(0xBADBAD, digest);

        vm.expectRevert(FocusBond.BadSignature.selector);
        fb.attest(id, cara, true, abi.encodePacked(r, s, v));
    }

    function test_resubmittingProofClearsVerdict() public {
        uint256 id = _threePersonCircle();
        vm.prank(cara);
        fb.submitProof(id, realProof);
        fb.attest(id, cara, true, _sign(id, cara, realProof, true));
        assertTrue(fb.isCompleter(id, cara));

        vm.prank(cara);
        fb.submitProof(id, fakeProof);
        (, bool verified,,,) = fb.checks(id, cara);
        assertFalse(verified, "a new file invalidates the old verdict");
    }

    function test_challengeOnlyDuringWindow() public {
        uint256 id = _threePersonCircle();
        vm.prank(alice);
        fb.submitProof(id, realProof);

        vm.prank(bob);
        vm.expectRevert(FocusBond.RoundLive.selector);
        fb.challenge{value: stake}(id, alice);

        _afterChallengeWindow(id);
        vm.prank(bob);
        vm.expectRevert(FocusBond.WindowClosed.selector);
        fb.challenge{value: stake}(id, alice);
    }

    function _stats(address who)
        internal
        view
        returns (uint32 streak, uint32 bestStreak, uint32 completed, uint32 missed, uint256 earned, uint256 lost)
    {
        return fb.stats(who);
    }
}
