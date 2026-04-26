from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import json, asyncio, uuid
from dotenv import load_dotenv

from tool import web_search, scrape_url, search_images
from agent import build_search_agent, build_reader_agent, writer_chain, critic_chain

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class ResearchRequest(BaseModel):
    topic: str


# store topic per session so stream route can access it
SESSION_TOPICS = {}


async def run_pipeline_stream(session_id: str, topic: str):

    def send(event, data):
        return f"data: {json.dumps({'event': event, **data})}\n\n"

    try:
        # ── Step 1: Search ────────────────────────────────────────────────────
        yield send("step_start", {"step": "search"})
        search_agent = build_search_agent()
        sr = await asyncio.to_thread(
            search_agent.invoke,
            {"messages": [("user", f"Find recent, reliable and detailed information about: {topic}")]}
        )
        search_content = sr["messages"][-1].content
        yield send("step_done", {"step": "search"})

        # ── Step 2: Reader ────────────────────────────────────────────────────
        yield send("step_start", {"step": "reader"})
        reader_agent = build_reader_agent()
        rr = await asyncio.to_thread(
            reader_agent.invoke,
            {"messages": [("user",
                f"Based on search results about '{topic}', "
                f"pick the most relevant URL and scrape it.\n\nSearch Results:\n{search_content[:800]}"
            )]}
        )
        reader_content = rr["messages"][-1].content
        yield send("step_done", {"step": "reader"})

        # ── Step 3: Writer ────────────────────────────────────────────────────
        yield send("step_start", {"step": "writer"})
        research = f"SEARCH RESULTS:\n{search_content}\n\nSCRAPED CONTENT:\n{reader_content}"
        report = await asyncio.to_thread(
            writer_chain.invoke,
            {"topic": topic, "research": research}
        )
        yield send("step_done", {"step": "writer"})

        # ── Step 4: Critic ────────────────────────────────────────────────────
        yield send("step_start", {"step": "critic"})
        feedback = await asyncio.to_thread(
            critic_chain.invoke,
            {"report": report}
        )
        yield send("step_done", {"step": "critic"})

        # ── Step 5: Images ────────────────────────────────────────────────────
        yield send("step_start", {"step": "images"})
        images = await asyncio.to_thread(search_images, topic, 6)
        print(f"Images going to frontend: {len(images)}")
        yield send("step_done", {"step": "images"})

        # ── Complete ──────────────────────────────────────────────────────────
        yield send("complete", {
            "report":   report,
            "feedback": feedback,
            "images":   images,
        })

    except Exception as e:
        print(f"PIPELINE ERROR: {e}")
        yield send("error", {"message": str(e)})

    finally:
        # clean up session topic
        SESSION_TOPICS.pop(session_id, None)


# ── Routes ────────────────────────────────────────────────────────────────────
@app.post("/api/research")
async def start(req: ResearchRequest):
    session_id = str(uuid.uuid4())
    # ✅ Store topic so stream can get it reliably
    SESSION_TOPICS[session_id] = req.topic
    return {"session_id": session_id, "topic": req.topic}


@app.get("/api/research/{session_id}/stream")
async def stream(session_id: str, topic: str = ""):
    # ✅ Use stored topic first, fall back to query param
    actual_topic = SESSION_TOPICS.get(session_id) or topic
    print(f"Stream called — session: {session_id}, topic: '{actual_topic}'")

    if not actual_topic:
        from fastapi.responses import JSONResponse
        return JSONResponse({"error": "topic is missing"}, status_code=400)

    return StreamingResponse(
        run_pipeline_stream(session_id, actual_topic),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )


@app.get("/api/health")
def health():
    return {"status": "ok"}