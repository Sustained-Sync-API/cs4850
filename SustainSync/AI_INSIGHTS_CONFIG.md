# AI-Driven Insights Configuration

## What Changed

All insights panels in the SustainSync dashboard are now **fully LLM-driven by default** instead of using deterministic fallback summaries.

### Affected Panels
1. **AI Sustainability Recommendations** - Enhanced with strict requirements for:
   - Specific data citations with exact numbers
   - Mapping to sustainability goals
   - Quantified impact estimates
   - Seasonal patterns and anomalies
   - Concrete action steps

2. **Overall Portfolio Insights** - Now LLM-generated with requirements for:
   - Key trends with exact numbers and percent changes
   - Cost efficiency analysis (cost per unit trends)
   - Forecast interpretation
   - Actionable recommendations with impact estimates
   - Sustainability/environmental notes

3. **Per-Utility AI Insights** (Power, Gas, Water) - Same enhanced analysis as portfolio insights

## How It Works

### Environment Variable Control
Set `ENABLE_LLM_SUMMARIES` in `docker-compose.yml` or `.env`:
- `true` (default) - All insights use LLM analysis (30-60 seconds per forecast call)
- `false` - Use fast deterministic summaries (instant)

### API Override
You can override per-request:
```bash
# Force LLM summaries
curl "http://localhost:8000/api/forecast/?periods=12&summaries=true"

# Force deterministic fallback (fast)
curl "http://localhost:8000/api/forecast/?periods=12&summaries=false"
```

## Performance Impact

**With LLM Summaries (ENABLE_LLM_SUMMARIES=true)**
- Forecast endpoint: 30-60 seconds (depends on Ollama performance)
- Recommendations endpoint: 5-15 seconds
- Total dashboard initial load: ~45-75 seconds

**Without LLM Summaries (ENABLE_LLM_SUMMARIES=false)**
- Forecast endpoint: <1 second
- Recommendations endpoint: 5-15 seconds (still LLM)
- Total dashboard initial load: ~6-16 seconds

## Prompt Enhancements

### Recommendations Prompt
Now requires:
- Exact data citations (e.g., "Power consumption increased 15.2% from Q3 to Q4, from 12,450 kWh to 14,343 kWh")
- Goal mapping (which sustainability goal each recommendation supports)
- Quantified impact (e.g., "Could reduce monthly cost by ~$120")
- Seasonal patterns and anomalies
- Progress assessment toward each goal

Format:
```
**[Recommendation Title]**
- Data Evidence: [specific metrics and trends]
- Goal Alignment: [which goal this supports and why]
- Expected Impact: [quantified benefit]
- Action Steps: [2-3 concrete steps]
```

### Portfolio/Utility Insights Prompt
Now requires:
1. **Key Trend**: Most significant pattern with exact numbers and percent changes
2. **Cost Efficiency**: Cost per unit trends, optimization opportunities
3. **Forecast Analysis**: Expected changes, risks, seasonal factors
4. **Actionable Recommendation**: Specific action with estimated impact
5. **Sustainability Note**: Environmental impact or efficiency improvement

### Analyst Preamble
Enhanced to emphasize:
- ALWAYS cite specific numbers (exact costs, consumption, dates, percent changes)
- Calculate cost per unit metrics ($/kWh, $/therm, $/gallon)
- Flag seasonal patterns with supporting evidence
- Estimate carbon reduction potential
- Provide quantified impact estimates
- Use exact figures, not approximations
- Compare periods explicitly (e.g., "Q4 2024 vs Q4 2023")

## Files Modified

1. **backend/SustainSync/views.py**
   - `forecast()`: Default `include_summaries` to `ENABLE_LLM_SUMMARIES` env var
   - `ai_recommendations()`: Enhanced prompt with structured requirements

2. **backend/llm/rag.py**
   - `ask_llm()`: Strengthened preamble with critical analysis requirements
   - `_summarize_usage_with_llm()`: Specific 5-point format requirement

3. **docker-compose.yml**
   - Added `ENABLE_LLM_SUMMARIES=true` environment variable

## How to Customize

### Change Number of Recommendations
Edit `backend/SustainSync/views.py`, line ~208:
```python
"Analyze the data and provide 3-5 actionable recommendations..."
# Change to "5-7" or "2-3" as needed
```

### Adjust Analysis Depth
Edit `backend/llm/rag.py`, function `ask_llm()` preamble (line ~270):
- Add more requirements to the CRITICAL ANALYSIS REQUIREMENTS list
- Modify formatting instructions
- Add carbon calculation formulas

### Change Summary Structure
Edit `backend/llm/rag.py`, function `_summarize_usage_with_llm()` (line ~490):
- Modify the 5-point format
- Add/remove analysis categories
- Change emphasis (cost vs sustainability)

## Fallback Behavior

If Ollama is unavailable or the LLM call fails:
- Recommendations: Returns context-driven summary with "(LLM unavailable)" prefix
- Portfolio/Utility Insights: Returns deterministic summaries from `_build_usage_context()`
- System continues to function with reduced insight quality

## Monitoring LLM Usage

Check logs to verify LLM is being used:
```bash
# Backend logs show Ollama calls
docker compose logs web | grep -i ollama

# Look for:
# "Posting prompt to Ollama HTTP API..."
# "Ollama response status: 200"
```

Check API response sources:
```bash
curl -s http://localhost:8000/api/recommendations/ | jq .sources

# Should show:
# {
#   "model": "llama3.2:1b",
#   "rag_enabled": true,
#   ...
# }
```

## Toggle Quick Reference

**Maximum AI Depth** (slow, highest quality):
```yaml
# docker-compose.yml
environment:
  - ENABLE_LLM_SUMMARIES=true
```

**Balanced** (fast forecasts, AI recommendations only):
```yaml
# docker-compose.yml
environment:
  - ENABLE_LLM_SUMMARIES=false
```

**Minimal** (all deterministic, fastest):
- Set `ENABLE_LLM_SUMMARIES=false`
- Stop ollama container: `docker compose stop ollama`

## Notes

- First LLM call after restart may take longer (model loading)
- GPU acceleration via CUDA significantly improves performance
- FAISS index is cached in `data/bill_index.faiss` for faster retrieval
- Recommendations always attempt LLM (no disable option currently)
