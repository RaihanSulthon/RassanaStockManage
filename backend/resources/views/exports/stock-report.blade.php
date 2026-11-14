<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <title>{{ $report->type->label() }} {{ $report->report_date->toDateString() }}</title>
    <style>
        body { font-family: DejaVu Sans, sans-serif; font-size: 11px; color: #1e293b; }
        h1 { font-size: 16px; margin: 0 0 4px; }
        .meta { margin-bottom: 12px; }
        .meta td { padding: 2px 8px 2px 0; vertical-align: top; }
        .meta td.label { color: #64748b; width: 120px; }
        table.items { width: 100%; border-collapse: collapse; }
        table.items th { background: #0f172a; color: #fff; text-align: left; padding: 6px; }
        table.items td { border-bottom: 1px solid #e2e8f0; padding: 5px 6px; }
        table.items tr:nth-child(even) td { background: #f8fafc; }
        .num { text-align: right; }
        .footer { margin-top: 16px; color: #64748b; font-size: 10px; }
    </style>
</head>
<body>
    <h1>Laporan {{ $report->type->label() }}</h1>

    <table class="meta">
        <tr><td class="label">Tanggal</td><td>{{ $report->report_date->translatedFormat('d F Y') }}</td></tr>
        <tr><td class="label">Dicatat oleh</td><td>{{ $report->creator?->name ?? '-' }}</td></tr>
        <tr><td class="label">Diperiksa Operation</td><td>{{ $report->operator?->name ?? '-' }}</td></tr>
        <tr><td class="label">Status</td><td>{{ $report->status->label() }}</td></tr>
        @if ($report->note)
            <tr><td class="label">Catatan</td><td>{{ $report->note }}</td></tr>
        @endif
    </table>

    <table class="items">
        <thead>
            <tr>
                <th style="width: 30px">No</th>
                <th>Nama</th>
                <th style="width: 70px">Satuan</th>
                <th class="num" style="width: 80px">Jumlah</th>
                <th>Catatan</th>
            </tr>
        </thead>
        <tbody>
            @foreach ($report->items as $i => $item)
                <tr>
                    <td>{{ $i + 1 }}</td>
                    <td>{{ $item->name }}</td>
                    <td>{{ $item->unit }}</td>
                    <td class="num">{{ rtrim(rtrim(number_format($item->quantity, 3, ',', '.'), '0'), ',') }}</td>
                    <td>{{ $item->note }}</td>
                </tr>
            @endforeach
        </tbody>
    </table>

    <div class="footer">
        Total item: {{ $report->items->count() }} &middot; Dicetak oleh {{ $printedBy }} pada {{ $printedAt }}
    </div>
</body>
</html>
