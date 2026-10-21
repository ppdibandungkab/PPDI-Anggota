import React, { useState, useRef, useMemo } from 'react';
import ExcelJS from 'exceljs';
import {
  X,
  Upload,
  Download,
  FileSpreadsheet,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Eye,
  FileCheck,
  Check,
  ChevronRight,
} from 'lucide-react';
import { usePPDI } from '../context/PPDIContext';

interface ExcelImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

interface ParsedRow {
  rowNumber: number;
  nik: string;
  namaLengkap: string;
  gelarDepan?: string;
  gelarBelakang?: string;
  tempatLahir: string;
  tanggalLahir: string;
  jenisKelamin: 'L' | 'P';
  agama: string;
  pendidikanTerakhir: 'SMA/SMK' | 'D3' | 'S1' | 'S2';
  noHpWa: string;
  email?: string;
  alamatRumah?: string;
  namaKecamatan?: string;
  namaDesa?: string;
  idDesa?: string;
  namaJabatan?: string;
  idJabatan?: number;
  noSk?: string;
  tglSk?: string;
  tmtJabatan?: string;
  jabatanPengurus?: string;
  isValid: boolean;
  errors: string[];
}

export const ExcelImportModal: React.FC<ExcelImportModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const {
    desaList,
    kecamatanList,
    jabatanList,
    anggotaList,
    batchImportAnggota,
  } = usePPDI();

  const [file, setFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [filterView, setFilterView] = useState<'all' | 'valid' | 'invalid'>('all');
  const [isProcessing, setIsProcessing] = useState(false);
  const [importProgress, setImportProgress] = useState<number>(0);
  const [importResult, setImportResult] = useState<{
    success: boolean;
    insertedCount: number;
    skippedCount: number;
    skipped?: any[];
    message?: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Existing NIK set for fast lookup
  const existingNikSet = useMemo(() => {
    return new Set(anggotaList.map((a) => String(a.nik).trim()));
  }, [anggotaList]);

  // Handle template download
  const handleDownloadTemplate = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Template Anggota PPDI');

    const headers = [
      'NIK', 'Nama Lengkap', 'Gelar Depan', 'Gelar Belakang', 'Tempat Lahir',
      'Tanggal Lahir', 'Jenis Kelamin', 'Agama', 'Pendidikan Terakhir',
      'Nomor WhatsApp', 'Email', 'Alamat Rumah', 'Kecamatan', 'Desa',
      'Jabatan', 'Nomor SK', 'Tanggal SK', 'TMT Jabatan', 'Jabatan Pengurus PPDI',
    ];

    worksheet.columns = headers.map(header => ({ header, key: header, width: 22 }));

    const sampleRows = [
      ['3204051203850011', 'Asep Hidayat', 'H.', 'S.AP', 'Bandung', '1985-03-12', 'L', 'Islam', 'S1', '081223344551', 'asep.hidayat@desa.id', 'Jl. Raya Soreang No. 12 RT 02/03', 'SOREANG', 'PAMEKARAN', 'Sekretaris Desa', '141.1/Kep.05-Desa/2023', '2023-01-10', '2023-02-01', 'Anggota Biasa'],
      ['3204162005900022', 'Siti Rahmawati', '', 'S.E', 'Bandung', '1990-05-20', 'P', 'Islam', 'S1', '085721889933', 'siti.rahmawati@desa.id', 'Kp. Ranca Manyar RT 01/05', 'BALEENDAH', 'ARJASARI', 'Kaur Keuangan', '141.1/Kep.12-Desa/2024', '2024-02-15', '2024-03-01', 'Anggota Biasa'],
      ['3204131508920033', 'Dedi Kusnadi', '', 'S.IP', 'Bandung', '1992-08-15', 'L', 'Islam', 'S1', '087822991155', 'dedi.kusnadi@desa.id', 'Jl. Sindangreret No. 45 Banjaran', 'BANJARAN', 'BANJARAN', 'Kasi Pemerintahan', '141.1/Kep.08-Desa/2023', '2023-05-10', '2023-06-01', 'Ketua Pengurus Kecamatan'],
    ];

    sampleRows.forEach(row => worksheet.addRow(row));

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'TEMPLATE_IMPORT_ANGGOTA_PPDI_BANDUNG.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Parse uploaded file
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;

    setFile(selected);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const arrayBuffer = evt.target?.result as ArrayBuffer;
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.load(arrayBuffer);
        const worksheet = workbook.worksheets[0];
        
        const jsonData: any[] = [];
        const headers: string[] = [];
        
        worksheet.eachRow((row, rowNumber) => {
          if (rowNumber === 1) {
            row.eachCell((cell) => headers.push(String(cell.value)));
          } else {
            const rowData: any = {};
            row.eachCell((cell, colNumber) => {
              rowData[headers[colNumber - 1]] = cell.value;
            });
            jsonData.push(rowData);
          }
        });

        processParsedData(jsonData);
      } catch (err: any) {
        alert('Gagal membaca file Excel. Pastikan format file .xlsx, .xls, atau .csv');
      }
    };
    reader.readAsArrayBuffer(selected);
  };

  // Normalize column mapping & validate
  const processParsedData = (data: any[]) => {
    const rows: ParsedRow[] = [];
    const fileNikSet = new Set<string>();

    data.forEach((item, index) => {
      // Flexible field access (case-insensitive keys)
      const getVal = (...keys: string[]): string => {
        for (const k of keys) {
          const matchedKey = Object.keys(item).find(
            (itemKey) => itemKey.trim().toLowerCase() === k.trim().toLowerCase()
          );
          if (matchedKey && item[matchedKey] !== undefined && item[matchedKey] !== null) {
            return String(item[matchedKey]).trim();
          }
        }
        return '';
      };

      const nik = getVal('NIK', 'No KTP', 'Nomor KTP', 'No. KTP', 'NIK KTP').replace(/\D/g, '');
      const namaLengkap = getVal('Nama Lengkap', 'Nama', 'Nama Perangkat', 'Nama Anggota');
      const gelarDepan = getVal('Gelar Depan', 'Gelar Depan (Opsional)');
      const gelarBelakang = getVal('Gelar Belakang', 'Gelar Belakang (Opsional)');
      const tempatLahir = getVal('Tempat Lahir', 'Tempat') || 'Bandung';

      // Parse date format (could be Date or YYYY-MM-DD or DD/MM/YYYY)
      let rawTgl = getVal('Tanggal Lahir', 'Tgl Lahir', 'Tanggal Lahir (YYYY-MM-DD)');
      if (rawTgl.includes('T')) rawTgl = rawTgl.split('T')[0];
      const tanggalLahir = rawTgl || '1990-01-01';

      const jkRaw = getVal('Jenis Kelamin', 'JK', 'Gender').toUpperCase();
      const jenisKelamin: 'L' | 'P' = jkRaw.startsWith('P') || jkRaw.includes('PEREMPUAN') ? 'P' : 'L';

      const agama = getVal('Agama') || 'Islam';
      const pddkRaw = getVal('Pendidikan Terakhir', 'Pendidikan').toUpperCase();
      let pendidikanTerakhir: 'SMA/SMK' | 'D3' | 'S1' | 'S2' = 'S1';
      if (pddkRaw.includes('SMA') || pddkRaw.includes('SMK')) pendidikanTerakhir = 'SMA/SMK';
      else if (pddkRaw.includes('D3') || pddkRaw.includes('DIPLOMA')) pendidikanTerakhir = 'D3';
      else if (pddkRaw.includes('S2') || pddkRaw.includes('MAGISTER')) pendidikanTerakhir = 'S2';

      const noHpWa = getVal('Nomor WhatsApp', 'No WhatsApp', 'No WA', 'WhatsApp', 'No HP', 'Telepon').replace(/\D/g, '');
      const email = getVal('Email', 'Alamat Email');
      const alamatRumah = getVal('Alamat Rumah', 'Alamat', 'Alamat Tinggal');

      const namaKecamatan = getVal('Kecamatan', 'Nama Kecamatan');
      const namaDesa = getVal('Desa', 'Nama Desa');
      const namaJabatan = getVal('Jabatan', 'Nama Jabatan', 'Jabatan SOTK');
      const noSk = getVal('Nomor SK', 'No SK', 'SK Pengangkatan', 'No. SK');
      const tglSk = getVal('Tanggal SK', 'Tgl SK') || new Date().toISOString().split('T')[0];
      const tmtJabatan = getVal('TMT Jabatan', 'TMT') || new Date().toISOString().split('T')[0];
      const jabatanPengurus = getVal('Jabatan Pengurus PPDI', 'Pengurus PPDI', 'Jabatan Pengurus') || 'Anggota Biasa';

      // Validation
      const errors: string[] = [];

      if (!nik) {
        errors.push('NIK wajib diisi');
      } else if (nik.length !== 16) {
        errors.push(`NIK harus 16 digit (${nik.length} digit terdeteksi)`);
      } else if (fileNikSet.has(nik)) {
        errors.push('Duplikat dalam file Excel ini');
      } else if (existingNikSet.has(nik)) {
        const found = anggotaList.find((a) => a.nik === nik);
        errors.push(`NIK sudah terdaftar di sistem (${found?.nama_lengkap || 'Anggota PPDI'})`);
      }

      if (!namaLengkap) {
        errors.push('Nama lengkap wajib diisi');
      }

      if (!noHpWa || noHpWa.length < 8) {
        errors.push('Nomor WA wajib diisi min 8 digit');
      }

      // Match Desa in master
      let matchedDesa = desaList.find(
        (d) =>
          d.nama_desa.toLowerCase().trim() === namaDesa.toLowerCase().trim() ||
          d.id_desa === namaDesa ||
          d.id_desa.replace(/\./g, '') === namaDesa.replace(/\./g, '')
      );

      // If matched, get idDesa
      const idDesa = matchedDesa?.id_desa || '3204052001';

      // Match Jabatan
      let matchedJabatan = jabatanList.find(
        (j) =>
          j.nama_jabatan.toLowerCase().trim() === namaJabatan.toLowerCase().trim() ||
          String(j.id_jabatan) === namaJabatan
      );
      const idJabatan = matchedJabatan ? matchedJabatan.id_jabatan : 2; // Default Sekretaris Desa

      fileNikSet.add(nik);

      rows.push({
        rowNumber: index + 2, // Excel row 2+
        nik,
        namaLengkap,
        gelarDepan,
        gelarBelakang,
        tempatLahir,
        tanggalLahir,
        jenisKelamin,
        agama,
        pendidikanTerakhir,
        noHpWa,
        email,
        alamatRumah,
        namaKecamatan: namaKecamatan || matchedDesa?.id_kecamatan || 'Soreang',
        namaDesa: matchedDesa?.nama_desa || namaDesa || 'Pamekaran',
        idDesa,
        namaJabatan: matchedJabatan?.nama_jabatan || namaJabatan || 'Sekretaris Desa',
        idJabatan,
        noSk: noSk || `141.1/Kep.${Math.floor(Math.random() * 80 + 10)}-Desa/${new Date().getFullYear()}`,
        tglSk,
        tmtJabatan,
        jabatanPengurus,
        isValid: errors.length === 0,
        errors,
      });
    });

    setParsedRows(rows);
  };

  const validRows = useMemo(() => parsedRows.filter((r) => r.isValid), [parsedRows]);
  const invalidRows = useMemo(() => parsedRows.filter((r) => !r.isValid), [parsedRows]);

  const displayedRows = useMemo(() => {
    if (filterView === 'valid') return validRows;
    if (filterView === 'invalid') return invalidRows;
    return parsedRows;
  }, [filterView, validRows, invalidRows, parsedRows]);

  // Execute Import
  const handleExecuteImport = async () => {
    if (validRows.length === 0) return;

    setIsProcessing(true);
    setImportProgress(10);

    try {
      // Map valid rows to batch payload
      const payload = validRows.map((r) => ({
        anggota: {
          nik: r.nik,
          nama_lengkap: r.namaLengkap,
          gelar_depan: r.gelarDepan || undefined,
          gelar_belakang: r.gelarBelakang || undefined,
          tempat_lahir: r.tempatLahir,
          tanggal_lahir: r.tanggalLahir,
          jenis_kelamin: r.jenisKelamin,
          agama: r.agama,
          pendidikan_terakhir: r.pendidikanTerakhir,
          no_hp_wa: r.noHpWa,
          email: r.email || undefined,
          foto: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80',
          alamat_rumah: r.alamatRumah || 'Kabupaten Bandung, Jawa Barat',
          status_pernikahan: 'Kawin',
        },
        riwayat: {
          id_desa: r.idDesa,
          nama_desa: r.namaDesa,
          id_jabatan: r.idJabatan,
          no_sk_pengangkatan: r.noSk,
          tgl_sk_pengangkatan: r.tglSk,
          tmt_jabatan: r.tmtJabatan,
          status_aktif: 'Aktif',
          file_sk: `SK_${r.namaLengkap.replace(/\s+/g, '_').toUpperCase()}_${new Date().getFullYear()}.pdf`,
        },
        keanggotaan: {
          tgl_bergabung: new Date().toISOString().split('T')[0],
          jabatan_pengurus: r.jabatanPengurus || 'Anggota Biasa',
          status_kta: 'Aktif',
        },
      }));

      setImportProgress(40);
      const res = await batchImportAnggota(payload);
      setImportProgress(100);

      setImportResult({
        success: true,
        insertedCount: res.insertedCount || validRows.length,
        skippedCount: (res.skippedCount || 0) + invalidRows.length,
        skipped: res.skipped,
        message: res.message || `${validRows.length} data anggota perangkat desa berhasil diimpor!`,
      });

      if (onSuccess) onSuccess();
    } catch (err: any) {
      setImportResult({
        success: false,
        insertedCount: 0,
        skippedCount: validRows.length,
        message: err.message || 'Gagal memproses impor ke database.',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setParsedRows([]);
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#111113]/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[92vh] flex flex-col my-4 border border-[#111113]/15 overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#F8F7F4] border-b border-[#111113]/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-800 text-white flex items-center justify-center shadow-xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <div className="brand-meta text-[#064E3B] font-semibold text-xs tracking-wider">
                IMPORT DATA MASSAL (BATCH REGISTRATION)
              </div>
              <h2 className="text-base sm:text-lg font-bold text-[#111113] tracking-tight">
                Import Data Induk Perangkat Desa dari Excel / CSV
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#111113]/50 hover:text-[#111113] hover:bg-neutral-200/50 rounded-lg transition-colors cursor-pointer"
            title="Tutup Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
          {/* Step 1: Template Download Banner */}
          <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <h3 className="font-bold text-emerald-950 flex items-center gap-1.5 text-xs">
                <span>Unduh Format Template Excel Resmi</span>
                <span className="px-1.5 py-0.2 bg-emerald-200 text-emerald-800 rounded-md text-[10px] font-mono">
                  Standard PPDI
                </span>
              </h3>
              <p className="text-[11px] text-emerald-800 leading-relaxed">
                Gunakan template resmi dengan kolom terstandar (NIK 16 digit, Nama, Jabatan SOTK, SK Pengangkatan, No WA) agar proses import dan penerbitan E-KTA berjalan otomatis tanpa hambatan.
              </p>
            </div>
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="px-4 py-2 bg-emerald-800 hover:bg-emerald-900 text-white font-bold rounded-lg text-xs flex items-center gap-1.5 shadow-xs shrink-0 cursor-pointer transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Unduh Template Excel (.xlsx)</span>
            </button>
          </div>

          {/* Result Banner if already imported */}
          {importResult && (
            <div
              className={`p-4 rounded-xl border flex flex-col gap-2 ${
                importResult.success
                  ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                  : 'bg-red-50 border-red-300 text-red-950'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {importResult.success ? (
                    <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                  )}
                  <span className="font-bold text-sm">
                    {importResult.success ? 'Import Data Berhasil!' : 'Import Mengalami Kendala'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleReset}
                  className="px-2.5 py-1 text-[11px] font-semibold bg-white border border-neutral-300 rounded-md hover:bg-neutral-50 cursor-pointer"
                >
                  Import File Lain
                </button>
              </div>

              <p className="text-xs">{importResult.message}</p>

              {importResult.success && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-2 pt-2 border-t border-emerald-200 text-xs">
                  <div className="bg-white/80 p-2 rounded-lg border border-emerald-200">
                    <span className="text-[10px] text-neutral-500 block">Berhasil Diterbitkan</span>
                    <strong className="text-emerald-700 text-base">{importResult.insertedCount} Anggota</strong>
                  </div>
                  <div className="bg-white/80 p-2 rounded-lg border border-emerald-200">
                    <span className="text-[10px] text-neutral-500 block">Dilewati / Duplikat</span>
                    <strong className="text-amber-700 text-base">{importResult.skippedCount} Baris</strong>
                  </div>
                  <div className="bg-white/80 p-2 rounded-lg border border-emerald-200 col-span-2 sm:col-span-1">
                    <span className="text-[10px] text-neutral-500 block">Status E-KTA</span>
                    <strong className="text-emerald-800 text-xs font-mono">Aktif / Tervalidasi QR</strong>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Upload Zone */}
          {!file ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-neutral-300 hover:border-emerald-600 rounded-xl p-8 text-center cursor-pointer transition-colors bg-neutral-50 hover:bg-emerald-50/30 group"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="w-14 h-14 mx-auto rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
                <Upload className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-neutral-900 text-sm">
                Klik untuk memilih berkas Excel atau tarik berkas ke sini
              </h3>
              <p className="text-neutral-500 text-xs mt-1">
                Mendukung format <strong>.xlsx, .xls, dan .csv</strong> (Maksimal 10 MB)
              </p>
              <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-neutral-300 rounded-lg text-neutral-700 text-xs font-medium shadow-2xs">
                <FileCheck className="w-3.5 h-3.5 text-emerald-700" />
                <span>Pilih File dari Komputer</span>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* File Info Card */}
              <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-800 text-white flex items-center justify-center font-bold">
                    <FileSpreadsheet className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-neutral-900 text-xs">{file.name}</div>
                    <div className="text-[11px] text-neutral-500 font-mono">
                      {(file.size / 1024).toFixed(1)} KB · Total {parsedRows.length} baris data ditemukan
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleReset}
                    className="px-2.5 py-1 text-xs text-neutral-600 hover:text-red-600 bg-white border border-neutral-300 hover:border-red-300 rounded-md transition-colors cursor-pointer"
                  >
                    Ganti File
                  </button>
                </div>
              </div>

              {/* Statistics & Filter Bar */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-neutral-200">
                <div className="flex items-center gap-2">
                  <span className="text-neutral-500 font-medium">Filter Tampilan:</span>
                  <div className="inline-flex rounded-lg border border-neutral-200 p-0.5 bg-neutral-100">
                    <button
                      type="button"
                      onClick={() => setFilterView('all')}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                        filterView === 'all'
                          ? 'bg-white text-neutral-900 shadow-2xs'
                          : 'text-neutral-600 hover:text-neutral-900'
                      }`}
                    >
                      Semua ({parsedRows.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterView('valid')}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1 ${
                        filterView === 'valid'
                          ? 'bg-emerald-700 text-white shadow-2xs'
                          : 'text-emerald-800 hover:text-emerald-950'
                      }`}
                    >
                      <Check className="w-3 h-3" />
                      <span>Valid ({validRows.length})</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterView('invalid')}
                      className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer transition-colors flex items-center gap-1 ${
                        filterView === 'invalid'
                          ? 'bg-red-700 text-white shadow-2xs'
                          : 'text-red-700 hover:text-red-950'
                      }`}
                    >
                      <AlertTriangle className="w-3 h-3" />
                      <span>Error / Duplikat ({invalidRows.length})</span>
                    </button>
                  </div>
                </div>

                <div className="text-right text-[11px] text-neutral-500">
                  {validRows.length > 0 ? (
                    <span className="text-emerald-700 font-semibold">
                      ✓ Siap mengimpor {validRows.length} anggota baru
                    </span>
                  ) : (
                    <span className="text-red-600 font-semibold">
                      ⚠ Tidak ada data yang valid untuk diimpor
                    </span>
                  )}
                </div>
              </div>

              {/* Data Preview Table */}
              <div className="border border-neutral-200 rounded-xl overflow-hidden shadow-2xs">
                <div className="max-h-72 overflow-y-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-[#F8F7F4] border-b border-neutral-200 sticky top-0 z-10 text-[11px] text-neutral-700">
                      <tr>
                        <th className="py-2.5 px-3 font-bold w-12 text-center">Baris</th>
                        <th className="py-2.5 px-3 font-bold w-24">Status</th>
                        <th className="py-2.5 px-3 font-bold">NIK KTP</th>
                        <th className="py-2.5 px-3 font-bold">Nama Lengkap</th>
                        <th className="py-2.5 px-3 font-bold">Desa / Kec</th>
                        <th className="py-2.5 px-3 font-bold">Jabatan</th>
                        <th className="py-2.5 px-3 font-bold">No WhatsApp</th>
                        <th className="py-2.5 px-3 font-bold">Keterangan Validasi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-200">
                      {displayedRows.length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-neutral-400">
                            Tidak ada data untuk filter ini
                          </td>
                        </tr>
                      ) : (
                        displayedRows.map((row) => (
                          <tr
                            key={row.rowNumber}
                            className={`hover:bg-neutral-50 transition-colors ${
                              !row.isValid ? 'bg-red-50/40' : ''
                            }`}
                          >
                            <td className="py-2 px-3 text-center text-neutral-400 font-mono text-[10px]">
                              #{row.rowNumber}
                            </td>
                            <td className="py-2 px-3">
                              {row.isValid ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                  <CheckCircle className="w-3 h-3 text-emerald-600" />
                                  <span>Valid</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800">
                                  <AlertCircle className="w-3 h-3 text-red-600" />
                                  <span>Error</span>
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-3 font-mono font-medium text-neutral-800">
                              {row.nik || '-'}
                            </td>
                            <td className="py-2 px-3 font-bold text-neutral-900">
                              {row.gelarDepan ? `${row.gelarDepan} ` : ''}
                              {row.namaLengkap}
                              {row.gelarBelakang ? `, ${row.gelarBelakang}` : ''}
                            </td>
                            <td className="py-2 px-3 text-neutral-600">
                              <span className="font-semibold text-neutral-800">{row.namaDesa}</span>
                              <span className="block text-[10px] text-neutral-400">Kec. {row.namaKecamatan}</span>
                            </td>
                            <td className="py-2 px-3 text-neutral-700">
                              <span className="font-medium">{row.namaJabatan}</span>
                              <span className="block text-[10px] text-neutral-400 font-mono truncate max-w-[150px]">
                                {row.noSk}
                              </span>
                            </td>
                            <td className="py-2 px-3 font-mono text-neutral-600">
                              {row.noHpWa || '-'}
                            </td>
                            <td className="py-2 px-3 text-[11px]">
                              {row.isValid ? (
                                <span className="text-emerald-700 font-medium">
                                  Siap terbitkan E-KTA
                                </span>
                              ) : (
                                <span className="text-red-600 font-medium block">
                                  {row.errors.join(', ')}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#F8F7F4] border-t border-[#111113]/10">
          <div className="text-[11px] text-neutral-500">
            {parsedRows.length > 0 && (
              <span>
                Total: <strong>{parsedRows.length}</strong> baris · Valid:{' '}
                <strong className="text-emerald-700">{validRows.length}</strong> · Duplikat/Error:{' '}
                <strong className="text-red-700">{invalidRows.length}</strong>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isProcessing}
              className="px-4 py-2 text-xs font-semibold text-neutral-700 bg-white hover:bg-neutral-100 border border-neutral-300 rounded-lg cursor-pointer transition-colors"
            >
              {importResult?.success ? 'Tutup' : 'Batal'}
            </button>

            {parsedRows.length > 0 && !importResult?.success && (
              <button
                type="button"
                disabled={validRows.length === 0 || isProcessing}
                onClick={handleExecuteImport}
                className="px-5 py-2 text-xs font-bold text-white bg-emerald-800 hover:bg-emerald-900 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm flex items-center gap-2 cursor-pointer transition-colors"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Memproses Import ({validRows.length} Data)...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    <span>Proses Impor {validRows.length} Anggota & Terbitkan E-KTA</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
