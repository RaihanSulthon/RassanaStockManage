<?php

namespace App\Notifications;

use Illuminate\Notifications\Notification;

/** Notifikasi di aplikasi (lonceng), disimpan di tabel notifications. */
class WorkflowNotification extends Notification
{
    public function __construct(
        private string $title,
        private string $message,
        private string $url,
    ) {}

    public function via(object $notifiable): array
    {
        return ['database'];
    }

    public function toArray(object $notifiable): array
    {
        return [
            'title' => $this->title,
            'message' => $this->message,
            'url' => $this->url,
        ];
    }
}
