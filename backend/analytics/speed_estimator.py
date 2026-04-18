import math
import time

class SpeedEstimator:
    def __init__(self):
        self.prev_positions = {}
        self.prev_time = {}

    def update(self, tracks):
        speeds = {}
        current_time = time.time()

        for track in tracks:
            x1, y1, x2, y2, track_id = track

            cx = (x1 + x2) // 2
            cy = (y1 + y2) // 2

            if track_id in self.prev_positions:
                px, py = self.prev_positions[track_id]
                dt = current_time - self.prev_time[track_id]

                if dt > 0:
                    dist = math.sqrt((cx - px)**2 + (cy - py)**2)
                    speed = dist / dt   # pixels per second
                    speeds[track_id] = speed

            self.prev_positions[track_id] = (cx, cy)
            self.prev_time[track_id] = current_time

        return speeds