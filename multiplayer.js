// multiplayer.js — GENCRAFT
// Real-time multiplayer via Ably + Intelligent Contract question generation.
//
// Load order requirement: this file MUST be loaded AFTER game.js and AFTER
// genlayer.js (which is type="module" so it loads async — we wait for the
// gl-ready event before we let a host start the match).

(function () {
  const ABLY_KEY = 'PLcYfQ.Q-j42w:gn7JJ70LbSF1whd8wp1jgMGx1geRh9_dmCmBhB187zg';

  // Module-level state. Mirrored to window.MP for game.js to read.
  const MP = {
    ably: null,
    channel: null,
    roomId: null,
    isHost: false,
    playerId: null,
    playerName: null,
    oppName: null,
    players: [],          // [{id, name, host}]
    topic: 'mixed',       // current match topic
    seed: null,           // current match seed
    questions: null,      // AI-generated question array (set before launch)
    glReady: false,
    started: false,
  };
  window.MP = MP;

  window.addEventListener('gl-ready', () => { MP.glReady = true; });

  // ------------------------------------------------------------------------
  // Connection
  // ------------------------------------------------------------------------

  function rid() {
    return Math.random().toString(36).slice(2, 8).toUpperCase();
  }

  async function connectAbly() {
    if (MP.ably) return MP.ably;
    if (typeof Ably === 'undefined') {
      throw new Error('Ably SDK not loaded');
    }
    MP.ably = new Ably.Realtime({ key: ABLY_KEY, clientId: MP.playerId });
    await new Promise((resolve, reject) => {
      MP.ably.connection.once('connected', resolve);
      MP.ably.connection.once('failed', reject);
    });
    return MP.ably;
  }

  async function joinChannel(roomId) {
    await connectAbly();
    MP.channel = MP.ably.channels.get(`gc-${roomId}`);
    MP.channel.subscribe(onMessage);
    return MP.channel;
  }

  function publish(eventType, payload) {
    if (!MP.channel) return;
    MP.channel.publish(eventType, {
      ...payload,
      from: MP.playerId,
      fromName: MP.playerName,
      ts: Date.now(),
    });
  }

  // ------------------------------------------------------------------------
  // Public API used by index.html buttons / game.js
  // ------------------------------------------------------------------------

  async function joinOrCreate({ name, roomId, asHost }) {
    MP.playerId = rid();
    MP.playerName = (name || 'Player').slice(0, 24);

    if (asHost) {
      MP.isHost = true;
      MP.roomId = roomId || rid();
      MP.players = [{ id: MP.playerId, name: MP.playerName, host: true }];
      await joinChannel(MP.roomId);
      // Host doesn't announce — joiners do.
      window.dispatchEvent(new CustomEvent('mp-room-ready', {
        detail: { roomId: MP.roomId, isHost: true },
      }));
    } else {
      if (!roomId) throw new Error('Room ID required to join');
      MP.isHost = false;
      MP.roomId = roomId.toUpperCase();
      await joinChannel(MP.roomId);
      publish('player_joined', { name: MP.playerName, id: MP.playerId });
      window.dispatchEvent(new CustomEvent('mp-room-ready', {
        detail: { roomId: MP.roomId, isHost: false },
      }));
    }
    return MP.roomId;
  }

  /**
   * Host calls this when they click START.
   * Flow:
   *   1. Publish "generation_starting" so all clients show the validator screen.
   *   2. Host calls the Intelligent Contract to generate questions.
   *   3. On success, host publishes the seed.
   *   4. Joiners fetch the questions from the contract using the seed.
   *   5. Once everyone has them, host fires the 3-2-1 countdown.
   */
  async function hostStartMatch(topic) {
    if (!MP.isHost) throw new Error('Only the host can start the match');
    if (!MP.glReady || !window.GL) {
      throw new Error('GenLayer client not ready yet — wait a moment and retry');
    }
    if (MP.players.length < 1) {
      throw new Error('No players in the room');
    }

    MP.topic = topic || 'mixed';
    // Seed combines room + timestamp so each match is unique but reproducible
    // across all clients (they all read the same seed from the contract).
    MP.seed = `${MP.roomId}-${Date.now()}`;

    // Tell everyone we're entering the validator-convening screen.
    publish('generation_starting', { seed: MP.seed, topic: MP.topic });
    window.dispatchEvent(new CustomEvent('mp-generation-starting', {
      detail: { seed: MP.seed, topic: MP.topic },
    }));

    // Run the generation. The host's wallet pays for the transaction.
    let questions;
    try {
      questions = await window.GL.generateQuestions(MP.seed, MP.topic, (stage) => {
        publish('generation_progress', { stage });
        window.dispatchEvent(new CustomEvent('mp-generation-progress', {
          detail: { stage },
        }));
      });
    } catch (err) {
      console.error('[MP] Generation failed:', err);
      publish('generation_failed', { error: String(err.message || err) });
      window.dispatchEvent(new CustomEvent('mp-generation-failed', {
        detail: { error: String(err.message || err) },
      }));
      throw err;
    }

    MP.questions = questions;

    // Tell joiners to fetch the questions from the contract themselves.
    publish('generation_complete', { seed: MP.seed, topic: MP.topic });

    // Brief pause so joiners can fetch, then countdown.
    setTimeout(() => {
      publish('game_start', { seed: MP.seed, topic: MP.topic });
      window.dispatchEvent(new CustomEvent('mp-game-start', {
        detail: { questions: MP.questions, seed: MP.seed, topic: MP.topic },
      }));
      MP.started = true;
    }, 1500);
  }

  function reportAnswer(qIndex, correct, xpDelta) {
    publish('answer', { qIndex, correct, xpDelta });
  }

  function reportDone(finalXp) {
    publish('game_done', { finalXp });
  }

  // ------------------------------------------------------------------------
  // Inbound message handler
  // ------------------------------------------------------------------------

  async function onMessage(msg) {
    const { name, data } = msg;
    if (!data || data.from === MP.playerId) return;  // ignore own messages

    switch (name) {
      case 'player_joined': {
        if (!MP.players.find(p => p.id === data.id)) {
          MP.players.push({ id: data.id, name: data.name, host: false });
        }
        MP.oppName = data.name;
        // Host re-broadcasts the player list so latecomers see everyone.
        if (MP.isHost) {
          publish('player_list', { players: MP.players });
        }
        window.dispatchEvent(new CustomEvent('mp-players-update', {
          detail: { players: MP.players },
        }));
        break;
      }
      case 'player_list': {
        MP.players = data.players || [];
        const opp = MP.players.find(p => p.id !== MP.playerId);
        if (opp) MP.oppName = opp.name;
        window.dispatchEvent(new CustomEvent('mp-players-update', {
          detail: { players: MP.players },
        }));
        break;
      }
      case 'generation_starting': {
        MP.seed = data.seed;
        MP.topic = data.topic;
        window.dispatchEvent(new CustomEvent('mp-generation-starting', {
          detail: { seed: data.seed, topic: data.topic },
        }));
        break;
      }
      case 'generation_progress': {
        window.dispatchEvent(new CustomEvent('mp-generation-progress', {
          detail: { stage: data.stage },
        }));
        break;
      }
      case 'generation_complete': {
        // Joiner: fetch questions from the contract using the seed.
        if (!MP.isHost && window.GL) {
          try {
            const qs = await window.GL.getQuestionsBySeed(data.seed);
            if (qs && qs.length) {
              MP.questions = qs;
              MP.seed = data.seed;
              MP.topic = data.topic;
              window.dispatchEvent(new CustomEvent('mp-questions-fetched'));
            }
          } catch (err) {
            console.warn('[MP] joiner fetch failed:', err);
          }
        }
        break;
      }
      case 'generation_failed': {
        window.dispatchEvent(new CustomEvent('mp-generation-failed', {
          detail: { error: data.error },
        }));
        break;
      }
      case 'game_start': {
        if (!MP.questions && window.GL) {
          // Last-resort fetch in case generation_complete arrived after game_start.
          MP.questions = await window.GL.getQuestionsBySeed(data.seed);
        }
        window.dispatchEvent(new CustomEvent('mp-game-start', {
          detail: { questions: MP.questions, seed: data.seed, topic: data.topic },
        }));
        MP.started = true;
        break;
      }
      case 'answer': {
        window.dispatchEvent(new CustomEvent('mp-opp-answer', {
          detail: { qIndex: data.qIndex, correct: data.correct, xpDelta: data.xpDelta, from: data.fromName },
        }));
        break;
      }
      case 'game_done': {
        window.dispatchEvent(new CustomEvent('mp-opp-done', {
          detail: { finalXp: data.finalXp, from: data.fromName },
        }));
        break;
      }
    }
  }

  // ------------------------------------------------------------------------
  // Expose
  // ------------------------------------------------------------------------

  window.MP_API = {
    joinOrCreate,
    hostStartMatch,
    reportAnswer,
    reportDone,
  };
})();
