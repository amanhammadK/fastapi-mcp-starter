from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from datetime import datetime
from typing import Optional
import time
import uuid

app = FastAPI(title="FastAPI MCP Starter", version="0.1.0")

endpoints_registry: dict = {}
request_log: list = []


class RegisterEndpointRequest(BaseModel):
    path: str
    method: str
    description: str


class LogRequestEntry(BaseModel):
    path: str
    method: str
    status_code: int
    duration_ms: float


@app.get("/")
def root():
    return {"message": "FastAPI MCP Starter", "version": "0.1.0", "endpoints_registered": len(endpoints_registry)}


@app.get("/health")
def health():
    return {"status": "healthy", "endpoints": len(endpoints_registry), "requests_logged": len(request_log)}


@app.post("/endpoints")
def register_endpoint(req: RegisterEndpointRequest):
    endpoint_id = f"{req.method.upper()} {req.path}"
    endpoints_registry[endpoint_id] = {
        "path": req.path,
        "method": req.method.upper(),
        "description": req.description,
        "registered_at": datetime.utcnow().isoformat(),
    }
    return {"registered": True, "id": endpoint_id}


@app.get("/endpoints")
def list_endpoints():
    return list(endpoints_registry.values())


@app.post("/requests")
def log_request(entry: LogRequestEntry):
    record = {
        "path": entry.path,
        "method": entry.method,
        "status_code": entry.status_code,
        "duration_ms": entry.duration_ms,
        "timestamp": datetime.utcnow().isoformat(),
    }
    request_log.append(record)
    if len(request_log) > 100:
        request_log.pop(0)
    return record


@app.get("/requests")
def get_request_log(limit: int = 20):
    return request_log[-limit:]


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
