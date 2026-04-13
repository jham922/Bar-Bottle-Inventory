import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { BottleWithLatestScan } from './inventory';
import { ConsumptionReportItem, VarianceReportItem } from './reports';

export function buildInventoryCsv(items: BottleWithLatestScan[]): string {
  const header = 'Brand,Spirit Type,Bottle Size (ml),Fill %,Remaining (ml),Last Scanned';
  const rows = items.map(i =>
    [i.brand, i.spirit_type, i.total_volume_ml, i.fill_pct ?? '', i.volume_remaining_ml ?? '', i.scanned_at ? new Date(i.scanned_at).toLocaleDateString() : ''].join(',')
  );
  return [header, ...rows].join('\n');
}

export function buildConsumptionCsv(items: ConsumptionReportItem[], dateStart: string, dateEnd: string): string {
  const header = `Consumption Report: ${dateStart} to ${dateEnd}\nBrand,Spirit Type,Consumed (ml),Consumed (oz)`;
  const OZ = 29.5735;
  const rows = items.map(i =>
    [i.brand, i.spirit_type, i.consumed_ml, (i.consumed_ml / OZ).toFixed(1)].join(',')
  );
  return [header, ...rows].join('\n');
}

export function buildVarianceCsv(items: VarianceReportItem[], dateStart: string, dateEnd: string): string {
  const header = `Variance Report: ${dateStart} to ${dateEnd}\nBrand,Theoretical (ml),Actual (ml),Difference (ml),Variance %,Flagged`;
  const rows = items.map(i =>
    [i.brand, i.theoretical_ml, i.actual_ml, i.diff_ml, `${i.variance_pct}%`, i.flagged ? 'YES' : 'no'].join(',')
  );
  return [header, ...rows].join('\n');
}

export async function shareCsv(csvContent: string, filename: string): Promise<void> {
  const path = `${FileSystem.cacheDirectory}${filename}`;
  await FileSystem.writeAsStringAsync(path, csvContent, { encoding: FileSystem.EncodingType.UTF8 });
  await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: filename });
}

export async function printReport(htmlContent: string): Promise<void> {
  await Print.printAsync({ html: htmlContent });
}

export function buildVarianceHtml(items: VarianceReportItem[], dateStart: string, dateEnd: string): string {
  const rows = items.map(i => `
    <tr style="${i.flagged ? 'background:#fff0f0' : ''}">
      <td>${i.brand}</td>
      <td>${i.theoretical_ml}ml</td>
      <td>${i.actual_ml}ml</td>
      <td>${i.diff_ml > 0 ? '+' : ''}${i.diff_ml}ml</td>
      <td>${i.variance_pct}%</td>
      <td>${i.flagged ? '⚠️ Review' : '✓'}</td>
    </tr>
  `).join('');

  return `
    <!DOCTYPE html><html><head>
    <style>body{font-family:sans-serif;padding:20px}table{width:100%;border-collapse:collapse}th{background:#333;color:#fff;padding:8px;text-align:left}td{padding:8px;border-bottom:1px solid #eee}h1{font-size:18px}</style>
    </head><body>
    <h1>Variance Report: ${dateStart} to ${dateEnd}</h1>
    <table><tr><th>Brand</th><th>Theoretical</th><th>Actual</th><th>Difference</th><th>Variance</th><th>Status</th></tr>
    ${rows}
    </table>
    </body></html>
  `;
}
