<?php

namespace App\Enums;

/** Status UR (User Request) dan PR (Purchasing Requisition). */
enum RequestStatus: string
{
    case Draft = 'draft';
    case Submitted = 'submitted';
    case Processed = 'processed';

    public function labelFor(string $doc): string
    {
        return match ($this) {
            self::Draft => 'Draft',
            self::Submitted => $doc === 'ur' ? 'Menunggu Operation' : 'Menunggu Purchasing',
            self::Processed => $doc === 'ur' ? 'Sudah dibuat PR' : 'Sudah dibuat PO',
        };
    }
}
