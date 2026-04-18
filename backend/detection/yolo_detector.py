from ultralytics import YOLO
import torch

class YOLODetector:
    def __init__(self):
        self.device = 'cuda' if torch.cuda.is_available() else 'cpu'
        print("Using device:", self.device)

        self.model = YOLO("yolov8n.pt")

    def detect(self, frame):
        results = self.model(
            frame,
            device=self.device,
            imgsz=480,     # smaller = faster + cooler
            half=True      # FP16 = faster GPU
        )

        detections = []

        for r in results:
            for box in r.boxes:
                x1, y1, x2, y2 = map(int, box.xyxy[0])
                conf = float(box.conf[0])
                cls = int(box.cls[0])

                if cls == 0 and conf > 0.4:  # person
                    detections.append([x1, y1, x2, y2, conf])

        return detections