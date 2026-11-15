from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS 
from openai import OpenAI
import os
import requests 

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# --- FLASK APP ---
app = Flask(__name__)
# This allows your live frontend to talk to your live backend
CORS(app, origins=["http://127.0.0.1:5500", "null", "https://ai-media-generation.onrender.com", "https://ai-media-generator-w67t.onrender.com", "https://ai-media-generator-fv1a.onrender.com"])

@app.route('/')
def serve_index():
    return send_from_directory(BASE_DIR, 'index.html')

@app.route('/logo.png')
def serve_logo():
    return send_from_directory(BASE_DIR, 'logo.png')

@app.route('/generate', methods=['POST'])
def generate_content():
    data = request.get_json()
    prompt = data.get('prompt')
    model_id = data.get('model')
    
    # Get user-provided keys from the request body
    user_openai_key = data.get('openai_key')
    user_google_key = data.get('google_key')

    if not prompt or not model_id:
        return jsonify({'error': 'Prompt and model ID are required.'}), 400

    try:
        media_urls = []
        
        # --- OpenAI Model Logic ---
        if model_id.startswith("dalle"):
            if not user_openai_key:
                return jsonify({'error': 'OpenAI API Key is required for this model.'}), 400
            
            client = OpenAI(api_key=user_openai_key)
            
            params = {'model': 'dall-e-3', 'prompt': prompt, 'n': 1, 'size': '1024x1024'}
            
            if model_id == "dalle-3-hd":
                params['quality'] = 'hd'
            elif model_id == "dalle-3-std":
                params['quality'] = 'standard'
            elif model_id == "dalle-2-1024":
                params['model'] = 'dall-e-2'
            elif model_id == "dalle-2-512":
                params['model'] = 'dall-e-2'
                params['size'] = '512x512'

            response = client.images.generate(**params)
            media_urls.append(response.data[0].url)
            
        # --- Google Model Logic ---
        elif model_id.startswith("imagen"):
            if not user_google_key:
                return jsonify({'error': 'Google API Key is required for this model.'}), 400

            model_name_map = {
                "imagen-4-ultra": "imagen-4.0-ultra-generate-preview-06-06",
                "imagen-4-std": "imagen-4.0-generate-preview-06-06",
                "imagen-3": "imagen-3.0-generate-002"
            }
            model_name = model_name_map.get(model_id)
            if not model_name:
                return jsonify({'error': 'Invalid model ID provided.'}), 400

            api_url = (
                f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:predict?key={user_google_key}"
            )
            payload = {"instances": [{"prompt": prompt}], "parameters": {"sampleCount": 1}}
            
            api_response = requests.post(api_url, json=payload)
            api_response.raise_for_status()
            result = api_response.json()

            if "predictions" not in result or not result["predictions"]:
                raise Exception("Google API did not return a prediction.")
            
            base64_image = result["predictions"][0]["bytesBase64Encoded"]
            media_urls.append(f"data:image/png;base64,{base64_image}")

        # --- Placeholder Video Logic ---
        elif model_id in ["sora", "veo"]:
            media_urls.append(
                "https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4"
            )
            
        else:
            return jsonify({'error': 'Invalid model ID provided.'}), 400

        return jsonify({'media_urls': media_urls})

    except Exception as e:
        import traceback
        traceback.print_exc() 
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    # Use port 5000 for local development for consistency
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)