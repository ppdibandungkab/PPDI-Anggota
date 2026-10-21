import React, { useState, useMemo } from 'react';
import { usePPDI } from '../context/PPDIContext';
import { X, CheckCircle, AlertCircle, Upload, Image as ImageIcon, FileText } from 'lucide-react';

interface PublicRegistrationFormProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PublicRegistrationForm: React.FC<PublicRegistrationFormProps> = ({ isOpen, onClose }) => {
  const { submitPendaftaran, desaList, kecamatanList, jabatanList, fullMembers, pendaftaranList } = usePPDI();
  
  const [formData, setFormData] = useState({
    nik: '',
    namaLengkap: '',
    tempatLahir: '',
    tanggalLahir: '',
    jenisKelamin: 'L' as 'L' | 'P',
    noHpWa: '',
    email: '',
    selectedKecamatan: '',
    selectedDesa: '',
    selectedJabatan: jabatanList[0]?.id_jabatan || 1,
    noSkPengangkatan: '',
    tglSkPengangkatan: '',
    tmtJabatan: '',
    foto: '',
    fileSk: '',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [nikError, setNikError] = useState('');

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

  if (!isOpen) return null;

  const handleResetForm = () => {
    setFormData({
      nik: '',
      namaLengkap: '',
      tempatLahir: '',
      tanggalLahir: '',
      jenisKelamin: 'L',
      noHpWa: '',
      email: '',
      selectedKecamatan: '',
      selectedDesa: '',
      selectedJabatan: jabatanList[0]?.id_jabatan || 1,
      noSkPengangkatan: '',
      tglSkPengangkatan: '',
      tmtJabatan: '',
      foto: '',
      fileSk: '',
    });
    setSuccess(false);
    setNikError('');
    onClose();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>, field: 'foto' | 'fileSk') => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        alert('Ukuran file maksimal 2 MB!');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, [field]: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isNikValid) {
      setNikError(duplicateNik ? 'NIK sudah terdaftar di sistem!' : 'NIK harus tepat 16 digit angka!');
      return;
    }

    if (!formData.selectedKecamatan || !formData.selectedDesa) {
      alert('Silakan pilih Kecamatan dan Desa penempatan terlebih dahulu!');
      return;
    }

    setIsSubmitting(true);

    try {
      await submitPendaftaran({
        nik: formData.nik,
        nama_lengkap: formData.namaLengkap.trim().toUpperCase(),
        tempat_lahir: formData.tempatLahir.trim(),
        tanggal_lahir: formData.tanggalLahir,
        jenis_kelamin: formData.jenisKelamin,
        agama: 'Islam',
        pendidikan_terakhir: 'S1',
        no_hp_wa: formData.noHpWa.trim(),
        email: formData.email.trim() || undefined,
        alamat_rumah: 'Kabupaten Bandung',
        status_pernikahan: 'Kawin',
        id_kecamatan: formData.selectedKecamatan,
        id_desa: formData.selectedDesa,
        id_jabatan: formData.selectedJabatan,
        no_sk_pengangkatan: formData.noSkPengangkatan.trim() || undefined,
        tgl_sk_pengangkatan: formData.tglSkPengangkatan || undefined,
        tmt_jabatan: formData.tmtJabatan || undefined,
        foto: formData.foto || undefined,
        file_sk: formData.fileSk || undefined,
      });
      setSuccess(true);
    } catch (err: any) {
      alert('Gagal registrasi: ' + (err?.message || err));
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
                  onChange={e => setFormData(prev => ({ ...prev, selectedJabatan: Number(e.target.value) }))} 
                  required
                >
                  {jabatanList.map(j => (
                    <option key={j.id_jabatan} value={j.id_jabatan}>
                      {j.nama_jabatan} ({j.kategori_jabatan})
                    </option>
                  ))}
                </select>
              </div>

              {/* No. SK Pengangkatan */}
              <div className="md:col-span-2 space-y-1">
                <label className="text-xs font-bold text-neutral-700 uppercase">
                  No. SK Pengangkatan Perangkat Desa
                </label>
                <input 
                  className="w-full p-3 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#064E3B] outline-none text-neutral-900 font-mono" 
                  placeholder="Contoh: 141.1/SK.12/Desa/2020" 
                  value={formData.noSkPengangkatan} 
                  onChange={e => setFormData({...formData, noSkPengangkatan: e.target.value})} 
                />
              </div>

              {/* Tanggal SK Pengangkatan */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-neutral-700 uppercase">
                  Tanggal SK Pengangkatan
                </label>
                <input 
                  type="date" 
                  className="w-full p-3 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#064E3B] outline-none text-neutral-900 bg-white" 
                  value={formData.tglSkPengangkatan} 
                  onChange={e => setFormData({...formData, tglSkPengangkatan: e.target.value})} 
                />
              </div>

              {/* TMT Jabatan */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-neutral-700 uppercase">
                  TMT (Terhitung Mulai Tanggal) Jabatan
                </label>
                <input 
                  type="date" 
                  className="w-full p-3 border border-neutral-300 rounded-lg focus:ring-2 focus:ring-[#064E3B] outline-none text-neutral-900 bg-white" 
                  value={formData.tmtJabatan} 
                  onChange={e => setFormData({...formData, tmtJabatan: e.target.value})} 
                />
              </div>

              {/* Upload Foto */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-neutral-700 uppercase flex items-center gap-1.5">
                  <ImageIcon className="w-4 h-4 text-emerald-700" />
                  <span>Upload Foto Resmi (Opsional)</span>
                </label>
                <div className="flex items-center gap-3">
                  <input 
                    type="file" 
                    accept="image/*"
                    onChange={e => handleFileChange(e, 'foto')}
                    className="w-full text-xs text-neutral-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer"
                  />
                  {formData.foto && <span className="text-[10px] text-emerald-600 font-bold whitespace-nowrap">✓ Terlampir</span>}
                </div>
              </div>

              {/* Upload SK */}
              <div className="space-y-1">
                <label className="text-xs font-bold text-neutral-700 uppercase flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-emerald-700" />
                  <span>Upload Berkas SK (PDF/Gambar)</span>
                </label>
                <div className="flex items-center gap-3">
                  <input 
                    type="file" 
                    accept="image/*,.pdf"
                    onChange={e => handleFileChange(e, 'fileSk')}
                    className="w-full text-xs text-neutral-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-bold file:bg-emerald-50 file:text-emerald-700 hover:file:bg-emerald-100 cursor-pointer"
                  />
                  {formData.fileSk && <span className="text-[10px] text-emerald-600 font-bold whitespace-nowrap">✓ Terlampir</span>}
                </div>
              </div>
            </div>
            
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
                disabled={isSubmitting || !isNikValid || !formData.selectedDesa || !formData.namaLengkap} 
                className="flex-1 py-3 bg-[#064E3B] hover:bg-[#043d2e] text-white rounded-xl font-bold text-sm transition-colors cursor-pointer shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Mengirim Data...' : 'Kirim Pendaftaran'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
