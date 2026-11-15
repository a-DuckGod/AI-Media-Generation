import app


def create_client():
    app.app.config["TESTING"] = True
    return app.app.test_client()


def test_invalid_model_returns_error(monkeypatch):
    client = create_client()

    def fake_post(*args, **kwargs):
        raise AssertionError("requests.post should not be called")

    monkeypatch.setattr(app.requests, "post", fake_post)

    for invalid_model in ("imagen-unknown", "sora", "veo"):
        response = client.post(
            "/generate",
            json={"prompt": "hi", "model": invalid_model, "google_key": "dummy"},
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

    resp = client.post("/generate", json={"prompt": "   ", "model": "gpt-image-1.5-med"})
    assert resp.status_code == 400
    assert resp.get_json() == {"error": "Prompt and model ID are required."}

    non_json = client.post("/generate", data="not json", content_type="text/plain")
    assert non_json.status_code == 400
    assert non_json.get_json() == {"error": "Prompt and model ID are required."}


def test_missing_api_key_returns_400():
    client = create_client()

    openai_resp = client.post("/generate", json={"prompt": "a cat", "model": "gpt-image-1.5-med"})
    assert openai_resp.status_code == 400
    assert openai_resp.get_json() == {"error": "OpenAI API Key is required for this model."}

    google_resp = client.post(
        "/generate", json={"prompt": "a cat", "model": "gemini-nano-banana-2.1"}
    )
    assert google_resp.status_code == 400
    assert google_resp.get_json() == {"error": "Google API Key is required for this model."}


def test_gemini_nano_banana_returns_data_url(monkeypatch):
    client = create_client()

    class FakeResponse:
        ok = True
        status_code = 200

        def json(self):
            return {
                "candidates": [
                    {
                        "content": {
                            "parts": [
                                {"inlineData": {"mimeType": "image/png", "data": "ZmFrZQ=="}}
                            ]
                        }
                    }
                ]
            }

    monkeypatch.setattr(app.requests, "post", lambda *args, **kwargs: FakeResponse())

    resp = client.post(
        "/generate",
        json={"prompt": "a sunset", "model": "gemini-nano-banana-2.1", "google_key": "dummy"},
    )
    assert resp.status_code == 200
    assert resp.get_json() == {"media_urls": ["data:image/png;base64,ZmFrZQ=="]}


def test_gpt_image_returns_b64_data_url(monkeypatch):
    client = create_client()

    class FakeItem:
        b64_json = "b3BlbmFp"
        url = None

    class FakeResult:
        data = [FakeItem()]

    class FakeImages:
        def generate(self, **kwargs):
            assert kwargs["model"] == "gpt-image-1.5"
            assert kwargs["quality"] == "high"
            return FakeResult()

    class FakeClient:
        def __init__(self, api_key):
            assert api_key == "sk-test"
            self.images = FakeImages()

    monkeypatch.setattr(app, "OpenAI", FakeClient)

    resp = client.post(
        "/generate",
        json={"prompt": "a sunset", "model": "gpt-image-1.5-high", "openai_key": "sk-test"},
    )
    assert resp.status_code == 200
    assert resp.get_json() == {"media_urls": ["data:image/png;base64,b3BlbmFp"]}
