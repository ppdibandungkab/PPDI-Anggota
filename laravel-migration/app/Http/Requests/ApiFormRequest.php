<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

/**
 * Base FormRequest enforcing identical JSON error format as Express server.ts:
 * { "success": false, "message": "...", "errors": { ... } }
 */
abstract class ApiFormRequest extends FormRequest
{
    protected int $errorStatus = 400;

    public function authorize(): bool
    {
        return true;
    }

    protected function failedValidation(Validator $validator): void
    {
        $firstMessage = $validator->errors()->first() ?: 'Data permintaan tidak valid.';

        throw new HttpResponseException(
            response()->json([
                'success' => false,
                'message' => $firstMessage,
                'errors'  => $validator->errors()->toArray(),
            ], $this->errorStatus)
        );
    }
}
