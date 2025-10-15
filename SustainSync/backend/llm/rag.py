# ---- /llm/rag_gpu.py ----
import os
import logging
import pandas as pd
import numpy as np
import faiss
import torch
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
    "When analyzing, consider key sustainability metrics such as:\n"
    "- Year-over-year changes in total and per-unit consumption.\n"
    "- Cost per unit of energy or water used.\n"
    "- Seasonal or regional consumption patterns.\n"
    "- Potential carbon reduction or energy efficiency improvements.\n"
    "- How shifts in resource usage might align with sustainability goals or company policies.\n\n"
    "When you respond:\n"
    "- Focus on trends, anomalies, and improvement opportunities.\n"
    "- Quantify metrics when possible (e.g., percent increases, cost per unit).\n"
    "- Provide actionable recommendations to improve efficiency or reduce environmental impact.\n\n"
    )

    # prompt = f"{preamble}Context:\n{context}\n\nQuestion:\n{question}\n\nAnswer with specific trends and comparisons."
    # Ensure DB-backed data is loaded and use it for metric hints
    try:
        ensure_resources()
    except Exception:
        # If resources couldn't be initialized, proceed with empty hint
        hint = ""
    else:
        hint = compute_metrics_hint(df if df is not None else pd.DataFrame())

    prompt = f"{preamble}{hint}\n\nContext:\n{context}\n\nQuestion:\n{question}\n\nAnswer with specific trends and comparisons."

    # 1) Prefer HTTP call to Ollama's completions endpoint (stable across
    # client versions). Use model id with explicit tag returned by the
    # /v1/models endpoint (we expect "llama3.2:latest").
    try:
        # Default to localhost so dev environments without docker-compose
        # still work; docker-compose overrides this with service name `ollama`.
        OLLAMA_HOST = os.environ.get('OLLAMA_HOST', 'localhost')
        OLLAMA_PORT = os.environ.get('OLLAMA_PORT', '11434')
        url = f"http://{OLLAMA_HOST}:{OLLAMA_PORT}/v1/completions"
        payload = {
            'model': os.environ.get('OLLAMA_MODEL', 'llama3.2:latest'),
            'prompt': prompt,
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
                # Ollama returns choices with 'text' for completions
                if 'choices' in body and len(body['choices']) > 0:
                    return body['choices'][0].get('text', '')
                # fallback: return full JSON as string
                logger.warning("Ollama 200 response did not contain 'choices': %s", body)
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
            # Some client versions expose chat; others may use chat-like API.
            res = None
            try:
                res = client.chat(model="llama3.2", messages=[{"role": "user", "content": prompt}])
                return res['message']['content']
            except Exception:
                # Try a positional chat or other client shapes if available
                try:
                    res = client.chat("llama3.2", prompt)
                    return res.get('message', {}).get('content', str(res))
                except Exception:
                    pass
        except Exception:
            pass

    # Fallback when Ollama or the chat call is not available. Return a
    # concise context-driven summary assembled from the computed metrics
    # and the retrieved context. This allows the frontend to show useful
    # information even without an LLM backend.
    # Use DB-backed data for metrics in the fallback as well
    try:
        ensure_resources()
        metrics = compute_metrics_hint(df if df is not None else pd.DataFrame())
    except Exception:
        metrics = ""
    ctx_excerpt = (context[:2000] + '...') if len(context) > 2000 else context
    fallback = (
        "(LLM unavailable) Context-driven summary:\n" +
        metrics + "\n\nRelevant context:\n" + ctx_excerpt +
        "\n\nTo enable full answers, install and run Ollama and ensure the Python 'ollama' client is available in the container."
    )
    return fallback

# 5. GPU forecasting (optional)
def forecast_trend(df):
    if 'bill_date' not in df.columns or df['bill_date'].dropna().empty:
        raise ValueError('No bill_date available for forecasting')
    df['year'] = pd.to_datetime(df['bill_date']).dt.year
    grouped = df.groupby('year')['cost'].sum().reset_index()

    x = torch.tensor(grouped['year'].values, dtype=torch.float32, device='cuda').unsqueeze(1)
    y = torch.tensor(grouped['cost'].values, dtype=torch.float32, device='cuda').unsqueeze(1)

    model_t = torch.nn.Linear(1, 1).cuda()
    opt = torch.optim.Adam(model_t.parameters(), lr=0.01)
    for _ in range(2000):
        opt.zero_grad()
        loss = torch.nn.functional.mse_loss(model_t(x), y)
        loss.backward()
        opt.step()

    future_years = torch.arange(2025, 2035, dtype=torch.float32, device='cuda').unsqueeze(1)
    preds = model_t(future_years).detach().cpu().numpy().flatten()

    forecast_summary = "\n".join([f"Predicted cost for {int(y)}: ${p:.2f}" for y, p in zip(future_years.flatten(), preds)])
    return forecast_summary

# Avoid heavy initialization at import-time. We'll lazily initialize the
# dataset, encoder model and FAISS index on first use so imports succeed in
# environments where some ML dependencies or hardware (GPU) aren't present.
df = None
model = None
index = None

def ensure_resources():
    """Make sure df, model and index are initialized. Swallows non-fatal
    errors and leaves resources as None if they can't be created."""
    global df, model, index
    if df is None:
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


def run_forecast():
    ensure_resources()
    if df is None:
        return "Data not available"
    try:
        forecast = forecast_trend(df)
        return forecast
    except Exception as e:
        return f"Forecasting failed: {e}"


def reload_data():
    global df, index
    df = load_data()
    index = build_index(df, model) if model is not None else None
    return "Data reloaded."
