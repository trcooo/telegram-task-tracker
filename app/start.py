import os
import sys
import subprocess
import signal
from typing import List

def uvicorn_cmd(port: int) -> List[str]:
    return [
        sys.executable, "-m", "uvicorn", "app.main:app",
        "--host", "0.0.0.0",
        "--port", str(port),
        "--proxy-headers",
        "--forwarded-allow-ips", "*",
        "--log-level", "info",
    ]

def main():
    # Railway typically sets PORT. Some platforms assume 8080.
    port_env = os.getenv("PORT", "").strip()
    main_port = int(port_env) if port_env.isdigit() else 8080

    # Always also expose the common alternates, but as separate processes (reliable).
    extra_ports = sorted({8080, 3000} - {main_port})

    procs: List[subprocess.Popen] = []

    # Sidecar processes: same app, but no scheduler (to avoid duplicates)
    for p in extra_ports:
        env = os.environ.copy()
        env["DISABLE_SCHEDULER"] = "1"
        proc = subprocess.Popen(uvicorn_cmd(p), env=env)
        procs.append(proc)

    # Main process in foreground
    main_env = os.environ.copy()
    main_env.pop("DISABLE_SCHEDULER", None)
    main_proc = subprocess.Popen(uvicorn_cmd(main_port), env=main_env)

    def _shutdown(*_):
        for pr in procs + [main_proc]:
            try:
                pr.terminate()
            except Exception:
                pass

    signal.signal(signal.SIGTERM, _shutdown)
    signal.signal(signal.SIGINT, _shutdown)

    code = main_proc.wait()
    _shutdown()
    raise SystemExit(code)

if __name__ == "__main__":
    main()
