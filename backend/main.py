import cv2
import os

from detection.yolo_detector import YOLODetector
from tracking.deepsort_tracker import Tracker

from analytics.time_tracker import TimeTracker
from analytics.path_tracker import PathTracker
from analytics.speed_estimator import SpeedEstimator
from analytics.zone_detector import ZoneDetector
from analytics.event_detector import EventDetector

from utils.video_utils import get_video
from utils.drawing_utils import (
    draw_tracks,
    draw_paths,
    draw_labels,
    draw_zone,
    draw_alert
)
from analytics.report_generator import ReportGenerator

# 🎯 USER FEATURE CONTROL
def get_user_preferences():

    # If called from UI/backend
    if "SHOW_PATHS" in os.environ:

        return {
            "paths": os.environ["SHOW_PATHS"] == "True",
            "speed": os.environ["SHOW_SPEED"] == "True",
            "zone": os.environ["SHOW_ZONE"] == "True",
            "alert": os.environ["SHOW_ALERT"] == "True",
            "time": os.environ["SHOW_TIME"] == "True"
        }

    # fallback default (if running main.py directly)
    return {
        "paths": True,
        "speed": True,
        "zone": True,
        "alert": True,
        "time": True
    }


def main():
    source = "data/input/video1.mp4"

    # 🎯 Get user choices
    features = get_user_preferences()

    cap = get_video(source)

    os.makedirs("output", exist_ok=True)

    fourcc = cv2.VideoWriter_fourcc(*'avc1')

    out = cv2.VideoWriter(
        "output/processed_video.mp4",
        fourcc,
        20,
        (480,360)
    )
    if not cap.isOpened():
        print("❌ Error: Cannot open video")
        return

    # 🔥 Initialize modules
    detector = YOLODetector()
    tracker = Tracker()

    time_tracker = TimeTracker()
    path_tracker = PathTracker()
    speed_estimator = SpeedEstimator()
    zone_detector = ZoneDetector()
    event_detector = EventDetector()
    report = ReportGenerator()

    frame_count = 0
    detections = []

    while True:
        ret, frame = cap.read()
        if not ret:
            break

        frame_count += 1

        # 🔥 Resize (performance)
        frame = cv2.resize(frame, (480, 360))

        # 🔥 Run detection every 2 frames
        if frame_count % 2 == 0:
            detections = detector.detect(frame)

        # 🔥 Tracking
        tracks = tracker.update(detections, frame)

        # 🔥 Analytics (ALWAYS RUN)
        time_tracker.update(tracks)
        path_tracker.update(tracks)

        speeds = speed_estimator.update(tracks)
        time_data = time_tracker.get_times()

        inside_zone = zone_detector.check(tracks)
        loitering = event_detector.detect_loitering(time_data)
        report.update(tracks, time_data, speeds, loitering)

        # 🎨 DRAWING (CONTROLLED)
        # 🔴 Highlight = zone + loitering
        highlight_ids = set(inside_zone)   # ONLY loitering = red
        # 🟢 Draw boxes
        frame = draw_tracks(frame, tracks, highlight_ids)

        # 🟡 Clean labels (time + speed)
        frame = draw_labels(
            frame,
            tracks,
            time_data,
            speeds,
            show_time=features["time"],
            show_speed=features["speed"]
        )

        # 🚧 Zone
        if features["zone"]:
            frame = draw_zone(frame, zone_detector.zone)

        # 🚨 Alert
        if features["alert"]:
            frame = draw_alert(frame, loitering)

        # 🔵 Paths
        if features["paths"]:
            paths = path_tracker.get_paths()
            frame = draw_paths(frame, paths)

        out.write(frame)
       # cv2.imshow("AI Video Analytics", frame)

        # 🔥 Key toggle (optional)
        fps = cap.get(cv2.CAP_PROP_FPS)

        # fallback if fps = 0
        if fps == 0:
            fps = 30

        delay = int(1000 / fps)

       # key = cv2.waitKey(delay) & 0xFF
        #if key == 27:  # ESC
         #   break

        #if key == ord('p'):
         #   features["paths"] = not features["paths"]

        #if key == ord('s'):
         #   features["speed"] = not features["speed"]

    cap.release()
    out.release()
    #cv2.destroyAllWindows()
    report.generate()


if __name__ == "__main__":
    main()