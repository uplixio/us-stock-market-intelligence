/**
 * Top Picks 데이터를 CSV로 내보내기
 */
export function exportTopPicksToCSV(picks: Record<string, unknown>[], filename = "top_picks.csv") {
  if (!picks || picks.length === 0) return;

  const headers = Object.keys(picks[0]);
  const rows = picks.map((row) =>
    headers.map((h) => {
      const val = row[h];
      if (val === null || val === undefined) return "";
      const str = String(val);
      // 쉼표나 따옴표 포함 시 인용
      return str.includes(",") || str.includes('"') ? `"${str.replace(/"/g, '""')}"` : str;
    }).join(",")
  );

  const csv = [headers.join(","), ...rows].join("\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
