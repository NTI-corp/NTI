import json

import httpx
import pytest
from nti_classifier.adapters import MiMoAdapter
from nti_classifier.protocol import ClassResult, PostIn, PromptSpec


@pytest.mark.asyncio
async def test_large_snowflake_ids_never_cross_the_llm_numeric_boundary():
    original = 2001234567890123456

    def serve(request):
        body = json.loads(request.content)
        posts = json.loads(body["messages"][1]["content"])
        assert posts[0]["tweet_id"] == 1
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": '[{"tweet_id":1,"q":{"2":0.9}}]',
                        }
                    }
                ]
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(serve)) as client:
        results = await MiMoAdapter(api_key="test", client=client).classify(
            [PostIn(original, "author", "agent")],
            PromptSpec("v2", "classify", (1, 2)),
        )
    assert results[0].tweet_id == original
    assert results[0].q == {2: 0.9}


@pytest.mark.asyncio
async def test_strict_pipeline_isolates_bad_posts_instead_of_discarding_a_half_batch():
    from nti_classifier.adapters import InvalidResponseError
    from nti_classifier.pipeline import ClassifierPipeline

    class Provider:
        version = "test"

        async def classify(self, posts, spec):
            if any(p.tweet_id == 3 for p in posts):
                raise InvalidResponseError("one malformed result")
            return [ClassResult(tweet_id=p.tweet_id, q={}) for p in posts]

    pipeline = ClassifierPipeline(primary=Provider(), batch_size=8, max_split_depth=4)
    out = await pipeline.run([PostIn(i, "a", "b") for i in range(8)], PromptSpec("v2", "x", (1,)))
    assert out.failed_tweet_ids == (3,)
    assert out.run_record.fallback_zero_count == 1
    assert len(out.results) == 8
