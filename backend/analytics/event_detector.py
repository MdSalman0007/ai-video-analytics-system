class EventDetector:
    def __init__(self, threshold=10):
        self.threshold = threshold  # seconds

    def detect_loitering(self, time_data):
        loitering_ids = []

        for track_id, t in time_data.items():
            if t > self.threshold:
                loitering_ids.append(track_id)

        return loitering_ids