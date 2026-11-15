# AI Media Generator

A lightweight, Bring-Your-Own-Key (BYOK) web application for generating AI images using **OpenAI DALL·E** and **Google Imagen** models. A single Flask service hosts both the web interface and the `/generate` API.

## Features

- **Unified Single-Service Architecture**: Flask serves the frontend (`index.html`, `logo.png`) and backend API (`/generate`, `/health`) from one deployment.
- **Bring Your Own Key (BYOK)**: Users enter their own OpenAI and/or Google AI API keys in the browser (with optional `localStorage` persistence). No server-side API keys are stored.
- **Supported Models**:
  - **OpenAI**: DALL·E 3 (HD & Standard), DALL·E 2 (1024px & 512px)
  - **Google**: Imagen 4 (Ultra & Standard), Imagen 3
- **Container & PaaS Ready**: Includes a `Dockerfile` for Google Cloud Run and a `Procfile` for Render / Buildpacks.

## Project Structure

```text
.
├── app.py              # Flask application (UI routes, /health, /generate)
├── index.html          # Single-page Tailwind CSS frontend
├── logo.png            # Site logo & favicon
├── test_app.py         # Pytest unit tests
├── requirements.txt    # Python dependencies
├── Dockerfile          # Production container image for Cloud Run
├── .dockerignore       # Docker build exclusions
└── Procfile            # Process definition for Render / Buildpacks
```

## Local Development

1. **Create and activate a virtual environment:**

   ```bash
   python3 -m venv .venv
   source .venv/bin/activate  # Windows: .venv\Scripts\activate
   ```

2. **Install dependencies:**

   ```bash
   pip install -r requirements.txt
   ```

3. **Run the app:**

   ```bash
   python app.py
   ```

   Open `http://127.0.0.1:5000` in your browser.

4. **Run tests:**

   ```bash
   pip install pytest
   pytest -v
   ```

## Deployment

### Render (Single Python Web Service)
- **Runtime**: Python 3
- **Build Command**: `pip install -r requirements.txt`
- **Start Command**: `gunicorn --bind 0.0.0.0:$PORT --workers 1 --threads 8 --timeout 0 app:app`

### Google Cloud Run
Cloud Run builds directly from the included `Dockerfile` (listening on `$PORT`, defaulting to `8080`) and exposes `/health` for health checks.
