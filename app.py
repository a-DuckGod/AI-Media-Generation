from flask import Flask, request, jsonify
from flask_cors import CORS 
from openai import OpenAI
import os
import requests 

# --- SECURE API CLIENT SETUP ---
# The keys are now loaded ONLY from environment variables.
# This makes your code safe to share.
openai_api_key = os.environ.get("OPENAI_API_KEY")
google_api_key = os.environ.get("GOOGLE_API_KEY")

if not openai_api_key or not google_api_key:
    # This check prevents the app from starting if keys are missing.
    raise ValueError("API keys for OpenAI and Google must be set as environment variables.")

openai_client = OpenAI(api_key=openai_api_key)

# --- FLASK APP ---
app = Flask(__name__)
CORS(app, origins=["http://127.0.0.1:5500", "null", "https://ai-media-generator-w67t.onrender.com"])

@app.route('/generate', methods=['POST'])
def generate_content():
    data = request.get_json()
    prompt = data.get('prompt')
    model_id = data.get('model')

    if not prompt or not model_id:
        return jsonify({'error': 'Prompt and model ID are required.'}), 400

    try:
        media_urls = []
        
        # --- OpenAI Model Logic ---
        if model_id == "dalle-3-hd":
            response = openai_client.images.generate(model="dall-e-3", prompt=prompt, n=1, size="1024x1024", quality="hd")
            media_urls.append(response.data[0].url)
        elif model_id == "dalle-3-std":
            response = openai_client.images.generate(model="dall-e-3", prompt=prompt, n=1, size="1024x1024", quality="standard")
            media_urls.append(response.data[0].url)
        elif model_id == "dalle-2-1024":
            response = openai_client.images.generate(model="dall-e-2", prompt=prompt, n=1, size="1024x1024")
            media_urls.append(response.data[0].url)
        elif model_id == "dalle-2-512":
            response = openai_client.images.generate(model="dall-e-2", prompt=prompt, n=1, size="512x512")
            media_urls.append(response.data[0].url)
            
        # --- Google Model Logic ---
        elif model_id in ["imagen-4-ultra", "imagen-4-std", "imagen-3"]:
            model_name = {
                "imagen-4-ultra": "imagen-4.0-ultra-generate-preview-06-06",
                "imagen-4-std": "imagen-4.0-generate-preview-06-06",
                "imagen-3": "imagen-3.0-generate-002"
            }[model_id]
            
            api_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:predict?key={google_api_key}"
            payload = {"instances": [{"prompt": prompt}], "parameters": {"sampleCount": 1}}
            
            api_response = requests.post(api_url, json=payload)
            api_response.raise_for_status()
            result = api_response.json()

            if "predictions" not in result or not result["predictions"]:
                raise Exception("Google API did not return a prediction.")
            
            base64_image = result["predictions"][0]["bytesBase64Encoded"]
            media_urls.append(f"data:image/png;base64,{base64_image}")

        # --- Placeholder Video Logic ---
        elif model_id == "sora":
            media_urls.append("https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4")
        elif model_id == "veo":
            media_urls.append("https://storage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4")
            
        else:
            return jsonify({'error': 'Invalid model ID provided.'}), 400

        return jsonify({'media_urls': media_urls})

    except Exception as e:
        import traceback
        traceback.print_exc() 
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # The debug=True flag is removed for production deployment
    # A production-ready web server like Gunicorn will be used instead.
    app.run(host='0.0.0.0', port=int(os.environ.get('PORT', 8080)))