import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import seaborn as sns
import pandas as pd

# 히트맵 데이터 로드
df = pd.read_csv("output/sector_heatmap.csv", index_col=0)

fig, ax = plt.subplots(figsize=(10, 8))

sns.heatmap(
    df,
    annot=True,
    fmt=".2f",
    cmap="RdYlGn",
    center=0,
    linewidths=0.5,
    linecolor="white",
    cbar_kws={"label": "Return (%)"},
    ax=ax,
)

ax.set_title("S&P 500 Sector Returns Heatmap (%)", fontsize=16, fontweight="bold", pad=15)
ax.set_xlabel("Period", fontsize=12)
ax.set_ylabel("")
ax.tick_params(axis="y", rotation=0)

plt.tight_layout()
plt.savefig("output/sector_heatmap.png", dpi=150, bbox_inches="tight")
print("output/sector_heatmap.png 저장 완료")
