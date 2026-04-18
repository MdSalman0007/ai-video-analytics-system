from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from fastapi import UploadFile, File, Form
import shutil

import subprocess
import os
import json

app = FastAPI()

# serve processed video
app.mount("/output", StaticFiles(directory="output"), name="output")

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# request model from React
class Features(BaseModel):
    paths: bool
    speed: bool
    zone: bool
    alert: bool
    time: bool

@app.post("/run")
async def run_analytics(
    video: UploadFile = File(None),
    features: str = Form(None)
):

    # 1 Save uploaded video
    with open("data/input/video1.mp4","wb") as buffer:
        shutil.copyfileobj(video.file, buffer)

    # 2 Read selected features from React
    f = json.loads(features)

    env = os.environ.copy()

    env["SHOW_PATHS"] = str(f["paths"])
    env["SHOW_SPEED"] = str(f["speed"])
    env["SHOW_ZONE"]  = str(f["zone"])
    env["SHOW_ALERT"] = str(f["alert"])
    env["SHOW_TIME"]  = str(f["time"])

    # 3 Run analysis
    subprocess.run(
        ["python","main.py"],
        env=env,
        check=True
    )

    # 4 Load report
    try:
        with open("reports/output.json","r") as file:
            report = json.load(file)
    except:
        report = []

    # 5 Build object list
    objects = []

    for item in report:
        if isinstance(item, dict):
            objects.append({
            "id": item.get("track_id","N/A"),
            "time": item.get("time","N/A"),
            "speed": item.get("speed","N/A"),
            "loitering": item.get("loitering",False)
        })

    else:
        objects.append({
            "id": str(item),
            "time":"N/A",
            "speed":"N/A",
            "loitering":False
        })

    # 6 Return analyzed video
    return {

        "video":"http://127.0.0.1:8000/output/processed_video.mp4",

        "stats":{
            "objects_detected": len(report),
            "active_alerts": len(report),
            "objects_in_zone": len(report),
            "avg_dwell_time":"3m 12s"
        },

        "objects": objects,

        "fps":30
    }