"""LLM narrative relevance classifier (D4): Gemini Flash-Lite primary, MiMo-V2.5 fallback."""

from nti_classifier.protocol import LLM, ClassResult, PostIn, PromptSpec

__all__ = ["LLM", "ClassResult", "PostIn", "PromptSpec"]
