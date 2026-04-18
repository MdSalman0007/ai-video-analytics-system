from deep_sort_realtime.deepsort_tracker import DeepSort

class Tracker:
    def __init__(self):
        self.tracker = DeepSort(
            max_age=50,
            n_init=3,
            nms_max_overlap=1.0,
            max_cosine_distance=0.3
        )

    def update(self, detections, frame):
        ds_detections = []

        for det in detections:
            x1, y1, x2, y2, conf = det
            w = x2 - x1
            h = y2 - y1

            ds_detections.append(([x1, y1, w, h], conf, 'person'))

        tracks = self.tracker.update_tracks(ds_detections, frame=frame)

        results = []

        for track in tracks:
            if not track.is_confirmed():
                continue

            track_id = track.track_id
            l, t, r, b = map(int, track.to_ltrb())

            results.append([l, t, r, b, track_id])

        return results