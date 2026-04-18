import json

class ReportGenerator:
    def __init__(self):
        self.data = {}

    def update(self, tracks, time_data, speeds, loitering_ids):
        for track in tracks:
            _, _, _, _, tid = track

            if tid not in self.data:
                self.data[tid] = {
                    "time": 0,
                    "avg_speed": 0,
                    "loitering": False
                }

            # update time
            if tid in time_data:
                self.data[tid]["time"] = round(time_data[tid], 2)

            # update speed
            if tid in speeds:
                self.data[tid]["avg_speed"] = round(speeds[tid], 2)

            # update loitering
            if tid in loitering_ids:
                self.data[tid]["loitering"] = True

    def generate(self):
        print("\n--- FINAL REPORT ---")

        # ✅ save to file
        with open("reports/output.json", "w") as f:
            json.dump(self.data, f, indent=4)

        print("Report saved to reports/output.json")