# { "Depends": "py-genlayer:test" }
"""
GENCRAFT Question Generator — Intelligent Contract

Generates quiz questions for GENCRAFT matches using LLM-equipped validators
and Optimistic Democracy consensus. Each match seed produces a question set
agreed upon by validator consensus.

Why this is core to gameplay (not just a leaderboard):
  - The questions players answer DO NOT EXIST until the contract runs.
  - The leader validator generates a candidate question set using its LLM.
  - Other validators independently assess whether the set meets the
    Equivalence Principle criteria (well-formed, on-topic, balanced).
  - Optimistic Democracy converges on the final set.
  - Without this contract executing, no game can start.

Non-comparative was chosen over comparative because:
  - Comparative would have every validator regenerate the entire 10-question
    set — expensive and wasteful.
  - Non-comparative has only the leader generate; validators just judge
    quality. This is the standard pattern for content-generation tasks
    per the GenLayer docs (analogous to the news-summary example).
"""

from genlayer import *
import json


VALID_TOPICS = {"genlayer", "web3", "consensus", "ai", "mixed"}

VALID_CATEGORIES = {
    "BASICS", "CONSENSUS", "INTELLIGENT CONTRACTS",
    "USE CASES", "TECHNICAL", "ECOSYSTEM",
}


# ----------------------------------------------------------------------------
# Helper: build the leader's generation prompt
# ----------------------------------------------------------------------------

def _topic_description(topic: str) -> str:
    descriptions = {
        "genlayer": (
            "GenLayer's Intelligent Contracts, Optimistic Democracy, the "
            "Equivalence Principle, GenVM, validators, and how AI consensus works"
        ),
        "web3": (
            "general Web3 and blockchain fundamentals: wallets, gas, smart "
            "contracts, EVM, layer 2s, bridges, common security pitfalls"
        ),
        "consensus": (
            "consensus mechanisms across blockchains: PoW, PoS, BFT variants, "
            "Optimistic Democracy, finality, fork choice, and trade-offs"
        ),
        "ai": (
            "the intersection of AI and blockchain: LLM-based oracles, on-chain "
            "inference, AI agents, Intelligent Contracts, verification of AI outputs"
        ),
        "mixed": (
            "a balanced mix of GenLayer concepts, Web3 fundamentals, consensus "
            "mechanisms, and AI-on-chain topics"
        ),
    }
    return descriptions.get(topic, descriptions["mixed"])


def _build_generation_prompt(topic: str, count: int, seed: str) -> str:
    desc = _topic_description(topic)
    return f"""You are generating multiple-choice quiz questions for a knowledge battle game called GENCRAFT.

Topic for this match: {desc}
Match seed (for variety, do not include in output): {seed}

Generate exactly {count} multiple-choice questions.

CRITICAL FORMATTING RULES:
1. Return ONLY a JSON array. No prose, no markdown fences, no commentary.
2. Each item must have these exact keys: "category", "question", "options", "correct".
3. "category" must be one of: "BASICS", "CONSENSUS", "INTELLIGENT CONTRACTS", "USE CASES", "TECHNICAL", "ECOSYSTEM".
4. "options" is an array of EXACTLY 4 strings.
5. "correct" is an integer 0-3 (the index of the correct option).
6. CRITICAL: All 4 options for any single question must have similar length (within 30% of each other in character count). Players have learned that the longest option is usually correct, so do not let answer length leak the answer.
7. Questions must be factually accurate. No trick questions about pop culture or trivia outside the topic.
8. Distractors (wrong answers) must be plausible, not obvious nonsense.
9. Vary difficulty: roughly 30 percent easy, 50 percent medium, 20 percent hard.

Example of one well-formed question:
{{"category":"CONSENSUS","question":"What problem does Optimistic Democracy primarily solve?","options":["Reaching consensus on non-deterministic LLM outputs across validators","Reducing the gas cost of standard ERC-20 token transfers on layer 1","Generating zero-knowledge proofs for private transactions on rollups","Bridging assets between two different proof-of-stake blockchain networks"],"correct":0}}

Now produce the JSON array of {count} questions. Output ONLY the JSON array, nothing else."""


# ----------------------------------------------------------------------------
# Helpers: parsing and validation (run inside the non-deterministic block)
# ----------------------------------------------------------------------------

def _strip_fences(text: str) -> str:
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    return text


def _extract_json_array(text: str) -> list:
    text = _strip_fences(text)
    start = text.find("[")
    end = text.rfind("]")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("No JSON array found in LLM output")
    parsed = json.loads(text[start:end + 1])
    if not isinstance(parsed, list):
        raise ValueError("Parsed value is not a list")
    return parsed


def _validate_and_clean(qs: list, expected_count: int) -> list:
    if not isinstance(qs, list):
        raise ValueError("questions must be a list")
    if len(qs) != expected_count:
        raise ValueError("question count mismatch")

    cleaned = []
    for i, q in enumerate(qs):
        if not isinstance(q, dict):
            raise ValueError("question " + str(i) + " is not an object")
        for key in ("category", "question", "options", "correct"):
            if key not in q:
                raise ValueError("question " + str(i) + " missing key " + key)
        if q["category"] not in VALID_CATEGORIES:
            raise ValueError("question " + str(i) + " has invalid category")
        if not isinstance(q["options"], list) or len(q["options"]) != 4:
            raise ValueError("question " + str(i) + " must have exactly 4 options")
        if not all(isinstance(o, str) and len(o) > 0 for o in q["options"]):
            raise ValueError("question " + str(i) + " has empty/non-string options")
        if not isinstance(q["correct"], int) or q["correct"] < 0 or q["correct"] > 3:
            raise ValueError("question " + str(i) + " has invalid 'correct' index")
        if not isinstance(q["question"], str) or len(q["question"].strip()) < 8:
            raise ValueError("question " + str(i) + " has empty/too-short text")
        cleaned.append({
            "category": q["category"],
            "question": q["question"].strip(),
            "options": [o.strip() for o in q["options"]],
            "correct": q["correct"],
        })
    return cleaned


# ----------------------------------------------------------------------------
# Contract
# ----------------------------------------------------------------------------

class QuestionGenerator(gl.Contract):
    # Map of seed -> JSON-serialized question list.
    questions_by_seed: TreeMap[str, str]

    # Map of seed -> topic that produced it (for analytics).
    topic_by_seed: TreeMap[str, str]

    # Audit counter.
    matches_generated: u256

    # Per-player cumulative XP across all submitted matches.
    player_xp: TreeMap[Address, u256]

    # Recent match results for leaderboard display (kept trimmed to last 50).
    # Each entry is JSON: {"player","name","xp","seed","topic"}
    recent_results: DynArray[str]

    def __init__(self) -> None:
        self.matches_generated = u256(0)

    # ------------------------------------------------------------------
    # WRITE: generate_questions
    #
    # The showpiece. The leader validator's LLM produces a candidate
    # question set; other validators evaluate whether it satisfies the
    # criteria via the non-comparative Equivalence Principle.
    # ------------------------------------------------------------------
    @gl.public.write
    def generate_questions(self, seed: str, topic: str, count: int) -> None:
        # Argument validation (deterministic, before any nondet block).
        if not isinstance(seed, str) or len(seed) == 0 or len(seed) > 128:
            raise Exception("seed must be a non-empty string up to 128 chars")
        if topic not in VALID_TOPICS:
            raise Exception("topic must be one of " + ", ".join(sorted(VALID_TOPICS)))
        if not isinstance(count, int) or count < 5 or count > 15:
            raise Exception("count must be an integer between 5 and 15")

        # Idempotency: if questions for this seed already exist, no-op.
        # Joiners may racily call this; only the first should run the LLM.
        if seed in self.questions_by_seed:
            return

        prompt = _build_generation_prompt(topic, count, seed)
        topic_desc = _topic_description(topic)
        expected_count = count

        # The leader function: runs the LLM and produces a JSON string.
        # Validators will independently run this and OD compares results.
        def leader_fn() -> str:
            raw = gl.nondet.exec_prompt(prompt)
            cleaned_text = _strip_fences(raw)
            parsed = _extract_json_array(cleaned_text)
            cleaned = _validate_and_clean(parsed, expected_count)
            # Return canonical JSON so validator comparison is stable.
            return json.dumps(cleaned, sort_keys=True)

        # Comparative EP: each validator runs leader_fn, then OD evaluates
        # whether the leader's JSON is "equivalent" to the validator's via
        # the principle below. The function's return value (leader's JSON)
        # IS the contract result — which is what we need to store.
        result = gl.eq_principle.prompt_comparative(
            leader_fn,
            (
                "Both outputs must be valid JSON arrays of exactly "
                + str(expected_count)
                + " multiple-choice quiz questions about: "
                + topic_desc
                + ". Each question must have keys: category (one of BASICS, "
                "CONSENSUS, INTELLIGENT CONTRACTS, USE CASES, TECHNICAL, ECOSYSTEM), "
                "question (non-empty string), options (array of exactly 4 strings), "
                "and correct (integer 0 to 3). The exact wording of questions and "
                "options can differ between the two sets — what matters is that "
                "both are valid quizzes on the topic. Treat them as equivalent if "
                "both meet these structural and topical criteria, even if the "
                "specific questions are different."
            ),
        )

        # Re-validate the consensus output before storing on-chain.
        # Defensive: result should be a JSON string, but be tolerant.
        if result is None or (isinstance(result, str) and len(result.strip()) == 0):
            raise Exception("consensus returned empty result; validators may have failed to agree")

        try:
            if isinstance(result, str):
                parsed_result = json.loads(result)
            elif isinstance(result, list):
                # In case SDK already deserialized for us
                parsed_result = result
            else:
                raise ValueError("unexpected result type: " + str(type(result).__name__))
            final = _validate_and_clean(parsed_result, expected_count)
        except Exception as e:
            raise Exception("consensus output failed validation: " + str(e))

        self.questions_by_seed[seed] = json.dumps(final)
        self.topic_by_seed[seed] = topic
        self.matches_generated = u256(int(self.matches_generated) + 1)

    # ------------------------------------------------------------------
    # READS
    # ------------------------------------------------------------------

    @gl.public.view
    def get_questions(self, seed: str) -> str:
        """JSON-serialized question list for a seed, or empty string if not found."""
        if seed not in self.questions_by_seed:
            return ""
        return self.questions_by_seed[seed]

    @gl.public.view
    def has_questions(self, seed: str) -> bool:
        return seed in self.questions_by_seed

    @gl.public.view
    def get_topic(self, seed: str) -> str:
        if seed not in self.topic_by_seed:
            return ""
        return self.topic_by_seed[seed]

    @gl.public.view
    def total_matches(self) -> int:
        return int(self.matches_generated)

    # ------------------------------------------------------------------
    # WRITE: submit_result (leaderboard)
    # ------------------------------------------------------------------

    @gl.public.write
    def submit_result(self, name: str, xp: int, seed: str, topic: str) -> None:
        if not isinstance(xp, int) or xp < 0 or xp > 100000:
            raise Exception("xp out of range")
        if not isinstance(name, str) or len(name) == 0 or len(name) > 32:
            raise Exception("name must be 1-32 chars")
        if not isinstance(seed, str) or len(seed) == 0 or len(seed) > 128:
            raise Exception("invalid seed")
        if not isinstance(topic, str) or len(topic) == 0 or len(topic) > 32:
            raise Exception("invalid topic")

        sender = gl.message.sender_address
        prev = int(self.player_xp.get(sender, u256(0)))
        self.player_xp[sender] = u256(prev + xp)

        entry = json.dumps({
            "player": str(sender),
            "name": name[:32],
            "xp": xp,
            "seed": seed,
            "topic": topic,
        })
        self.recent_results.append(entry)

        # Trim to last 50. DynArray.pop(0) is O(n) but the list stays small.
        while len(self.recent_results) > 50:
            self.recent_results.pop(0)

    @gl.public.view
    def get_player_xp(self, addr: Address) -> int:
        return int(self.player_xp.get(addr, u256(0)))

    @gl.public.view
    def get_recent_results(self) -> str:
        """Returns JSON array of recent result entries."""
        out = []
        for r in self.recent_results:
            out.append(r)
        return json.dumps(out)
