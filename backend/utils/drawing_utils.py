import cv2


# 🟢 Draw bounding boxes + IDs (with highlight)
def draw_tracks(frame, tracks, highlight_ids=None):
    highlight_ids = set(highlight_ids or [])

    for x1, y1, x2, y2, track_id in tracks:

        if track_id in highlight_ids:
            color = (0, 0, 255)   # 🔴 RED (inside zone)
        else:
            color = (0, 255, 0)   # 🟢 GREEN (outside zone)

        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

        cv2.putText(frame, f"ID:{track_id}",
                    (x1, y1 - 10),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.6, color, 2)

    return frame


# 🔵 Draw paths
def draw_paths(frame, paths):
    for track_id, points in paths.items():
        for i in range(1, len(points)):
            cv2.line(frame, points[i - 1], points[i], (255, 0, 0), 2)
    return frame


# 🟡 NEW: Combined label (time + speed)
def draw_labels(frame, tracks, time_data, speeds, show_time=True, show_speed=True):
    for x1, y1, x2, y2, tid in tracks:
        parts = [f"ID:{tid}"]

        if show_time and tid in time_data:
            parts.append(f"{time_data[tid]:.1f}s")

        if show_speed and tid in speeds:
            parts.append(f"{speeds[tid]:.1f}px/s")

        label = f"ID:{tid}"

        if show_time and tid in time_data:
            label += f" {time_data[tid]:.1f}s"
        cv2.putText(frame, label,
                    (x1, y1 - 25),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.5, (255, 255, 255), 2)

    return frame


# 🔴 Draw zone
def draw_zone(frame, zone):
    x1, y1, x2, y2 = zone

    cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 0, 255), 2)
    cv2.putText(frame, "ZONE",
                (x1, y1 - 10),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.6, (0, 0, 255), 2)

    return frame


# 🚨 Draw alert
def draw_alert(frame, loitering_ids):
    if not loitering_ids:
        return frame

    text = f"LOITERING: {loitering_ids[0]}" if loitering_ids else ""
    cv2.putText(frame, text,
                (10, 30),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7, (0, 0, 255), 2)

    return frame