class PathTracker:
    def __init__(self):
        self.paths = {}
        self.max_length = 20   # ✅ limit path length

    def update(self, tracks):
        for track in tracks:
            x1, y1, x2, y2, track_id = track

            center_x = (x1 + x2) // 2
            center_y = (y1 + y2) // 2

            if track_id not in self.paths:
                self.paths[track_id] = []

            if self.paths[track_id]:
                px, py = self.paths[track_id][-1]
                center_x = int((px + center_x) / 2)
                center_y = int((py + center_y) / 2)

            self.paths[track_id].append((center_x, center_y))
            # 🔥 IMPORTANT: limit size
            if len(self.paths[track_id]) > self.max_length:
                self.paths[track_id].pop(0)

    def get_paths(self):
        return self.paths