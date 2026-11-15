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

