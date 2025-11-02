# AI Model Configuration Guide

SustainSync now supports using **separate LLM models** for different purposes to optimize performance, cost, and accuracy.

## Model Types

### 1. **Insights Model** (`OLLAMA_INSIGHTS_MODEL`)
- **Purpose**: General data analysis and trends
- **Used for**: 
  - Dashboard AI insights
  - General queries about consumption patterns
  - Historical data analysis
  - Quick answers to user questions
- **Recommendations**: Use a faster, general-purpose model like `llama3.2:latest`

### 2. **Recommendations Model** (`OLLAMA_RECOMMENDATIONS_MODEL`)
- **Purpose**: Sustainability recommendations and advice
- **Used for**:
  - Sustainability Goals page recommendations
  - Forecast summaries with Key Trends, Cost Efficiency, Actionable Recommendations
  - Detailed sustainability guidance aligned with user goals
- **Recommendations**: Use a more specialized or larger model like `mistral:latest` or `llama3.1:latest`

### 3. **Default Model** (`OLLAMA_MODEL`)
- **Purpose**: Fallback when specific models aren't configured
- **Default**: `llama3.2:latest`

## Configuration Options

### Option 1: Use Same Model for Both (Default)
```yaml
# In docker-compose.yml or .env
OLLAMA_MODEL=llama3.2:latest
```
Both insights and recommendations will use `llama3.2:latest`

### Option 2: Use Different Models
```yaml
# In docker-compose.yml or .env
OLLAMA_INSIGHTS_MODEL=llama3.2:latest        # Fast model for quick insights
OLLAMA_RECOMMENDATIONS_MODEL=mistral:latest  # Better model for detailed advice
```

### Option 3: Use Same Model with Different Names
```yaml
# Both use the same model, but you can change them independently later
OLLAMA_INSIGHTS_MODEL=llama3.2:latest
OLLAMA_RECOMMENDATIONS_MODEL=llama3.2:latest
```

## Setup Instructions

### 1. Pull the Models in Ollama Container

First, make sure Ollama is running:
```bash
docker compose up -d ollama
```

Pull the models you want to use:
```bash
# For insights (fast general model)
docker exec -it sustainsync-ollama-1 ollama pull llama3.2:latest

# For recommendations (specialized model)
docker exec -it sustainsync-ollama-1 ollama pull mistral:latest

# Or any other model you prefer
docker exec -it sustainsync-ollama-1 ollama pull llama3.1:latest
```

### 2. Configure Environment Variables

Edit `docker-compose.yml` under the `web` service:

```yaml
web:
  environment:
    - OLLAMA_HOST=ollama
    - OLLAMA_PORT=11434
    # Configure your models here:
    - OLLAMA_INSIGHTS_MODEL=llama3.2:latest
    - OLLAMA_RECOMMENDATIONS_MODEL=mistral:latest
```

Or create/edit `.env` file:
```env
OLLAMA_INSIGHTS_MODEL=llama3.2:latest
OLLAMA_RECOMMENDATIONS_MODEL=mistral:latest
```

### 3. Restart Services

```bash
docker compose down
docker compose up --build
```

## Model Recommendations

### For Performance (Fast Response)
```yaml
OLLAMA_INSIGHTS_MODEL=llama3.2:latest
OLLAMA_RECOMMENDATIONS_MODEL=llama3.2:latest
```

### For Quality (Better Analysis)
```yaml
OLLAMA_INSIGHTS_MODEL=llama3.2:latest
OLLAMA_RECOMMENDATIONS_MODEL=mistral:latest  # or llama3.1:latest
```

### For Balanced Approach
```yaml
OLLAMA_INSIGHTS_MODEL=llama3.2:latest        # Fast for quick queries
OLLAMA_RECOMMENDATIONS_MODEL=llama3.2:latest # Same model for consistency
```

## Testing Your Configuration

After configuring models, test them:

1. **Test Insights Model**: Go to Dashboard and check AI-powered insights
2. **Test Recommendations Model**: Go to Sustainability Goals and check recommendations

Check Docker logs to see which model is being used:
```bash
docker compose logs web | grep "Using model"
```

You should see logs like:
```
Using model 'llama3.2:latest' for insights
Using model 'mistral:latest' for recommendations
```

## Available Models

Popular models you can use with Ollama:

| Model | Size | Best For | Speed |
|-------|------|----------|-------|
| `llama3.2:latest` | ~2GB | General purpose, fast | ⚡⚡⚡ |
| `llama3.1:latest` | ~4.7GB | Better reasoning | ⚡⚡ |
| `mistral:latest` | ~4.1GB | Detailed analysis | ⚡⚡ |
| `llama3:latest` | ~4.7GB | General purpose | ⚡⚡ |
| `phi3:latest` | ~2.3GB | Fast, efficient | ⚡⚡⚡ |

Check all available models: https://ollama.com/library

## Troubleshooting

### Model Not Found
If you get a "model not found" error:
```bash
# Pull the model in the Ollama container
docker exec -it sustainsync-ollama-1 ollama pull <model-name>
```

### Slow Recommendations
If recommendations are taking too long:
- Switch to a smaller model for `OLLAMA_RECOMMENDATIONS_MODEL`
- Consider using the same fast model for both

### Memory Issues
If Ollama runs out of memory:
- Use smaller models (llama3.2, phi3)
- Restart Ollama container: `docker compose restart ollama`

## Notes

- Models are stored persistently in Docker volume `ollama_data`
- Each model needs to be pulled only once
- You can change models anytime by updating environment variables and restarting
- Different models can be used to optimize for speed vs. quality based on your needs
