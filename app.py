import os
import traceback
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from openai import OpenAI
import requests

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

IMAGEN_MODEL_MAP = {
    "imagen-4-ultra": "imagen-4.0-ultra-generate-preview-06-06",
    "imagen-4-std": "imagen-4.0-generate-preview-06-06",
    "imagen-3": "imagen-3.0-generate-002",
}

app = Flask(__name__)
CORS(
    app,
    origins=[
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "null",
        "https://ai-media-generation.onrender.com",
        "https://ai-media-generator-w67t.onrender.com",
        "https://ai-media-generator-fv1a.onrender.com",
    ],
)


@app.route("/")
def serve_index():
    return send_from_directory(BASE_DIR, "index.html")


@app.route("/logo.png")
def serve_logo():
    return send_from_directory(BASE_DIR, "logo.png")


@app.route("/health")
def health_check():
    return jsonify({"status": "ok"}), 200


@app.route("/generate", methods=["POST"])
def generate_content():
    data = request.get_json(silent=True) or {}
    prompt = (data.get("prompt") or "").strip()
    model_id = (data.get("model") or "").strip()

    user_openai_key = (data.get("openai_key") or "").strip()
    user_google_key = (data.get("google_key") or "").strip()

    if not prompt or not model_id:
        return jsonify({"error": "Prompt and model ID are required."}), 400

    try:
        media_urls = []

        if model_id.startswith("dalle"):
            if not user_openai_key:
                return jsonify({"error": "OpenAI API Key is required for this model."}), 400

            client = OpenAI(api_key=user_openai_key)
            params = {
                "model": "dall-e-3",
                "prompt": prompt,
                "n": 1,
                "size": "1024x1024",
            }

            if model_id == "dalle-3-hd":
                params["quality"] = "hd"
            elif model_id == "dalle-3-std":
                params["quality"] = "standard"
            elif model_id == "dalle-2-1024":
                params["model"] = "dall-e-2"
            elif model_id == "dalle-2-512":
                params["model"] = "dall-e-2"
                params["size"] = "512x512"
            else:
                return jsonify({"error": "Invalid model ID provided."}), 400

            response = client.images.generate(**params)
            media_urls.append(response.data[0].url)

        elif model_id.startswith("imagen"):
            if not user_google_key:
                return jsonify({"error": "Google API Key is required for this model."}), 400

            model_name = IMAGEN_MODEL_MAP.get(model_id)
            if not model_name:
                return jsonify({"error": "Invalid model ID provided."}), 400

            api_url = (
                f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:predict"
                f"?key={user_google_key}"
            )
            payload = {
                "instances": [{"prompt": prompt}],
                "parameters": {"sampleCount": 1},
            }

            api_response = requests.post(api_url, json=payload, timeout=60)
            if not api_response.ok:
                err_msg = None
                try:
                    err_msg = api_response.json().get("error", {}).get("message")
                except ValueError:
                    err_msg = None
                return (
                    jsonify({"error": err_msg or f"Google API error ({api_response.status_code})."}),
                    api_response.status_code if 400 <= api_response.status_code < 500 else 502,
                )

            result = api_response.json()
            predictions = result.get("predictions") or []
            if not predictions or "bytesBase64Encoded" not in predictions[0]:
                return jsonify({"error": "Google API did not return a prediction."}), 502

            base64_image = predictions[0]["bytesBase64Encoded"]
            media_urls.append(f"data:image/png;base64,{base64_image}")

        elif model_id in ["sora", "veo"]:
            media_urls.append(
                "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
            )

        else:
            return jsonify({"error": "Invalid model ID provided."}), 400

        return jsonify({"media_urls": media_urls})

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)