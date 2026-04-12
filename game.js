/* ════════════════════════════════════════
   GENCRAFT — GAME.JS  (Updated Edition)
   New in this version:
   1. 100+ GenLayer questions (was 62)
   2. Sound effects via Web Audio API
   3. Animated XP counter
   4. Shareable result card (downloads as PNG)
════════════════════════════════════════ */


/* ════════════════════════════════════════
   SECTION 1 — ALL QUESTIONS (100+)
════════════════════════════════════════ */

const QUESTIONS = [

  /* ─── BASICS ─── */
  { cat:'BASICS', q:'What is GenLayer?', opts:['A centralised AI company','An AI-native blockchain with Intelligent Contracts','A Layer 2 scaling solution for Bitcoin','A DeFi lending protocol'], ans:1, exp:'GenLayer is an AI-native blockchain introducing Intelligent Contracts — AI-powered smart contracts connected to the internet.' },
  { cat:'BASICS', q:'Which programming language are Intelligent Contracts written in?', opts:['Solidity','Rust','Python','JavaScript'], ans:2, exp:'GenLayer uses Python, making it far more accessible than Solidity-based blockchains.' },
  { cat:'BASICS', q:'What does GenLayer deliver beyond Bitcoin and Ethereum?', opts:['Faster transactions','Trustless decision-making','Lower fees','Better privacy'], ans:1, exp:'Bitcoin = trustless money. Ethereum = trustless computation. GenLayer = trustless decision-making.' },
  { cat:'BASICS', q:'How much did GenLayer raise in its seed round?', opts:['$2M','$5M','$7.5M','$15M'], ans:2, exp:'GenLayer raised $7.5M led by North Island Ventures with Arrington Capital and Arthur Hayes\' Maelstrom.' },
  { cat:'BASICS', q:'What problem do traditional smart contracts have with real-world data?', opts:['Too slow','Need external oracles and cannot natively access the internet','Too expensive','Cannot handle tokens'], ans:1, exp:'Traditional blockchains are isolated — they need external oracles to access real-world data.' },
  { cat:'BASICS', q:'What licence is GenLayer released under?', opts:['Apache 2.0','GPL-3.0','MIT','Proprietary'], ans:2, exp:'GenLayer is MIT licensed — fully open source.' },
  { cat:'BASICS', q:'How does GenLayer describe its core role?', opts:['Fastest chain for AI','A synthetic jurisdiction and AI-native trust layer on-chain','Cheapest AI platform','A proof-of-work miner'], ans:1, exp:'GenLayer is a synthetic jurisdiction — a decentralised digital court that resolves disputes via AI validators.' },
  { cat:'BASICS', q:'Which investor\'s family office backed GenLayer?', opts:['Vitalik Buterin','Sam Altman','Arthur Hayes','CZ Binance'], ans:2, exp:'Arthur Hayes\' Maelstrom family office backed GenLayer.' },
  { cat:'BASICS', q:'What is the name of GenLayer\'s native smart contract format?', opts:['Smart Agreements','Intelligent Contracts','AI Protocols','Chain Contracts'], ans:1, exp:'GenLayer calls its AI-powered contracts Intelligent Contracts — a step beyond traditional smart contracts.' },
  { cat:'BASICS', q:'Which blockchain did GenLayer take most inspiration from for smart contracts?', opts:['Bitcoin','Solana','Ethereum','Cardano'], ans:2, exp:'Ethereum pioneered smart contracts and GenLayer builds on that foundation, adding AI capabilities on top.' },
  { cat:'BASICS', q:'What does GenLayer say most new blockchain dApps are?', opts:['Revolutionary','Forks or incremental improvements','Completely original','Government approved'], ans:1, exp:'GenLayer observes that most new dApps are forks because traditional smart contracts cannot handle real-world complexity.' },
  { cat:'BASICS', q:'What is the missing primitive for autonomous commerce according to GenLayer?', opts:['Trustless money','Trustless computation','Trustless decision-making','Trustless identity'], ans:2, exp:'GenLayer delivers trustless decision-making — the missing primitive for autonomous commerce, governance and dispute resolution.' },
  { cat:'BASICS', q:'How does GenLayer position itself relative to Layer 2 blockchains?', opts:['It is a Layer 2','It is a Layer 1 with AI-native capabilities','It is a sidechain','It is an off-chain solution'], ans:1, exp:'GenLayer is a Layer 1 blockchain with AI-native capabilities built directly into its core.' },
  { cat:'BASICS', q:'What does GenLayer replace in the traditional blockchain stack?', opts:['The wallet layer','Traditional deterministic smart contracts with AI-powered Intelligent Contracts','The token standard','The mining algorithm'], ans:1, exp:'GenLayer replaces deterministic smart contracts with Intelligent Contracts that can reason, interpret and fetch real-world data.' },

  /* ─── CONSENSUS ─── */
  { cat:'CONSENSUS', q:'What is GenLayer\'s consensus mechanism called?', opts:['Proof of Stake','Proof of Work','Optimistic Democracy','Delegated Authority'], ans:2, exp:'Optimistic Democracy enables trustless decisions on subjective real-world data using AI validators.' },
  { cat:'CONSENSUS', q:'How many validators are selected per transaction initially?', opts:['3','5','7','10'], ans:1, exp:'5 validators each connected to a different LLM process each transaction in the initial round.' },
  { cat:'CONSENSUS', q:'What happens when validators disagree?', opts:['Transaction rejected','An appeal window opens and validator set can double','Leader wins','Returns to sender'], ans:1, exp:'Disagreement opens an appeal window — participants post a bond to double the validator set.' },
  { cat:'CONSENSUS', q:'What must you post to trigger an appeal?', opts:['Flat fee','A bond','Governance tokens','Wait 24 hours'], ans:1, exp:'Posting a bond triggers an appeal doubling the validator set. A successful appeal returns the bond.' },
  { cat:'CONSENSUS', q:'What staking model does GenLayer use?', opts:['Nominated PoS','Liquid PoS','Delegated Proof of Stake (dPOS)','Pure PoS'], ans:2, exp:'GenLayer uses delegated Proof-of-Stake where validators are randomly selected subsets.' },
  { cat:'CONSENSUS', q:'Why is Optimistic Democracy needed?', opts:['Traditional consensus is slow','Blockchains are deterministic and cannot handle AI non-deterministic outputs','Uses less energy','More centralised'], ans:1, exp:'AI models produce varied outputs for the same input. Optimistic Democracy handles this through validator voting.' },
  { cat:'CONSENSUS', q:'What is the Equivalence Principle?', opts:['Validators must produce identical outputs','Validators vote on whether outputs are equivalent enough — not identical','All tokens must equal value','Contracts must be identical to Solidity'], ans:1, exp:'The Equivalence Principle allows for AI\'s natural variation — outputs just need to be close enough.' },
  { cat:'CONSENSUS', q:'What does the leader validator do in a transaction round?', opts:['Earns double rewards','Proposes the output which others vote to accept or reject','Is permanently selected','Pays a fee'], ans:1, exp:'The leader proposes the output. The other four validators independently compare against their own results and vote.' },
  { cat:'CONSENSUS', q:'What is the maximum validator set size after a full appeal?', opts:['5','7','10','20'], ans:2, exp:'After an appeal the validator set doubles from 5 to 10, bringing more perspectives to the contested decision.' },
  { cat:'CONSENSUS', q:'What connects each validator to their computation source?', opts:['A GPU cluster','A different LLM','A centralised API','A trusted hardware module'], ans:1, exp:'Each of the 5 validators is connected to a different LLM — ensuring diverse independent perspectives on every transaction.' },
  { cat:'CONSENSUS', q:'What does Optimistic Democracy bridge?', opts:['Speed and security','Blockchain determinism and real-world complexity','Privacy and transparency','Centralisation and decentralisation'], ans:1, exp:'Optimistic Democracy bridges the gap between blockchain determinism and the complexity of intelligent real-time decision-making.' },
  { cat:'CONSENSUS', q:'How are validators selected in Optimistic Democracy?', opts:['By stake size only','By reputation score','Randomly from the staking pool','By community vote'], ans:2, exp:'Validators are randomly selected subsets from the delegated Proof-of-Stake pool — preventing centralisation.' },
  { cat:'CONSENSUS', q:'What does a validator do if they disagree with the leader\'s output?', opts:['Accept it anyway','Vote to reject it','Leave the network','Post a complaint on-chain'], ans:1, exp:'Validators independently evaluate the output and vote to reject if it does not match their own result — triggering re-evaluation.' },

  /* ─── INTELLIGENT CONTRACTS ─── */
  { cat:'INTELLIGENT CONTRACTS', q:'What can Intelligent Contracts do that traditional ones cannot?', opts:['Execute transfers faster','Fetch live internet data without oracles','Process cheaper transactions','Store more data'], ans:1, exp:'Intelligent Contracts fetch live web data directly on-chain — no external oracles required.' },
  { cat:'INTELLIGENT CONTRACTS', q:'What type of language can Intelligent Contracts interpret?', opts:['Only Solidity','Only formal code','Natural language instructions','Only binary'], ans:2, exp:'Intelligent Contracts interpret natural language — contracts can be written in plain English.' },
  { cat:'INTELLIGENT CONTRACTS', q:'How fast can GenLayer resolve prediction markets?', opts:['24 hours','Under 1 hour','1 week','Instantly'], ans:1, exp:'GenLayer resolves markets in under 1 hour at less than $1 per market.' },
  { cat:'INTELLIGENT CONTRACTS', q:'What is Greyboxing in GenLayer?', opts:['A privacy feature','A security mechanism against adversarial AI attacks','A token burn mechanism','A bridge protocol'], ans:1, exp:'Greyboxing mitigates adversarial attacks on AI models within the multi-validator system.' },
  { cat:'INTELLIGENT CONTRACTS', q:'What does GenLayer\'s Intelligent Oracle do?', opts:['Provides randomness','Reads and reasons with live web data trustlessly','Connects to Chainlink','Manages bridges'], ans:1, exp:'Intelligent Oracles let dApps read and reason with live web data trustlessly.' },
  { cat:'INTELLIGENT CONTRACTS', q:'What replaces external oracles in GenLayer?', opts:['Chainlink feeds','Centralised APIs','Intelligent Contracts with built-in web access','Human reporters'], ans:2, exp:'Intelligent Contracts eliminate the need for external oracles by fetching and verifying live data directly on-chain.' },
  { cat:'INTELLIGENT CONTRACTS', q:'What types of data can Intelligent Contracts process?', opts:['Only numerical data','Only on-chain data','Text, images, and qualitative evidence','Only tokenised assets'], ans:2, exp:'Intelligent Contracts process text, images, qualitative evidence, and unstructured data — far beyond traditional contracts.' },
  { cat:'INTELLIGENT CONTRACTS', q:'How much does GenLayer charge per market resolution?', opts:['$10','$5','Under $1','$0.001'], ans:2, exp:'Market resolutions cost under $1 on GenLayer — making them economically viable at scale.' },
  { cat:'INTELLIGENT CONTRACTS', q:'What type of operations can Intelligent Contracts handle that traditional ones cannot?', opts:['Only deterministic operations','Only financial operations','Non-deterministic operations and real-world complexity','Only on-chain data operations'], ans:2, exp:'Intelligent Contracts handle non-deterministic operations — they respond to varied real-world inputs unlike traditional contracts.' },
  { cat:'INTELLIGENT CONTRACTS', q:'What does multimodality mean for future Intelligent Contracts?', opts:['They process multiple currencies','They can work with images, audio and video alongside text','They run on multiple blockchains','They serve multiple users simultaneously'], ans:1, exp:'GenLayer plans to integrate full multimodality — enabling validators to work with images, audio, and video alongside text.' },
  { cat:'INTELLIGENT CONTRACTS', q:'What ambiguous clause can an Intelligent Contract interpret?', opts:['Only numeric conditions','Legal terms like force majeure or reasonable effort','Only token transfer conditions','Only time-based conditions'], ans:1, exp:'AI consensus interprets ambiguous legal terms like force majeure, turning subjective language into deterministic execution.' },
  { cat:'INTELLIGENT CONTRACTS', q:'What can an Intelligent Contract monitor for DeFi security?', opts:['Only on-chain events','Crypto news sites and real-time data feeds to detect attacks','Only price feeds','Only governance votes'], ans:1, exp:'An Intelligent Contract can monitor crypto news sites to detect when a protocol is under attack and trigger emergency shutdown.' },

  /* ─── USE CASES ─── */
  { cat:'USE CASES', q:'How can GenLayer automate insurance payouts?', opts:['Automating premiums only','Triggering payouts when AI verifies real-world events','Tokenising policies','Via APIs'], ans:1, exp:'Intelligent Contracts monitor web data like drought alerts and trigger payouts automatically.' },
  { cat:'USE CASES', q:'What commercial dispute role can GenLayer play?', opts:['Small claims only','Decentralised AI arbitration for commercial contracts','Government body','International trade only'], ans:1, exp:'GenLayer provides decentralised AI arbitration removing cost, delay and bias.' },
  { cat:'USE CASES', q:'How does GenLayer handle terms like force majeure?', opts:['Rejects them','AI consensus converts subjective language into deterministic execution','Sends to humans','Flags for legal review'], ans:1, exp:'AI consensus interprets ambiguous legal terms turning subjective language into enforceable outcomes.' },
  { cat:'USE CASES', q:'What makes GenLayer ideal for AI agent commerce?', opts:['Token price stability','A neutral trustless environment for AI agents to transact','Ethereum compatibility','Fast block times'], ans:1, exp:'GenLayer is purpose-built for AI agent commerce — agents can transact with humans and other agents.' },
  { cat:'USE CASES', q:'What DAO governance does GenLayer unlock?', opts:['Standard token-voting only','AI-powered DAOs that autonomously evaluate proposals against a constitution','DAOs with human arbitrators','PoW DAOs'], ans:1, exp:'GenLayer enables AI-powered DAOs where proposals are automatically checked against a constitutional framework.' },
  { cat:'USE CASES', q:'What can an Intelligent Contract do for a freelancer dispute?', opts:['Nothing — legal disputes need humans','Evaluate submitted work quality and release payment based on AI verdict','Only transfer the payment','Only log the dispute'], ans:1, exp:'An Intelligent Contract can evaluate submitted work against natural language criteria and execute payment automatically.' },
  { cat:'USE CASES', q:'How could GenLayer detect a drought for insurance purposes?', opts:['By checking satellite imagery only','By fetching live web data from weather services and news sources','By querying government APIs only','By asking validators manually'], ans:1, exp:'An Intelligent Contract monitors publicly available web data including weather services and news to verify real-world conditions.' },
  { cat:'USE CASES', q:'What kind of oracle can GenLayer build that existing oracles cannot?', opts:['Price feed oracles only','Oracles that answer any question with a publicly available web answer','Weather data oracles only','Random number generators'], ans:1, exp:'Unlike traditional oracles limited to predefined datasets, GenLayer can build oracles that answer almost any question.' },
  { cat:'USE CASES', q:'How can GenLayer be used for on-chain identity verification?', opts:['Only via government APIs','AI verifies identity using web data and qualitative evidence','Only via social media','Only via token ownership'], ans:1, exp:'Intelligent Contracts can verify identity using web data and qualitative evidence enabling robust on-chain verification.' },
  { cat:'USE CASES', q:'What is unique about GenLayer\'s prediction market resolution?', opts:['They use off-chain settlement','AI resolves outcomes using real-world data in under 1 hour at under $1','They require human reporters','They only work for crypto prices'], ans:1, exp:'GenLayer resolves prediction markets in under 1 hour at under $1 using AI to verify outcomes directly from the web.' },
  { cat:'USE CASES', q:'How can GenLayer help content creator royalty distribution?', opts:['NFT minting only','Royalty contracts that automatically verify usage and pay creators based on real engagement','Social media integration','Video streaming'], ans:1, exp:'Intelligent Contracts can monitor web data to verify content usage and automatically distribute royalties without intermediaries.' },
  { cat:'USE CASES', q:'How can GenLayer improve supply chain management?', opts:['Only by tracking tokens','By fetching real-world shipping data and verifying delivery conditions autonomously','Only by connecting to existing ERP systems','By requiring manual confirmation'], ans:1, exp:'Intelligent Contracts can fetch real-world logistics data and verify delivery conditions, automating complex supply chain agreements.' },

  /* ─── TECHNICAL ─── */
  { cat:'TECHNICAL', q:'What are GenLayer\'s two core blockchain components?', opts:['Mining and Validation Layers','Consensus Layer and Virtual Machine','Storage and Execution Layers','Network and Application Layers'], ans:1, exp:'GenLayer has a Consensus Layer (Optimistic Democracy) and a Virtual Machine that executes Intelligent Contracts.' },
  { cat:'TECHNICAL', q:'What is GenLayer Studio?', opts:['Mobile wallet','Browser-based IDE for Intelligent Contracts','Block explorer','Hardware wallet'], ans:1, exp:'GenLayer Studio is the web-based IDE for writing, testing and deploying Intelligent Contracts.' },
  { cat:'TECHNICAL', q:'What is GenLayer\'s JavaScript SDK called?', opts:['genlayer-web3','genlayer-js','gen-sdk','layer-client'], ans:1, exp:'genlayer-js is the JavaScript SDK for interacting with Intelligent Contracts from web apps.' },
  { cat:'TECHNICAL', q:'What partner supplies GPU compute for validators?', opts:['AWS','Google Cloud','io.net','Nvidia'], ans:2, exp:'io.net provides on-demand geo-distributed GPU compute for GenLayer validators.' },
  { cat:'TECHNICAL', q:'What privacy tech does Atoma Network bring?', opts:['Zero-knowledge proofs','Trusted Execution Environments (TEEs) for private AI inference','Homomorphic encryption','Secure MPC'], ans:1, exp:'Atoma uses TEEs to isolate data during AI processing providing verifiable end-to-end privacy.' },
  { cat:'TECHNICAL', q:'What is Testnet Bradbury?', opts:['GenLayer\'s mainnet','A testing environment for AI consensus and model routing','A competitor project','A governance proposal'], ans:1, exp:'Testnet Bradbury is GenLayer\'s testing environment — a scholar\'s gym where developers test AI consensus and model routing.' },
  { cat:'TECHNICAL', q:'What makes GenLayer non-deterministic compared to traditional blockchains?', opts:['It uses random number generators','Intelligent Contracts use AI reasoning which produces varied outputs','It uses proof-of-work mining','It relies on human validator votes'], ans:1, exp:'AI models can produce varied outputs for the same input — making GenLayer non-deterministic by nature.' },
  { cat:'TECHNICAL', q:'What is model routing in GenLayer?', opts:['Routing transactions to the cheapest network','Directing contract execution to the most appropriate AI model','Load balancing between servers','Selecting validators by stake only'], ans:1, exp:'Model routing directs each Intelligent Contract execution to the most suitable AI model for the task.' },
  { cat:'TECHNICAL', q:'How many open-source AI models can validators access via io.net?', opts:['5','15','30','100'], ans:2, exp:'Through io.net validators can access 30 open-source models across thousands of GPUs.' },
  { cat:'TECHNICAL', q:'What cross-chain service does GenLayer support?', opts:['Bridge to Bitcoin only','LayerZero for inter-blockchain communication','Wormhole for Solana only','Polkadot parachains only'], ans:1, exp:'GenLayer supports cross-chain communication via LayerZero — meaning its data can be used by any connected blockchain.' },
  { cat:'TECHNICAL', q:'What does GenLayer\'s Virtual Machine execute?', opts:['Solidity bytecode only','Python-based Intelligent Contracts with AI capabilities','EVM-compatible transactions only','WebAssembly modules'], ans:1, exp:'The GenLayer Virtual Machine executes Python-based Intelligent Contracts supporting AI reasoning and web access natively.' },
  { cat:'TECHNICAL', q:'What security mechanism does GenLayer use against AI manipulation?', opts:['Traditional audits only','Greyboxing — a multi-validator security layer against adversarial AI attacks','Bug bounties only','Centralised monitoring'], ans:1, exp:'Greyboxing distributes validation across multiple AI models reducing vulnerability to adversarial manipulation of any single model.' },
  { cat:'TECHNICAL', q:'What does genlayer-js allow developers to build?', opts:['Mobile apps only','Web applications that interact directly with Intelligent Contracts','Smart contracts in JavaScript','Solidity compiler tools'], ans:1, exp:'genlayer-js lets frontend developers build web applications that interact directly with GenLayer Intelligent Contracts.' },

  /* ─── ECOSYSTEM ─── */
  { cat:'ECOSYSTEM', q:'What does the GenLayer–Atoma partnership enable?', opts:['Faster blocks','Privacy-first Intelligent Contracts resolving disputes confidentially','Cheaper gas','Better NFTs'], ans:1, exp:'The partnership enables privacy-first Intelligent Contracts resolving disputes with full data privacy.' },
  { cat:'ECOSYSTEM', q:'What AI economy value does GenLayer reference by 2030?', opts:['$500B','$1T','$2.6T','$10T'], ans:2, exp:'GenLayer references a $2.6 trillion AI-driven economy by 2030.' },
  { cat:'ECOSYSTEM', q:'What does the Gaia partnership bring to GenLayer?', opts:['More validators','Decentralised AI inference with on-chain arbitration at the edge','Cheaper storage','Better UX tooling'], ans:1, exp:'The GenLayer-Gaia integration enables decentralised AI inference with on-chain arbitration at the network edge.' },
  { cat:'ECOSYSTEM', q:'What does GenLayer say about the current crypto ecosystem?', opts:['Growing fast','Most dApps are forks due to smart contract limitations','Maturing','Overcrowded'], ans:1, exp:'GenLayer observes blockchain stagnation — most dApps are forks because smart contracts cannot handle real-world complexity.' },
  { cat:'ECOSYSTEM', q:'Who led GenLayer\'s seed funding round?', opts:['Andreessen Horowitz','North Island Ventures','Binance Labs','Coinbase Ventures'], ans:1, exp:'North Island Ventures led GenLayer\'s $7.5M seed round.' },
  { cat:'ECOSYSTEM', q:'What does GenLayer identify as improbable for AI agents to rely on?', opts:['Blockchain technology','The traditional legal system and trusting centralised third parties for data','Decentralised networks','Token-based economies'], ans:1, exp:'GenLayer argues it is improbable that AI agents will use the slow expensive human-built legal system or trust centralised data providers.' },
  { cat:'ECOSYSTEM', q:'What is the projected value of AI-driven commerce by 2030?', opts:['$500 billion','$1 trillion','$2.6 trillion','$10 trillion'], ans:2, exp:'GenLayer positions itself as trust infrastructure for the $2.6 trillion AI-driven economy projected by 2030.' },
  { cat:'ECOSYSTEM', q:'What does GenLayer offer developers building on its platform?', opts:['Only documentation','Developer support programs, testnets, and a lively ecosystem','Hardware subsidies','Government grants'], ans:1, exp:'GenLayer provides developer support programs, testnets, education initiatives, and ecosystem funding for builders.' },
  { cat:'ECOSYSTEM', q:'What partner provides private AI inference for GenLayer validators?', opts:['OpenAI','Atoma Network via TEEs','Anthropic','Google DeepMind'], ans:1, exp:'Atoma Network provides private AI inference using Trusted Execution Environments ensuring data privacy during contract execution.' },
  { cat:'ECOSYSTEM', q:'What kind of applications does GenLayer enable that were previously impossible?', opts:['Only faster token transfers','Applications that interpret events, evaluate evidence and adapt to changing conditions trustlessly','Only better UX for existing dApps','Only cheaper transactions'], ans:1, exp:'GenLayer enables apps that interpret real-world events, evaluate qualitative evidence, and adapt — impossible on deterministic blockchains.' },
  { cat:'ECOSYSTEM', q:'What does GenLayer call itself relative to AI agents needs?', opts:['The fastest network for AI','The perfect neutral ground for AI agents to conduct business','The cheapest AI execution layer','The most secure AI ledger'], ans:1, exp:'GenLayer is built from the ground up to be the perfect place for AI Agents to conduct business — transacting and contracting trustlessly.' },
  { cat:'ECOSYSTEM', q:'Which other investors participated in GenLayer\'s seed round?', opts:['Sequoia and a16z','Arrington Capital, Node Capital and TykheBlock','Tiger Global and Paradigm','Multicoin and Pantera'], ans:1, exp:'Arrington Capital, Node Capital, TykheBlock, ZK Ventures and others participated alongside lead investor North Island Ventures.' },
];

/* ─── BLUFF QUESTIONS ─── */
const BLUFFS = [
  { cat:'BLUFF ROUND', q:'One of these GenLayer statements is FABRICATED. Which one?', opts:['GenLayer uses Python for Intelligent Contracts','Optimistic Democracy selects 5 validators per transaction','GenLayer requires miners to solve hash puzzles to validate AI outputs','Intelligent Contracts fetch live web data without oracles'], bluff:2, exp:'GenLayer does NOT use proof-of-work mining. It uses Optimistic Democracy with AI validators.' },
  { cat:'BLUFF ROUND', q:'SPOT THE BLUFF — one of these facts is invented.', opts:['GenLayer raised $7.5M in its seed round','Arthur Hayes\' Maelstrom backed GenLayer','GenLayer uses Go for Intelligent Contracts','GenLayer is MIT licensed'], bluff:2, exp:'Intelligent Contracts are written in Python, not Go.' },
  { cat:'BLUFF ROUND', q:'One of these Optimistic Democracy facts is a LIE.', opts:['Validators double in an appeal round','A bond triggers an appeal','OD requires 51% of all token holders to vote','Each validator uses a different LLM'], bluff:2, exp:'Optimistic Democracy uses 5 randomly selected validators — NOT 51% of all token holders.' },
  { cat:'BLUFF ROUND', q:'Which Intelligent Contract claim is FABRICATED?', opts:['They process natural language','They eliminate external oracles','They are limited to on-chain data only','They resolve markets in under 1 hour'], bluff:2, exp:'The opposite is true — Intelligent Contracts specifically access off-chain real-world web data.' },
  { cat:'BLUFF ROUND', q:'One of these GenLayer ecosystem facts is completely MADE UP. Find it.', opts:['GenLayer partnered with io.net for GPU compute','Atoma Network brings TEE-based private inference to GenLayer','GenLayer acquired Chainlink to replace its oracle infrastructure','GenLayer partnered with Gaia for edge AI execution'], bluff:2, exp:'GenLayer did NOT acquire Chainlink. It replaced the need for oracles entirely with Intelligent Contracts.' },
  { cat:'BLUFF ROUND', q:'SPOT THE BLUFF — one use case description is fabricated.', opts:['GenLayer can automate insurance payouts using web data verification','GenLayer can power AI-driven DAOs with constitutional enforcement','GenLayer can replace all traditional financial audits with zero human involvement','GenLayer can resolve commercial disputes via decentralised AI arbitration'], bluff:2, exp:'GenLayer does not claim to replace ALL financial audits with zero human involvement — that is an overstatement invented for this bluff.' },
  { cat:'BLUFF ROUND', q:'Which of these technical GenLayer facts is INVENTED?', opts:['GenLayer\'s Virtual Machine executes Python-based contracts','GenLayer supports cross-chain communication via LayerZero','GenLayer stores all Intelligent Contract outputs permanently on IPFS','GenLayer uses model routing to direct tasks to optimal AI models'], bluff:2, exp:'GenLayer does not use IPFS for Intelligent Contract output storage — this detail was fabricated.' },
  { cat:'BLUFF ROUND', q:'One of these Intelligent Contract capabilities is FAKE. Which one?', opts:['They can interpret natural language contract terms','They can fetch live web data without external oracles','They can automatically rewrite themselves when market conditions change','They can evaluate qualitative evidence like images and documents'], bluff:2, exp:'Intelligent Contracts do not automatically rewrite themselves — they execute based on their original logic, just with AI reasoning.' },
];

/* ─── OD FINALE CLAIMS ─── */
const OD_CLAIMS = [
  { text:'GenLayer\'s Optimistic Democracy uses 5 AI validators in the initial round', ans:true },
  { text:'Intelligent Contracts on GenLayer require external oracles to fetch web data', ans:false },
  { text:'GenLayer allows smart contracts to be written in Python rather than Solidity', ans:true },
  { text:'GenLayer\'s appeal mechanism reduces the validator set when a transaction is disputed', ans:false },
  { text:'GenLayer raised $7.5 million in its seed funding round', ans:true },
  { text:'Optimistic Democracy requires 51% of token holders to reach a decision', ans:false },
  { text:'GenLayer partnered with io.net to supply decentralised GPU compute for validators', ans:true },
  { text:'GenLayer Intelligent Contracts can only process numerical on-chain data', ans:false },
  { text:'GenLayer is MIT licensed and fully open source', ans:true },
  { text:'GenLayer uses proof-of-work mining to validate Intelligent Contracts', ans:false },
];


/* ════════════════════════════════════════
   SECTION 2 — SOUND EFFECTS ENGINE
   Uses Web Audio API — no external files needed
════════════════════════════════════════ */

let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}

function playSound(type) {
  try {
    const ctx = getAudioContext();

    if (type === 'correct') {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'square';
      osc.frequency.setValueAtTime(523, ctx.currentTime);
      osc.frequency.setValueAtTime(659, ctx.currentTime + 0.08);
      osc.frequency.setValueAtTime(784, ctx.currentTime + 0.16);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);
    }

    if (type === 'wrong') {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(200, ctx.currentTime);
      osc.frequency.setValueAtTime(150, ctx.currentTime + 0.1);
      osc.frequency.setValueAtTime(100, ctx.currentTime + 0.2);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.4);
    }

    if (type === 'bluff') {
      [0, 0.1, 0.2, 0.35].forEach((time, i) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'square';
        osc.frequency.setValueAtTime([392,523,659,784][i], ctx.currentTime + time);
        gain.gain.setValueAtTime(0.12, ctx.currentTime + time);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + time + 0.15);
        osc.start(ctx.currentTime + time); osc.stop(ctx.currentTime + time + 0.15);
      });
    }

    if (type === 'xp') {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.05);
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.2);
    }

    if (type === 'tick') {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1000, ctx.currentTime);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + 0.05);
    }

    if (type === 'finale') {
      [{freq:392,t:0},{freq:523,t:0.15},{freq:659,t:0.3},{freq:784,t:0.45},{freq:1046,t:0.65}].forEach(n => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'square';
        osc.frequency.setValueAtTime(n.freq, ctx.currentTime + n.t);
        gain.gain.setValueAtTime(0.12, ctx.currentTime + n.t);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + n.t + 0.2);
        osc.start(ctx.currentTime + n.t); osc.stop(ctx.currentTime + n.t + 0.2);
      });
    }

    if (type === 'victory') {
      [523,659,784,1046,1318].forEach((freq, i) => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.1);
        gain.gain.setValueAtTime(0.1, ctx.currentTime + i * 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.1 + 0.15);
        osc.start(ctx.currentTime + i * 0.1); osc.stop(ctx.currentTime + i * 0.1 + 0.15);
      });
    }

    if (type === 'timeup') {
      [0, 0.15, 0.3].forEach(time => {
        const osc = ctx.createOscillator(), gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.type = 'square';
        osc.frequency.setValueAtTime(440, ctx.currentTime + time);
        osc.frequency.setValueAtTime(330, ctx.currentTime + time + 0.07);
        gain.gain.setValueAtTime(0.15, ctx.currentTime + time);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + time + 0.12);
        osc.start(ctx.currentTime + time); osc.stop(ctx.currentTime + time + 0.12);
      });
    }

  } catch(e) { /* Audio failed silently — game still works */ }
}


/* ════════════════════════════════════════
   SECTION 3 — ANIMATED XP COUNTER
════════════════════════════════════════ */

let xpAnimations = {};

function animateScore(elementId, fromValue, toValue, duration) {
  duration = duration || 800;
  const el = document.getElementById(elementId);
  if (!el) return;
  if (xpAnimations[elementId]) cancelAnimationFrame(xpAnimations[elementId]);
  const startTime  = performance.now();
  const difference = toValue - fromValue;
  function step(currentTime) {
    const elapsed  = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased    = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(fromValue + difference * eased) + ' XP';
    if (progress < 1) {
      xpAnimations[elementId] = requestAnimationFrame(step);
    } else {
      el.textContent = toValue + ' XP';
      delete xpAnimations[elementId];
    }
  }
  xpAnimations[elementId] = requestAnimationFrame(step);
}


/* ════════════════════════════════════════
   SECTION 4 — SHAREABLE RESULT CARD
   Generates a PNG image players can share
════════════════════════════════════════ */

function generateShareCard(playerName, finalScore, correctCount, bluffCount, odBonus, totalQuestions) {
  const canvas  = document.createElement('canvas');
  canvas.width  = 600;
  canvas.height = 360;
  const ctx     = canvas.getContext('2d');

  // Background
  ctx.fillStyle = '#141a14';
  ctx.fillRect(0, 0, 600, 360);

  // Subtle grid pattern
  ctx.fillStyle = 'rgba(74,222,128,0.03)';
  for (let x = 0; x < 600; x += 20) {
    for (let y = 0; y < 360; y += 20) {
      if ((x + y) % 40 === 0) ctx.fillRect(x, y, 20, 20);
    }
  }

  // Border
  ctx.strokeStyle = '#4ade80';
  ctx.lineWidth   = 2;
  ctx.strokeRect(10, 10, 580, 340);

  // Corner accents
  [[10,10],[590,10],[10,350],[590,350]].forEach(([cx,cy]) => {
    ctx.fillStyle = '#4ade80';
    ctx.fillRect(cx - 2, cy - 2, 14, 2);
    ctx.fillRect(cx - 2, cy - 2, 2, 14);
  });

  // Header label
  ctx.fillStyle = '#7a9a7a'; ctx.font = '11px monospace'; ctx.textAlign = 'center';
  ctx.fillText('// GENCRAFT · KNOWLEDGE EDITION //', 300, 38);

  // GENCRAFT title
  ctx.fillStyle = '#4ade80'; ctx.font = 'bold 36px monospace';
  ctx.shadowColor = 'rgba(74,222,128,0.4)'; ctx.shadowBlur = 15;
  ctx.fillText('GENCRAFT', 300, 90);
  ctx.shadowBlur = 0;

  // Player name
  ctx.fillStyle = '#f5fff5'; ctx.font = 'bold 22px monospace';
  ctx.fillText(playerName.toUpperCase(), 300, 130);

  // Divider
  ctx.strokeStyle = '#4a5e4a'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(60, 148); ctx.lineTo(540, 148); ctx.stroke();

  // Score
  ctx.fillStyle = '#4ade80'; ctx.font = 'bold 56px monospace';
  ctx.shadowColor = 'rgba(74,222,128,0.4)'; ctx.shadowBlur = 20;
  ctx.fillText(finalScore + ' XP', 300, 215);
  ctx.shadowBlur = 0;

  // Validator rank
  const rank = finalScore >= 900 ? 'OPTIMISTIC ORACLE'
             : finalScore >= 650 ? 'CONSENSUS MASTER'
             : finalScore >= 400 ? 'SENIOR VALIDATOR'
             : finalScore >= 200 ? 'JUNIOR VALIDATOR'
             : 'NODE LEARNER';
  ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 16px monospace';
  ctx.fillText(rank, 300, 242);

  // Stats boxes
  [{label:'CORRECT', value:correctCount+'/'+totalQuestions},
   {label:'BLUFFS',  value:bluffCount+' CAUGHT'},
   {label:'OD BONUS',value:odBonus?'+50 XP':'MISSED'}
  ].forEach((stat, i) => {
    const x = 120 + i * 180;
    ctx.fillStyle = 'rgba(74,222,128,0.08)';
    ctx.fillRect(x - 65, 260, 130, 56);
    ctx.strokeStyle = '#4a5e4a'; ctx.lineWidth = 1;
    ctx.strokeRect(x - 65, 260, 130, 56);
    ctx.fillStyle = i === 2 && odBonus ? '#7dd3fc' : '#f5fff5';
    ctx.font = 'bold 15px monospace'; ctx.textAlign = 'center';
    ctx.fillText(stat.value, x, 283);
    ctx.fillStyle = '#7a9a7a'; ctx.font = '10px monospace';
    ctx.fillText(stat.label, x, 302);
  });

  // Watermark
  ctx.fillStyle = '#4a5e4a'; ctx.font = '10px monospace';
  ctx.fillText('BUILT ON GENLAYER · ' + new Date().toLocaleDateString(), 300, 340);

  // Download the image
  const dataURL = canvas.toDataURL('image/png');
  const link    = document.createElement('a');
  link.download = 'gencraft-' + playerName.toLowerCase() + '-' + finalScore + 'xp.png';
  link.href     = dataURL;
  link.click();

  // Open preview in new tab
  const win = window.open();
  if (win) {
    win.document.write(
      '<html><body style="margin:0;background:#141a14;display:flex;align-items:center;justify-content:center;min-height:100vh">' +
      '<div style="text-align:center">' +
      '<img src="' + dataURL + '" style="max-width:100%;border-radius:8px"/>' +
      '<p style="color:#4ade80;font-family:monospace;margin-top:12px;font-size:12px">Right click the image → Save as, then share it!</p>' +
      '</div></body></html>'
    );
  }
}

function shareResultCard() {
  generateShareCard(myName, score1, correctAnswers, bluffsDetected, odBonusEarned, totalQ);
}


/* ════════════════════════════════════════
   SECTION 5 — LOCAL STORAGE HELPERS
════════════════════════════════════════ */

function loadStorage() {
  try { return JSON.parse(localStorage.getItem('gencraft_data') || '{}'); }
  catch(e) { return {}; }
}
function saveStorage(data) {
  try { localStorage.setItem('gencraft_data', JSON.stringify(data)); }
  catch(e) { console.warn('Could not save data:', e); }
}
function getStats() {
  const d = loadStorage();
  return d.stats || { gamesPlayed:0, totalXP:0, bestScore:0, bluffsCaught:0, bestStreak:0, odBonuses:0, cats:{} };
}
function saveStats(s) { const d = loadStorage(); d.stats = s; saveStorage(d); }
function getLB()      { const d = loadStorage(); return d.lb || []; }
function saveLB(lb)   { const d = loadStorage(); d.lb = lb.slice(0,20); saveStorage(d); }


/* ════════════════════════════════════════
   SECTION 6 — GAME STATE
════════════════════════════════════════ */

let mode='solo', myName='MINER', roomCode='';
let questions=[], currentQ=0, totalQ=20;
let score1=200, score2=200, prevScore1=200, prevScore2=200;
let streak1=0, streak2=0;
let stakeAmount=0, selectedStake=0;
let timerInt=null, timeLeft=18, answered=false;
let bluffsDetected=0, correctAnswers=0, odBonusEarned=false;
let currentODClaim=null, odValidators=[];
let sessionStats={ cats:{} };


/* ════════════════════════════════════════
   SECTION 7 — UTILITY
════════════════════════════════════════ */

function shuffle(array) {
  const r = [...array];
  for (let i = r.length-1; i > 0; i--) {
    const j = Math.floor(Math.random()*(i+1));
    [r[i],r[j]] = [r[j],r[i]];
  }
  return r;
}

function getValidatorRank(xp) {
  if (xp>=900) return '🏆 ORACLE';
  if (xp>=650) return '⚡ MASTER';
  if (xp>=400) return '◈ SENIOR';
  if (xp>=200) return '◆ JUNIOR';
  return '⛏ LEARNER';
}

function floatXP(amount) {
  const el = document.createElement('div');
  el.className='xp-float'; el.textContent='+'+amount+' XP'; el.style.color='var(--em)';
  el.style.left=(Math.random()*60+20)+'%'; el.style.top='40%';
  document.body.appendChild(el); setTimeout(()=>el.remove(),1200);
}


/* ════════════════════════════════════════
   SECTION 8 — PAGE NAVIGATION
════════════════════════════════════════ */

function showPage(id) {
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const t = document.getElementById('page-'+id);
  if (t) t.classList.add('active');
  document.querySelectorAll('.tb-nav-btn').forEach(b=>b.classList.toggle('active',b.dataset.page===id));
  if (id==='leaderboard') renderLB();
  if (id==='stats')       renderStats();
  if (id==='splash')      renderSplash();
}


/* ════════════════════════════════════════
   SECTION 9 — HUD & HOTBAR
════════════════════════════════════════ */

function updateHotbar() {
  document.getElementById('hs-q').textContent  = Math.max(0, totalQ-currentQ);
  document.getElementById('hs-xp').textContent = score1;
  document.getElementById('hs-st').textContent = streak1;
  document.getElementById('hs-bl').textContent = bluffsDetected;
  const s = getStats();
  document.getElementById('hs-gp').textContent = s.gamesPlayed;
  document.getElementById('hs-bs').textContent = s.bestScore;
  document.getElementById('hs-rk').textContent = s.gamesPlayed ? getValidatorRank(s.bestScore).split(' ')[0] : '—';
  document.getElementById('tb-xp-pill').textContent = score1+' XP';
}

function updateHUD() {
  if (score1 !== prevScore1) { animateScore('s1', prevScore1, score1); prevScore1=score1; }
  if (score2 !== prevScore2) { animateScore('s2', prevScore2, score2); prevScore2=score2; }
  document.getElementById('qnum').textContent = String(currentQ+1).padStart(2,'0')+'/'+String(totalQ).padStart(2,'0');
  document.getElementById('st1').textContent  = streak1>1 ? '🔥 '+streak1+'x STREAK' : '';
  document.getElementById('st2').textContent  = streak2>1 ? streak2+'x 🔥' : '';
  updateHotbar();
}

function renderHearts(id, lives) {
  const el = document.getElementById(id); el.innerHTML='';
  for (let i=0; i<3; i++) {
    const h=document.createElement('div');
    h.className='heart'+(i<lives?'':' empty');
    el.appendChild(h);
  }
}


/* ════════════════════════════════════════
   SECTION 10 — PAGE RENDERERS
════════════════════════════════════════ */

function renderSplash() {
  const s = getStats();
  document.getElementById('splash-games').textContent = s.gamesPlayed;
  document.getElementById('splash-best').textContent  = s.bestScore;
  document.getElementById('splash-rank').textContent  = s.gamesPlayed ? getValidatorRank(s.bestScore) : '—';
}

function renderLB() {
  const lb=getLB(), table=document.getElementById('lb-table');
  if (!lb.length) { table.innerHTML='<div style="text-align:center;padding:24px;font-family:var(--mn);font-size:11px;color:var(--txt3)">No scores yet. Complete a game to appear here!</div>'; return; }
  table.innerHTML='';
  lb.forEach((e,i) => {
    const row=document.createElement('div');
    row.className='lb-row rank-'+(i+1)+(e.isMe?' mine':'');
    row.innerHTML='<div class="lb-rank">'+(i+1)+'</div>'+
      '<div class="lb-avatar" style="border-color:var(--em);color:var(--em)">'+e.name[0]+'</div>'+
      '<div class="lb-info"><div class="lb-name">'+e.name+'</div><div class="lb-meta">'+e.correct+'/20 · '+e.bluffs+' bluffs · '+e.mode+'</div></div>'+
      '<div class="lb-score"><div class="lb-xp">'+e.xp+' XP</div><div class="lb-date">'+e.date+'</div>'+
      (i===0?'<div class="lb-badge gold">CHAMPION</div>':i===1?'<div class="lb-badge silver">RUNNER UP</div>':i===2?'<div class="lb-badge bronze">THIRD</div>':'')+'</div>';
    table.appendChild(row);
  });
  const mi=lb.findIndex(e=>e.isMe);
  document.getElementById('my-rank-display').textContent=mi>=0?'#'+(mi+1):'—';
  document.getElementById('lb-total').textContent=lb.length;
}

function filterLB(type,btn) {
  document.querySelectorAll('.lb-filter-btn').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
}

function renderStats() {
  const s=getStats();
  document.getElementById('stat-total-xp').textContent=s.totalXP;
  document.getElementById('stat-best').textContent=s.bestScore;
  document.getElementById('stat-rank').textContent=s.gamesPlayed?getValidatorRank(s.bestScore):'—';
  document.getElementById('stat-games').textContent=s.gamesPlayed;
  document.getElementById('stat-bluffs').textContent=s.bluffsCaught;
  document.getElementById('stat-streak').textContent=s.bestStreak;
  document.getElementById('stat-od').textContent=s.odBonuses;
  [['BASICS','cb-basics','cp-basics'],['CONSENSUS','cb-consensus','cp-consensus'],['INTELLIGENT CONTRACTS','cb-ic','cp-ic'],
   ['USE CASES','cb-use','cp-use'],['TECHNICAL','cb-tech','cp-tech'],['BLUFF ROUND','cb-bluff','cp-bluff']
  ].forEach(([cat,bid,pid]) => {
    const c=(s.cats&&s.cats[cat])||{c:0,t:0};
    const pct=c.t>0?Math.round((c.c/c.t)*100):0;
    document.getElementById(bid).style.width=pct+'%';
    document.getElementById(pid).textContent=pct+'%';
  });
  if (s.bestStreak>=5)   document.getElementById('ach-streak')?.classList.remove('locked');
  if (s.bluffsCaught>=5) document.getElementById('ach-bluff')?.classList.remove('locked');
  if (s.odBonuses>=3)    document.getElementById('ach-od')?.classList.remove('locked');
  if (s.bestScore>=900)  document.getElementById('ach-oracle')?.classList.remove('locked');
}


/* ════════════════════════════════════════
   SECTION 11 — GAME INIT
════════════════════════════════════════ */

function initSolo()  { mode='solo'; myName='MINER'; buildQuestions(); showPage('game'); startGame(); }
function initMulti() { showPage('multi-setup'); }

function joinOrCreate() {
  myName  = (document.getElementById('pname-input').value.trim()||'MINER').toUpperCase();
  roomCode = document.getElementById('room-input').value.trim().toUpperCase()||('GL'+Math.floor(1000+Math.random()*9000));
  document.getElementById('room-display').textContent=roomCode;
  showPage('waiting');
}

function simOpponent() {
  const wm=document.getElementById('wait-msg');
  wm.textContent='OPPONENT CONNECTED — FORGING IN 3...';
  let c=3;
  const iv=setInterval(()=>{c--;if(c>0){wm.textContent='FORGING IN '+c+'...';}else{clearInterval(iv);buildQuestions();showPage('game');startGame();}},1000);
}

function buildQuestions() {
  const base=shuffle([...QUESTIONS]).slice(0,totalQ-4);
  const bluffs=shuffle([...BLUFFS]).slice(0,4);
  questions=[]; let bi=0;
  for (let i=0;i<base.length;i++) {
    questions.push(base[i]);
    if ((i+1)%4===0&&bi<bluffs.length) questions.push(bluffs[bi++]);
  }
  questions=questions.slice(0,totalQ);
}

function startGame() {
  currentQ=0; score1=200; score2=200; prevScore1=200; prevScore2=200;
  streak1=0; streak2=0; bluffsDetected=0; correctAnswers=0; odBonusEarned=false;
  sessionStats={cats:{}};
  document.getElementById('p1name').textContent=myName;
  const p2=document.getElementById('p2name').closest('.hud-player');
  if (p2) p2.style.opacity=mode==='solo'?'0.35':'1';
  document.getElementById('s1').textContent='200 XP';
  document.getElementById('s2').textContent='200 XP';
  updateHotbar(); renderHearts('h1',3); renderHearts('h2',3);
  hideGamePanels(); showStake();
}


/* ════════════════════════════════════════
   SECTION 12 — STAKE PHASE
════════════════════════════════════════ */

function showStake() {
  if (currentQ>=questions.length) { runContract(true); return; }
  const q=questions[currentQ], isBluff=q.cat==='BLUFF ROUND';
  hideGamePanels();
  document.getElementById('stake-panel').style.display='block';
  document.getElementById('stake-title').textContent=isBluff?'BLUFF ROUND — FORGE STAKE':'Q'+(currentQ+1)+' — FORGE YOUR STAKE';
  document.getElementById('vault-val').textContent=score1;
  document.getElementById('stake-desc').textContent=isBluff?'One answer is fabricated. Catch it = double stake + 40 XP. Miss = lose stake.':'Correct = double stake + time bonus. Wrong = lose stake.';
  const vals=[10,25,50,Math.min(100,score1)].filter((v,i,a)=>v<=score1&&v>0&&a.indexOf(v)===i);
  const grid=document.getElementById('ore-grid'); grid.innerHTML=''; selectedStake=0;
  document.getElementById('stake-confirm-btn').disabled=true;
  vals.forEach(value=>{
    const btn=document.createElement('button'); btn.className='ore-btn';
    btn.innerHTML=value+'<span class="ore-sub">XP</span>';
    btn.onclick=()=>{ document.querySelectorAll('.ore-btn').forEach(b=>b.classList.remove('sel')); btn.classList.add('sel'); selectedStake=value; document.getElementById('stake-confirm-btn').disabled=false; playSound('xp'); };
    grid.appendChild(btn);
  });
  const badge=document.getElementById('qbadge');
  badge.textContent=isBluff?'BLUFF ROUND':q.cat;
  badge.style.borderColor=isBluff?'var(--rs)':'var(--em)';
  badge.style.color=isBluff?'var(--rs)':'var(--em)';
  document.getElementById('timer-mode-lbl').textContent=isBluff?'BLUFF ROUND':'STANDARD ROUND';
}

function confirmStake(override) {
  stakeAmount=(override!==undefined)?override:selectedStake;
  hideGamePanels(); showQuestion();
}


/* ════════════════════════════════════════
   SECTION 13 — QUESTION PHASE
════════════════════════════════════════ */

function showQuestion() {
  const q=questions[currentQ], isBluff=q.cat==='BLUFF ROUND';
  document.getElementById('quiz-wrap').style.display='block';
  document.getElementById('q-card').className='q-panel'+(isBluff?' bluff':'');
  document.getElementById('q-cat-tag').textContent=q.cat;
  const st=document.getElementById('q-stake-tag');
  if (stakeAmount>0){st.style.display='inline-block';st.textContent='STAKED '+stakeAmount+' XP';}else st.style.display='none';
  document.getElementById('q-txt').textContent=q.q;
  document.getElementById('q-result').style.display='none';
  document.getElementById('q-explain').style.display='none';
  answered=false;
  const keys=['A','B','C','D'];
  const shuffled=shuffle(q.opts.map((text,i)=>({text,orig:i})));
  const optsDiv=document.getElementById('opts'); optsDiv.innerHTML='';
  shuffled.forEach((option,i)=>{
    const btn=document.createElement('button'); btn.className='opt'; btn.dataset.orig=option.orig;
    btn.innerHTML='<span class="opt-key">'+keys[i]+'</span><span class="opt-txt">'+option.text+'</span><span class="bflag">BLUFF</span>';
    btn.onclick=isBluff?()=>selectBluff(btn,option.orig,q):()=>selectAnswer(btn,option.orig===q.ans,q,shuffled);
    optsDiv.appendChild(btn);
  });
  startTimer(q,shuffled);
}

function startTimer(q,shuffled) {
  clearInterval(timerInt); timeLeft=18;
  const bar=document.getElementById('timer-bar');
  bar.style.width='100%'; bar.style.background='var(--em)';
  document.getElementById('timer-txt').textContent='18s';
  timerInt=setInterval(()=>{
    timeLeft--;
    document.getElementById('timer-txt').textContent=timeLeft+'s';
    bar.style.width=((timeLeft/18)*100)+'%';
    if (timeLeft<=9) bar.style.background='var(--am)';
    if (timeLeft<=4) { bar.style.background='var(--rs)'; playSound('tick'); }
    if (timeLeft<=0) { clearInterval(timerInt); if(!answered) timeUp(q,shuffled); }
  },1000);
}

function timeUp(q,shuffled) {
  answered=true; streak1=0;
  if (stakeAmount>0) score1=Math.max(0,score1-stakeAmount);
  if (mode==='multi') simulateOpponentAnswer(false);
  playSound('timeup');
  revealAnswers(q,shuffled);
  showQuestionResult(false,'TIME EXPIRED — '+(stakeAmount>0?'LOST '+stakeAmount+' XP':''),q.exp);
  trackCategory(q.cat,false); scheduleNextQuestion();
}

function selectAnswer(btn,correct,q,shuffled) {
  if (answered) return; answered=true; clearInterval(timerInt);
  const tb=Math.floor((timeLeft/18)*15);
  const sb=correct&&streak1>=2?Math.min(streak1*10,40):0;
  if (correct) { score1+=stakeAmount*2+20+tb+sb; streak1++; correctAnswers++; playSound('correct'); setTimeout(()=>playSound('xp'),300); }
  else         { score1=Math.max(0,score1-(stakeAmount+10)); streak1=0; playSound('wrong'); }
  if (mode==='multi') simulateOpponentAnswer(Math.random()<0.6);
  updateHUD(); btn.className='opt '+(correct?'correct':'wrong');
  revealAnswers(q,shuffled);
  showQuestionResult(correct,correct?'BLOCK MINED! +'+(stakeAmount*2+20+tb+sb)+' XP'+(sb?' [STREAK!]':''):'BLOCK FAILED — '+(stakeAmount>0?'-'+stakeAmount+' XP':''),q.exp);
  trackCategory(q.cat,correct); scheduleNextQuestion();
  if (correct) floatXP(stakeAmount*2+20+tb+sb);
}

function selectBluff(btn,origIndex,q) {
  if (answered) return; answered=true; clearInterval(timerInt);
  const caught=origIndex===q.bluff;
  if (caught) { score1+=stakeAmount*2+40; streak1++; bluffsDetected++; correctAnswers++; playSound('bluff'); setTimeout(()=>playSound('xp'),400); }
  else        { score1=Math.max(0,score1-(stakeAmount+15)); streak1=0; playSound('wrong'); }
  if (mode==='multi') simulateOpponentAnswer(Math.random()<0.4);
  updateHUD(); btn.className='opt '+(caught?'correct':'wrong');
  document.querySelectorAll('.opt').forEach(b=>{ b.disabled=true; if(parseInt(b.dataset.orig)===q.bluff&&!b.classList.contains('correct')) b.className='opt bluff-exposed'; });
  showQuestionResult(caught,caught?'BLUFF DETECTED! +'+(stakeAmount*2+40)+' XP':'BLUFF MISSED — FAKE ANSWER EXPOSED',q.exp,caught);
  trackCategory('BLUFF ROUND',caught); scheduleNextQuestion();
  if (caught) floatXP(stakeAmount*2+40);
}

function revealAnswers(q,shuffled) {
  document.querySelectorAll('.opt').forEach(btn=>{
    btn.disabled=true;
    if (q.ans!==undefined&&parseInt(btn.dataset.orig)===q.ans&&!btn.classList.contains('correct')) btn.className='opt reveal';
  });
}

function showQuestionResult(correct,msg,exp,isBluff) {
  const r=document.getElementById('q-result');
  r.style.display='block'; r.className=isBluff?'bluff':correct?'correct':'wrong'; r.textContent=msg;
  if (exp) { const e=document.getElementById('q-explain'); e.style.display='block'; e.textContent=exp; }
}

function trackCategory(cat,correct) {
  if (!sessionStats.cats[cat]) sessionStats.cats[cat]={c:0,t:0};
  sessionStats.cats[cat].t++; if(correct) sessionStats.cats[cat].c++;
}

function simulateOpponentAnswer(correct) {
  const old=score2;
  score2=Math.max(0,score2+(correct?65+Math.floor(Math.random()*20):-20));
  streak2=correct?streak2+1:0;
}

function scheduleNextQuestion() {
  setTimeout(()=>{ document.getElementById('quiz-wrap').style.display='none'; currentQ++; runContract(currentQ>=totalQ); },2700);
}


/* ════════════════════════════════════════
   SECTION 14 — CONTRACT ANIMATION
════════════════════════════════════════ */

function runContract(isLast) {
  hideGamePanels();
  document.getElementById('contract-anim').style.display='block';
  document.getElementById('ct-title').textContent=isLast?'FINALISING — SETTLING ALL SCORES...':'EXECUTING INTELLIGENT CONTRACT...';
  document.getElementById('ct-verdict').style.display='none';
  const log=document.getElementById('ct-log'); log.innerHTML='';
  const lines=isLast?[
    '> Processing '+totalQ+' transaction records...',
    '> XP vault: P1='+score1+' XP | P2='+score2+' XP',
    '> Bluff detections: '+bluffsDetected+' caught',
    '> Streak multipliers applied...',
    '> Preparing Optimistic Democracy finale...',
  ]:[
    '> Fetching verification data...',
    '> Running LLM validation layer...',
    '> Equivalence check passed...',
    '> XP escrow settlement complete.',
  ];
  let li=0;
  const iv=setInterval(()=>{
    if (li>=lines.length) {
      clearInterval(iv);
      const v=document.getElementById('ct-verdict'); v.style.display='block';
      v.className='ct-verdict '+(correctAnswers>=currentQ/2?'win':'lose');
      v.textContent=isLast?'> SESSION CLOSED — OD FINALE LAUNCHING':'> '+(correctAnswers>=currentQ/2?'CONTRACT VALIDATED — XP TRANSFERRED':'CONTRACT CHALLENGED — VAULT ADJUSTED');
      if (isLast) playSound('finale');
      setTimeout(()=>{ document.getElementById('contract-anim').style.display='none'; if(isLast)showODFinale();else showStake(); },1100);
      return;
    }
    const s=document.createElement('div'); s.className='ll'; s.textContent=lines[li]; log.appendChild(s); li++;
  },300);
}


/* ════════════════════════════════════════
   SECTION 15 — OD FINALE
════════════════════════════════════════ */

function showODFinale() {
  hideGamePanels();
  document.getElementById('od-final').style.display='block';
  const badge=document.getElementById('qbadge');
  badge.textContent='OD FINALE'; badge.style.borderColor='var(--di)'; badge.style.color='var(--di)';
  document.getElementById('qnum').textContent='FINAL';
  currentODClaim=OD_CLAIMS[Math.floor(Math.random()*OD_CLAIMS.length)];
  document.getElementById('od-claim').textContent=currentODClaim.text;
  const names=shuffle(['GPT-4','GEMINI','CLAUDE','LLAMA','MISTRAL']);
  const cc=2+Math.floor(Math.random()*2);
  odValidators=names.map((name,i)=>({name,vote:i<cc?currentODClaim.ans:!currentODClaim.ans}));
  shuffle(odValidators);
  const isSplit=odValidators.filter(v=>v.vote===currentODClaim.ans).length===3;
  document.getElementById('split-notice').style.display='none';
  document.getElementById('appeal-box').style.display='none';
  document.getElementById('od-vote-wrap').style.display='none';
  document.getElementById('od-result-box').style.display='none';
  const vrow=document.getElementById('od-vrow'); vrow.innerHTML='';
  odValidators.forEach((v,i)=>{ const c=document.createElement('span'); c.className='vchip vp'; c.id='odv'+i; c.textContent=v.name+': ?'; vrow.appendChild(c); });
  let i=0;
  const ri=setInterval(()=>{
    if (i>=odValidators.length) {
      clearInterval(ri);
      setTimeout(()=>{ if(isSplit){document.getElementById('split-notice').style.display='block';document.getElementById('appeal-box').style.display='block';}else document.getElementById('od-vote-wrap').style.display='block'; },400);
      return;
    }
    const c=document.getElementById('odv'+i);
    c.className='vchip '+(odValidators[i].vote?'vt':'vf');
    c.textContent=odValidators[i].name+': '+(odValidators[i].vote?'TRUE':'FALSE');
    playSound('xp'); i++;
  },560);
}

function triggerAppeal() {
  if (score1<20) { skipAppeal(); return; }
  score1=Math.max(0,score1-20); updateHUD();
  document.getElementById('appeal-box').style.display='none';
  const vrow=document.getElementById('od-vrow');
  const sep=document.createElement('div');
  sep.style.cssText='width:100%;font-family:var(--px);font-size:5px;color:var(--di);padding:5px 0;letter-spacing:.08em';
  sep.textContent='// APPEAL — SET EXPANDED 5 → 10 //';
  vrow.appendChild(sep);
  const ev=shuffle(['GPT-4O','CLAUDE-3.5','GEMINI-PRO','MISTRAL-L','DEEPSEEK']).map((name,i)=>({name,vote:i<3?currentODClaim.ans:!currentODClaim.ans}));
  ev.forEach((v,i)=>{ const c=document.createElement('span'); c.className='vchip vp'; c.id='odve'+i; c.textContent=v.name+': ?'; vrow.appendChild(c); });
  let i=0;
  const iv=setInterval(()=>{
    if (i>=ev.length) { clearInterval(iv); setTimeout(()=>document.getElementById('od-vote-wrap').style.display='block',400); return; }
    const c=document.getElementById('odve'+i); c.className='vchip '+(ev[i].vote?'vt':'vf'); c.textContent=ev[i].name+': '+(ev[i].vote?'TRUE':'FALSE'); i++;
  },380);
}

function skipAppeal() {
  document.getElementById('appeal-box').style.display='none';
  document.getElementById('od-vote-wrap').style.display='block';
}

function castODVote(vote) {
  document.getElementById('od-vote-wrap').style.display='none';
  const correct=vote===currentODClaim.ans;
  const maj=odValidators.filter(v=>v.vote===currentODClaim.ans).length;
  if (correct) { const old=score1; score1+=50; odBonusEarned=true; playSound('victory'); animateScore('s1',old,score1); floatXP(50); }
  else playSound('wrong');
  if (mode==='multi') score2=Math.max(0,score2+(Math.random()<0.5?50:0));
  updateHUD();
  const rb=document.getElementById('od-result-box'); rb.style.display='block'; rb.className=correct?'win':'lose';
  document.getElementById('od-res-title').textContent=correct?'CONSENSUS REACHED — +50 XP!':'VOTE REJECTED';
  document.getElementById('od-res-sub').textContent='Validators voted '+maj+'-'+(5-maj)+'. Claim is '+(currentODClaim.ans?'TRUE':'FALSE')+'. Final vault: '+score1+' XP.';
}


/* ════════════════════════════════════════
   SECTION 16 — RESULTS PAGE
════════════════════════════════════════ */

function showResults() {
  const s=getStats();
  s.gamesPlayed++; s.totalXP+=score1; if(score1>s.bestScore) s.bestScore=score1;
  s.bluffsCaught+=bluffsDetected; if(streak1>s.bestStreak) s.bestStreak=streak1;
  if(odBonusEarned) s.odBonuses++;
  if(!s.cats) s.cats={};
  Object.keys(sessionStats.cats||{}).forEach(cat=>{
    if(!s.cats[cat]) s.cats[cat]={c:0,t:0};
    s.cats[cat].c+=sessionStats.cats[cat].c; s.cats[cat].t+=sessionStats.cats[cat].t;
  });
  saveStats(s);
  const lb=getLB();
  lb.push({name:myName,xp:score1,correct:correctAnswers,bluffs:bluffsDetected,mode,date:new Date().toLocaleDateString(),isMe:false});
  lb.sort((a,b)=>b.xp-a.xp);
  const mi=lb.findIndex(e=>e.name===myName&&e.xp===score1);
  if(mi>=0) lb[mi].isMe=true;
  saveLB(lb); updateHotbar(); showPage('results');

  const iWon=score1>=score2;
  document.getElementById('res-title').textContent=mode==='solo'?'MINE COMPLETE':iWon?'VICTORY!':'DEFEATED';
  document.getElementById('res-sub').textContent=mode==='solo'?'// FINAL VAULT: '+score1+' XP — '+correctAnswers+'/'+totalQ+' CORRECT //':(iWon?'// WELL CRAFTED, '+myName+' //':'// OPPONENT WINS //');

  const rows=mode==='solo'
    ?[{name:myName,xp:score1,color:'var(--em)',detail:correctAnswers+' CORRECT · '+bluffsDetected+' BLUFFS'+(odBonusEarned?' · OD +50':'')}]
    :[{name:myName,xp:score1,color:'var(--em)',detail:'YOU'},{name:'OPPONENT',xp:score2,color:'var(--am)',detail:'OPPONENT'}].sort((a,b)=>b.xp-a.xp);

  const rc=document.getElementById('results-rows'); rc.innerHTML='';
  rows.forEach((pl,i)=>{
    const d=document.createElement('div'); d.className='lb-row rank-'+(i+1);
    d.innerHTML='<div class="lb-rank">'+(i+1)+'</div>'+
      '<div class="lb-avatar" style="border-color:'+pl.color+';color:'+pl.color+'">'+pl.name[0]+'</div>'+
      '<div class="lb-info"><div class="lb-name" style="color:'+pl.color+'">'+pl.name+'</div><div class="lb-meta">'+pl.detail+'</div></div>'+
      '<div class="lb-score"><div class="lb-xp">'+pl.xp+' XP</div>'+(i===0&&mode==='multi'?'<div class="lb-badge gold">WINNER</div>':'')+'</div>';
    rc.appendChild(d);
  });

  const odv=document.getElementById('od-bonus-val');
  odv.textContent=odBonusEarned?'+50 XP EARNED':'NOT EARNED';
  odv.style.color=odBonusEarned?'var(--di)':'var(--txt3)';

  document.getElementById('results-stats').innerHTML=
    '<div class="stat-card em"><div class="sc-val">'+score1+'</div><div class="sc-lbl">FINAL VAULT</div></div>'+
    '<div class="stat-card am"><div class="sc-val">'+correctAnswers+'/'+totalQ+'</div><div class="sc-lbl">BLOCKS MINED</div></div>'+
    '<div class="stat-card rs"><div class="sc-val">'+bluffsDetected+'</div><div class="sc-lbl">BLUFFS CAUGHT</div></div>';

  // Show the share card button
  const shareBtn=document.getElementById('share-card-btn');
  if (shareBtn) shareBtn.style.display='block';
}

function restartGame() { hideGamePanels(); buildQuestions(); showPage('game'); startGame(); }


/* ════════════════════════════════════════
   SECTION 17 — UTILITIES
════════════════════════════════════════ */

function hideGamePanels() {
  ['stake-panel','quiz-wrap','contract-anim','od-final'].forEach(id=>document.getElementById(id).style.display='none');
}


/* ════════════════════════════════════════
   INIT
════════════════════════════════════════ */
renderLB(); renderStats(); renderSplash(); updateHotbar();
