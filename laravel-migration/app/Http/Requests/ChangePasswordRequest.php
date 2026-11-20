<?php

namespace App\Http\Requests;

use App\Models\User;
use App\Services\PpdiHelperService;
use Illuminate\Validation\Validator;

class ChangePasswordRequest extends ApiFormRequest
{
    public function rules(): array
    {
        return [
            'id_user'            => ['nullable'],
            'username'           => ['nullable', 'string'],
            'oldPassword'        => ['nullable', 'string'],
            'newPassword'        => ['required', 'string'],
            'requireOldPassword' => ['nullable', 'boolean'],
            'requireUpdatedAt'   => ['nullable', 'boolean'],
        ];
    }

    public function messages(): array
    {
        return [
            'newPassword.required' => 'Password baru minimal harus 6 karakter',
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v) {
            if (empty($this->input('id_user')) && empty($this->input('username'))) {
                $v->errors()->add('id_user', 'ID Pengguna atau username wajib disertakan');
                return;
            }

            $cleanNew = trim((string) $this->input('newPassword', ''));
            if (strlen($cleanNew) < 6) {
                $v->errors()->add('newPassword', 'Password baru minimal harus 6 karakter');
                return;
            }

            $requireOld = $this->has('requireOldPassword')
                ? filter_var($this->input('requireOldPassword'), FILTER_VALIDATE_BOOLEAN)
                : true;
            $cleanOld = trim((string) $this->input('oldPassword', ''));

            if ($requireOld && $cleanOld === '') {
                $v->errors()->add('oldPassword', 'Password lama wajib diisi');
                return;
            }

            if ($requireOld && $cleanOld === $cleanNew) {
                $v->errors()->add('newPassword', 'Password baru tidak boleh sama dengan password lama');
                return;
            }

            if (in_array($cleanNew, PpdiHelperService::DEFAULT_PASSWORDS, true)) {
                $v->errors()->add(
                    'newPassword',
                    'Password baru tidak boleh menggunakan password default. Silakan buat kata sandi baru yang aman dan unik.'
                );
                return;
            }

            // Validasi kondisi updated_at !== null apabila mode validasi ketat aktif
            // (tetap mengizinkan aktivasi awal password default saat requireOldPassword = false atau oldPassword adalah password default)
            $requireUpdatedAt = $this->has('requireUpdatedAt')
                ? filter_var($this->input('requireUpdatedAt'), FILTER_VALIDATE_BOOLEAN)
                : filter_var(env('STRICT_PASSWORD_UPDATED_AT_CHECK', false), FILTER_VALIDATE_BOOLEAN);

            $isDefaultPassActivation = !$requireOld
                || in_array($cleanOld, PpdiHelperService::DEFAULT_PASSWORDS, true);

            if ($requireUpdatedAt && !$isDefaultPassActivation) {
                $targetUser = User::findByIdOrUsername(
                    $this->input('id_user'),
                    (string) $this->input('username', '')
                );

                if ($targetUser && !$targetUser->hasValidUpdatedAt()) {
                    $v->errors()->add(
                        'updated_at',
                        'Perubahan password belum diizinkan: profil/akun harus diperbarui terlebih dahulu (updated_at masih kosong).'
                    );
                }
            }
        });
    }
}
