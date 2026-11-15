import app


def create_client():
    app.app.config["TESTING"] = True
    return app.app.test_client()


def test_invalid_imagen_model_returns_error(monkeypatch):
    client = create_client()

    def fake_post(*args, **kwargs):
        raise AssertionError("requests.post should not be called")

    monkeypatch.setattr(app.requests, "post", fake_post)

    response = client.post(
        "/generate",
        json={"prompt": "hi", "model": "imagen-unknown", "google_key": "dummy"},
    )

    assert response.status_code == 400
    assert response.get_json() == {"error": "Invalid model ID provided."}


def test_serves_frontend_and_logo():
    client = create_client()

    index_resp = client.get("/")
    assert index_resp.status_code == 200
    assert b"AI Media Generator" in index_resp.data

    logo_resp = client.get("/logo.png")
    assert logo_resp.status_code == 200
    assert logo_resp.content_type == "image/png"


def test_health_check():
    client = create_client()
    response = client.get("/health")
    assert response.status_code == 200
    assert response.get_json() == {"status": "ok"}


def test_missing_prompt_or_model_returns_400():
    client = create_client()

    resp = client.post("/generate", json={"prompt": "   ", "model": "dalle-3-std"})
    assert resp.status_code == 400
    assert resp.get_json() == {"error": "Prompt and model ID are required."}

    non_json = client.post("/generate", data="not json", content_type="text/plain")
    assert non_json.status_code == 400
    assert non_json.get_json() == {"error": "Prompt and model ID are required."}


def test_missing_api_key_returns_400():
    client = create_client()

    openai_resp = client.post("/generate", json={"prompt": "a cat", "model": "dalle-3-std"})
    assert openai_resp.status_code == 400
    assert openai_resp.get_json() == {"error": "OpenAI API Key is required for this model."}

    google_resp = client.post("/generate", json={"prompt": "a cat", "model": "imagen-3"})
    assert google_resp.status_code == 400
    assert google_resp.get_json() == {"error": "Google API Key is required for this model."}
