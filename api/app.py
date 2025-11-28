from werkzeug.wrappers import Request, Response
from werkzeug.datastructures import Headers

# Import the Flask app from the project's top-level `app.py`.
# This file provides a minimal bridge to let Vercel's Python runtime
# call the existing Flask WSGI app. Note: heavy ML models may be
# too large or slow for Vercel serverless functions — see VERCEL.md.
try:
    from app import app as flask_app
except Exception as e:
    flask_app = None


@Request.application
def _wsgi_app(request):
    if flask_app is None:
        return Response(
            "Flask app could not be imported. See VERCEL.md for details.",
            status=500,
            mimetype="text/plain",
        )

    # Let Flask handle the request by forwarding WSGI environ.
    return request.get_response(flask_app)


def handler(request):
    """Vercel Python function entrypoint.

    The Vercel Python runtime will call `handler(request)` with a
    werkzeug `Request`-like object. We reuse the `Request.application`
    decorator above to convert it into a response.
    """
    return _wsgi_app(request)


if __name__ == "__main__":
    # Local test runner for convenience
    from werkzeug.serving import run_simple

    if flask_app is None:
        print("Flask app not found. Start this from project root where app.py exists.")
    else:
        run_simple("0.0.0.0", 5000, flask_app, use_reloader=True)
