import os
import sqlite3
import base64
import json
import time
import uuid
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import numpy as np
import cv2
import kociemba

app = Flask(__name__, static_folder=".", static_url_path="")
CORS(app)

BASE_DIR  = os.path.dirname(os.path.abspath(__file__))
DB_PATH   = os.path.join(BASE_DIR, "rubiks.db")
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS sessions (
                id          TEXT PRIMARY KEY,
                created_at  TEXT NOT NULL,
                cube_state  TEXT,
                solution    TEXT,
                move_count  INTEGER,
                solve_time  REAL,
                input_mode  TEXT
            );

            CREATE TABLE IF NOT EXISTS captures (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id  TEXT NOT NULL,
                face        TEXT NOT NULL,
                image_path  TEXT,
                detected    TEXT,
                captured_at TEXT NOT NULL,
                FOREIGN KEY (session_id) REFERENCES sessions(id)
            );
        """)


init_db()


HSV_RANGES = {
    "white":  [(0,   0,  180), (180,  60, 255)],
    "yellow": [(20, 100,  100), (35,  255, 255)],
    "red":    [(0,  120,   70), (10,  255, 255)],
    "red2":   [(170, 120,  70), (180, 255, 255)],
    "orange": [(11, 150,   70), (22,  255, 255)],
    "green":  [(40,  60,   40), (85,  255, 255)],
    "blue":   [(90,  60,   40), (130, 255, 255)],
}

def _classify_pixel(bgr_pixel: np.ndarray) -> str:
    hsv = cv2.cvtColor(np.uint8([[bgr_pixel]]), cv2.COLOR_BGR2HSV)[0][0]

    best_color = "white"
    best_score = -1

    for color, (lo, hi) in {
        "white":  (HSV_RANGES["white"][0],  HSV_RANGES["white"][1]),
        "yellow": (HSV_RANGES["yellow"][0], HSV_RANGES["yellow"][1]),
        "red":    (HSV_RANGES["red"][0],    HSV_RANGES["red"][1]),
        "red2":   (HSV_RANGES["red2"][0],   HSV_RANGES["red2"][1]),
        "orange": (HSV_RANGES["orange"][0], HSV_RANGES["orange"][1]),
        "green":  (HSV_RANGES["green"][0],  HSV_RANGES["green"][1]),
        "blue":   (HSV_RANGES["blue"][0],   HSV_RANGES["blue"][1]),
    }.items():
        lo_arr = np.array(lo); hi_arr = np.array(hi)
        if np.all(hsv >= lo_arr) and np.all(hsv <= hi_arr):
            score = int(hsv[1]) + int(hsv[2])
            if score > best_score:
                best_score = score
                best_color = "red" if color == "red2" else color

    return best_color


def detect_colors_from_image(image_data: bytes) -> list[str]:
    np_arr = np.frombuffer(image_data, np.uint8)
    img    = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
    if img is None:
        raise ValueError("Could not decode image")

    h, w = img.shape[:2]
    cell_h = h // 3
    cell_w = w // 3
    colors = []

    for row in range(3):
        for col in range(3):
            y1 = row * cell_h + cell_h // 5
            y2 = (row + 1) * cell_h - cell_h // 5
            x1 = col * cell_w + cell_w // 5
            x2 = (col + 1) * cell_w - cell_w // 5
            patch = img[y1:y2, x1:x2]

            data = patch.reshape(-1, 3).astype(np.float32)
            _, _, centers = cv2.kmeans(
                data, 1, None,
                (cv2.TERM_CRITERIA_EPS + cv2.TERM_CRITERIA_MAX_ITER, 10, 1.0),
                3, cv2.KMEANS_RANDOM_CENTERS
            )
            dominant_bgr = centers[0].astype(np.uint8)
            colors.append(_classify_pixel(dominant_bgr))

    return colors


FACE_ORDER  = ["U", "R", "F", "D", "L", "B"]
COLOR_CHAR  = {"white": "U", "red": "R", "green": "F",
               "yellow": "D", "orange": "L", "blue": "B"}

def cube_state_to_kociemba_string(cube_state: dict) -> str:
    result = ""
    for face in FACE_ORDER:
        for color in cube_state[face]:
            ch = COLOR_CHAR.get(color)
            if ch is None:
                raise ValueError(f"Unknown color '{color}' on face {face}")
            result += ch
    return result


def validate_cube_state(cube_state: dict) -> tuple[bool, str]:
    counts = {c: 0 for c in COLOR_CHAR}
    for face in FACE_ORDER:
        if face not in cube_state:
            return False, f"Missing face '{face}'"
        if len(cube_state[face]) != 9:
            return False, f"Face '{face}' must have 9 stickers, got {len(cube_state[face])}"
        for color in cube_state[face]:
            if color not in counts:
                return False, f"Unknown color '{color}'"
            counts[color] += 1

    for color, count in counts.items():
        if count != 9:
            return False, f"Color '{color}' appears {count} times (expected 9)"

    return True, "OK"


@app.route("/")
def index():
    return send_from_directory(BASE_DIR, "index1.html")


@app.route("/api/session", methods=["POST"])
def create_session():
    session_id = str(uuid.uuid4())
    mode       = request.json.get("input_mode", "manual") if request.is_json else "manual"

    with get_db() as conn:
        conn.execute(
            "INSERT INTO sessions (id, created_at, input_mode) VALUES (?, ?, ?)",
            (session_id, datetime.utcnow().isoformat(), mode)
        )

    return jsonify({"session_id": session_id}), 201


@app.route("/api/session/<session_id>", methods=["GET"])
def get_session(session_id):
    with get_db() as conn:
        row = conn.execute(
            "SELECT * FROM sessions WHERE id = ?", (session_id,)
        ).fetchone()

    if not row:
        return jsonify({"error": "Session not found"}), 404

    return jsonify(dict(row))


@app.route("/api/solve", methods=["POST"])
def solve():
    data = request.get_json(force=True)
    session_id  = data.get("session_id")
    cube_state  = data.get("cube_state")

    if not cube_state:
        return jsonify({"error": "cube_state is required"}), 400

    valid, msg = validate_cube_state(cube_state)
    if not valid:
        return jsonify({"error": msg}), 422

    try:
        kociemba_str = cube_state_to_kociemba_string(cube_state)
        t0       = time.time()
        raw_sol  = kociemba.solve(kociemba_str)
        solve_time = round(time.time() - t0, 4)
    except Exception as e:
        return jsonify({"error": f"Solver error: {str(e)}"}), 500

    solution   = raw_sol.strip().split()
    move_count = len(solution)

    if session_id:
        with get_db() as conn:
            conn.execute(
                """UPDATE sessions
                   SET cube_state=?, solution=?, move_count=?, solve_time=?
                   WHERE id=?""",
                (json.dumps(cube_state), json.dumps(solution),
                 move_count, solve_time, session_id)
            )

    return jsonify({
        "solution":   solution,
        "move_count": move_count,
        "solve_time": solve_time,
        "kociemba_input": kociemba_str
    })


@app.route("/api/detect-colors", methods=["POST"])
def detect_colors():
    face       = request.form.get("face") or request.args.get("face", "U")
    session_id = request.form.get("session_id")

    image_data = None
    if "image" in request.files:
        image_data = request.files["image"].read()
    elif "image_b64" in request.form:
        b64 = request.form["image_b64"]
        if "," in b64:
            b64 = b64.split(",", 1)[1]
        image_data = base64.b64decode(b64)
    else:
        body = request.get_json(silent=True) or {}
        b64  = body.get("image_b64", "")
        if b64:
            if "," in b64:
                b64 = b64.split(",", 1)[1]
            image_data = base64.b64decode(b64)

    if not image_data:
        return jsonify({"error": "No image provided (use 'image' file field or 'image_b64')"}), 400

    if face not in ("U", "R", "F", "D", "L", "B"):
        return jsonify({"error": f"Invalid face '{face}'"}), 400

    try:
        colors = detect_colors_from_image(image_data)
    except Exception as e:
        return jsonify({"error": f"Color detection failed: {str(e)}"}), 500

    if session_id:
        filename   = f"{session_id}_{face}_{int(time.time())}.jpg"
        filepath   = os.path.join(UPLOAD_DIR, filename)
        with open(filepath, "wb") as f:
            f.write(image_data)

        with get_db() as conn:
            conn.execute(
                """INSERT INTO captures (session_id, face, image_path, detected, captured_at)
                   VALUES (?, ?, ?, ?, ?)""",
                (session_id, face, filepath, json.dumps(colors),
                 datetime.utcnow().isoformat())
            )

    return jsonify({"face": face, "colors": colors})


@app.route("/api/history", methods=["GET"])
def history():
    with get_db() as conn:
        rows = conn.execute(
            """SELECT id, created_at, move_count, solve_time, input_mode
               FROM sessions
               WHERE solution IS NOT NULL
               ORDER BY created_at DESC
               LIMIT 20"""
        ).fetchall()

    return jsonify([dict(r) for r in rows])


@app.route("/api/validate", methods=["POST"])
def validate():
    data       = request.get_json(force=True)
    cube_state = data.get("cube_state", {})
    valid, msg = validate_cube_state(cube_state)
    return jsonify({"valid": valid, "message": msg})


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "timestamp": datetime.utcnow().isoformat()})


if __name__ == "__main__":
    print("🟩  Rubik's Cube Solver backend starting on http://localhost:5000")
    app.run(debug=True, port=5000)