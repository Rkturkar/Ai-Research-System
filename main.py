from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import sqlite3, json, time, asyncio, uuid
from dotenv import load_dotenv

from tool import web_search, scrape_url
from agent import build_search_agent, build_reader_agent, writer_chain, critic_chain

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Models ──
class ResearchRequest(BaseModel):
    topic: str


# ── SSE PIPELINE ──
async def run_pipeline_stream(session_id: str, topic: str):

    def send(event, data):
        return f"data: {json.dumps({'event': event, **data})}\n\n"

    try:
        # STEP 1
        yield send("step_start", {"step": "search"})

        search_agent = build_search_agent()
        sr = await asyncio.to_thread(
            search_agent.invoke,
            {"messages": [("user", f"Find info about: {topic}")]}
        )
        search_content = sr["messages"][-1].content

        yield send("step_done", {"step": "search"})

        # STEP 2
        yield send("step_start", {"step": "reader"})

        reader_agent = build_reader_agent()
        rr = await asyncio.to_thread(
            reader_agent.invoke,
            {"messages": [("user", f"Scrape best URL from:\n{search_content[:800]}")]}
        )
        reader_content = rr["messages"][-1].content

        yield send("step_done", {"step": "reader"})

        # STEP 3
        yield send("step_start", {"step": "writer"})

        research = f"{search_content}\n\n{reader_content}"

        report = await asyncio.to_thread(
            writer_chain.invoke,
            {"topic": topic, "research": research}
        )

        yield send("step_done", {"step": "writer"})

        # STEP 4
        yield send("step_start", {"step": "critic"})

        feedback = await asyncio.to_thread(
            critic_chain.invoke,
            {"report": report}
        )

        yield send("step_done", {"step": "critic"})
        
        images = await asyncio.to_thread(
            fetch_image.invoke,
            topic
        )
        images = images.split('\n')
        # DONE
        yield send("complete", {
            "report": report,
            "feedback": feedback,
            "images":images
        })

    except Exception as e:
        print("ERROR:", str(e))  # 🔥 DEBUG
        yield send("error", {"message": str(e)})


# ── Routes ──
@app.post("/api/research")
async def start(req: ResearchRequest):
    return {"session_id": str(uuid.uuid4())}


@app.get("/api/research/{session_id}/stream")
async def stream(session_id: str, topic: str = ""):
    return StreamingResponse(
        run_pipeline_stream(session_id, topic),
        media_type="text/event-stream"
    )