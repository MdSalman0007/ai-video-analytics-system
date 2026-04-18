import cv2

def get_video(source):
    if source == "camera":
        return cv2.VideoCapture(0)
    else:
        return cv2.VideoCapture(source)