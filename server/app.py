"""Tonix Lab vocal remover server.
Runs the same kind of AI as Ultimate Vocal Remover (MDX-Net models, through the audio-separator library)
on your own computer. No accounts, no limits. Songs stay on your machine."""
import os, uuid, time, threading, queue, shutil, glob
from fastapi import FastAPI, UploadFile, File, HTTPException, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

MODELS = os.environ.get("MODELS_DIR", "/models")
WORK = os.environ.get("WORK_DIR", "/work")
MODEL = os.environ.get("MODEL", "UVR-MDX-NET-Voc_FT.onnx")
PORT = int(os.environ.get("PORT", "8765"))
STUB = os.environ.get("STUB") == "1"            # test mode: no AI, just checks the plumbing
ORIGINS = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]
MAX_MB = int(os.environ.get("MAX_MB", "300"))
KEEP_SECONDS = 6 * 3600
os.makedirs(MODELS, exist_ok=True); os.makedirs(WORK, exist_ok=True)

app = FastAPI(title="Tonix vocal server")
app.add_middleware(CORSMiddleware, allow_origins=ORIGINS, allow_methods=["*"], allow_headers=["*"], max_age=600)

@app.middleware("http")
async def private_network(request: Request, call_next):
    # Chrome asks permission when a public https site talks to a server on your own network.
    if request.method == "OPTIONS" and request.headers.get("access-control-request-private-network"):
        resp = Response(status_code=204)
        o = request.headers.get("origin", "")
        if o in ORIGINS or any(o.startswith(x) for x in ORIGINS if x.startswith("http://")):
            resp.headers["Access-Control-Allow-Origin"] = o
            resp.headers["Access-Control-Allow-Methods"] = "*"
            resp.headers["Access-Control-Allow-Headers"] = request.headers.get("access-control-request-headers", "*")
            resp.headers["Access-Control-Allow-Private-Network"] = "true"
            resp.headers["Vary"] = "Origin"
        return resp
    resp = await call_next(request)
    resp.headers["Access-Control-Allow-Private-Network"] = "true"
    return resp

jobs = {}            # id -> dict(status, message, name, files)
q = queue.Queue()
sep = None
sep_lock = threading.Lock()

def get_sep():
    global sep
    if sep is None:
        from audio_separator.separator import Separator
        sep = Separator(output_dir=os.path.join(WORK, "_out"), model_file_dir=MODELS, output_format="WAV")
        sep.load_model(model_filename=MODEL)
    return sep

def run_job(jid):
    j = jobs[jid]; d = os.path.join(WORK, jid)
    try:
        j.update(status="working", message="Loading the AI model (the first time it downloads, a few minutes)...")
        src = j["src"]
        if STUB:
            time.sleep(1)
            shutil.copy(src, os.path.join(d, "vocals.wav")); shutil.copy(src, os.path.join(d, "music.wav"))
        else:
            with sep_lock:
                s = get_sep(); j.update(message="Separating. A song takes a few minutes on a processor...")
                s.output_dir = d
                try: s.model_instance.output_dir = d
                except Exception: pass
                outs = s.separate(src)
            outs = [o if os.path.isabs(o) else os.path.join(d, os.path.basename(o)) for o in outs]
            outs += [f for f in glob.glob(os.path.join(d, '*.wav')) if f not in outs]
            voc = next((o for o in outs if "(vocals)" in o.lower()), None)
            ins = next((o for o in outs if "(instrumental)" in o.lower() or "(no vocals)" in o.lower()), None)
            if not voc or not ins: raise RuntimeError("The model did not return vocals and music files: " + ", ".join(map(os.path.basename, outs)))
            os.replace(voc, os.path.join(d, "vocals.wav")); os.replace(ins, os.path.join(d, "music.wav"))
        j.update(status="done", message="Done.")
    except Exception as e:
        j.update(status="error", message=str(e) or e.__class__.__name__)

def worker():
    while True:
        jid = q.get()
        try: run_job(jid)
        finally: q.task_done()
threading.Thread(target=worker, daemon=True).start()

def cleanup():
    while True:
        time.sleep(600)
        now = time.time()
        for jid in list(jobs):
            if now - jobs[jid]["t"] > KEEP_SECONDS:
                shutil.rmtree(os.path.join(WORK, jid), ignore_errors=True); jobs.pop(jid, None)
threading.Thread(target=cleanup, daemon=True).start()

@app.get("/health")
def health(): return {"ok": True, "model": MODEL, "stub": STUB, "queued": q.qsize()}

@app.post("/separate")
async def separate(file: UploadFile = File(...)):
    jid = uuid.uuid4().hex[:12]; d = os.path.join(WORK, jid); os.makedirs(d)
    ext = os.path.splitext(file.filename or "")[1].lower()[:8] or ".audio"
    src = os.path.join(d, "input" + ext); size = 0
    with open(src, "wb") as f:
        while True:
            chunk = await file.read(1 << 20)
            if not chunk: break
            size += len(chunk)
            if size > MAX_MB << 20: f.close(); shutil.rmtree(d, ignore_errors=True); raise HTTPException(413, "That file is bigger than %d MB." % MAX_MB)
            f.write(chunk)
    jobs[jid] = dict(status="queued", message="Waiting its turn...", name=os.path.splitext(file.filename or "song")[0], src=src, t=time.time())
    q.put(jid)
    return {"id": jid}

@app.get("/job/{jid}")
def job(jid: str):
    j = jobs.get(jid)
    if not j: raise HTTPException(404, "Unknown or expired job.")
    return {"status": j["status"], "message": j["message"], "name": j["name"]}

@app.get("/file/{jid}/{kind}")
def get_file(jid: str, kind: str):
    j = jobs.get(jid)
    if not j or j["status"] != "done" or kind not in ("vocals", "music"): raise HTTPException(404, "Not ready.")
    return FileResponse(os.path.join(WORK, jid, kind + ".wav"), media_type="audio/wav")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)
