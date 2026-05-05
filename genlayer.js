// genlayer.js
// GenLayer integration: wallet connection, question generation, leaderboard submission.
//
// Uses the genlayer-js SDK loaded as an ES module from a CDN so we don't need
// a build step. This file exposes everything on `window.GL` for the rest of
// the (non-module) game code to use.
//
// IMPORTANT: this file must be loaded as <script type="module" src="genlayer.js">
// because of the import statement.

import {
  createClient,
  createAccount,
} from 'https://esm.sh/genlayer-js@latest';
import { studionet } from 'https://esm.sh/genlayer-js@latest/chains';
import { TransactionStatus } from 'https://esm.sh/genlayer-js@latest/types';

// ----------------------------------------------------------------------------
// Configuration
// ----------------------------------------------------------------------------

// REPLACE this with the address printed by the GenLayer Studio after deploying
// contracts/QuestionGenerator.py. The old leaderboard contract is no longer
// used — this single contract handles questions AND leaderboard.
const CONTRACT_ADDRESS = '0x45bFf3e67466d3CBf6f7b0c41cb4e630eC253f81';

// Studio testnet is the default chain for development. Swap to simulator if
// you're running everything locally.
const CHAIN = studionet;

// How many questions per match. Must match what the contract enforces (5-15).
const QUESTIONS_PER_MATCH = 5;  // smaller batch = much higher LLM JSON success rate

// How long we're willing to wait for question generation before giving up
// and offering the user a retry/fallback. Generation involves multiple
// validator LLM calls so this is intentionally generous.
const GENERATION_TIMEOUT_MS = 300_000;  // 5 minutes — validator LLMs can be slow on shared infra

// ----------------------------------------------------------------------------
// State
// ----------------------------------------------------------------------------

let client = null;          // genlayer-js client
let account = null;         // ephemeral account (used when no wallet connected)
let walletAddress = null;   // user's connected wallet address (if any)
let isInitializing = false;

// ----------------------------------------------------------------------------
// Client setup
// ----------------------------------------------------------------------------

async function ensureClient() {
  if (client) return client;
  if (isInitializing) {
    // Another caller is already setting up; wait for them.
    while (isInitializing) await new Promise(r => setTimeout(r, 50));
    return client;
  }
  isInitializing = true;
  try {
    if (walletAddress) {
      // MetaMask / injected wallet handles signing.
      client = createClient({ chain: CHAIN, account: walletAddress });
    } else {
      // No wallet — create an ephemeral signing account so reads/writes still work.
      // For competitive leaderboard play the user should connect a wallet,
      // but solo play and question generation can proceed anonymously.
      account = createAccount();
      client = createClient({ chain: CHAIN, account });
    }
    // Initialize GenLayer's consensus contract bindings (required before writes).
    if (typeof client.initializeConsensusSmartContract === 'function') {
      await client.initializeConsensusSmartContract();
    }
    return client;
  } finally {
    isInitializing = false;
  }
}

// ----------------------------------------------------------------------------
// Wallet connection (kept compatible with the existing UI)
// ----------------------------------------------------------------------------

async function connectWallet() {
  // Detect injected wallet (MetaMask, Coinbase, etc.).
  if (typeof window.ethereum === 'undefined') {
    throw new Error('No wallet detected. Install MetaMask or use the manual address option.');
  }
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  if (!accounts || accounts.length === 0) {
    throw new Error('Wallet returned no accounts.');
  }
  walletAddress = accounts[0];
  // Force client rebuild with the wallet address.
  client = null;
  await ensureClient();
  return walletAddress;
}

function setManualAddress(addr) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) {
    throw new Error('Invalid Ethereum address format.');
  }
  walletAddress = addr;
  client = null;  // force rebuild
}

function getAddress() {
  return walletAddress || (account && account.address) || null;
}

// ----------------------------------------------------------------------------
// Question generation — the core integration
// ----------------------------------------------------------------------------

/**
 * Trigger the Intelligent Contract to generate a question set for this match.
 * Idempotent on the contract side — multiple players can call this safely;
 * only the first call actually runs the LLMs.
 *
 * @param {string} seed - Match seed (room id + start timestamp works well).
 * @param {string} topic - One of: genlayer, web3, consensus, ai, mixed.
 * @param {(stage:string)=>void} onProgress - UI callback for the loading screen.
 * @returns {Promise<Array>} parsed question array
 */
async function generateQuestions(seed, topic, onProgress = () => {}) {
  const c = await ensureClient();
  onProgress('connecting');

  // Fast path: if questions already exist for this seed (e.g. host triggered
  // generation and a joiner is fetching), skip the write transaction.
  const existing = await getQuestionsBySeed(seed);
  if (existing && existing.length > 0) {
    onProgress('ready');
    return existing;
  }

  onProgress('summoning_validators');

  // Submit the write transaction. This is the call that spins up the validator
  // LLMs and runs Optimistic Democracy.
  let txHash;
  try {
    txHash = await c.writeContract({
      address: CONTRACT_ADDRESS,
      functionName: 'generate_questions',
      args: [seed, topic, QUESTIONS_PER_MATCH],
      value: 0n,
    });
  } catch (err) {
    throw new Error(`Failed to submit generation transaction: ${err.message || err}`);
  }

  onProgress('validators_thinking');

  // Strategy: instead of waiting for a transaction RECEIPT (which is flaky
  // on Studio's RPC — often returns "not found" even after success), we poll
  // the contract's STATE directly via getQuestionsBySeed. Once the leader's
  // result has been stored, the questions become readable. This bypasses
  // the receipt mechanism entirely.
  //
  // The contract is idempotent — `if seed in self.questions_by_seed: return`
  // — so repeated polls are safe and cheap.
  const startedAt = Date.now();
  let pollAttempt = 0;
  let questions = null;

  while (true) {
    pollAttempt++;
    const elapsed = Date.now() - startedAt;

    if (elapsed > GENERATION_TIMEOUT_MS) {
      throw new Error(
        `Generation timed out after ${Math.round(elapsed / 1000)}s. ` +
        `The transaction may still finalize on-chain — check the explorer at ` +
        `https://explorer-studio.genlayer.com/address/${CONTRACT_ADDRESS}`
      );
    }

    try {
      const fetched = await getQuestionsBySeed(seed);
      if (fetched && fetched.length > 0) {
        questions = fetched;
        console.log(
          `[GL] Questions ready after ${Math.round(elapsed / 1000)}s ` +
          `(${pollAttempt} poll(s)).`
        );
        break;
      }
    } catch (err) {
      // Silent — getQuestionsBySeed already logs warnings, and a transient
      // read failure shouldn't kill the whole generation.
    }

    // Update UI roughly every 10s so the user sees progress.
    if (pollAttempt % 5 === 1 && pollAttempt > 1) {
      console.log(`[GL] Still waiting for consensus (${Math.round(elapsed / 1000)}s elapsed)...`);
    }

    // Wait 2 seconds before polling again.
    await new Promise(r => setTimeout(r, 2000));
  }

  onProgress('consensus_reached');

  onProgress('ready');
  return questions;
}

async function getQuestionsBySeed(seed) {
  const c = await ensureClient();
  try {
    const raw = await c.readContract({
      address: CONTRACT_ADDRESS,
      functionName: 'get_questions',
      args: [seed],
      stateStatus: 'accepted',
    });
    if (!raw || typeof raw !== 'string' || raw.length === 0) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[GL] get_questions read failed:', err);
    return [];
  }
}

// ----------------------------------------------------------------------------
// Leaderboard
// ----------------------------------------------------------------------------

async function submitResult(name, xp, seed, topic) {
  const c = await ensureClient();
  const txHash = await c.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: 'submit_result',
    args: [name, xp, seed, topic],
    value: 0n,
  });
  // Don't block the UI on FINALIZED — fire and let the user move on.
  c.waitForTransactionReceipt({
    hash: txHash,
    status: TransactionStatus.ACCEPTED,
    retries: 30,
    interval: 2000,
  }).catch(err => console.warn('[GL] submitResult receipt error:', err));
  return txHash;
}

async function getRecentResults() {
  const c = await ensureClient();
  try {
    const raw = await c.readContract({
      address: CONTRACT_ADDRESS,
      functionName: 'get_recent_results',
      args: [],
      stateStatus: 'accepted',
    });
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.warn('[GL] get_recent_results failed:', err);
    return [];
  }
}

// ----------------------------------------------------------------------------
// Expose to non-module game code
// ----------------------------------------------------------------------------

window.GL = {
  connectWallet,
  setManualAddress,
  getAddress,
  generateQuestions,
  getQuestionsBySeed,
  submitResult,
  getRecentResults,
  CONTRACT_ADDRESS,
  QUESTIONS_PER_MATCH,
};

// Signal readiness so multiplayer.js / game.js can wait for us.
window.dispatchEvent(new Event('gl-ready'));
console.log('[GL] genlayer.js initialized; contract:', CONTRACT_ADDRESS);
