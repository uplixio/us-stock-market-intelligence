"use client";

interface SectorData {
  sector?: string;
  name?: string;
  change_pct?: number;
  change_1d?: number;
  momentum?: number;
  [key: string]: unknown;
}

interface Props {
  sectors: SectorData[];
}

function getHeatmapColor(pct: number): string {
  if (pct >= 3) return "bg-green-600 text-white";
  if (pct >= 1) return "bg-green-400 text-white";
  if (pct >= 0) return "bg-green-200 text-gray-800";
  if (pct >= -1) return "bg-red-200 text-gray-800";
  if (pct >= -3) return "bg-red-400 text-white";
  return "bg-red-600 text-white";
}

export default function SectorHeatmap({ sectors }: Props) {
  if (!sectors || sectors.length === 0) return null;

  return (
    <div className="w-full">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
        섹터 수익률 히트맵
      </h3>
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
        {sectors.map((s, i) => {
          const pct = s.change_pct ?? s.change_1d ?? s.momentum ?? 0;
          const label = s.name ?? s.sector ?? String(i);
          return (
            <div
              key={label}
              className={`rounded-lg p-3 text-center ${getHeatmapColor(pct)}`}
            >
              <div className="text-xs font-medium truncate">{label}</div>
              <div className="text-lg font-bold">
                {pct >= 0 ? "+" : ""}{pct.toFixed(1)}%
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
