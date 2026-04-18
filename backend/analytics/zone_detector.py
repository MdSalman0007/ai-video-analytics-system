class ZoneDetector:
    def __init__(self):
        # Define rectangular zone (x1, y1, x2, y2)
        self.zone = (100, 100, 350, 350)

    def check(self, tracks):
        inside = []

        zx1, zy1, zx2, zy2 = self.zone

        for track in tracks:
            x1, y1, x2, y2, track_id = track

            cx = (x1 + x2) // 2
            cy = (y1 + y2) // 2

            if zx1 < cx < zx2 and zy1 < cy < zy2:
                inside.append(track_id)

        return inside