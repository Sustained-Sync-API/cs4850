# ---- /llm/rag_gpu.py ----
import os
import logging
import pandas as pd
import numpy as np
import faiss
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

# Provide a small compatibility shim for older code that imports
# `cached_download` from `huggingface_hub`. Newer `huggingface_hub`
# exposes `hf_hub_download` / `snapshot_download` instead. Some
# third-party packages (for example older sentence-transformers
# releases) attempt `from huggingface_hub import cached_download` and
# will fail. Create a thin wrapper that downloads HTTP(s) URLs and
# delegates to `hf_hub_download` when appropriate.
try:
    # If huggingface_hub already has cached_download, nothing to do
    import huggingface_hub as _hf_hub
    if not hasattr(_hf_hub, "cached_download"):
        import requests
        def _cached_download(url, *args, **kwargs):
            """Simple compatibility function to download a URL to a cache path.

            This implementation handles HTTP/HTTPS URLs by streaming to a
            local cache directory and returns the local path. If the `url`
            doesn't look like an HTTP URL, fall back to hf_hub_download() if
            available.
            """
            cache_dir = kwargs.get('cache_dir') or '/tmp/hf_cache'
            os.makedirs(cache_dir, exist_ok=True)

            # If url looks like an http(s) URL, download it directly
            if isinstance(url, str) and url.startswith(('http://', 'https://')):
                fname = kwargs.get('filename') or os.path.basename(url.split('?')[0])
                path = os.path.join(cache_dir, fname)
                if not os.path.exists(path):
                    resp = requests.get(url, stream=True, timeout=60)
                    resp.raise_for_status()
                    with open(path, 'wb') as f:
                        for chunk in resp.iter_content(chunk_size=8192):
                            if chunk:
                                f.write(chunk)
                return path

            # Fallback: try hf_hub_download with the provided args
            if hasattr(_hf_hub, 'hf_hub_download'):
                return _hf_hub.hf_hub_download(repo_id=url, **{k: v for k, v in kwargs.items() if k != 'cache_dir'})

            # Last resort: raise the original import-time error semantics
            raise ImportError('cached_download compatibility shim could not resolve URL or delegate to hf_hub_download')

        _hf_hub.cached_download = _cached_download
except Exception:
    # If anything goes wrong building the shim, proceed — the original
    # import may still fail and will be handled by the caller.
    pass

from sentence_transformers import SentenceTransformer
# Ollama client: optional. We prefer to lazily initialize the client at
# call-time so the web process can start before Ollama is ready. This
# avoids import-time connection failures when Ollama is started later.
client = None
_OLLAMA_AVAILABLE = False
_OLLAMA_CLIENT_CLASS = None
try:
    # Import the client class if available; do NOT instantiate yet.
    from ollama import Client as _OllamaClientClass
    _OLLAMA_CLIENT_CLASS = _OllamaClientClass
except Exception:
    _OLLAMA_CLIENT_CLASS = None


def _init_ollama_client_if_needed():
    """Attempt to create an Ollama Client if the client class is
    installed and we haven't yet created an instance. Safe to call
    repeatedly; sets globals `client` and `_OLLAMA_AVAILABLE`.
    """
    global client, _OLLAMA_AVAILABLE
    if client is not None:
        return
    if _OLLAMA_CLIENT_CLASS is None:
        _OLLAMA_AVAILABLE = False
        return

    try:
        OLLAMA_HOST = os.environ.get('OLLAMA_HOST', 'localhost')
        OLLAMA_PORT = os.environ.get('OLLAMA_PORT', '11434')
        base_url = f"http://{OLLAMA_HOST}:{OLLAMA_PORT}"

        # Try a few different constructor signatures depending on the
        # installed version of the `ollama` client. Some releases expect
        # a positional host, others accept `host=` or `base_url=`.
        client_obj = None
        constructors = [
            lambda: _OLLAMA_CLIENT_CLASS(base_url),
            lambda: _OLLAMA_CLIENT_CLASS(host=base_url),
            lambda: _OLLAMA_CLIENT_CLASS(base_url=base_url),
            lambda: _OLLAMA_CLIENT_CLASS(base_url=base_url, timeout=60),
        ]
        for ctor in constructors:
            try:
                client_obj = ctor()
                break
            except Exception:
                client_obj = None
                continue

        if client_obj is not None:
            client = client_obj
            _OLLAMA_AVAILABLE = True
        else:
            client = None
            _OLLAMA_AVAILABLE = False
    except Exception:
        client = None
        _OLLAMA_AVAILABLE = False

DATA_PATH = None
INDEX_PATH = 'data/bill_index.faiss'
MODEL_NAME = 'all-MiniLM-L6-v2'

print("🔧 Initializing Bill Analysis Assistant...")
logger = logging.getLogger(__name__)
logger.addHandler(logging.NullHandler())

# 1. Load and preprocess data
def load_data():
    """Load data exclusively from the Django/Postgres DB using the ORM.

    This function will attempt to initialize Django if it is not already
    configured (sets DJANGO_SETTINGS_MODULE and calls django.setup).
    It returns a DataFrame with a 'summary' column (one row per item)
    plus yearly aggregate summaries appended, as before.
    """
    global raw_df
    # Try to import the Django model; if Django isn't configured, set it up.
    try:
        # If we're already inside the Django process, this import should work
        from SustainSync.models import Bill
    except Exception:
        # Configure Django programmatically
        import sys
        import os
        try:
            # Ensure project backend package is on path (parent directory of this file)
            base_pkg = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
            if base_pkg not in sys.path:
                sys.path.insert(0, base_pkg)
            os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'backend.settings')
            import django
            django.setup()
            from SustainSync.models import Bill
        except Exception as e:
            raise RuntimeError(f"Failed to initialize Django to load DB data: {e}")

    # Query bills via ORM
    try:
        qs = Bill.objects.all().values('bill_date', 'bill_type', 'city', 'state', 'consumption', 'units_of_measure', 'cost')
        df = pd.DataFrame(list(qs))
    except Exception as e:
        raise RuntimeError(f"Failed to query Bill objects from DB: {e}")

    if df.empty:
        # Return empty DataFrame with expected column so downstream code can handle it
        return pd.DataFrame({'summary': []})

    # Normalize column names
    df.columns = df.columns.str.lower()

    # Ensure expected columns exist so later code doesn't KeyError
    expected_cols = ['bill_date', 'bill_type', 'city', 'state', 'consumption', 'units_of_measure', 'cost']
    for c in expected_cols:
        if c not in df.columns:
            df[c] = pd.NA

    # Generate per-row summary (defensive access using get-like semantics)
    df['summary'] = df.apply(lambda r:
        f"{r.get('bill_date','')} {r.get('bill_type','')} in {r.get('city','')}, {r.get('state','')} "
        f"consumed {r.get('consumption',0)} {r.get('units_of_measure','')} costing ${r.get('cost',0)}", axis=1)

    # Generate yearly summaries
    df['year'] = pd.to_datetime(df['bill_date']).dt.year
    yearly = df.groupby(['year', 'bill_type']).agg(
        total_cost=('cost', 'sum'),
        total_usage=('consumption', 'sum'),
    ).reset_index()

    yearly['summary'] = yearly.apply(lambda r:
        f"In {r['year']}, {r['bill_type']} total usage was {r['total_usage']:.2f} "
        f"and total cost was ${r['total_cost']:.2f}", axis=1)

    # Combine detailed + yearly summaries
    combined = pd.concat([df[['summary']], yearly[['summary']]])
    combined.reset_index(drop=True, inplace=True)

    # Preserve the raw tabular data (without summary columns) for downstream
    # analytics such as forecasting and metric hints. This avoids relying on
    # CSV fallbacks and keeps the RAG dataset focused on text summaries while
    # still exposing structured data when needed.
    raw_df = df.drop(columns=['summary', 'year'], errors='ignore').copy()

    logger.info("Loaded %d bill rows from DB into RAG dataset", len(df))
    return combined

# 2. Build or load FAISS embeddings
def build_index(df, model):
    if os.path.exists(INDEX_PATH):
        print("📦 Loading existing FAISS index...")
        return faiss.read_index(INDEX_PATH)
    print("⚙️ Building FAISS index...")
    emb = model.encode(df['summary'].tolist(), batch_size=64, convert_to_numpy=True, show_progress_bar=True)
    index = faiss.IndexFlatL2(emb.shape[1])
    index.add(emb)
    faiss.write_index(index, INDEX_PATH)
    print("✅ Index built and cached.")
    return index

# 3. Retrieve relevant context
def retrieve(query, model, df, index, k=10):
    q_emb = model.encode([query], convert_to_numpy=True)
    D, I = index.search(q_emb, k)
    return [df.iloc[i]['summary'] for i in I[0]]

def compute_metrics_hint(df):
    # Expect df already loaded by caller to avoid repeated file reads.
    df = df.copy()
    if 'bill_date' not in df.columns or df['bill_date'].dropna().empty:
        return ""

    # coerce bill_date safely
    try:
        df['year'] = pd.to_datetime(df['bill_date']).dt.year
    except Exception:
        return ""
    latest_year = df['year'].max() if not df.empty else None
    if latest_year is None:
        return ""
    prev_year = latest_year - 1

    yearly = df.groupby(['year', 'bill_type'])[['cost', 'consumption']].sum().reset_index()
    recent = yearly[yearly['year'].isin([prev_year, latest_year])]
    if len(recent) < 2:
        return ""

    hint = []
    for t in recent['bill_type'].unique():
        curr = recent[(recent['bill_type']==t)&(recent['year']==latest_year)]
        prev = recent[(recent['bill_type']==t)&(recent['year']==prev_year)]
        if not curr.empty and not prev.empty:
            delta_cost = (curr['cost'].values[0] - prev['cost'].values[0]) / prev['cost'].values[0] * 100
            delta_use = (curr['consumption'].values[0] - prev['consumption'].values[0]) / prev['consumption'].values[0] * 100
            hint.append(f"{t}: cost changed {delta_cost:+.1f}%, usage changed {delta_use:+.1f}% from {prev_year} to {latest_year}.")
    return "Recent sustainability summary: " + " ".join(hint)


# 4. LLM query with Llama 3.2
def ask_llm(context, question):
    # preamble = (
    #     "You are an intelligent energy billing analyst. "
    #     "Use the context data covering years 2015–2024 from Duluth, GA, "
    #     "to reason clearly about consumption and cost trends.\n\n"
    # )
    preamble = (
    "You are an intelligent **energy and sustainability analyst** for a mid-sized tech company in Duluth, GA. "
    "You are reviewing multi-year billing and consumption data (2015–2024) across power, gas, and water utilities. "
    "Your goal is to provide **insightful, data-driven analysis** that helps the company improve both its **financial efficiency** "
    "and **environmental sustainability**.\n\n"
    "CRITICAL ANALYSIS REQUIREMENTS:\n"
    "- ALWAYS cite specific numbers from the data (exact costs, consumption values, dates, percent changes).\n"
    "- Identify year-over-year trends with precise quantification (e.g., '12.3% increase from 2023 to 2024').\n"
    "- Calculate and report cost per unit metrics (e.g., $/kWh, $/therm, $/gallon).\n"
    "- Flag seasonal patterns, anomalies, or efficiency opportunities with supporting evidence.\n"
    "- Estimate carbon reduction potential or energy efficiency gains where applicable.\n"
    "- Provide actionable recommendations with quantified impact estimates.\n"
    "- Align insights with company sustainability goals when provided.\n\n"
    "When you respond:\n"
    "- Use exact figures, not approximations (e.g., say '$1,234.56' not 'about $1,200').\n"
    "- Compare periods explicitly (e.g., 'Q4 2024 vs Q4 2023').\n"
    "- Prioritize insights by financial impact and sustainability benefit.\n"
    "- Suggest 2-3 concrete action steps for each key finding.\n\n"
    )

    # prompt = f"{preamble}Context:\n{context}\n\nQuestion:\n{question}\n\nAnswer with specific trends and comparisons."
    # Ensure DB-backed data is loaded and use it for metric hints
    try:
        ensure_resources()
    except Exception:
        # If resources couldn't be initialized, proceed with empty hint
        hint = ""
    else:
        source = raw_df if raw_df is not None else pd.DataFrame()
        hint = compute_metrics_hint(source)

    prompt = f"{preamble}{hint}\n\nContext:\n{context}\n\nQuestion:\n{question}\n\nAnswer with specific trends and comparisons."

    # 1) Prefer HTTP call to Ollama's native generate endpoint
    # Ollama 0.12.6 uses /api/generate, not OpenAI-compatible /v1/completions
    try:
        OLLAMA_HOST = os.environ.get('OLLAMA_HOST', 'ollama')
        OLLAMA_PORT = os.environ.get('OLLAMA_PORT', '11434')
        url = f"http://{OLLAMA_HOST}:{OLLAMA_PORT}/api/generate"
        payload = {
            'model': os.environ.get('OLLAMA_MODEL', 'llama3.2:latest'),
            'prompt': prompt,
            'stream': False,
        }

        # Prepare a requests session with retry logic for transient errors
        session = requests.Session()
        retries = Retry(total=3, backoff_factor=1, status_forcelist=[429, 500, 502, 503, 504])
        session.mount('http://', HTTPAdapter(max_retries=retries))

        logger.info("Posting prompt to Ollama HTTP API %s (model=%s)", url, payload['model'])
        r = session.post(url, json=payload, timeout=60)
        logger.info("Ollama response status: %s", r.status_code)
        # Log response body at debug level (may contain large text)
        try:
            logger.debug("Ollama response body: %s", r.text)
        except Exception:
            logger.debug("Ollama response body could not be logged as text")

        if r.status_code == 200:
            try:
                body = r.json()
                # Ollama native API returns 'response' field with generated text
                if 'response' in body:
                    return body['response']
                # fallback: return full JSON as string
                logger.warning("Ollama 200 response did not contain 'response': %s", body)
                return str(body)
            except Exception:
                logger.exception("Failed to parse Ollama JSON response; returning raw text")
                return r.text
        else:
            logger.warning("Non-200 response from Ollama: %s - %s", r.status_code, r.text[:1000])
    except Exception:
        logger.exception("Exception during Ollama HTTP request")
        # Fall through to Python client attempt and then to context fallback
        pass

    # 2) Try the Python client if available (lazy init)
    _init_ollama_client_if_needed()
    if _OLLAMA_AVAILABLE and client is not None:
        try:
            # Use generate() method for Ollama native API
            res = client.generate(
                model="llama3.2",
                prompt=prompt
            )
            if isinstance(res, dict) and 'response' in res:
                return res['response']
            return str(res)
        except Exception:
            logger.exception("Python client generate() call failed")
            pass

    # Fallback when Ollama or the chat call is not available. Return a
    # concise context-driven summary assembled from the computed metrics
    # and the retrieved context. This allows the frontend to show useful
    # information even without an LLM backend.
    # Use DB-backed data for metrics in the fallback as well
    try:
        ensure_resources()
        metrics_source = raw_df if raw_df is not None else pd.DataFrame()
        metrics = compute_metrics_hint(metrics_source)
    except Exception:
        metrics = ""
    ctx_excerpt = (context[:2000] + '...') if len(context) > 2000 else context
    fallback = (
        "(LLM unavailable) Context-driven summary:\n" +
        metrics + "\n\nRelevant context:\n" + ctx_excerpt +
        "\n\nTo enable full answers, install and run Ollama and ensure the Python 'ollama' client is available in the container."
    )
    return fallback

def _prepare_monthly_timeseries(df):
    """Aggregate a raw bill DataFrame into a monthly cost/usage time-series."""

    if df is None or df.empty:
        raise ValueError('No billing data available for forecasting')

    if 'bill_date' not in df.columns or 'cost' not in df.columns:
        raise ValueError('Required bill_date or cost fields are missing for forecasting')

    ts = df[['bill_date', 'cost', 'consumption']].dropna(subset=['bill_date', 'cost']).copy()
    if ts.empty:
        raise ValueError('Billing data does not contain any cost values for forecasting')

    ts['bill_date'] = pd.to_datetime(ts['bill_date'])
    ts = (
        ts.groupby(pd.Grouper(key='bill_date', freq='ME'))
        .agg(cost=('cost', 'sum'), consumption=('consumption', 'sum'))
        .reset_index()
    )
    ts = ts.sort_values('bill_date')

    if len(ts) < 3:
        raise ValueError('At least three months of data are required for forecasting')

    return ts


def _forecast_from_series(ts, periods=12):
    """Run Prophet (or a linear fallback) on a prepared monthly series."""

    history = [
        {
            'date': row['bill_date'].date().isoformat(),
            'value': float(row['cost']),
            'usage': float(row['consumption'] or 0),
        }
        for _, row in ts.iterrows()
    ]

    prophet_forecast = None
    prophet_error = None
    try:
        from prophet import Prophet

        # Forecast cost
        prophet_df_cost = ts.rename(columns={'bill_date': 'ds', 'cost': 'y'})
        model_cost = Prophet(seasonality_mode='additive', yearly_seasonality=True)
        model_cost.fit(prophet_df_cost)
        future = model_cost.make_future_dataframe(periods=periods, freq='ME')
        forecast_cost = model_cost.predict(future)
        tail_cost = forecast_cost.tail(periods)
        
        # Forecast consumption/usage
        prophet_df_usage = ts.rename(columns={'bill_date': 'ds', 'consumption': 'y'})
        model_usage = Prophet(seasonality_mode='additive', yearly_seasonality=True)
        model_usage.fit(prophet_df_usage)
        forecast_usage = model_usage.predict(future)
        tail_usage = forecast_usage.tail(periods)
        
        prophet_forecast = [
            {
                'date': row_cost['ds'].date().isoformat(),
                'yhat': float(row_cost['yhat']),
                'yhat_lower': float(row_cost['yhat_lower']),
                'yhat_upper': float(row_cost['yhat_upper']),
                'yhat_usage': float(row_usage['yhat']),
                'yhat_usage_lower': float(row_usage['yhat_lower']),
                'yhat_usage_upper': float(row_usage['yhat_upper']),
            }
            for (_, row_cost), (_, row_usage) in zip(tail_cost.iterrows(), tail_usage.iterrows())
        ]
    except Exception as exc:  # pragma: no cover - Prophet optional dependency
        prophet_error = str(exc)

    if prophet_forecast is not None:
        return {
            'model': 'prophet',
            'history': history,
            'series': prophet_forecast,
        }

    # Fallback to a lightweight linear trend when Prophet is unavailable.
    ts = ts.reset_index(drop=True)
    ts['month_index'] = np.arange(len(ts))
    
    # Forecast cost
    coeffs_cost = np.polyfit(ts['month_index'], ts['cost'], 1)
    slope_cost, intercept_cost = coeffs_cost
    
    # Forecast usage/consumption
    coeffs_usage = np.polyfit(ts['month_index'], ts['consumption'].fillna(0), 1)
    slope_usage, intercept_usage = coeffs_usage
    
    future_index = np.arange(len(ts), len(ts) + periods)
    last_date = ts['bill_date'].max()
    future_dates = pd.date_range(last_date + pd.offsets.MonthEnd(1), periods=periods, freq='M')
    fallback_series = []
    for idx, date in zip(future_index, future_dates):
        pred_cost = slope_cost * idx + intercept_cost
        pred_usage = slope_usage * idx + intercept_usage
        fallback_series.append({
            'date': date.date().isoformat(),
            'yhat': float(pred_cost),
            'yhat_lower': float(pred_cost),
            'yhat_upper': float(pred_cost),
            'yhat_usage': float(pred_usage),
            'yhat_usage_lower': float(pred_usage),
            'yhat_usage_upper': float(pred_usage),
        })

    return {
        'model': 'linear-regression',
        'history': history,
        'series': fallback_series,
        'warning': f'Prophet unavailable: {prophet_error}' if prophet_error else 'Prophet unavailable',
    }


def forecast_trend(bills_df, periods=12):
    """Forecast future utility spend for the provided bill slice."""

    ts = _prepare_monthly_timeseries(bills_df)
    return _forecast_from_series(ts, periods=periods)


def _build_usage_context(df, forecast_result, label):
    """Create structured context and a deterministic fallback summary for LLM calls."""

    label_name = 'Total' if label == 'total' else label
    if df is None or df.empty:
        fallback = f"• No {label_name.lower()} data available yet. Upload bills to unlock insights."
        return "", fallback

    df = df.dropna(subset=['bill_date']).copy()
    if df.empty:
        fallback = f"• No {label_name.lower()} billing dates recorded yet."
        return "", fallback

    df['bill_date'] = pd.to_datetime(df['bill_date'])
    monthly = (
        df.groupby(pd.Grouper(key='bill_date', freq='ME'))
        .agg(cost=('cost', 'sum'), consumption=('consumption', 'sum'))
        .reset_index()
        .sort_values('bill_date')
    )

    if monthly.empty:
        fallback = f"• {label_name} billing records are missing cost values."
        return "", fallback

    lines = []
    for _, row in monthly.tail(12).iterrows():
        lines.append(
            f"{row['bill_date'].date().isoformat()}: cost ${float(row['cost'] or 0):.2f}, "
            f"usage {float(row['consumption'] or 0):.2f}"
        )

    context = (
        f"{label_name} monthly cost and usage summary (most recent 12 months):\n" + "\n".join(lines)
    )

    latest_row = monthly.iloc[-1]
    latest_cost = float(latest_row['cost'] or 0)
    latest_label = latest_row['bill_date'].date().isoformat()
    total_cost = float(monthly['cost'].sum())
    avg_cost = float(monthly['cost'].mean())

    next_forecast = None
    if isinstance(forecast_result, dict):
        series = forecast_result.get('series') or []
        if series:
            next_forecast = series[0]

    fallback_lines = [
        f"Latest month ({latest_label}) spent ${latest_cost:.2f} on {label_name.lower()} services.",
        f"Average monthly spend is ${avg_cost:.2f}.",
        f"Total recorded spend stands at ${total_cost:.2f}.",
    ]
    if next_forecast:
        fallback_lines.append(
            f"Upcoming forecast for {next_forecast['date']} is ${float(next_forecast['yhat']):.2f}."
        )

    fallback = "\n".join(f"• {line}" for line in fallback_lines)
    return context, fallback


def _summarize_usage_with_llm(label, context, fallback):
    """Request a concise optimisation summary for the provided utility slice."""

    label_name = 'Total portfolio' if label == 'total' else f"{label} usage"
    prompt = (
        f"Analyze the {label_name} data and forecast provided in the context.\n\n"
        "Provide 3-5 specific insights in this format:\n"
        "1. **Key Trend**: [Describe the most significant pattern with exact numbers and percent changes]\n"
        "2. **Cost Efficiency**: [Calculate and report cost per unit trends, identify optimization opportunities]\n"
        "3. **Forecast Analysis**: [Interpret the forecast - expected changes, risks, seasonal factors]\n"
        "4. **Actionable Recommendation**: [Specific action with estimated cost/carbon impact]\n"
        "5. **Sustainability Note**: [Environmental impact or efficiency improvement opportunity]\n\n"
        "MUST include: exact dollar amounts, consumption values, dates, and percent changes from the data."
    )

    if not context:
        return fallback

    try:
        summary = ask_llm(context, prompt)
        if not summary or summary.strip().lower().startswith('(llm unavailable)'):
            return fallback
        return summary
    except Exception:
        return fallback


def forecast_trend_with_breakdown(bills_df, periods=12, include_summaries=False):
    """Forecast totals alongside per-utility breakdowns and AI summaries.
    
    Args:
        bills_df: DataFrame with bill data
        periods: Number of periods to forecast
        include_summaries: If True, generate LLM summaries (slow). If False, use fallback summaries.
    """

    total_forecast = forecast_trend(bills_df, periods=periods)
    breakdown = []

    default_types = pd.Series([], dtype=object)
    bill_types = sorted({bt for bt in bills_df.get('bill_type', default_types).dropna().unique()})
    for bill_type in bill_types:
        subset = bills_df[bills_df['bill_type'] == bill_type]
        try:
            forecast_result = forecast_trend(subset, periods=periods)
            breakdown.append({'bill_type': bill_type, **forecast_result})
        except Exception as exc:
            breakdown.append({'bill_type': bill_type, 'error': str(exc)})

    summaries = {}
    context, fallback = _build_usage_context(bills_df, total_forecast, 'total')
    if include_summaries:
        summaries['total'] = _summarize_usage_with_llm('total', context, fallback)
    else:
        summaries['total'] = fallback

    for entry in breakdown:
        bill_type = entry['bill_type']
        if 'error' in entry:
            summaries[bill_type] = f"• Unable to forecast {bill_type.lower()} yet: {entry['error']}"
            continue
        subset = bills_df[bills_df['bill_type'] == bill_type]
        context, fallback = _build_usage_context(subset, entry, bill_type)
        if include_summaries:
            summaries[bill_type] = _summarize_usage_with_llm(bill_type, context, fallback)
        else:
            summaries[bill_type] = fallback

    combined = {**total_forecast, 'breakdown': breakdown, 'summaries': summaries}
    return combined

# Avoid heavy initialization at import-time. We'll lazily initialize the
# dataset, encoder model and FAISS index on first use so imports succeed in
# environments where some ML dependencies or hardware (GPU) aren't present.
df = None
raw_df = None
model = None
index = None

def ensure_resources():
    """Make sure df, model and index are initialized. Swallows non-fatal
    errors and leaves resources as None if they can't be created."""
    global df, raw_df, model, index
    if df is None or raw_df is None:
        # Load exclusively from DB; if this fails, raise so callers know
        try:
            df = load_data()
        except Exception as e:
            # Do not silently fallback to CSV — surface the error.
            raise
    if model is None:
        try:
            # Prefer GPU if available, but fall back to CPU.
            model = SentenceTransformer(MODEL_NAME, device='cuda')
        except Exception:
            try:
                model = SentenceTransformer(MODEL_NAME, device='cpu')
            except Exception:
                model = None
    if index is None and df is not None and model is not None:
        try:
            index = build_index(df, model)
        except Exception:
            index = None


def run_query(question: str):
    ensure_resources()
    ctx = "\n".join(retrieve(question, model, df, index, k=10)) if df is not None and index is not None and model is not None else ""
    ans = ask_llm(ctx, question)
    return ans


def run_forecast(periods=12, include_summaries=False):
    """Run forecast with optional LLM summaries.
    
    Args:
        periods: Number of periods to forecast
        include_summaries: If True, generate LLM summaries (slow, ~2-3 minutes).
                          If False, use fast fallback summaries.
    """
    ensure_resources()
    if raw_df is None:
        return {'error': 'Data not available'}
    try:
        forecast = forecast_trend_with_breakdown(raw_df, periods=periods, include_summaries=include_summaries)
        return forecast
    except Exception as e:
        return {'error': f'Forecasting failed: {e}'}


def reload_data():
    global df, raw_df, index
    df = load_data()
    index = build_index(df, model) if model is not None else None
    return "Data reloaded."
