"""Label a token with a narrative from its name and symbol (when no KOL has mentioned it).

Only used for tokens that already cleared the Radar liquidity bar, so few reach the model.
Every failure returns "no label": a missing label is honest, a guessed one is not.
"""

from __future__ import annotations

import asyncio
import json
import os
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Protocol

import httpx

NARRATIVE_DESCRIPTIONS: Mapping[int, str] = {
    1: "Privacy / ZK: privacy protocols and zero-knowledge cryptography",
    2: "AI Agents: autonomous AI agents and agentic payments",
    3: "RWA: tokenized real-world assets (stocks, bonds, commodities, funds)",
    4: "Stablecoins: stablecoins and stablechains",
    5: "DePIN: decentralized physical infrastructure and GPU compute",
    6: "Prediction Markets: on-chain prediction and event markets",
    7: "Perp DEX: decentralized perpetual exchanges",
    8: "DeFi: core DeFi outside perp DEX and stablecoins (lending, AMMs, yield)",
    9: "Memecoin: memecoins and trenching culture (animal, joke or pop-culture names)",
    10: "Gaming: on-chain and web3 gaming ecosystems",
}

SYSTEM_PROMPT = (
    "You assign crypto tokens to one narrative using only the token's name and ticker.\n"
    "Narratives:\n"
    + "\n".join(f"{nid}: {text}" for nid, text in NARRATIVE_DESCRIPTIONS.items())
    + '\nInput: a JSON array of {"i": number, "symbol": string, "name": string}.\n'
    "Output: a JSON object mapping each i (as a string) to a narrative number, or to null when the "
    "name and ticker do not clearly point to one narrative. Never guess: null is the right answer "
    "for an unclear token."
)


class TokenLabeler(Protocol):
    async def label(self, tokens: Sequence[tuple[str, str, str]]) -> dict[str, int | None] | None:
        """(address, symbol, name) -> {address: narrative id or None}; None if unreachable."""
        ...


def parse_labels(text: str, count: int) -> dict[int, int | None]:
    """Parse the model JSON into {1-based index: narrative id or None}; unknown ids become None."""
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned = "\n".join(lines).strip()
    parsed = json.loads(cleaned)
    if not isinstance(parsed, dict):
        raise ValueError("expected a JSON object")
    out: dict[int, int | None] = {}
    for key, value in parsed.items():
        try:
            index = int(key)
        except (TypeError, ValueError):
            continue
        if not 1 <= index <= count:
            continue
        if isinstance(value, bool) or not isinstance(value, int):
            out[index] = None
        else:
            out[index] = value if value in NARRATIVE_DESCRIPTIONS else None
    return out


@dataclass(slots=True)
class GeminiTokenLabeler:
    api_keys: tuple[str, ...]
    model: str
    base_url: str = "https://generativelanguage.googleapis.com/v1beta"
    timeout: float = 60.0
    client: httpx.AsyncClient | None = None

    @classmethod
    def from_env(cls) -> GeminiTokenLabeler | None:
        keys = [os.environ.get("GEMINI_API_KEY", "")]
        keys += os.environ.get("GEMINI_API_KEY_2", "").split(",")
        unique = tuple(dict.fromkeys(k.strip() for k in keys if k.strip()))
        if not unique:
            return None
        return cls(api_keys=unique, model=os.environ.get("GEMINI_MODEL", "gemini-4-hydrogen"))

    async def label(self, tokens: Sequence[tuple[str, str, str]]) -> dict[str, int | None] | None:
        if not tokens:
            return {}
        rows = [
            {"i": i, "symbol": symbol[:32], "name": name[:64]}
            for i, (_, symbol, name) in enumerate(tokens, 1)
        ]
        payload = {
            "systemInstruction": {"parts": [{"text": SYSTEM_PROMPT}]},
            "contents": [
                {
                    "role": "user",
                    "parts": [
                        {"text": json.dumps(rows, ensure_ascii=False, separators=(",", ":"))}
                    ],
                }
            ],
            "generationConfig": {"temperature": 0, "responseMimeType": "application/json"},
        }
        url = f"{self.base_url.rstrip('/')}/models/{self.model}:generateContent"
        for attempt in range(4):
            key = self.api_keys[attempt % len(self.api_keys)]
            try:
                if self.client is not None:
                    resp = await self.client.post(url, params={"key": key}, json=payload)
                else:
                    async with httpx.AsyncClient(timeout=self.timeout) as client:
                        resp = await client.post(url, params={"key": key}, json=payload)
            except (httpx.TimeoutException, httpx.TransportError):
                await asyncio.sleep(1.0 + attempt)
                continue
            if resp.status_code in (429, 500, 502, 503, 504):
                await asyncio.sleep(2.0 * (attempt + 1))
                continue
            if resp.status_code >= 400:
                return None
            try:
                parts = resp.json()["candidates"][0]["content"]["parts"]
                text = [
                    p["text"]
                    for p in parts
                    if isinstance(p, dict) and not p.get("thought") and "text" in p
                ][-1]
                by_index = parse_labels(str(text), len(tokens))
            except (KeyError, IndexError, TypeError, ValueError):
                return None
            return {address: by_index.get(i) for i, (address, _, _) in enumerate(tokens, 1)}
        return None
