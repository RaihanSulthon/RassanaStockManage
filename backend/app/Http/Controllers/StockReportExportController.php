<?php

namespace App\Http\Controllers;

use App\Models\StockReport;
use Barryvdh\DomPDF\Facade\Pdf;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use OpenSpout\Common\Entity\Row;
use OpenSpout\Common\Entity\Style\Style;
use OpenSpout\Writer\XLSX\Options;
use OpenSpout\Writer\XLSX\Writer;
use Symfony\Component\HttpFoundation\BinaryFileResponse;

class StockReportExportController extends Controller
{
    private const TZ = 'Asia/Jakarta';

    public function pdf(Request $request, StockReport $stockReport)
    {
        Gate::authorize('export', $stockReport);

        $report = $this->load($stockReport);
        $stockReport->addLog($request->user(), 'exported', ['format' => 'pdf']);

        return Pdf::loadView('exports.stock-report', [
            'report' => $report,
            'printedBy' => $request->user()->name,
            'printedAt' => now(self::TZ)->format('d/m/Y H:i'),
        ])->setPaper('a4')->download($this->filename($report, 'pdf'));
    }

    public function excel(Request $request, StockReport $stockReport): BinaryFileResponse
    {
        Gate::authorize('export', $stockReport);

        $report = $this->load($stockReport);
        $stockReport->addLog($request->user(), 'exported', ['format' => 'excel']);

        $path = tempnam(sys_get_temp_dir(), 'stock_').'.xlsx';

        $options = new Options;
        $options->setColumnWidth(6, 1);
        $options->setColumnWidth(40, 2);
        $options->setColumnWidth(14, 3);
        $options->setColumnWidth(14, 4);
        $options->setColumnWidth(40, 5);

        $writer = new Writer($options);
        $writer->openToFile($path);
        $writer->getCurrentSheet()->setName($report->type->label());

        $bold = (new Style)->withFontBold(true);
        $title = (new Style)->withFontBold(true)->withFontSize(14);

        $writer->addRow(Row::fromValuesWithStyle(['LAPORAN '.strtoupper($report->type->label())], $title));
        $writer->addRow(Row::fromValues(['Tanggal', $report->report_date->translatedFormat('d F Y')]));
        $writer->addRow(Row::fromValues(['Dicatat oleh', $report->creator?->name ?? '-']));
        $writer->addRow(Row::fromValues(['Diperiksa Operation', $report->operator?->name ?? '-']));
        $writer->addRow(Row::fromValues(['Status', $report->status->label()]));
        if ($report->note) {
            $writer->addRow(Row::fromValues(['Catatan', $report->note]));
        }
        $writer->addRow(Row::fromValues([]));
        $writer->addRow(Row::fromValuesWithStyle(['No', 'Nama', 'Satuan', 'Jumlah', 'Catatan'], $bold));

        foreach ($report->items as $i => $item) {
            $writer->addRow(Row::fromValues([$i + 1, $item->name, $item->unit, $item->quantity, $item->note ?? '']));
        }

        $writer->addRow(Row::fromValues([]));
        $writer->addRow(Row::fromValues([
            'Dicetak oleh '.$request->user()->name.' pada '.now(self::TZ)->format('d/m/Y H:i'),
        ]));
        $writer->close();

        return response()->download($path, $this->filename($report, 'xlsx'))->deleteFileAfterSend(true);
    }

    private function load(StockReport $report): StockReport
    {
        return $report->load(['items', 'creator:id,name', 'operator:id,name', 'completer:id,name']);
    }

    private function filename(StockReport $report, string $ext): string
    {
        return "stok-{$report->type->value}-{$report->report_date->toDateString()}-{$report->id}.{$ext}";
    }
}
