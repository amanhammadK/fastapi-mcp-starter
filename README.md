# FastAPI MCP Starter

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-blue.svg" alt="Version 1.0.0"/>
  <img src="https://img.shields.io/badge/python-3.12+-green.svg" alt="Python 3.12+"/>
  <img src="https://img.shields.io/badge/fastapi-0.100+-teal.svg" alt="FastAPI 0.100+"/>
  <img src="https://img.shields.io/badge/license-MIT-green.svg" alt="MIT License"/>
</p>

A professional starter template for building MCP (Model Context Protocol) servers with FastAPI. Provides a robust foundation for creating high-performance API servers with automatic OpenAPI documentation, input validation, and production-ready deployment configurations.

## What's Included

- FastAPI application with health check endpoint
- MCP-compatible server architecture
- Uvicorn ASGI server configuration
- PyTest test suite configuration
- Ruff linter configuration
- Docker multi-stage build with health checks
- CI/CD pipeline via GitHub Actions

## Features

- **FastAPI**: High-performance async Python web framework
- **MCP Protocol**: Model Context Protocol compliant server
- **Auto Documentation**: OpenAPI/Swagger UI at `/docs`
- **Input Validation**: Pydantic-based request/response models
- **Async Support**: Native async/await for concurrent requests
- **CORS Ready**: Configurable cross-origin resource sharing
- **Dockerized**: Multi-stage Dockerfile with HEALTHCHECK
- **CI/CD Ready**: GitHub Actions workflow for lint and test
- **Code Quality**: Ruff linting with strict rules
- **Cross-Platform**: Works on Linux, macOS, and Windows

## Quick Start

### Prerequisites

- Python 3.12 or higher
- pip and virtualenv

### Installation

```bash
# Clone the repository
git clone https://github.com/amanhammadK/fastapi-mcp-starter.git
cd fastapi-mcp-starter

# Create virtual environment
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate

# Install dependencies
pip install -e ".[dev]"

# Set up environment
cp .env.example .env
```

### Running

```bash
# Start the development server
uvicorn main:app --reload --port 8000

# Open http://localhost:8000/docs
```

### Testing

```bash
# Run tests
python -m pytest
```

## Project Structure

```
fastapi-mcp-starter/
├── .github/
│   └── workflows/
│       └── ci.yml              # GitHub Actions CI pipeline
├── src/                        # MCP server source
├── tests/                      # Test files
├── .env.example               # Environment variables template
├── .gitignore                 # Git ignore rules
├── .prettierrc                # Prettier configuration
├── Dockerfile                 # Multi-stage Docker build
├── eslint.config.js           # ESLint configuration
├── jest.config.js             # Jest configuration
├── main.py                    # FastAPI application entry point
├── package.json               # JS dependencies
├── pyproject.toml             # Python dependencies
└── README.md                  # This file
```

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `HOST` | Server bind address (default: 0.0.0.0) | No |
| `PORT` | Server port (default: 8000) | No |
| `OPENAI_API_KEY` | OpenAI API key for AI features | No |

### FastAPI Configuration

The application is configured in `main.py`:

```python
app = FastAPI(
    title="FastAPI MCP Starter",
    description="MCP-compatible API server",
    version="1.0.0"
)
```

## Deployment

### Docker

```bash
# Build the image
docker build -t fastapi-mcp-starter .

# Run the container
docker run -p 8000:8000 --env-file .env fastapi-mcp-starter
```

### Production Deployment

- **Docker Compose**: Add to your compose stack
- **Kubernetes**: Deploy as a pod with health checks
- **Cloud Run**: Serverless deployment with gcloud
- **Railway / Render**: Auto-deploy from GitHub

### Health Check

The Docker HEALTHCHECK polls `http://localhost:8000/`. Ensure the root endpoint returns 200 OK.

## Development Guide

### Adding a New Endpoint

```python
from pydantic import BaseModel

class Item(BaseModel):
    name: str
    price: float

@app.post("/items/")
async def create_item(item: Item):
    return {"item": item, "message": "Created"}
```

### Adding MCP Tools

```python
@app.post("/mcp/tools/")
async def mcp_tool(request: dict):
    # Implement MCP tool logic
    return {"result": "processed"}
```

### Code Style

- Follow PEP 8 conventions
- Ruff for linting: `ruff check .`
- Run `python -m pytest` before committing

## License

MIT License — see [LICENSE](LICENSE) for details.

---

<p align="center">
  Built with FastAPI and ❤️
</p>