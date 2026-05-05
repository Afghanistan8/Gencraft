# GENCRAFT — AI-Generated Questions Update

This update addresses the GenLayer Portal rejection feedback by moving question
generation from a hardcoded client-side bank into an Intelligent Contract.
Validators now generate every match's questions live using their LLMs, with
Optimistic Democracy reaching consensus on the final set.

## Why this satisfies the reviewer

The reviewer wrote:

> the browser quiz is running entirely client-side with 100+ hardcoded GenLayer
> questions. Unfortunately, for mini-games in the projects and milestones, we
> are looking for games that directly integrate AI and consensus in the core
> of their dynamics.

After this update:

- **No game can start without the contract executing.** When the host clicks
  Generate Questions, the contract's `generate_questions` function runs.
  Validators independently produce candidate question sets via their LLMs,
  and the Equivalence Principle resolves them into a single consensus set.
- **Every match is unique.** Questions are generated fresh per seed; no two
  games are the same.
- **AI consensus is visible to players.** The "AI Validators Convening" screen
  shows the validator nodes lighting up as they think and reaching agreement —
  the gameplay literally pauses on the consensus mechanism.
- **The hardcoded bank is now a fallback only**, used if testnet generation
  fails. The default path is contract-driven.

## File changes

| File | Change |
|---|---|
| `contracts/QuestionGenerator.py` | NEW — Intelligent Contract with `generate_questions`, `get_questions`, `submit_result`, leaderboard storage |
| `genlayer.js` | REWRITTEN — uses official `genlayer-js` SDK, exposes `generateQuestions` and related methods |
| `multiplayer.js` | UPDATED — host triggers contract on START, joiners fetch questions by seed |
| `index.html` | PATCHED — add topic picker page, validator-convening loading screen (see `index_patch.html`) |
| `game.js` | SMALL HOOK — accepts AI-generated questions via `window.startGameWithQuestions` |

## Deployment steps

### 1. Deploy the contract

1. Open https://studio.genlayer.com
2. Connect your wallet and switch to GenLayer Studio testnet (`studionet`)
3. Open `contracts/QuestionGenerator.py` in the Studio editor
4. Click Deploy. Pass no constructor args.
5. Copy the deployed contract address.

### 2. Update the frontend

1. In `genlayer.js`, replace `0xREPLACE_WITH_DEPLOYED_QUESTION_GENERATOR_ADDRESS`
   with the address from step 1.
2. In `index.html`, change `<script src="genlayer.js">` to
   `<script type="module" src="genlayer.js">` so the SDK ES imports work.
3. Apply the patches in `index_patch.html` to `index.html` (the file marks
   each step clearly).
4. Add the small wrappers in `game.js` shown at the bottom of `index_patch.html`
   under "PATCH STEP 5".

### 3. Test locally

1. Open the page, enter solo mode.
2. Pick a topic. Click Generate Questions.
3. The validator-convening screen appears for ~30-90 seconds.
4. Game starts with AI-generated questions.

If generation fails, the screen shows Retry / Use Hardcoded buttons.

### 4. Test multiplayer

1. Two browsers, two wallets.
2. Host creates room, joiner joins via room code.
3. Host clicks START, picks topic, clicks Generate Questions.
4. Both players see the convening animation.
5. Both players get the same AI-generated questions when it completes.

## Architecture decisions worth noting in the resubmission

**Why generation happens at match start, not per-question:** GenLayer
testnet transactions take 30-90 seconds to reach `ACCEPTED` consensus.
Doing this between every question would kill the gameplay loop. Doing it
once at match start lets us use the latency as a *feature* — the
"Validators Convening" screen is the player's window into what's happening
on-chain.

**Why we use `ACCEPTED` not `FINALIZED`:** `FINALIZED` waits for the appeal
window to close (~minutes). `ACCEPTED` means OD consensus has been reached,
which is sufficient to read the questions back and start the game.

**Why questions are stored on-chain by seed:** This makes the question set
auditable and reproducible. Anyone can verify that the questions a match
played were the ones validators agreed on. It also means joiners can fetch
the same set the host generated without needing the host to re-broadcast it
through Ably.

## What to write in the resubmission notes

Suggested text for the "Notes" field on the GenLayer Portal:

> GENCRAFT now uses an Intelligent Contract as the core of every match.
> When a host starts a game, the contract `QuestionGenerator.generate_questions`
> is called. Five LLM-equipped validators independently generate candidate
> question sets on the chosen topic, then the Equivalence Principle resolves
> them into a single consensus set via Optimistic Democracy. Players see
> this happen live on the "Validators Convening" screen. The hardcoded
> question bank is retained only as a fallback for testnet outages.
>
> Address of deployed contract on Studio testnet: 0x[your address]
>
> Try a match: pick a topic, watch the validators converge, play the
> AI-generated quiz. Each game produces a unique question set tied to the
> match seed and stored on-chain.

## Known limits / future work

- **Generation cost:** Each match start is one write transaction. Free on
  testnet; would need a fee model on mainnet.
- **Question quality varies with LLM:** A validator running a weaker model
  may produce thinner distractors. This is a feature of OD, not a bug —
  but worth noting if you see odd questions.
- **No Sybil protection on the leaderboard:** Anyone can submit a result.
  A future contract version could require the seed to be one the player
  actually generated, plus signed answers.
