# Landscape: social accountability with money stakes

FocusBond is not inventing the category. Staking money on habits with friends is
a real and growing product space. What follows is the research we did before
building, and the specific gap we went after.

## Closest to what we built: friends, proof, and paying friends

| App | Fit | How it works |
| --- | --- | --- |
| [Streek](https://www.getstreek.com/) | Almost exact | One shared group streak of 3 to 8 friends. Proof is an in-app live photo, timelapse, GPS, Apple Health, or screen time. Card or Apple Pay linked up front. Launching Q4 2026, waitlist only. |
| [Nudge](https://getnudge.net/) | Very close | Group challenges with photo proof and money fines settled over Venmo, or social forfeits instead. Live on iOS. |
| [Forfeit](https://www.forfeit.app/) | Close on proof and money | Task plus deadline plus stake. Photo, video, or timelapse proof verified by AI with human appeal. Stripe pre-authorises the stake and captures it the moment you miss. Forfeit retains the money today; paying it to friends is on their roadmap. |

Two details from Streek's own page are worth stating precisely, because they are
harsher than the usual "loser pays friends" summary and they shaped our design:

- The streak is collective. It only advances when **every** member checks in.
- If one person misses, the challenge ends and **every member is charged their
  full stake**, and Streek keeps all of it.

That is great drama but it is not redistribution, and the company is the
beneficiary. Forfeit is the same shape: the app is the counterparty.

## Same mechanic, but the money rarely reaches your friends

| App | Where the money goes |
| --- | --- |
| [stickK](https://www.stickk.com/) | Commitment contract with a referee. Fail and your pledge goes to a charity, an anti-charity, or optionally a named person. The Yale-economist original, and the most formal. |
| [Beeminder](https://www.beeminder.com/) | Tracks your data continuously and charges your card on a derailment, with an escalating pledge ladder. The money goes to Beeminder. |
| [TaskRatchet](https://taskratchet.com/) | Deadlines with an automatic charge on a miss. Solo focused. |
| [FineStreak](https://finestreak.com/) | AI phone calls plus photo proof plus fines. Heavier enforcement, not a social pool. |
| [due.box](https://due.box/) | Stake money per task, irreversible once the deadline passes. |

## How our origin example maps onto them

The example that started this project was: apply to five jobs a week, submit a
screenshot of each sent email, and whoever misses pays their friends.

- **Nudge** is the only one you can actually use with friends today, settling over Venmo.
- **Streek** is the closest mechanically, but it is not live and the house keeps the money.
- **Forfeit** has the best proof pipeline for screenshot evidence, but the friend payout is still missing.

## The gap we went after

Existing products cluster into two shapes:

1. Solo stakes where you lose money to the app or a charity.
2. Daily habit streaks like gym or wake-up, rather than weekly productivity
   quotas like "five applications."

Nobody combines weekly group goals, proof review, and genuine peer-to-peer
payout to the friends who completed, with no custodian in the middle.

## What FocusBond changes

| Concern | Streek / Forfeit / Nudge | FocusBond |
| --- | --- | --- |
| Who holds the money | The company, via Stripe or a card hold | A smart contract, in escrow |
| Who receives a forfeit | The company (Streek, Forfeit) or a charity | The friends who completed, split evenly |
| House cut | Yes, that is the business model | None. Every settlement path drains the escrow to members |
| Rules | Terms of service plus a support inbox | Public bytecode, and `settle` is permissionless |
| Proof durability | A row in their database | A timestamped hash onchain, plus a signed referee verdict |
| Disputes | Email support and appeals | A bonded onchain challenge that a referee pass defeats |
| Auditability | Take their word for it | Every payout is a transaction you can open on the explorer |

The honest version of our claim: Venmo can request five dollars, and Stripe can
charge a card. Neither can escrow a group of friends, resolve a bonded dispute,
and split a forfeit among the people who showed up in a single atomic
settlement, with no company able to keep the money.
