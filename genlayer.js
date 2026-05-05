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
const CONTRACT_ADDRESS = '0x5c2e9A88a2b821EF54b9944396b56ea45df3e9BB';

// Studio testnet is the default chain for development. Swap to simulator if
// you're running everything locally.
const CHAIN = studionet;

// How many questions per match. Must match what the contract enforces (5-15).
const QUESTIONS_PER_MATCH = 10;

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

  // Wait for consensus. We use ACCEPTED rather than FINALIZED because
  // FINALIZED waits for the appeal window to close (~minutes), which is too
  // long for a game start. ACCEPTED means OD has converged.
  try {
    await Promise.race([
      c.waitForTransactionReceipt({
        hash: txHash,
        status: TransactionStatus.ACCEPTED,
        retries: 150,
        interval: 2000,  // poll every 2 s for up to 5 min
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Generation timed out')), GENERATION_TIMEOUT_MS)
      ),
    ]);
  } catch (err) {
    throw new Error(`Validator consensus failed: ${err.message || err}`);
  }

  onProgress('consensus_reached');

  // Read the consensus result.
  const questions = await getQuestionsBySeed(seed);
  if (!questions || questions.length === 0) {
    throw new Error('Contract accepted the transaction but returned no questions.');
  }

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

// ----------------------------------------------------------------------------
// Global wallet button shim
//
// The CONNECT WALLET button in index.html calls connectWallet() at the global
// scope. Since genlayer.js is now a module, that name isn't visible without
// this bridge. Also updates the button text on success/error.
// ----------------------------------------------------------------------------

function _updateWalletButton(text, ok) {
  const btn = document.getElementById('wallet-connect-btn');
  if (!btn) return;
  btn.textContent = text;
  if (ok) {
    btn.style.color = '#4ce0c5';
    btn.style.borderColor = '#4ce0c5';
  }
}

window.connectWallet = async function () {
  try {
    _updateWalletButton('CONNECTING…', false);
    const addr = await connectWallet();
    const short = addr.slice(0, 6) + '…' + addr.slice(-4);
    _updateWalletButton(short.toUpperCase(), true);
    console.log('[GL] Wallet connected:', addr);
    return addr;
  } catch (err) {
    console.error('[GL] Wallet connect failed:', err);
    _updateWalletButton('CONNECT WALLET', false);
    // Show a friendly hint for the most common case.
    const msg = err && err.message ? err.message : String(err);
    if (msg.includes('No wallet detected')) {
      alert('No wallet found. Install MetaMask or another EVM wallet, then refresh.');
    } else if (msg.includes('user rejected') || msg.includes('User rejected')) {
      // User clicked cancel — silent is fine.
    } else {
      alert('Wallet connect failed: ' + msg);
    }
    throw err;
  }
};

// Signal readiness so multiplayer.js / game.js can wait for us.
window.dispatchEvent(new Event('gl-ready'));
console.log('[GL] genlayer.js initialized; contract:', CONTRACT_ADDRESS);
