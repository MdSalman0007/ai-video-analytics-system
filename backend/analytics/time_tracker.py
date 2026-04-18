import time

class TimeTracker:
    def __init__(self):
        self.start_times = {}
        self.total_times = {}

    def update(self, tracks):
        current_time = time.time()

        for track in tracks:
            _, _, _, _, track_id = track

            if track_id not in self.start_times:
                self.start_times[track_id] = current_time

            self.total_times[track_id] = current_time - self.start_times[track_id]

    def get_times(self):
        return self.total_times