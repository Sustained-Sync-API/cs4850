# ---- /llm/rag_gpu.py ----
import os
import pandas as pd
import numpy as np
import faiss
import torch
from sentence_transformers import SentenceTransformer
from ollama import Client

DATA_PATH = 'data/billdata.csv'
INDEX_PATH = 'data/bill_index.faiss'
MODEL_NAME = 'all-MiniLM-L6-v2'

print("🔧 Initializing Bill Analysis Assistant...")

# 1. Load and preprocess data
def load_data():
    df = pd.read_csv(DATA_PATH)
    df.columns = df.columns.str.lower()

    # Generate per-row summary
    df['summary'] = df.apply(lambda r:
        f"{r['bill_date']} {r['bill_type']} in {r['city']}, {r['state']} "
        f"consumed {r['consumption']} {r['units_of_measure']} costing ${r['cost']}", axis=1)

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
    df['year'] = pd.to_datetime(df['bill_date']).dt.year
    latest_year = df['year'].max()
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
    hint = compute_metrics_hint(pd.read_csv(DATA_PATH))
    prompt = f"{preamble}{hint}\n\nContext:\n{context}\n\nQuestion:\n{question}\n\nAnswer with specific trends and comparisons."

    res = client.chat(model="llama3.2", messages=[{"role": "user", "content": prompt}])
    return res['message']['content']

# 5. GPU forecasting (optional)
def forecast_trend(df):
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

# Initialize components
client = Client()
df = load_data()
model = SentenceTransformer(MODEL_NAME, device='cuda')
index = build_index(df, model)

print("\n💬 Bill Analysis Assistant (type 'reload' to refresh data, 'forecast' for predictions, or 'quit' to exit)\n")

# Interactive loop
while True:
    q = input("You: ").strip()
    if q.lower() in ['quit', 'exit']:
        print("👋 Exiting assistant.")
        break
    elif q.lower() == 'reload':
        print("🔄 Reloading data and rebuilding index...")
        df = load_data()
        index = build_index(df, model)
        print("✅ Data reloaded.")
        continue
    elif q.lower() == 'forecast':
        print("📈 Forecasting next 10 years...")
        forecast = forecast_trend(pd.read_csv(DATA_PATH))
        print(forecast)
        continue

    ctx = "\n".join(retrieve(q, model, df, index, k=10))
    ans = ask_llm(ctx, q)
    print(f"\nAssistant: {ans}\n")
