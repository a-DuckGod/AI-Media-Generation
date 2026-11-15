import os
import traceback
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from openai import OpenAI
import requests

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

OPENAI_MODELS = {
    "gpt-image-1.5-high": {"model": "gpt-image-1.5", "quality": "high", "size": "1024x1024"},
    "gpt-image-1.5-med": {"model": "gpt-image-1.5", "quality": "medium", "size": "1024x1024"},
    "gpt-image-1-high": {"model": "gpt-image-1", "quality": "high", "size": "1024x1024"},
    "gpt-image-1-med": {"model": "gpt-image-1", "quality": "medium", "size": "1024x1024"},
    "gpt-image-1-mini": {"model": "gpt-image-1-mini", "quality": "medium", "size": "1024x1024"},
    "dalle-3-hd": {"model": "dall-e-3", "quality": "hd", "size": "1024x1024"},
    "dalle-3-std": {"model": "dall-e-3", "quality": "standard", "size": "1024x1024"},
    "dalle-2-1024": {"model": "dall-e-2", "size": "1024x1024"},
    "dalle-2-512": {"model": "dall-e-2", "size": "512x512"},
}

GEMINI_IMAGE_MODELS = {
    "gemini-nano-banana-2.1": "gemini-nano-banana-2.1",
    "gemini-3-pro-image": "gemini-3-pro-image",
    "gemini-3.1-flash-image": "gemini-3.1-flash-image",
    "gemini-3.1-flash-lite-image": "gemini-3.1-flash-lite-image",
    "gemini-2.5-flash-image": "gemini-2.5-flash-image",
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

        if model_id in OPENAI_MODELS:
            if not user_openai_key:
                return jsonify({"error": "OpenAI API Key is required for this model."}), 400

            client = OpenAI(api_key=user_openai_key)
            params = {"prompt": prompt, "n": 1, **OPENAI_MODELS[model_id]}

            response = client.images.generate(**params)
            item = response.data[0]
            if getattr(item, "b64_json", None):
                media_urls.append(f"data:image/png;base64,{item.b64_json}")
            elif getattr(item, "url", None):
                media_urls.append(item.url)
            else:
                return jsonify({"error": "OpenAI API did not return an image."}), 502

        elif model_id in GEMINI_IMAGE_MODELS:
            if not user_google_key:
                return jsonify({"error": "Google API Key is required for this model."}), 400

            model_name = GEMINI_IMAGE_MODELS[model_id]
            api_url = (
                f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent"
                f"?key={user_google_key}"
            )
            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"responseModalities": ["IMAGE"]},
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
            for candidate in result.get("candidates") or []:
                parts = (candidate.get("content") or {}).get("parts") or []
                for part in parts:
                    inline = part.get("inlineData")
                    if inline and inline.get("data"):
                        mime_type = inline.get("mimeType") or "image/png"
                        media_urls.append(f"data:{mime_type};base64,{inline['data']}")
                        break
                if media_urls:
                    break

            if not media_urls:
                return jsonify({"error": "Google API did not return an image."}), 502

        else:
            return jsonify({"error": "Invalid model ID provided."}), 400

        return jsonify({"media_urls": media_urls})

    except Exception as e:
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)