# FocusBond — Demo Script

You know that friend who always says “gym tomorrow”?
Imagine two of you — Bob and Alice — each put a little money on the line. Every day: show up, take a workout photo, check in.
If you skip, you don’t pay the app. You pay your friends who actually went.
That’s FocusBond.

Accountability apps already charge you when you miss — Streek, Forfeit, Beeminder. But usually the company keeps the money.
We’re flipping that. The stake sits in a smart contract on Monad. Completers get paid. Missers fund them. The contract keeps nothing — not a single wei.

Watch a round. I’m creating a Gym Streak circle — goal: workout photo before the deadline. Stake is small MON on Monad Testnet.
Bob and Alice each join and stake. Their MON goes into escrow — not into our pocket. You can see it on the explorer.
Round starts. Clock is running.

Check-in is simple: upload proof. The image is hashed in the browser — we never store the photo. Onchain we only keep the hash.
Bob submits a real gym photo. Referee says pass.
Alice… uploads a cat photo. Referee rejects it.
She’s a misser.
There’s a short challenge window so friends can dispute fakes — but a valid referee pass beats a false accusation.

Time’s up. Anyone can settle — it’s permissionless. App doesn’t even need to be online.
Alice’s entire stake goes to Bob — one transaction.
Escrow balance: zero. Contract retained nothing.
Bob’s streak goes up. Alice’s resets. That’s the loop.

Why Monad? This product is a bunch of tiny actions — join, check in, attest, settle — plus an atomic payout. Sub-second blocks and cheap fees make that feel like a normal app, not a DeFi ritual.
What’s new: peer-to-peer accountability with no custodian. Proof onchain as a hash, AI referee as a shield, bonded challenge as a sword, and money that only moves to the people who showed up.

FocusBond — miss it, pay your friends. Live on Monad Testnet.
Thanks.
