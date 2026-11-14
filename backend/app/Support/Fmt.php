<?php

namespace App\Support;

/** Format angka gaya Indonesia untuk PDF / pesan. */
class Fmt
{
    public static function qty(float|int|null $n): string
    {
        if ($n === null) {
            return '-';
        }

        return rtrim(rtrim(number_format((float) $n, 3, ',', '.'), '0'), ',');
    }

    public static function money(float|int|null $n): string
    {
        if ($n === null) {
            return '-';
        }

        $decimals = fmod((float) $n, 1.0) == 0.0 ? 0 : 2;

        return 'Rp '.number_format((float) $n, $decimals, ',', '.');
    }

    public static function date($d): string
    {
        return $d ? \Illuminate\Support\Carbon::parse($d)->translatedFormat('d M Y') : '-';
    }

    public static function datetime($d): string
    {
        return $d ? \Illuminate\Support\Carbon::parse($d)->format('d/m/Y H:i') : '-';
    }
}
