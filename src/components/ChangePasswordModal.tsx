import React, { useState, useEffect } from 'react';
import { usePPDI } from '../context/PPDIContext';
import { UserAccount } from '../types/ppdi';
import {
  Key,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  X,
  ShieldCheck,
  User,
} from 'lucide-react';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetUser?: UserAccount | null;
  requireOldPassword?: boolean;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  onClose,
  targetUser,
  requireOldPassword = true,
}) => {
  const { currentUser, changePassword } = usePPDI();

  // If no targetUser passed, default to currentUser
  const user = targetUser || currentUser;
  const isSelf = user.id_user === currentUser.id_user;
  // If editing self, always require old password
  const mustRequireOld = requireOldPassword || isSelf;

  // Form states
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Visibility toggles
  const [showOldPassword, setShowOldPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Status & Feedback
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Reset form when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowOldPassword(false);
      setShowNewPassword(false);
      setShowConfirmPassword(false);
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [isOpen, user]);

  if (!isOpen) return null;

  // Password validation computations
  const isOldFilled = !mustRequireOld || oldPassword.trim().length > 0;
  const isNewLengthValid = newPassword.trim().length >= 6;
  const isNewDifferentFromOld = !mustRequireOld || (oldPassword.trim() !== newPassword.trim());
  const isConfirmMatching = newPassword.trim() !== '' && newPassword === confirmPassword;

  // Password strength score (0-4)
  const calculateStrength = (pass: string) => {
    if (!pass) return 0;
    let score = 0;
    if (pass.length >= 6) score += 1;
    if (pass.length >= 8) score += 1;
    if (/[A-Z]/.test(pass) && /[a-z]/.test(pass)) score += 1;
    if (/[0-9]/.test(pass) || /[^A-Za-z0-9]/.test(pass)) score += 1;
    return score;
  };

  const strength = calculateStrength(newPassword);
  const strengthLabels = ['Sangat Lemah', 'Lemah', 'Cukup', 'Kuat', 'Sangat Kuat'];
  const strengthColors = ['bg-red-500', 'bg-orange-500', 'bg-amber-500', 'bg-emerald-600', 'bg-emerald-700'];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    // Validation checks
    if (mustRequireOld && !oldPassword.trim()) {
      setErrorMsg('Password lama yang saat ini digunakan wajib diisi.');
      return;
    }

    if (!isNewLengthValid) {
      setErrorMsg('Password baru minimal harus terdiri dari 6 karakter.');
      return;
    }

    if (mustRequireOld && oldPassword.trim() === newPassword.trim()) {
      setErrorMsg('Password baru tidak boleh sama dengan password lama saat ini.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('Pengetikan ulang password baru (konfirmasi) tidak cocok. Pastikan kedua input sama persis.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await changePassword({
        userId: user.id_user,
        username: user.username,
        oldPassword: mustRequireOld ? oldPassword.trim() : undefined,
        newPassword: newPassword.trim(),
        requireOldPassword: mustRequireOld,
      });

      setSuccessMsg(res.message || 'Password berhasil diperbarui! Silakan gunakan password baru ini.');
      setTimeout(() => {
        onClose();
      }, 1600);
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal mengubah password. Silakan coba kembali.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white rounded-2xl shadow-2xl border border-neutral-200 w-full max-w-md overflow-hidden transform transition-all animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
      >
        {/* Header */}
        <div className="bg-[#064E3B] text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/10 rounded-lg">
              <Key className="w-5 h-5 text-amber-300" />
            </div>
            <div>
              <h2 id="modal-title" className="text-base font-bold tracking-tight">
                Ganti Password Akun
              </h2>
              <p className="text-xs text-emerald-100 font-mono mt-0.5">
                {isSelf ? 'Perbarui kata sandi akun Anda' : `Atur ulang password: ${user.username}`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            type="button"
            className="text-white/70 hover:text-white hover:bg-white/10 p-1.5 rounded-lg transition-colors cursor-pointer"
            aria-label="Tutup Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Identity Context Card */}
        <div className="bg-neutral-50 px-6 py-3 border-b border-neutral-200 flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2 text-neutral-700">
            <User className="w-4 h-4 text-neutral-400" />
            <span className="font-bold text-neutral-900">{user.nama}</span>
            <span className="text-neutral-400">(@{user.username})</span>
          </div>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-200">
            {user.role}
          </span>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Error Message Alert */}
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-medium">{errorMsg}</div>
            </div>
          )}

          {/* Success Message Alert */}
          {successMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <div className="flex-1 font-semibold">{successMsg}</div>
            </div>
          )}

          {/* 1. Password Lama (Saat Ini) */}
          {mustRequireOld && (
            <div className="space-y-1">
              <label className="block text-xs font-bold text-neutral-700 font-mono">
                Password Lama (Saat Ini) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showOldPassword ? 'text' : 'password'}
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  placeholder="Masukkan password yang saat ini aktif..."
                  required={mustRequireOld}
                  className="w-full pl-9 pr-10 py-2.5 text-xs bg-white border border-neutral-300 rounded-lg text-neutral-900 placeholder:text-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-[#064E3B] focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowOldPassword(!showOldPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-400 hover:text-neutral-700 cursor-pointer"
                  tabIndex={-1}
                  aria-label={showOldPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                >
                  {showOldPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[10px] text-neutral-500">
                Wajib diisi sesuai dengan kata sandi login Anda yang saat ini tersimpan di sistem.
              </p>
            </div>
          )}

          {/* 2. Password Baru */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-neutral-700 font-mono">
              Password Baru <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400">
                <Key className="w-4 h-4" />
              </div>
              <input
                type={showNewPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Minimal 6 karakter..."
                required
                minLength={6}
                className={`w-full pl-9 pr-10 py-2.5 text-xs bg-white border rounded-lg text-neutral-900 placeholder:text-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-[#064E3B] focus:border-transparent transition-all ${
                  newPassword && !isNewLengthValid ? 'border-red-400' : 'border-neutral-300'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-400 hover:text-neutral-700 cursor-pointer"
                tabIndex={-1}
                aria-label={showNewPassword ? 'Sembunyikan password' : 'Tampilkan password'}
              >
                {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Password strength meter */}
            {newPassword.length > 0 && (
              <div className="space-y-1 pt-1">
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className="text-neutral-500">Kekuatan Password:</span>
                  <span className="font-semibold text-neutral-700">{strengthLabels[strength]}</span>
                </div>
                <div className="w-full bg-neutral-200 h-1.5 rounded-full overflow-hidden flex gap-0.5">
                  {[1, 2, 3, 4].map((step) => (
                    <div
                      key={step}
                      className={`h-full flex-1 transition-all duration-300 ${
                        strength >= step ? strengthColors[strength] : 'bg-neutral-200'
                      }`}
                    />
                  ))}
                </div>
              </div>
            )}

            {mustRequireOld && oldPassword && newPassword && oldPassword === newPassword && (
              <p className="text-[10px] text-red-600 font-medium">
                Password baru tidak boleh sama dengan password lama.
              </p>
            )}
          </div>

          {/* 3. Konfirmasi Password Baru */}
          <div className="space-y-1">
            <label className="block text-xs font-bold text-neutral-700 font-mono">
              Pengetikan Ulang Password Baru (Konfirmasi) <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Ketik ulang password baru Anda..."
                required
                className={`w-full pl-9 pr-10 py-2.5 text-xs bg-white border rounded-lg text-neutral-900 placeholder:text-neutral-400 focus:outline-hidden focus:ring-2 focus:ring-[#064E3B] focus:border-transparent transition-all ${
                  confirmPassword
                    ? isConfirmMatching
                      ? 'border-emerald-500 focus:ring-emerald-600'
                      : 'border-red-400 focus:ring-red-500'
                    : 'border-neutral-300'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-400 hover:text-neutral-700 cursor-pointer"
                tabIndex={-1}
                aria-label={showConfirmPassword ? 'Sembunyikan password' : 'Tampilkan password'}
              >
                {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Confirmation match feedback */}
            {confirmPassword.length > 0 && (
              <div className="flex items-center gap-1.5 text-[10px] font-mono pt-0.5">
                {isConfirmMatching ? (
                  <span className="text-emerald-700 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Password baru cocok dan terverifikasi
                  </span>
                ) : (
                  <span className="text-red-600 font-medium flex items-center gap-1">
                    <AlertCircle className="w-3.5 h-3.5" />
                    Pengetikan ulang password belum cocok
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-neutral-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={
                isSubmitting ||
                !isOldFilled ||
                !isNewLengthValid ||
                !isConfirmMatching ||
                (mustRequireOld && oldPassword === newPassword)
              }
              className={`px-5 py-2 text-xs font-bold text-white rounded-lg transition-all flex items-center gap-1.5 shadow-sm cursor-pointer ${
                isSubmitting ||
                !isOldFilled ||
                !isNewLengthValid ||
                !isConfirmMatching ||
                (mustRequireOld && oldPassword === newPassword)
                  ? 'bg-neutral-400 cursor-not-allowed opacity-70'
                  : 'bg-[#064E3B] hover:bg-[#043d2e] hover:shadow-md'
              }`}
            >
              {isSubmitting ? (
                <>
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Memverifikasi & Menyimpan...</span>
                </>
              ) : (
                <>
                  <Key className="w-3.5 h-3.5" />
                  <span>Simpan Password Baru</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
