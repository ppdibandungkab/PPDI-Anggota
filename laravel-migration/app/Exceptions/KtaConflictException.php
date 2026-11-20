<?php

namespace App\Exceptions;

use RuntimeException;

class KtaConflictException extends RuntimeException
{
    public function __construct(
        string $message = 'Nomor KTA sudah digunakan oleh anggota lain. Silakan coba kembali.',
        public readonly ?string $conflictingKta = null,
        ?\Throwable $previous = null
    ) {
        parent::__construct($message, 409, $previous);
    }
}
