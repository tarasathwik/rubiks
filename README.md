# Computer Vision–Assisted Rubik's Cube Solver

A full-stack web application that solves a physical Rubik's Cube from either manual color entry or a photo of each face. A Flask backend performs OpenCV-based color detection and calls the Kociemba two-phase algorithm to compute a solution, which is returned to a browser frontend for step-by-step playback.

> **Note:** This was built as a learning project to combine classical computer vision (color segmentation in HSV space) with a well-known cube-solving algorithm, wrapped in a small full-stack app with session history.

## Project Overview

1. **Input** — the cube state is entered manually, captured face-by-face with a camera, or uploaded as images.
2. **Color detection** — each face image is split into a 3×3 grid, the dominant color of each cell is found with k-means, and the color is classified in HSV space.
3. **Validation** — the assembled cube state is checked for exactly 9 stickers per face and exactly 9 of each color before solving.
4. **Solving** — the validated state is converted into Kociemba's string format and solved with the `kociemba` two-phase algorithm.
5. **History** — each session (state, solution, move count, solve time) is stored in SQLite and can be replayed.

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python, Flask, Flask-CORS |
| Computer vision | OpenCV, NumPy |
| Solver | `kociemba` (two-phase algorithm) |
| Database | SQLite |
| Frontend | HTML, CSS, vanilla JavaScript |

## How Color Detection Works

For each face image:
1. The image is divided into a 3×3 grid of cells.
2. Each cell is cropped with a margin (`cell_size // 5` on each side) to avoid sticker edges and glare.
3. `cv2.kmeans` is run on the cropped patch to find its dominant BGR color.
4. The dominant color is converted to HSV and matched against fixed HSV ranges for white, yellow, red, orange, green and blue.
5. Red is split into two HSV ranges (`red` and `red2`) to handle hue wrap-around at 0°/180°, and both are reported as `red`.

**Known limitation:** the HSV ranges are fixed thresholds tuned for specific lighting. Color detection is sensitive to shadows and white balance, and works best under even, bright lighting.

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/session` | Create a new solving session, returns a `session_id`. |
| `GET` | `/api/session/<id>` | Fetch a session's stored state and solution. |
| `POST` | `/api/detect-colors` | Detect the 9 sticker colors on one face from an uploaded or base64 image. |
| `POST` | `/api/validate` | Validate a full cube state (9 stickers/face, 9 of each color) without solving. |
| `POST` | `/api/solve` | Validate and solve a cube state; stores the result if a `session_id` is given. |
| `GET` | `/api/history` | Return the 20 most recent solved sessions. |
| `GET` | `/api/health` | Health check. |

### Example: solving a cube state

```bash
curl -X POST http://localhost:5000/api/solve \
  -H "Content-Type: application/json" \
  -d '{
        "session_id": "optional-session-id",
        "cube_state": {
          "U": ["white","white","white","white","white","white","white","white","white"],
          "R": ["red", "...9 stickers..."],
          "F": ["green", "...9 stickers..."],
          "D": ["yellow", "...9 stickers..."],
          "L": ["orange", "...9 stickers..."],
          "B": ["blue", "...9 stickers..."]
        }
      }'
```

Response:
```json
{
  "solution": ["R", "U", "R'", "U'", "..."],
  "move_count": 20,
  "solve_time": 0.0123,
  "kociemba_input": "UUUUUUUUU..."
}
```

## Database Schema

```sql
CREATE TABLE sessions (
    id TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    cube_state TEXT,
    solution TEXT,
    move_count INTEGER,
    solve_time REAL,
    input_mode TEXT
);

CREATE TABLE captures (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    face TEXT NOT NULL,
    image_path TEXT,
    detected TEXT,
    captured_at TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);
```

## Repository Structure

```
rubiks/
├── app.py             # Flask app: routes, color detection, validation, solving
├── index1.html        # Frontend page
├── script.js          # Frontend logic (capture, calls to the API, playback)
├── style1.css         # Styling
├── requirements.txt   # Python dependencies
└── uploads/           # Captured face images (gitignored, not committed)
```

## Installation & Setup

```bash
# Clone the repository
git clone https://github.com/tarasathwik/rubiks.git
cd rubiks

# Install dependencies
pip install -r requirements.txt

# Run the server
python app.py
```

The app serves the frontend directly from Flask at `http://localhost:5000`.

## Challenges & Solutions

- **Lighting-sensitive color detection:** fixed HSV thresholds misclassified stickers under uneven lighting, most often confusing orange with red and white with yellow. Cropping each cell with a margin before averaging, and using HSV instead of raw RGB, reduced these errors; the manual-entry mode remains available as a fallback.
- **Red hue wrap-around:** red sits at both ends of the HSV hue range (near 0° and 180°), so a single range missed some red stickers. Using two ranges (`red` and `red2`) and merging them fixed this.
- **Validating before solving:** an unsolvable or miscounted cube state previously only surfaced as a generic solver error. Adding `/api/validate` (checking for 9 stickers per face and 9 of each color) catches most input mistakes before the solve call.

## Possible Improvements

- Replace fixed HSV thresholds with a small calibration step (sample known sticker colors at the start of a session).
- Add parity/solvability checks beyond sticker counts, since an invalid-but-balanced cube state can still fail in the solver.
- Containerize the app (Dockerfile) for easier deployment.

## License

This project was built for educational purposes.
