<?php

namespace App\Support;

use App\Models\User;
use Barryvdh\DomPDF\Facade\Pdf;
use OpenSpout\Common\Entity\Row;
use OpenSpout\Common\Entity\Style\Style;
use OpenSpout\Writer\XLSX\Options;
use OpenSpout\Writer\XLSX\Writer;
use Symfony\Component\HttpFoundation\Response;

/**
 * Satu struktur dokumen -> dua format (PDF & Excel), dipakai semua dokumen:
 * UR, PR, PO, riwayat penerimaan, laporan saldo stok, bukti pembayaran.
 *
 * Kolom tabel: ['label' => 'Jumlah', 'type' => 'text|qty|money|int']
 */
class DocumentExport
{
    /** @var array<int, array{0: string, 1: string}> */
    private array $meta = [];

    /** @var array<int, array<string, mixed>> */
    private array $sections = [];

    /** @var array<int, string> */
    private array $notes = [];

    public function __construct(private string $title, private string $filename) {}

    public function meta(string $label, mixed $value): static
    {
        $this->meta[] = [$label, ($value === null || $value === '') ? '-' : (string) $value];

        return $this;
    }

    /**
     * @param  array<int, array{label: string, type?: string}>  $columns
     * @param  array<int, array<int, mixed>>  $rows
     * @param  array<int, mixed>|null  $totals  baris total (panjang sama dengan kolom; null untuk sel kosong)
     */
    public function table(?string $heading, array $columns, array $rows, ?array $totals = null): static
    {
        $this->sections[] = compact('heading', 'columns', 'rows', 'totals');

        return $this;
    }

    public function note(string $text): static
    {
        $this->notes[] = $text;

        return $this;
    }

    public function download(string $format, User $printedBy): Response
    {
        $printed = 'Dicetak oleh '.$printedBy->name.' ('.$printedBy->role->label().') pada '.now()->format('d/m/Y H:i');

        return $format === 'pdf' ? $this->pdf($printed) : $this->excel($printed);
    }

    private function pdf(string $printed): Response
    {
        $maxCols = max(array_map(fn ($s) => count($s['columns']), $this->sections) ?: [0]);

        return Pdf::loadView('exports.document', [
            'title' => $this->title,
            'meta' => $this->meta,
            'sections' => array_map(fn ($s) => [
                ...$s,
                'rows' => array_map(fn ($r) => $this->formatRow($s['columns'], $r), $s['rows']),
                'totals' => $s['totals'] ? $this->formatRow($s['columns'], $s['totals']) : null,
            ], $this->sections),
            'notes' => $this->notes,
            'printed' => $printed,
        ])->setPaper('a4', $maxCols > 6 ? 'landscape' : 'portrait')->download($this->filename.'.pdf');
    }

    private function excel(string $printed): Response
    {
        $path = tempnam(sys_get_temp_dir(), 'doc_').'.xlsx';
        $maxCols = max(array_map(fn ($s) => count($s['columns']), $this->sections) ?: [1]);

        $options = new Options;
        $options->setColumnWidth(24, 1);
        $options->setColumnWidth(32, 2);
        for ($c = 3; $c <= max($maxCols, 3); $c++) {
            $options->setColumnWidth(16, $c);
        }

        $writer = new Writer($options);
        $writer->openToFile($path);
        $writer->getCurrentSheet()->setName(mb_substr(preg_replace('/[\\\\\/?*\[\]:]/', '', $this->title), 0, 31));

        $bold = (new Style)->withFontBold(true);
        $title = (new Style)->withFontBold(true)->withFontSize(14);

        $writer->addRow(Row::fromValuesWithStyle([$this->title], $title));
        foreach ($this->meta as [$label, $value]) {
            $writer->addRow(Row::fromValues([$label, $value]));
        }

        foreach ($this->sections as $s) {
            $writer->addRow(Row::fromValues([]));
            if ($s['heading']) {
                $writer->addRow(Row::fromValuesWithStyle([$s['heading']], $bold));
            }
            $writer->addRow(Row::fromValuesWithStyle(array_column($s['columns'], 'label'), $bold));
            foreach ($s['rows'] as $row) {
                $writer->addRow(Row::fromValues(array_map(fn ($v) => $v ?? '', array_values($row))));
            }
            if ($s['totals']) {
                $writer->addRow(Row::fromValuesWithStyle(array_map(fn ($v) => $v ?? '', $s['totals']), $bold));
            }
        }

        $writer->addRow(Row::fromValues([]));
        foreach ($this->notes as $n) {
            $writer->addRow(Row::fromValues([$n]));
        }
        $writer->addRow(Row::fromValues([$printed]));
        $writer->close();

        return response()->download($path, $this->filename.'.xlsx')->deleteFileAfterSend(true);
    }

    /** @return array<int, array{0: string, 1: bool}> [teks, rata kanan] */
    private function formatRow(array $columns, array $row): array
    {
        $row = array_values($row);
        $out = [];
        foreach ($columns as $i => $col) {
            $v = $row[$i] ?? null;
            $type = $col['type'] ?? 'text';
            $out[] = match (true) {
                $v === null || $v === '' => ['', false],
                $type === 'qty' && is_numeric($v) => [Fmt::qty($v), true],
                $type === 'money' && is_numeric($v) => [Fmt::money($v), true],
                $type === 'int' => [(string) $v, true],
                default => [(string) $v, false],
            };
        }

        return $out;
    }
}
