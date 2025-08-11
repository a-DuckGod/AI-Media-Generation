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

