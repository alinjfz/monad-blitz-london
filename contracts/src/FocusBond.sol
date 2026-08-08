// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title FocusBond
/// @notice Friend-group accountability circles with real money on the line.
///         Everyone stakes MON on a shared goal. Whoever misses has their entire
///         stake split evenly among the friends who showed up.
///
///         The contract takes no fee and cannot retain value: every settlement
///         path drains the circle's escrow back to its members.
///
/// Trust model, two independent layers:
///   1. `submitProof` commits keccak256 of the evidence before the deadline.
///      This proves you held that exact file in time, not what it depicts.
///   2. `attest` lets an offchain vision referee sign a pass or fail verdict.
///      A referee pass acts as a shield: it defeats a peer `challenge`.
///      An unattested check-in can be challenged by any member who posts a bond
///      equal to the stake, so a false accusation costs what it tries to take.
contract FocusBond {
    uint256 public constant MAX_MEMBERS = 8;
    uint256 public constant MIN_MEMBERS = 2;

    struct Check {
        bytes32 proofHash;
        bool verified; // referee signed a pass
        bool failedByAI; // referee signed a fail
        bool broke; // self-reported break, irreversible
        address challenger; // zero if unchallenged
    }

    struct Circle {
        uint256 stake;
        uint64 roundSeconds;
        uint64 challengeSeconds;
        uint64 endsAt; // zero until started
        uint64 challengeEndsAt;
        bool settled;
        string goal;
        address[] members;
    }

    struct Stats {
        uint32 streak;
        uint32 bestStreak;
        uint32 completed;
        uint32 missed;
        uint256 earned; // cumulative MON won from friends who missed
        uint256 lost; // cumulative MON lost to friends
    }

    /// @dev Flattened per-member state so the dashboard can render from one call.
    struct MemberView {
        address addr;
        bytes32 proofHash;
        bool verified;
        bool failedByAI;
        bool broke;
        address challenger;
        bool completer;
        Stats stats;
    }

    address public immutable referee;
    uint256 public circleCount;

    mapping(uint256 => Circle) private _circles;
    mapping(uint256 => mapping(address => Check)) public checks;
    mapping(uint256 => mapping(address => bool)) public isMember;
    mapping(address => Stats) public stats;
    /// @dev Credited only when a push payment fails, so one hostile receiver
    ///      can never freeze everyone else's settlement.
    mapping(address => uint256) public withdrawable;

    event CircleCreated(
        uint256 indexed id, address indexed creator, uint256 stake, string goal, uint64 roundSeconds, uint64 challengeSeconds
    );
    event Joined(uint256 indexed id, address indexed member, uint256 stake);
    event Started(uint256 indexed id, uint64 endsAt, uint64 challengeEndsAt);
    event ProofSubmitted(uint256 indexed id, address indexed member, bytes32 proofHash);
    event Attested(uint256 indexed id, address indexed member, bool pass);
    event Challenged(uint256 indexed id, address indexed member, address indexed challenger, uint256 bond);
    event ChallengeResolved(uint256 indexed id, address indexed member, address indexed challenger, bool succeeded);
    event FocusBroken(uint256 indexed id, address indexed member);
    event Nudged(uint256 indexed id, address indexed from, address indexed to);
    event Slashed(uint256 indexed id, address indexed member, uint256 amount);
    event Settled(uint256 indexed id, address[] completers, uint256[] payouts, uint256 misserCount);
    event CollectiveFail(uint256 indexed id);
    event Aborted(uint256 indexed id);
    event PayoutDeferred(address indexed to, uint256 amount);

    error NoCircle();
    error BadStake();
    error WrongValue();
    error BadWindow();
    error CircleFull();
    error NotMember();
    error AlreadyMember();
    error AlreadyStarted();
    error NotStarted();
    error TooFewMembers();
    error RoundOver();
    error RoundLive();
    error WindowClosed();
    error AlreadySettled();
    error AlreadyChallenged();
    error AlreadyBroke();
    error SelfChallenge();
    error NoProof();
    error EmptyProof();
    error BadSignature();
    error NothingToWithdraw();

    constructor(address referee_) {
        referee = referee_;
    }

    // ---------------------------------------------------------------- lifecycle

    function createCircle(uint256 stake, string calldata goal, uint64 roundSeconds, uint64 challengeSeconds)
        external
        payable
        returns (uint256 id)
    {
        if (stake == 0) revert BadStake();
        if (msg.value != stake) revert WrongValue();
        if (roundSeconds == 0 || challengeSeconds == 0) revert BadWindow();

        id = ++circleCount;
        Circle storage c = _circles[id];
        c.stake = stake;
        c.goal = goal;
        c.roundSeconds = roundSeconds;
        c.challengeSeconds = challengeSeconds;
        c.members.push(msg.sender);
        isMember[id][msg.sender] = true;

        emit CircleCreated(id, msg.sender, stake, goal, roundSeconds, challengeSeconds);
        emit Joined(id, msg.sender, stake);
    }

    function join(uint256 id) external payable {
        Circle storage c = _circles[id];
        if (c.stake == 0) revert NoCircle();
        if (c.endsAt != 0) revert AlreadyStarted();
        if (c.settled) revert AlreadySettled();
        if (isMember[id][msg.sender]) revert AlreadyMember();
        if (c.members.length >= MAX_MEMBERS) revert CircleFull();
        if (msg.value != c.stake) revert WrongValue();

        c.members.push(msg.sender);
        isMember[id][msg.sender] = true;
        emit Joined(id, msg.sender, c.stake);
    }

    function start(uint256 id) external {
        Circle storage c = _circles[id];
        if (!isMember[id][msg.sender]) revert NotMember();
        if (c.endsAt != 0) revert AlreadyStarted();
        if (c.settled) revert AlreadySettled();
        if (c.members.length < MIN_MEMBERS) revert TooFewMembers();

        c.endsAt = uint64(block.timestamp) + c.roundSeconds;
        c.challengeEndsAt = c.endsAt + c.challengeSeconds;
        emit Started(id, c.endsAt, c.challengeEndsAt);
    }

    /// @notice Refund everyone if the round never started, so a friend who never
    ///         joins can't strand the escrow.
    function abort(uint256 id) external {
        Circle storage c = _circles[id];
        if (!isMember[id][msg.sender]) revert NotMember();
        if (c.endsAt != 0) revert AlreadyStarted();
        if (c.settled) revert AlreadySettled();

        c.settled = true;
        uint256 n = c.members.length;
        for (uint256 i; i < n; ++i) {
            _pay(c.members[i], c.stake);
        }
        emit Aborted(id);
    }

    // ------------------------------------------------------------- check-ins

    /// @param proofHash keccak256 of the evidence bytes. Re-submitting before the
    ///        deadline overwrites, so a bad screenshot can be replaced.
    function submitProof(uint256 id, bytes32 proofHash) external {
        Circle storage c = _circles[id];
        if (!isMember[id][msg.sender]) revert NotMember();
        if (c.endsAt == 0) revert NotStarted();
        if (block.timestamp > c.endsAt) revert RoundOver();
        if (proofHash == bytes32(0)) revert EmptyProof();

        Check storage ck = checks[id][msg.sender];
        if (ck.broke) revert AlreadyBroke();

        ck.proofHash = proofHash;
        // A new file invalidates any previous verdict.
        ck.verified = false;
        ck.failedByAI = false;
        emit ProofSubmitted(id, msg.sender, proofHash);
    }

    function breakFocus(uint256 id) external {
        Circle storage c = _circles[id];
        if (!isMember[id][msg.sender]) revert NotMember();
        if (c.endsAt == 0) revert NotStarted();
        if (block.timestamp > c.endsAt) revert RoundOver();

        checks[id][msg.sender].broke = true;
        emit FocusBroken(id, msg.sender);
    }

    /// @notice Relay a referee verdict. Anyone may relay; only the referee's
    ///         signature counts. The digest is bound to this chain, this
    ///         contract, and this exact proof hash, so replay is inert.
    function attest(uint256 id, address member, bool pass, bytes calldata sig) external {
        Circle storage c = _circles[id];
        if (c.endsAt == 0) revert NotStarted();
        if (c.settled) revert AlreadySettled();
        if (block.timestamp > c.challengeEndsAt) revert WindowClosed();
        if (!isMember[id][member]) revert NotMember();

        Check storage ck = checks[id][member];
        if (ck.proofHash == bytes32(0)) revert NoProof();
        if (_recover(verdictDigest(id, member, ck.proofHash, pass), sig) != referee) revert BadSignature();

        ck.verified = pass;
        ck.failedByAI = !pass;
        emit Attested(id, member, pass);
    }

    /// @notice Accuse a member during the challenge window by posting a bond
    ///         equal to the stake. A referee pass defeats the challenge and the
    ///         bond goes to the accused.
    function challenge(uint256 id, address member) external payable {
        Circle storage c = _circles[id];
        if (!isMember[id][msg.sender]) revert NotMember();
        if (!isMember[id][member]) revert NotMember();
        if (member == msg.sender) revert SelfChallenge();
        if (c.endsAt == 0) revert NotStarted();
        if (block.timestamp <= c.endsAt) revert RoundLive();
        if (block.timestamp > c.challengeEndsAt) revert WindowClosed();
        if (msg.value != c.stake) revert WrongValue();

        Check storage ck = checks[id][member];
        if (ck.challenger != address(0)) revert AlreadyChallenged();

        ck.challenger = msg.sender;
        emit Challenged(id, member, msg.sender, c.stake);
    }

    /// @notice Free social pressure. Emits an event only; costs a fraction of a
    ///         cent on Monad, which is the whole point.
    function nudge(uint256 id, address to) external {
        if (!isMember[id][msg.sender]) revert NotMember();
        if (!isMember[id][to]) revert NotMember();
        emit Nudged(id, msg.sender, to);
    }

    // ---------------------------------------------------------------- settle

    /// @notice Permissionless. Once the challenge window closes anyone can
    ///         trigger the payout, so it does not depend on our app being up.
    function settle(uint256 id) external {
        Circle storage c = _circles[id];
        if (c.stake == 0) revert NoCircle();
        if (c.endsAt == 0) revert NotStarted();
        if (c.settled) revert AlreadySettled();
        if (block.timestamp <= c.challengeEndsAt) revert WindowClosed();

        c.settled = true;

        uint256 n = c.members.length;
        address[] memory completers = _findCompleters(id, c, n);

        _resolveChallenges(id, c, c.stake, n);

        if (completers.length == 0) {
            // Nobody showed up: there is no fair recipient, so refund stakes and
            // reset every streak.
            _refundAll(c, n);
            emit CollectiveFail(id);
            return;
        }

        _payout(id, c, completers, n - completers.length);
    }

    function withdraw() external {
        uint256 amount = withdrawable[msg.sender];
        if (amount == 0) revert NothingToWithdraw();
        withdrawable[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert NothingToWithdraw();
    }

    // ------------------------------------------------------------------ views

    function verdictDigest(uint256 id, address member, bytes32 proofHash, bool pass) public view returns (bytes32) {
        bytes32 inner = keccak256(abi.encode(block.chainid, address(this), id, member, proofHash, pass));
        return keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", inner));
    }

    function getCircle(uint256 id)
        external
        view
        returns (
            uint256 stake,
            string memory goal,
            uint64 roundSeconds,
            uint64 challengeSeconds,
            uint64 endsAt,
            uint64 challengeEndsAt,
            bool settled,
            address[] memory members,
            uint256 escrow
        )
    {
        Circle storage c = _circles[id];
        return (
            c.stake,
            c.goal,
            c.roundSeconds,
            c.challengeSeconds,
            c.endsAt,
            c.challengeEndsAt,
            c.settled,
            c.members,
            c.settled ? 0 : c.stake * c.members.length
        );
    }

    /// @notice One call powers the whole dashboard.
    function getBoard(uint256 id) external view returns (MemberView[] memory board) {
        Circle storage c = _circles[id];
        uint256 n = c.members.length;
        board = new MemberView[](n);
        for (uint256 i; i < n; ++i) {
            address m = c.members[i];
            Check storage ck = checks[id][m];
            board[i] = MemberView({
                addr: m,
                proofHash: ck.proofHash,
                verified: ck.verified,
                failedByAI: ck.failedByAI,
                broke: ck.broke,
                challenger: ck.challenger,
                completer: _isCompleter(id, m),
                stats: stats[m]
            });
        }
    }

    function isCompleter(uint256 id, address member) external view returns (bool) {
        return _isCompleter(id, member);
    }

    // --------------------------------------------------------------- internal

    function _isCompleter(uint256 id, address member) internal view returns (bool) {
        Check storage ck = checks[id][member];
        if (ck.proofHash == bytes32(0)) return false;
        if (ck.broke) return false;
        if (ck.failedByAI) return false;
        // An unattested check-in loses to a challenge; a referee pass defeats it.
        if (ck.challenger != address(0) && !ck.verified) return false;
        return true;
    }

    function _findCompleters(uint256 id, Circle storage c, uint256 n) internal view returns (address[] memory out) {
        address[] memory scratch = new address[](n);
        uint256 cc;
        for (uint256 i; i < n; ++i) {
            address m = c.members[i];
            if (_isCompleter(id, m)) {
                scratch[cc] = m;
                ++cc;
            }
        }
        out = new address[](cc);
        for (uint256 i; i < cc; ++i) {
            out[i] = scratch[i];
        }
    }

    function _refundAll(Circle storage c, uint256 n) internal {
        for (uint256 i; i < n; ++i) {
            address m = c.members[i];
            Stats storage st = stats[m];
            st.streak = 0;
            st.missed += 1;
            _pay(m, c.stake);
        }
    }

    function _payout(uint256 id, Circle storage c, address[] memory completers, uint256 misserCount) internal {
        uint256 stake = c.stake;
        uint256 cc = completers.length;
        uint256 pot = stake * misserCount;
        uint256 share = pot / cc;
        uint256 dust = pot - (share * cc);
        // Dust goes to the most consistent completer, measured before increments.
        uint256 dustWinner = dust == 0 ? type(uint256).max : _mostConsistent(completers);

        uint256[] memory paidAmount = new uint256[](cc);
        for (uint256 i; i < cc; ++i) {
            uint256 amount = stake + share;
            if (i == dustWinner) amount += dust;
            paidAmount[i] = amount;
            _rewardCompleter(completers[i], amount, amount - stake);
        }

        _slashMissers(id, c, stake, c.members.length);
        emit Settled(id, completers, paidAmount, misserCount);
    }

    function _mostConsistent(address[] memory completers) internal view returns (uint256 winner) {
        uint32 best = stats[completers[0]].streak;
        for (uint256 i = 1; i < completers.length; ++i) {
            uint32 s = stats[completers[i]].streak;
            if (s > best) {
                best = s;
                winner = i;
            }
        }
    }

    function _rewardCompleter(address member, uint256 amount, uint256 gain) internal {
        Stats storage st = stats[member];
        st.streak += 1;
        if (st.streak > st.bestStreak) st.bestStreak = st.streak;
        st.completed += 1;
        st.earned += gain;
        _pay(member, amount);
    }

    function _slashMissers(uint256 id, Circle storage c, uint256 stake, uint256 n) internal {
        for (uint256 i; i < n; ++i) {
            address m = c.members[i];
            if (_isCompleter(id, m)) continue;
            Stats storage st = stats[m];
            st.streak = 0;
            st.missed += 1;
            st.lost += stake;
            emit Slashed(id, m, stake);
        }
    }

    function _resolveChallenges(uint256 id, Circle storage c, uint256 stake, uint256 n) internal {
        for (uint256 i; i < n; ++i) {
            address m = c.members[i];
            Check storage ck = checks[id][m];
            address accuser = ck.challenger;
            if (accuser == address(0)) continue;

            if (ck.verified) {
                // False accusation: the bond is forfeited to the accused.
                _pay(m, stake);
                emit ChallengeResolved(id, m, accuser, false);
            } else {
                _pay(accuser, stake);
                emit ChallengeResolved(id, m, accuser, true);
            }
        }
    }

    function _pay(address to, uint256 amount) internal {
        if (amount == 0) return;
        (bool ok,) = to.call{value: amount}("");
        if (!ok) {
            withdrawable[to] += amount;
            emit PayoutDeferred(to, amount);
        }
    }

    function _recover(bytes32 digest, bytes calldata sig) internal pure returns (address) {
        if (sig.length != 65) revert BadSignature();
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;
        return ecrecover(digest, v, r, s);
    }
}
