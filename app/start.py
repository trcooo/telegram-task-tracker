import os
import threading
import uvicorn

def _run(app, port: int, main: bool):
    config = uvicorn.Config(
        app,
        host="0.0.0.0",
        port=port,
        log_level="info",
        proxy_headers=True,
        forwarded_allow_ips="*",
    )
    server = uvicorn.Server(config)

    if not main:
        # Avoid signal handlers in background thread
        server.install_signal_handlers = lambda: None  # type: ignore

    server.run()

def main():
    from .main import app  # import here to ensure env is loaded first

    main_port = int(os.getenv("PORT", "3000") or "3000")
    # Railway/proxies sometimes route to EXPOSEd or default ports; keep compatibility.
    extra_ports = {3000, 8080} - {main_port}

    for p in sorted(extra_ports):
        t = threading.Thread(target=_run, args=(app, p, False), daemon=True)
        t.start()

    _run(app, main_port, True)

if __name__ == "__main__":
    main()
