<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <title>{{ $title }}</title>
    <style>
        body { font-family: DejaVu Sans, sans-serif; font-size: 10px; color: #1e293b; }
        h1 { font-size: 15px; margin: 0 0 8px; }
        h2 { font-size: 11px; margin: 14px 0 4px; }
        .meta td { padding: 1px 10px 1px 0; vertical-align: top; }
        .meta td.label { color: #64748b; width: 130px; }
        table.grid { width: 100%; border-collapse: collapse; margin-top: 4px; }
        table.grid th { background: #0f172a; color: #fff; text-align: left; padding: 5px; }
        table.grid td { border-bottom: 1px solid #e2e8f0; padding: 4px 5px; }
        table.grid tr:nth-child(even) td { background: #f8fafc; }
        table.grid tr.total td { font-weight: bold; border-top: 1.5px solid #0f172a; background: #fff; }
        .r { text-align: right; }
        .notes { margin-top: 12px; }
        .footer { margin-top: 14px; color: #64748b; font-size: 9px; }
    </style>
</head>
<body>
    <h1>{{ $title }}</h1>

    <table class="meta">
        @foreach ($meta as [$label, $value])
            <tr><td class="label">{{ $label }}</td><td>{{ $value }}</td></tr>
        @endforeach
    </table>

    @foreach ($sections as $s)
        @if ($s['heading'])
            <h2>{{ $s['heading'] }}</h2>
        @endif
        <table class="grid">
            <thead>
                <tr>
                    @foreach ($s['columns'] as $col)
                        <th class="{{ in_array($col['type'] ?? 'text', ['qty', 'money', 'int']) ? 'r' : '' }}">{{ $col['label'] }}</th>
                    @endforeach
                </tr>
            </thead>
            <tbody>
                @forelse ($s['rows'] as $row)
                    <tr>
                        @foreach ($row as [$text, $right])
                            <td class="{{ $right ? 'r' : '' }}">{{ $text }}</td>
                        @endforeach
                    </tr>
                @empty
                    <tr><td colspan="{{ count($s['columns']) }}">Tidak ada data.</td></tr>
                @endforelse
                @if ($s['totals'])
                    <tr class="total">
                        @foreach ($s['totals'] as [$text, $right])
                            <td class="{{ $right ? 'r' : '' }}">{{ $text }}</td>
                        @endforeach
                    </tr>
                @endif
            </tbody>
        </table>
    @endforeach

    @if ($notes)
        <div class="notes">
            @foreach ($notes as $n)
                <div>{{ $n }}</div>
            @endforeach
        </div>
    @endif

    <div class="footer">{{ $printed }}</div>
</body>
</html>
