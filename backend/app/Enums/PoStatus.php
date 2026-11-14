<?php

namespace App\Enums;

enum PoStatus: string
{
    case Draft = 'draft';
    case PendingApproval = 'pending_approval';
    case Revision = 'revision';
    case Approved = 'approved';
    case Sent = 'sent';
    case PartiallyReceived = 'partially_received';
    case Received = 'received';
    case Closed = 'closed';

    public function label(): string
    {
        return match ($this) {
            self::Draft => 'Draft',
            self::PendingApproval => 'Menunggu Approval',
            self::Revision => 'Perlu Revisi',
            self::Approved => 'Disetujui',
            self::Sent => 'Dikirim ke Vendor',
            self::PartiallyReceived => 'Diterima Sebagian',
            self::Received => 'Diterima Lengkap',
            self::Closed => 'Ditutup',
        };
    }

    public function editable(): bool
    {
        return in_array($this, [self::Draft, self::Revision], true);
    }

    /** Status di mana gudang boleh mencatat penerimaan barang dari vendor. */
    public function receivable(): bool
    {
        return in_array($this, [self::Sent, self::PartiallyReceived], true);
    }
}
