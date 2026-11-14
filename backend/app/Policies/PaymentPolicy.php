<?php

namespace App\Policies;

use App\Enums\PaymentStatus;
use App\Enums\Role;
use App\Models\Payment;
use App\Models\User;

class PaymentPolicy
{
    public function view(User $actor, Payment $payment): bool
    {
        return $actor->role->isPrivileged();
    }

    public function update(User $actor, Payment $payment): bool
    {
        return $actor->hasRole(Role::Finance) && $payment->status === PaymentStatus::Prepared;
    }

    public function pay(User $actor, Payment $payment): bool
    {
        return $this->update($actor, $payment);
    }

    public function delete(User $actor, Payment $payment): bool
    {
        return $this->update($actor, $payment);
    }

    public function export(User $actor, Payment $payment): bool
    {
        return $this->view($actor, $payment);
    }
}
