import httpx
import pytest
from nti_fetcher.storage import SupabaseStorage


@pytest.mark.asyncio
@pytest.mark.parametrize("requested,expected", [(None, 1507), (1400, 1400), (0, 0)])
async def test_select_reads_every_page_without_silent_server_truncation(requested, expected):
    rows = [{"user_id": i} for i in range(1507)]
    offsets = []

    def serve(request):
        offset = int(request.url.params.get("offset", "0"))
        size = min(1000, int(request.url.params.get("limit", "1000")))
        offsets.append(offset)
        assert request.url.params["order"] == "user_id.asc"
        return httpx.Response(200, json=rows[offset : offset + size])

    async with httpx.AsyncClient(transport=httpx.MockTransport(serve)) as client:
        storage = SupabaseStorage("https://db.invalid", "test", client=client)
        result = await storage.select("kols", order="user_id.asc", limit=requested)
    assert [r["user_id"] for r in result] == list(range(expected))
    assert len(offsets) >= (2 if expected > 1000 else 0)
    if requested == 0:
        assert offsets == []


@pytest.mark.asyncio
async def test_upsert_chunks_large_batches_to_avoid_statement_timeout():
    batch_sizes: list[int] = []

    def serve(request: httpx.Request) -> httpx.Response:
        import json

        payload = json.loads(request.content.decode("utf-8"))
        batch_sizes.append(len(payload))
        return httpx.Response(201, content=b"")

    rows = [{"tweet_id": i} for i in range(1205)]
    async with httpx.AsyncClient(transport=httpx.MockTransport(serve)) as client:
        storage = SupabaseStorage("https://db.invalid", "test", client=client)
        await storage.upsert_posts(rows)
    assert batch_sizes == [500, 500, 205]
