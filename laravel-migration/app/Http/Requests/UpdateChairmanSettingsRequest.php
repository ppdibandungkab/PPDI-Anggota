<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\Exceptions\HttpResponseException;

class UpdateChairmanSettingsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $rules = [
            'chairman_name'         => ['nullable', 'string', 'max:150'],
            'chairman_title'        => ['nullable', 'string', 'max:200'],
            'chairman_greeting'     => ['nullable', 'string', 'max:10000'],
            'chairman_photo_base64' => ['nullable', 'string'],
            'remove_photo'          => ['nullable', 'boolean'],
        ];

        if ($this->hasFile('chairman_photo')) {
            $rules['chairman_photo'] = ['file', 'image', 'mimes:jpg,jpeg,png,webp', 'max:2048'];
        } else {
            $rules['chairman_photo'] = ['nullable', 'string'];
        }

        return $rules;
    }

    /**
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'chairman_name.max'      => 'Nama Ketua maksimal 150 karakter.',
            'chairman_title.max'     => 'Jabatan Ketua maksimal 200 karakter.',
            'chairman_greeting.max'  => 'Kata-kata sambutan Ketua maksimal 10.000 karakter.',
            'chairman_photo.image'   => 'File foto Ketua harus berupa gambar yang valid.',
            'chairman_photo.mimes'   => 'Format foto Ketua tidak didukung. Hanya JPG, PNG, atau WEBP yang diperbolehkan.',
            'chairman_photo.max'     => 'Ukuran file foto Ketua maksimal 2 MB.',
        ];
    }

    protected function failedValidation(Validator $validator): void
    {
        throw new HttpResponseException(response()->json([
            'success' => false,
            'message' => $validator->errors()->first() ?: 'Validasi data sambutan Ketua gagal.',
            'errors'  => $validator->errors(),
        ], 422));
    }
}
