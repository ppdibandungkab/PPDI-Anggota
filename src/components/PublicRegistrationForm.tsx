import React, { useState, useMemo } from 'react';
import { usePPDI } from '../context/PPDIContext';
import { X, CheckCircle, AlertCircle, Image as ImageIcon, FileText, Loader2, Calendar } from 'lucide-react';

interface PublicRegistrationFormProps {
  isOpen: boolean;
  onClose: () => void;
}

interface UploadProgressState {
  status: 'idle' | 'reading' | 'uploading' | 'done' | 'error';
  progress: number;
  fileName: string;
  fileSizeLabel: string;
  errorMessage?: string;
}

const INITIAL_UPLOAD_STATE: UploadProgressState = {
  status: 'idle',
  progress: 0,
  fileName: '',
  fileSizeLabel: '',
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

const formatDdMmYyyyInput = (raw: string): string => {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  return `${digits.slice(0, 2)}-${digits.slice(2, 4)}-${digits.slice(4)}`;
};

const validateDdMmYyyy = (
  value: string
): { valid: boolean; error?: string; isoDate?: string } => {
  const trimmed = value.trim();
  if (!trimmed) {
    return { valid: false, error: 'Tanggal wajib diisi dengan format DD-MM-YYYY.' };
  }
  const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(trimmed);
  if (!match) {
    return {
      valid: false,
      error: 'Format harus DD-MM-YYYY (contoh: 17-08-2024).',
    };
  }
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (year < 1950 || year > 2100) {
    return { valid: false, error: 'Tahun harus berada di antara 1950 hingga 2100.' };
  }
  if (month < 1 || month > 12) {
    return { valid: false, error: 'Bulan tidak valid (harus 01 - 12).' };
  }
  if (day < 1 || day > 31) {
    return { valid: false, error: 'Tanggal tidak valid (harus 01 - 31).' };
  }
  const candidate = new Date(year, month - 1, day);
  if (
    candidate.getFullYear() !== year ||
    candidate.getMonth() !== month - 1 ||
    candidate.getDate() !== day
  ) {
    return { valid: false, error: 'Tanggal tersebut tidak ada dalam kalender.' };
  }
  const isoDate = `${match[3]}-${match[2]}-${match[1]}`;
  return { valid: true, isoDate };
};

export const PublicRegistrationForm: React.FC<PublicRegistrationFormProps> = ({ isOpen, onClose }) => {
  const { submitPendaftaran, desaList, kecamatanList, jabatanList, fullMembers, pendaftaranList } = usePPDI();
  
  const [formData, setFormData] = useState({
    nik: '',
    namaLengkap: '',
    gelarDepan: '',
    gelarBelakang: '',
    tempatLahir: '',
    tanggalLahir: '',
    jenisKelamin: 'L' as 'L' | 'P',
    pendidikanTerakhir: 'SMA/SMK',
    noHpWa: '',
    email: '',
    selectedKecamatan: '',
    selectedDesa: '',
    selectedJabatan: jabatanList[0]?.id_jabatan || 1,
    jabatanPengurus: 'Anggota Biasa',
    noSkPengangkatan: '',
    tglSkPengangkatan: '',
    tmtJabatan: '',
    foto: '',
    fileSk: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [nikError, setNikError] = useState('');
  const [formError, setFormError] = useState('');
  const [fotoFileName, setFotoFileName] = useState('');
  const [skFileName, setSkFileName] = useState('');
  const [fotoUpload, setFotoUpload] = useState<UploadProgressState>(INITIAL_UPLOAD_STATE);
  const [skUpload, setSkUpload] = useState<UploadProgressState>(INITIAL_UPLOAD_STATE);
  const [dateTouched, setDateTouched] = useState<{ tglSk: boolean; tmt: boolean }>({
    tglSk: false,
    tmt: false,
  });

  // Urutkan daftar kecamatan secara alfabetis
  const sortedKecamatanList = useMemo(() => {
    return [...kecamatanList].sort((a, b) => a.nama_kecamatan.localeCompare(b.nama_kecamatan));
  }, [kecamatanList]);

  // Filter desa dinamis berdasarkan kecamatan yang dipilih
  const availableDesa = useMemo(() => {
    if (!formData.selectedKecamatan) return [];
    const cleanKec = String(formData.selectedKecamatan).trim().replace(/[^a-zA-Z0-9]/g, '');
    return desaList
      .filter((d) => {
        const cleanDesaKec = String(d.id_kecamatan || '').trim().replace(/[^a-zA-Z0-9]/g, '');
        return cleanDesaKec === cleanKec;
      })
      .sort((a, b) => a.nama_desa.localeCompare(b.nama_desa));
  }, [desaList, formData.selectedKecamatan]);

  // Validasi NIK unik & 16 digit
  const duplicateNik = useMemo(() => {
    if (!formData.nik) return false;
    const inAnggota = fullMembers.some((m) => m.anggota.nik === formData.nik);
    const inPending = pendaftaranList.some((p) => p.nik === formData.nik && p.status_approval === 'Menunggu');
    return inAnggota || inPending;
  }, [formData.nik, fullMembers, pendaftaranList]);

  const isNikValid = formData.nik.length === 16 && !duplicateNik;

  const tglSkValidation = useMemo(() => validateDdMmYyyy(formData.tglSkPengangkatan), [formData.tglSkPengangkatan]);
  const tmtValidation = useMemo(() => validateDdMmYyyy(formData.tmtJabatan), [formData.tmtJabatan]);

  const isUploadingAny =
    fotoUpload.status === 'reading' ||
    fotoUpload.status === 'uploading' ||
    skUpload.status === 'reading' ||
    skUpload.status === 'uploading';

  if (!isOpen) return null;

  const handleResetForm = () => {
    setFormData({
      nik: '',
      namaLengkap: '',
      gelarDepan: '',
      gelarBelakang: '',
      tempatLahir: '',
      tanggalLahir: '',
      jenisKelamin: 'L',
      pendidikanTerakhir: 'SMA/SMK',
      noHpWa: '',
      email: '',
      selectedKecamatan: '',
      selectedDesa: '',
      selectedJabatan: jabatanList[0]?.id_jabatan || 1,
      jabatanPengurus: 'Anggota Biasa',
      noSkPengangkatan: '',
      tglSkPengangkatan: '',
      tmtJabatan: '',
      foto: '',
      fileSk: '',
    });
    setSuccess(false);
    setNikError('');
    setFormError('');
    setFotoFileName('');
    setSkFileName('');
    setFotoUpload(INITIAL_UPLOAD_STATE);
    setSkUpload(INITIAL_UPLOAD_STATE);
    setDateTouched({ tglSk: false, tmt: false });
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, field: 'foto' | 'fileSk') => {
    const file = e.target.files?.[0];
    const setUploadState = field === 'foto' ? setFotoUpload : setSkUpload;
    const setFileName = field === 'foto' ? setFotoFileName : setSkFileName;

    if (!file) {
      setFileName('');
      setUploadState(INITIAL_UPLOAD_STATE);
      setFormData((prev) => ({ ...prev, [field]: '' }));
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      const msg = `Ukuran file ${field === 'foto' ? 'Foto Resmi' : 'Berkas SK'} maksimal 2 MB!`;
      setFormError(msg);
      setUploadState({
        status: 'error',
        progress: 0,
        fileName: file.name,
        fileSizeLabel: formatFileSize(file.size),
        errorMessage: msg,
      });
      e.target.value = '';
      return;
    }

    setFormError('');
    setFileName(file.name);
    const sizeLabel = formatFileSize(file.size);
    setFormData((prev) => ({ ...prev, [field]: '' }));
    setUploadState({
      status: 'reading',
      progress: 8,
      fileName: file.name,
      fileSizeLabel: sizeLabel,
    });

    const reader = new FileReader();

    reader.onprogress = (evt) => {
      if (evt.lengthComputable && evt.total > 0) {
        const readPct = Math.min(40, Math.max(10, Math.round((evt.loaded / evt.total) * 40)));
        setUploadState({
          status: 'reading',
          progress: readPct,
          fileName: file.name,
          fileSizeLabel: sizeLabel,
        });
      }
    };

    reader.onerror = () => {
      const msg = `Gagal membaca berkas ${field === 'foto' ? 'Foto Resmi' : 'Berkas SK'}.`;
      setFormError(msg);
      setUploadState({
        status: 'error',
        progress: 0,
        fileName: file.name,
        fileSizeLabel: sizeLabel,
        errorMessage: msg,
      });
    };

    reader.onloadend = () => {
      const base64Data = reader.result as string;
      if (!base64Data) return;

      setUploadState({
        status: 'uploading',
        progress: 45,
        fileName: file.name,
        fileSizeLabel: sizeLabel,
      });

      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/upload', true);
      xhr.setRequestHeader('Content-Type', 'application/json');

      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable && evt.total > 0) {
          const uploadPct = 45 + Math.round((evt.loaded / evt.total) * 50);
          setUploadState({
            status: 'uploading',
            progress: Math.min(95, uploadPct),
            fileName: file.name,
            fileSizeLabel: sizeLabel,
          });
        }
      };

      xhr.onload = () => {
        try {
          if (xhr.status >= 200 && xhr.status < 300) {
            const parsed = JSON.parse(xhr.responseText);
            if (parsed?.success && parsed?.url) {
              setFormData((prev) => ({ ...prev, [field]: parsed.url }));
              setUploadState({
                status: 'done',
                progress: 100,
                fileName: file.name,
                fileSizeLabel: sizeLabel,
              });
              return;
            }
          }
        } catch {
          // fallback below
        }
        // Fallback ke data base64 agar proses pendaftaran tetap lancar
        setFormData((prev) => ({ ...prev, [field]: base64Data }));
        setUploadState({
          status: 'done',
          progress: 100,
          fileName: file.name,
          fileSizeLabel: sizeLabel,
        });
      };

      xhr.onerror = () => {
        // Fallback ke data base64 jika koneksi API upload terganggu
        setFormData((prev) => ({ ...prev, [field]: base64Data }));
        setUploadState({
          status: 'done',
          progress: 100,
          fileName: file.name,
          fileSizeLabel: sizeLabel,
        });
      };

      xhr.send(
        JSON.stringify({
          type: field === 'foto' ? 'foto' : 'sk',
          fileName: file.name,
          fileData: base64Data,
          nik: formData.nik || 'TEMP',
        })
      );
    };

    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setDateTouched({ tglSk: true, tmt: true });

    if (isUploadingAny) {
      setFormError('Mohon tunggu hingga proses unggah Foto Resmi dan Berkas SK selesai 100%.');
      return;
    }

    if (!isNikValid) {
      setNikError(duplicateNik ? 'NIK sudah terdaftar di sistem!' : 'NIK harus tepat 16 digit angka!');
      return;
    }

    if (!formData.selectedKecamatan || !formData.selectedDesa) {
      setFormError('Silakan pilih Kecamatan dan Desa penempatan terlebih dahulu!');
      return;
    }

    if (!formData.noSkPengangkatan.trim()) {
      setFormError('No. SK Pengangkatan Perangkat Desa wajib diisi!');
      return;
    }

    if (!tglSkValidation.valid || !tglSkValidation.isoDate) {
      setFormError(`Tanggal SK Pengangkatan: ${tglSkValidation.error || 'Format tanggal harus DD-MM-YYYY!'}`);
      return;
    }

    if (!tmtValidation.valid || !tmtValidation.isoDate) {
      setFormError(`TMT Jabatan: ${tmtValidation.error || 'Format tanggal harus DD-MM-YYYY!'}`);
      return;
    }

    if (!formData.foto) {
      setFormError('Foto Resmi wajib diunggah!');
      return;
    }

    if (!formData.fileSk) {
      setFormError('Berkas SK (PDF/Gambar) wajib diunggah!');
      return;
    }

    setIsSubmitting(true);

    try {
      await submitPendaftaran({
        nik: formData.nik,
        nama_lengkap: formData.namaLengkap.trim().toUpperCase(),
        gelar_depan: formData.gelarDepan.trim() || undefined,
        gelar_belakang: formData.gelarBelakang.trim() || undefined,
        tempat_lahir: formData.tempatLahir.trim(),
        tanggal_lahir: formData.tanggalLahir,
        jenis_kelamin: formData.jenisKelamin,
        agama: 'Islam',
        pendidikan_terakhir: formData.pendidikanTerakhir || 'SMA/SMK',
        no_hp_wa: formData.noHpWa.trim(),
        email: formData.email.trim() || undefined,
        alamat_rumah: 'Kabupaten Bandung',
        status_pernikahan: 'Kawin',
        id_kecamatan: formData.selectedKecamatan,
        id_desa: formData.selectedDesa,
        id_jabatan: formData.selectedJabatan,
        jabatan_pengurus: formData.jabatanPengurus || 'Anggota Biasa',
        no_sk_pengangkatan: formData.noSkPengangkatan.trim(),
        tgl_sk_pengangkatan: tglSkValidation.isoDate,
        tmt_jabatan: tmtValidation.isoDate,
        foto: formData.foto,
        file_sk: formData.fileSk,
      });
      setSuccess(true);
    } catch (err: any) {
      setFormError('Gagal registrasi: ' + (err?.message || err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#064E3B]/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col overflow-hidden text-neutral-900 my-8">
        <div className="px-6 py-5 bg-[#064E3B] text-white flex items-center justify-between border-b border-[#043d2e]">
          <div>
            <h2 className="text-lg font-bold">Formulir Pendaftaran Perangkat Desa</h2>
            <p className="text-emerald-100 text-xs">PPDI Kabupaten Bandung - Registrasi Data Induk & SK</p>
          </div>
          <button onClick={handleResetForm} className="text-emerald-100 hover:text-white cursor-pointer p-1 rounded-md hover:bg-white/10 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {success ? (
          <div className="text-center py-12 px-6">
            <CheckCircle className="w-20 h-20 text-emerald-500 mx-auto mb-6" />
            <h2 className="text-2xl font-bold mb-3 text-neutral-900">Pendaftaran Berhasil Dikirim</h2>
            <p className="text-neutral-600 mb-8 max-w-md mx-auto text-sm leading-relaxed">
              Data beserta Dokumen SK & Foto Anda telah berhasil tersimpan di sistem basis data kepegawaian PPDI Kabupaten Bandung. Silakan hubungi Pengurus Kecamatan atau Kabupaten untuk aktivasi dan pencetakan E-KTA.
            </p>
            <button onClick={handleResetForm} className="px-8 py-3 bg-[#064E3B] hover:bg-[#043d2e] text-white rounded-xl font-bold cursor-pointer transition-colors shadow-md">
              Selesai & Tutup
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* NIK */}
              <div className="md:col-span-2 space-y-1">
                <label className="text-xs font-bold text-neutral-700 uppercase">
                  NIK KTP (16 Digit) <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <input 
                    className={`w-full p-3 border rounded-lg outline-none font-mono text-neutral-900 ${nikError || duplicateNik ? 'border-red-500 ring-1 ring-red-500' : 'border-neutral-300 focus:ring-2 focus:ring-[#064E3B]'}`} 
                    placeholder="3204xxxxxxxxxxxx" 
                    value={formData.nik} 
                    onChange={e => {
                      setFormData({...formData, nik: e.target.value.replace(/\D/g, '')});
                      setNikError('');
                    }} 
                    required 
                    maxLength={16} 
                  />
                  <button 
                    type="button" 
                    onClick={() => {
                      if (formData.nik.length !== 16) setNikError('NIK harus 16 digit angka.');
                      else if (duplicateNik) setNikError('NIK sudah terdaftar di sistem!');
                      else setNikError('');
                    }} 
                    className="px-4 bg-neutral-800 text-white rounded-lg text-xs font-bold hover:bg-neutral-900 cursor-pointer whitespace-nowrap"
                  >
                    Cek NIK
                  </button>
                </div>
                {isNikValid && (
                  <div className="text-emerald-600 text-xs font-semibold flex items-center gap-1 mt-1">
                    <CheckCircle className="w-3.5 h-3.5" />
                    <span>NIK Valid & Siap Didaftarkan</span>
                  </div>
                )}
                {nikError && (
                  <p className="text-xs text-red-600 flex items-center gap-1 mt-1 font-medium">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{nikError}</span>
                  </p>
                )}
              </div>

              {/* Nama Lengkap */}
              <div className="md:col-span-2 space-y-1">
                <label className="text-xs font-bold text-neutral-700 uppercase">
                  Nama Lengkap (Tanpa Gelar) <span className="text-red-500">*</span>
                </label>
                <input 
                  className="w-full p-3 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#064E3B] outline-none text-neutral-900 font-semibold uppercase tracking-wide" 
                  placeholder="CONTOH: ASEP SAEPULOH" 
                  value={formData.namaLengkap} 
                  onChange={e => setFormData({...formData, namaLengkap: e.target.value.toUpperCase()})} 
                  required 
                />
              </div>

              {/* Gelar Depan */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-neutral-700 uppercase">
                  Gelar Depan <span className="text-neutral-400 font-normal lowercase">(opsional)</span>
                </label>
                <input 
                  className="w-full p-3 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#064E3B] outline-none text-neutral-900 placeholder:text-neutral-400 text-sm" 
                  placeholder="Contoh: H., Drs., Ir." 
                  value={formData.gelarDepan} 
                  onChange={e => setFormData({...formData, gelarDepan: e.target.value})} 
                />
              </div>

              {/* Gelar Belakang */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-neutral-700 uppercase">
                  Gelar Belakang <span className="text-neutral-400 font-normal lowercase">(opsional)</span>
                </label>
                <input 
                  className="w-full p-3 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#064E3B] outline-none text-neutral-900 placeholder:text-neutral-400 text-sm" 
                  placeholder="Contoh: S.Pd., S.Sos., S.IP., M.Si." 
                  value={formData.gelarBelakang} 
                  onChange={e => setFormData({...formData, gelarBelakang: e.target.value})} 
                />
              </div>

              {/* Pratinjau Nama Lengkap + Gelar */}
              {(formData.gelarDepan.trim() || formData.gelarBelakang.trim()) && (
                <div className="md:col-span-2 text-xs bg-emerald-50 text-emerald-900 p-2.5 rounded-lg border border-emerald-200 flex items-center gap-2">
                  <span className="font-bold text-emerald-800">Pratinjau Nama & Gelar di E-KTA:</span>
                  <span className="font-semibold text-neutral-900">
                    {formData.gelarDepan.trim() ? `${formData.gelarDepan.trim()} ` : ''}
                    {formData.namaLengkap || 'NAMA LENGKAP'}
                    {formData.gelarBelakang.trim() ? `, ${formData.gelarBelakang.trim()}` : ''}
                  </span>
                </div>
              )}

              {/* Tempat Lahir */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-neutral-700 uppercase">
                  Tempat Lahir <span className="text-red-500">*</span>
                </label>
                <input 
                  className="w-full p-3 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#064E3B] outline-none text-neutral-900" 
                  placeholder="Contoh: Bandung"
                  value={formData.tempatLahir} 
                  onChange={e => setFormData({...formData, tempatLahir: e.target.value})} 
                  required 
                />
              </div>

              {/* Tanggal Lahir */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-neutral-700 uppercase">
                  Tanggal Lahir <span className="text-red-500">*</span>
                </label>
                <input 
                  type="date" 
                  className="w-full p-3 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#064E3B] outline-none text-neutral-900 bg-white" 
                  value={formData.tanggalLahir} 
                  onChange={e => setFormData({...formData, tanggalLahir: e.target.value})} 
                  required 
                />
              </div>

              {/* Jenis Kelamin */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-neutral-700 uppercase">
                  Jenis Kelamin <span className="text-red-500">*</span>
                </label>
                <select 
                  className="w-full p-3 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#064E3B] outline-none text-neutral-900 bg-white"
                  value={formData.jenisKelamin}
                  onChange={e => setFormData({...formData, jenisKelamin: e.target.value as 'L' | 'P'})}
                  required
                >
                  <option value="L">Laki-laki</option>
                  <option value="P">Perempuan</option>
                </select>
              </div>

              {/* Pendidikan Terakhir */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-neutral-700 uppercase">
                  Pendidikan Terakhir <span className="text-red-500">*</span>
                </label>
                <select 
                  className="w-full p-3 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#064E3B] outline-none text-neutral-900 bg-white"
                  value={formData.pendidikanTerakhir}
                  onChange={e => setFormData({...formData, pendidikanTerakhir: e.target.value})}
                  required
                >
                  <option value="SD">SD / Sederajat</option>
                  <option value="SMP">SMP / Sederajat</option>
                  <option value="SMA/SMK">SMA / SMK / Sederajat (Default)</option>
                  <option value="D1">D1 (Diploma)</option>
                  <option value="D2">D2 (Diploma)</option>
                  <option value="D3">D3 (Diploma)</option>
                  <option value="S1">D4/S1 (Sarjana)</option>
                  <option value="S2">S2 (Magister)</option>
                  <option value="S3">S3 (Doktor)</option>
                </select>
              </div>

              {/* No. HP / WhatsApp */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-neutral-700 uppercase">
                  No. HP / WhatsApp <span className="text-red-500">*</span>
                </label>
                <input 
                  className="w-full p-3 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#064E3B] outline-none font-mono text-neutral-900" 
                  placeholder="08xxxxxxxxxx" 
                  value={formData.noHpWa} 
                  onChange={e => setFormData({...formData, noHpWa: e.target.value.replace(/\D/g, '')})} 
                  required 
                />
              </div>

              {/* Email */}
              <div className="md:col-span-2 space-y-1">
                <label className="text-xs font-bold text-neutral-700 uppercase">Email (Opsional)</label>
                <input 
                  type="email" 
                  className="w-full p-3 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#064E3B] outline-none text-neutral-900" 
                  placeholder="nama@email.com" 
                  value={formData.email} 
                  onChange={e => setFormData({...formData, email: e.target.value})} 
                />
              </div>

              {/* Kecamatan Penempatan */}
              <div className="md:col-span-2 space-y-1">
                <label className="text-xs font-bold text-neutral-700 uppercase">
                  Kecamatan Penempatan <span className="text-red-500">*</span>
                </label>
                <select 
                  className="w-full p-3 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#064E3B] outline-none text-neutral-900 bg-white" 
                  value={formData.selectedKecamatan}
                  onChange={e => {
                    const newKec = e.target.value;
                    setFormData(prev => ({
                      ...prev,
                      selectedKecamatan: newKec,
                      selectedDesa: '',
                    }));
                  }}
                  required
                >
                  <option value="">-- Pilih Kecamatan ({sortedKecamatanList.length} Kecamatan) --</option>
                  {sortedKecamatanList.map(k => (
                    <option key={k.id_kecamatan} value={k.id_kecamatan}>
                      {k.nama_kecamatan.toUpperCase().startsWith('KEC.') ? k.nama_kecamatan : `Kecamatan ${k.nama_kecamatan}`}
                    </option>
                  ))}
                </select>
              </div>

              {/* Desa Penempatan */}
              <div className="md:col-span-2 space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-neutral-700 uppercase">
                    Desa Penempatan <span className="text-red-500">*</span>
                  </label>
                  {formData.selectedKecamatan && (
                    <span className="text-[11px] text-emerald-700 font-semibold">
                      {availableDesa.length} Desa Terdaftar
                    </span>
                  )}
                </div>
                <select 
                  className="w-full p-3 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#064E3B] outline-none text-neutral-900 bg-white disabled:bg-neutral-100 disabled:text-neutral-400 disabled:cursor-not-allowed" 
                  value={formData.selectedDesa} 
                  onChange={e => setFormData(prev => ({ ...prev, selectedDesa: e.target.value }))} 
                  disabled={!formData.selectedKecamatan}
                  required
                >
                  <option value="">
                    {!formData.selectedKecamatan 
                      ? '-- Pilih Kecamatan Terlebih Dahulu --' 
                      : availableDesa.length === 0 
                      ? '-- Tidak Ada Desa di Kecamatan Ini --' 
                      : `-- Pilih Desa (${availableDesa.length} Desa) --`}
                  </option>
                  {availableDesa.map(d => (
                    <option key={d.id_desa} value={d.id_desa}>
                      {d.nama_desa.toUpperCase().startsWith('DESA') ? d.nama_desa : `Desa ${d.nama_desa}`}
                    </option>
                  ))}
                </select>
              </div>

              {/* Jabatan Formasi */}
              <div className="md:col-span-2 space-y-1">
                <label className="text-xs font-bold text-neutral-700 uppercase">
                  Jabatan Perangkat Desa <span className="text-red-500">*</span>
                </label>
                <select 
                  className="w-full p-3 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#064E3B] outline-none text-neutral-900 bg-white" 
                  value={formData.selectedJabatan} 
                  onChange={e => {
                    const newJId = Number(e.target.value);
                    const matchedJ = jabatanList.find(j => j.id_jabatan === newJId);
                    const isKades = matchedJ?.kategori_jabatan === 'Kepala Desa' ||
                      matchedJ?.nama_jabatan?.toLowerCase().includes('kepala desa') ||
                      matchedJ?.nama_jabatan?.toLowerCase().includes('kades');
                    setFormData(prev => ({
                      ...prev,
                      selectedJabatan: newJId,
                      jabatanPengurus: isKades 
                        ? (prev.jabatanPengurus === 'Penasehat' ? 'Penasehat' : 'Anggota Istimewa')
                        : prev.jabatanPengurus
                    }));
                  }} 
                  required
                >
                  {jabatanList.map(j => (
                    <option key={j.id_jabatan} value={j.id_jabatan}>
                      {j.nama_jabatan} ({j.kategori_jabatan})
                    </option>
                  ))}
                </select>
              </div>

              {/* Jabatan Kepengurusan PPDI */}
              <div className="md:col-span-2 space-y-1">
                <label className="text-xs font-bold text-neutral-700 uppercase flex items-center justify-between">
                  <span>Jabatan Kepengurusan PPDI <span className="text-red-500">*</span></span>
                  {(() => {
                    const matchedJ = jabatanList.find(j => j.id_jabatan === formData.selectedJabatan);
                    const isKades = matchedJ?.kategori_jabatan === 'Kepala Desa' ||
                      matchedJ?.nama_jabatan?.toLowerCase().includes('kepala desa') ||
                      matchedJ?.nama_jabatan?.toLowerCase().includes('kades');
                    return isKades ? (
                      <span className="text-[11px] font-normal text-amber-700 lowercase">
                        (Khusus Kepala Desa: Anggota Istimewa / Penasehat)
                      </span>
                    ) : null;
                  })()}
                </label>
                <select 
                  className="w-full p-3 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#064E3B] outline-none text-neutral-900 bg-white font-medium" 
                  value={formData.jabatanPengurus} 
                  onChange={e => setFormData(prev => ({ ...prev, jabatanPengurus: e.target.value }))} 
                  required
                >
                  {(() => {
                    const matchedJ = jabatanList.find(j => j.id_jabatan === formData.selectedJabatan);
                    const isKades = matchedJ?.kategori_jabatan === 'Kepala Desa' ||
                      matchedJ?.nama_jabatan?.toLowerCase().includes('kepala desa') ||
                      matchedJ?.nama_jabatan?.toLowerCase().includes('kades');
                    if (isKades) {
                      return (
                        <>
                          <option value="Anggota Istimewa">Anggota Istimewa</option>
                          <option value="Penasehat">Penasehat</option>
                        </>
                      );
                    }
                    return (
                      <>
                        <option value="Anggota Biasa">Anggota Biasa</option>
                        <option value="Pengurus Kecamatan">Pengurus Kecamatan</option>
                        <option value="Pengurus Daerah Kab. Bandung">Pengurus Daerah Kab. Bandung</option>
                        <option value="Anggota Istimewa">Anggota Istimewa</option>
                        <option value="Penasehat">Penasehat</option>
                      </>
                    );
                  })()}
                </select>
              </div>

              {/* No. SK Pengangkatan */}
              <div className="md:col-span-2 space-y-1">
                <label className="text-xs font-bold text-neutral-700 uppercase">
                  No. SK Pengangkatan Perangkat Desa <span className="text-red-500">*</span>
                </label>
                <input 
                  className="w-full p-3 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#064E3B] outline-none text-neutral-900 font-mono" 
                  placeholder="Contoh: 141.1/SK.12/Desa/2020" 
                  value={formData.noSkPengangkatan} 
                  onChange={e => setFormData({...formData, noSkPengangkatan: e.target.value})} 
                  required
                />
              </div>

              {/* Tanggal SK Pengangkatan (DD-MM-YYYY) */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-neutral-700 uppercase flex items-center justify-between">
                  <span>Tanggal SK Pengangkatan <span className="text-red-500">*</span></span>
                  <span className="text-[10px] font-mono text-neutral-400 font-normal">DD-MM-YYYY</span>
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="DD-MM-YYYY"
                    maxLength={10}
                    className={`w-full pl-9 pr-3 py-3 border rounded-lg outline-none text-neutral-900 bg-white font-mono text-sm ${
                      (dateTouched.tglSk || formData.tglSkPengangkatan.length > 0) && !tglSkValidation.valid
                        ? 'border-red-500 ring-1 ring-red-500'
                        : tglSkValidation.valid
                        ? 'border-emerald-500 ring-1 ring-emerald-500/30'
                        : 'border-neutral-300 focus:ring-2 focus:ring-[#064E3B]'
                    }`}
                    value={formData.tglSkPengangkatan}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const formatted =
                        raw.length < formData.tglSkPengangkatan.length
                          ? raw.replace(/[^0-9-]/g, '').slice(0, 10)
                          : formatDdMmYyyyInput(raw);
                      setFormData((prev) => ({ ...prev, tglSkPengangkatan: formatted }));
                    }}
                    onBlur={() => setDateTouched((prev) => ({ ...prev, tglSk: true }))}
                    required
                  />
                </div>
                {(dateTouched.tglSk || formData.tglSkPengangkatan.length > 0) && !tglSkValidation.valid ? (
                  <p className="text-[11px] text-red-600 flex items-center gap-1 font-medium">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{tglSkValidation.error}</span>
                  </p>
                ) : tglSkValidation.valid ? (
                  <p className="text-[11px] text-emerald-700 flex items-center gap-1 font-semibold">
                    <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>Format tanggal valid ({formData.tglSkPengangkatan})</span>
                  </p>
                ) : (
                  <p className="text-[10px] text-neutral-400 font-mono">Contoh: 17-08-2024</p>
                )}
              </div>

              {/* TMT Jabatan (DD-MM-YYYY) */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-neutral-700 uppercase flex items-center justify-between">
                  <span>TMT Jabatan <span className="text-red-500">*</span></span>
                  <span className="text-[10px] font-mono text-neutral-400 font-normal">DD-MM-YYYY</span>
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    inputMode="numeric"
                    placeholder="DD-MM-YYYY"
                    maxLength={10}
                    className={`w-full pl-9 pr-3 py-3 border rounded-lg outline-none text-neutral-900 bg-white font-mono text-sm ${
                      (dateTouched.tmt || formData.tmtJabatan.length > 0) && !tmtValidation.valid
                        ? 'border-red-500 ring-1 ring-red-500'
                        : tmtValidation.valid
                        ? 'border-emerald-500 ring-1 ring-emerald-500/30'
                        : 'border-neutral-300 focus:ring-2 focus:ring-[#064E3B]'
                    }`}
                    value={formData.tmtJabatan}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const formatted =
                        raw.length < formData.tmtJabatan.length
                          ? raw.replace(/[^0-9-]/g, '').slice(0, 10)
                          : formatDdMmYyyyInput(raw);
                      setFormData((prev) => ({ ...prev, tmtJabatan: formatted }));
                    }}
                    onBlur={() => setDateTouched((prev) => ({ ...prev, tmt: true }))}
                    required
                  />
                </div>
                {(dateTouched.tmt || formData.tmtJabatan.length > 0) && !tmtValidation.valid ? (
                  <p className="text-[11px] text-red-600 flex items-center gap-1 font-medium">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>{tmtValidation.error}</span>
                  </p>
                ) : tmtValidation.valid ? (
                  <p className="text-[11px] text-emerald-700 flex items-center gap-1 font-semibold">
                    <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>Format tanggal valid ({formData.tmtJabatan})</span>
                  </p>
                ) : (
                  <p className="text-[10px] text-neutral-400 font-mono">Contoh: 01-09-2024</p>
                )}
              </div>

              {/* Upload Foto */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-700 uppercase flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4 text-emerald-700" />
                  <span>Upload Foto Resmi <span className="text-red-500">*</span></span>
                </label>
                <div className="flex items-center gap-3">
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={e => handleFileChange(e, 'foto')}
                    required
                    className="w-full text-xs text-neutral-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer"
                  />
                </div>

                {fotoUpload.status !== 'idle' && (
                  <div
                    className={`p-2.5 rounded-lg border text-[11px] space-y-1.5 ${
                      fotoUpload.status === 'error'
                        ? 'bg-red-50 border-red-200 text-red-800'
                        : fotoUpload.status === 'done'
                        ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                        : 'bg-amber-50/70 border-amber-200 text-amber-900'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {(fotoUpload.status === 'reading' || fotoUpload.status === 'uploading') && (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-700 shrink-0" />
                        )}
                        {fotoUpload.status === 'done' && (
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        )}
                        {fotoUpload.status === 'error' && (
                          <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                        )}
                        <span className="font-mono font-semibold truncate">{fotoUpload.fileName || fotoFileName}</span>
                      </div>
                      <span className="font-mono text-[10px] shrink-0 font-bold">
                        {fotoUpload.fileSizeLabel} &middot; {fotoUpload.progress}%
                      </span>
                    </div>

                    <div className="w-full h-2 bg-neutral-200/80 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-200 ${
                          fotoUpload.status === 'error'
                            ? 'bg-red-500'
                            : fotoUpload.status === 'done'
                            ? 'bg-emerald-600'
                            : 'bg-amber-500 animate-pulse'
                        }`}
                        style={{ width: `${fotoUpload.progress}%` }}
                      />
                    </div>

                    <div className="text-[10px] font-medium">
                      {fotoUpload.status === 'reading'
                        ? 'Membaca berkas foto...'
                        : fotoUpload.status === 'uploading'
                        ? 'Mengunggah foto resmi ke server...'
                        : fotoUpload.status === 'done'
                        ? 'Foto resmi berhasil diunggah & siap dikirim'
                        : fotoUpload.errorMessage}
                    </div>
                  </div>
                )}
              </div>

              {/* Upload SK */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-neutral-700 uppercase flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-emerald-700" />
                  <span>Upload Berkas SK (PDF/Gambar) <span className="text-red-500">*</span></span>
                </label>
                <div className="flex items-center gap-3">
                  <input 
                    type="file" 
                    accept="image/*,.pdf"
                    onChange={e => handleFileChange(e, 'fileSk')}
                    required
                    className="w-full text-xs text-neutral-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer"
                  />
                </div>

                {skUpload.status !== 'idle' && (
                  <div
                    className={`p-2.5 rounded-lg border text-[11px] space-y-1.5 ${
                      skUpload.status === 'error'
                        ? 'bg-red-50 border-red-200 text-red-800'
                        : skUpload.status === 'done'
                        ? 'bg-emerald-50/70 border-emerald-200 text-emerald-900'
                        : 'bg-amber-50/70 border-amber-200 text-amber-900'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        {(skUpload.status === 'reading' || skUpload.status === 'uploading') && (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-700 shrink-0" />
                        )}
                        {skUpload.status === 'done' && (
                          <CheckCircle className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        )}
                        {skUpload.status === 'error' && (
                          <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                        )}
                        <span className="font-mono font-semibold truncate">{skUpload.fileName || skFileName}</span>
                      </div>
                      <span className="font-mono text-[10px] shrink-0 font-bold">
                        {skUpload.fileSizeLabel} &middot; {skUpload.progress}%
                      </span>
                    </div>

                    <div className="w-full h-2 bg-neutral-200/80 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-200 ${
                          skUpload.status === 'error'
                            ? 'bg-red-500'
                            : skUpload.status === 'done'
                            ? 'bg-emerald-600'
                            : 'bg-amber-500 animate-pulse'
                        }`}
                        style={{ width: `${skUpload.progress}%` }}
                      />
                    </div>

                    <div className="text-[10px] font-medium">
                      {skUpload.status === 'reading'
                        ? 'Membaca berkas SK...'
                        : skUpload.status === 'uploading'
                        ? 'Mengunggah berkas SK ke server...'
                        : skUpload.status === 'done'
                        ? 'Berkas SK berhasil diunggah & siap dikirim'
                        : skUpload.errorMessage}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}
            
            <div className="flex gap-3 pt-3">
              <button 
                type="button" 
                onClick={handleResetForm} 
                className="flex-1 py-3 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 rounded-xl font-bold text-sm transition-colors cursor-pointer"
              >
                Batal
              </button>
              <button 
                type="submit" 
                disabled={
                  isSubmitting ||
                  isUploadingAny ||
                  !isNikValid ||
                  !formData.selectedDesa ||
                  !formData.namaLengkap ||
                  !formData.noSkPengangkatan.trim() ||
                  !tglSkValidation.valid ||
                  !tmtValidation.valid ||
                  !formData.foto ||
                  !formData.fileSk
                } 
                className="flex-1 py-3 bg-[#064E3B] hover:bg-[#043d2e] text-white rounded-xl font-bold text-sm transition-colors cursor-pointer shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isUploadingAny
                  ? 'Mengunggah Berkas...'
                  : isSubmitting
                  ? 'Mengirim Data...'
                  : 'Kirim Pendaftaran'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
