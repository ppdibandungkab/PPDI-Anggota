import React, { useState, useEffect, useMemo, useRef } from 'react';
import { usePPDI } from '../context/PPDIContext';
import { RegulasiItem, RegulasiKategori } from '../types/ppdi';
import { formatDateIndo, safeFetchJson } from '../utils/ppdiHelpers';
import { PermissionGate } from './PermissionGate';
import {
  BookOpen,
  Search,
  Upload,
  FileText,
  Download,
  Eye,
  Edit2,
  Trash2,
  X,
  Globe,
  Lock,
  ExternalLink,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Share2,
  Check,
  Calendar,
} from 'lucide-react';

const KATEGORI_OPTIONS: RegulasiKategori[] = [
  'Undang-Undang',
  'Peraturan Pemerintah',
  'Permendagri',
  'Peraturan Daerah',
  'Peraturan Bupati',
  'AD/ART PPDI',
  'Surat Edaran',
  'Lainnya',
];

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const PustakaRegulasiView: React.FC = () => {
  const { currentUser, hasPermission } = usePPDI();
  const canCreate = hasPermission('regulasi', 'add');
  const canEdit = hasPermission('regulasi', 'edit');
  const canDelete = hasPermission('regulasi', 'delete');

  const [items, setItems] = useState<RegulasiItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [toastMsg, setToastMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [filterKategori, setFilterKategori] = useState<string>('all');
  const [filterTahun, setFilterTahun] = useState<string>('all');
  const [filterVisibilitas, setFilterVisibilitas] = useState<'all' | 'public' | 'internal'>('all');

  // Preview PDF modal
  const [previewItem, setPreviewItem] = useState<RegulasiItem | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Delete confirmation modal
  const [deleteTarget, setDeleteTarget] = useState<RegulasiItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Upload / Edit modal state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<RegulasiItem | null>(null);
  const [formJudul, setFormJudul] = useState('');
  const [formNomor, setFormNomor] = useState('');
  const [formTahun, setFormTahun] = useState<number>(new Date().getFullYear());
  const [formKategori, setFormKategori] = useState<RegulasiKategori>('Undang-Undang');
  const [formTanggal, setFormTanggal] = useState('');
  const [formTentang, setFormTentang] = useState('');
  const [formIsPublic, setFormIsPublic] = useState(true);
  const [formFileName, setFormFileName] = useState('');
  const [formFileData, setFormFileData] = useState('');
  const [formFileSize, setFormFileSize] = useState(0);
  const [formError, setFormError] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showToast = (type: 'success' | 'error', text: string) => {
    setToastMsg({ type, text });
    setTimeout(() => setToastMsg(null), 4000);
  };

  const fetchRegulasi = async () => {
    setIsLoading(true);
    setErrorMsg('');
    try {
      const res = await safeFetchJson('/api/regulasi');
      if (res.ok && res.data?.success && Array.isArray(res.data.items)) {
        setItems(res.data.items);
      } else {
        setErrorMsg(res.data?.message || 'Gagal memuat daftar regulasi.');
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'Terjadi kesalahan saat menghubungi server.');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRegulasi();
  }, []);

  // ESC key handling for open modals
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (deleteTarget) {
        setDeleteTarget(null);
      } else if (previewItem) {
        setPreviewItem(null);
      } else if (isFormOpen) {
        setIsFormOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deleteTarget, previewItem, isFormOpen]);

  const availableYears = useMemo(() => {
    const set = new Set<number>();
    items.forEach((it) => {
      if (it.tahun) set.add(Number(it.tahun));
    });
    return Array.from(set).sort((a, b) => b - a);
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return items.filter((item) => {
      if (filterKategori !== 'all' && item.kategori !== filterKategori) return false;
      if (filterTahun !== 'all' && String(item.tahun) !== filterTahun) return false;
      if (filterVisibilitas === 'public' && !item.is_public) return false;
      if (filterVisibilitas === 'internal' && item.is_public) return false;
      if (q) {
        const hay = `${item.judul} ${item.nomor_regulasi} ${item.kategori} ${item.tentang} ${item.file_name} ${item.tahun}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, searchQuery, filterKategori, filterTahun, filterVisibilitas]);

  const stats = useMemo(() => {
    const total = items.length;
    const publicCount = items.filter((i) => i.is_public).length;
    const categoriesCount = new Set(items.map((i) => i.kategori)).size;
    const totalDownloads = items.reduce((sum, i) => sum + (Number(i.download_count) || 0), 0);
    return { total, publicCount, categoriesCount, totalDownloads };
  }, [items]);

  const openAddModal = () => {
    setEditingItem(null);
    setFormJudul('');
    setFormNomor('');
    setFormTahun(new Date().getFullYear());
    setFormKategori('Undang-Undang');
    setFormTanggal('');
    setFormTentang('');
    setFormIsPublic(true);
    setFormFileName('');
    setFormFileData('');
    setFormFileSize(0);
    setFormError('');
    setIsFormOpen(true);
  };

  const openEditModal = (item: RegulasiItem) => {
    setEditingItem(item);
    setFormJudul(item.judul);
    setFormNomor(item.nomor_regulasi);
    setFormTahun(item.tahun);
    setFormKategori((item.kategori as RegulasiKategori) || 'Lainnya');
    setFormTanggal(item.tanggal_penetapan || '');
    setFormTentang(item.tentang || '');
    setFormIsPublic(item.is_public);
    setFormFileName(item.file_name);
    setFormFileData('');
    setFormFileSize(item.file_size || 0);
    setFormError('');
    setIsFormOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormError('');
    const file = e.target.files?.[0];
    if (!file) return;

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      setFormError('Hanya berkas berformat PDF (.pdf) yang diperbolehkan.');
      e.target.value = '';
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      setFormError('Ukuran file PDF maksimal 25 MB.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setFormFileName(file.name);
      setFormFileData(result);
      setFormFileSize(file.size);
      if (!formJudul.trim()) {
        setFormJudul(file.name.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim());
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formNomor.trim()) {
      setFormError('Nomor regulasi wajib diisi (contoh: UU No. 3 Tahun 2024).');
      return;
    }
    if (!formJudul.trim()) {
      setFormError('Judul regulasi wajib diisi.');
      return;
    }
    if (!editingItem && !formFileData) {
      setFormError('Silakan unggah berkas PDF aturan perundang-undangan terlebih dahulu.');
      return;
    }

    setIsSaving(true);
    try {
      const payload: Record<string, any> = {
        judul: formJudul.trim(),
        nomor_regulasi: formNomor.trim(),
        tahun: Number(formTahun) || new Date().getFullYear(),
        kategori: formKategori,
        tanggal_penetapan: formTanggal || undefined,
        tentang: formTentang.trim(),
        is_public: formIsPublic,
        uploaded_by: currentUser?.nama || currentUser?.username || 'Admin PPDI',
      };

      if (formFileData) {
        payload.fileName = formFileName;
        payload.fileData = formFileData;
      }

      const url = editingItem
        ? `/api/regulasi/${encodeURIComponent(editingItem.id_regulasi)}`
        : '/api/regulasi';
      const method = editingItem ? 'PUT' : 'POST';

      const res = await safeFetchJson(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok || !res.data?.success) {
        setFormError(res.data?.message || 'Gagal menyimpan dokumen regulasi.');
        return;
      }

      setIsFormOpen(false);
      await fetchRegulasi();
      showToast(
        'success',
        editingItem
          ? 'Perubahan regulasi berhasil disimpan.'
          : 'Regulasi PDF baru berhasil diunggah dan diterbitkan.'
      );
    } catch (err: any) {
      setFormError(err?.message || 'Terjadi kesalahan saat menyimpan regulasi.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTogglePublic = async (item: RegulasiItem) => {
    if (!canEdit) return;
    try {
      const res = await safeFetchJson(`/api/regulasi/${encodeURIComponent(item.id_regulasi)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_public: !item.is_public }),
      });
      if (res.ok && res.data?.success) {
        setItems((prev) =>
          prev.map((p) => (p.id_regulasi === item.id_regulasi ? res.data.item : p))
        );
        showToast(
          'success',
          !item.is_public
            ? `"${item.nomor_regulasi}" kini tersedia di Halaman Publik.`
            : `"${item.nomor_regulasi}" diubah menjadi Khusus Anggota (Internal).`
        );
      } else {
        showToast('error', res.data?.message || 'Gagal memperbarui visibilitas.');
      }
    } catch (err: any) {
      showToast('error', err?.message || 'Gagal memperbarui visibilitas.');
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await safeFetchJson(`/api/regulasi/${encodeURIComponent(deleteTarget.id_regulasi)}`, {
        method: 'DELETE',
      });
      if (res.ok && res.data?.success) {
        setItems((prev) => prev.filter((p) => p.id_regulasi !== deleteTarget.id_regulasi));
        if (previewItem?.id_regulasi === deleteTarget.id_regulasi) {
          setPreviewItem(null);
        }
        showToast('success', res.data?.message || 'Dokumen regulasi berhasil dihapus.');
        setDeleteTarget(null);
      } else {
        showToast('error', res.data?.message || 'Gagal menghapus regulasi.');
      }
    } catch (err: any) {
      showToast('error', err?.message || 'Gagal menghapus regulasi.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDownload = async (item: RegulasiItem) => {
    try {
      const link = document.createElement('a');
      link.href = item.file_url;
      link.download = item.file_name || `${item.nomor_regulasi}.pdf`;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      const res = await safeFetchJson(`/api/regulasi/${encodeURIComponent(item.id_regulasi)}/download`, {
        method: 'POST',
      });
      if (res.ok && res.data?.success) {
        setItems((prev) =>
          prev.map((p) =>
            p.id_regulasi === item.id_regulasi
              ? { ...p, download_count: res.data.download_count }
              : p
          )
        );
        if (previewItem?.id_regulasi === item.id_regulasi) {
          setPreviewItem((prev) =>
            prev ? { ...prev, download_count: res.data.download_count } : null
          );
        }
      }
    } catch (_) {
      // tetap lanjut download
    }
  };

  const handleCopyShareLink = (item: RegulasiItem) => {
    if (typeof window === 'undefined') return;
    const absoluteUrl = `${window.location.origin}${item.file_url}`;
    navigator.clipboard.writeText(absoluteUrl);
    setCopiedId(item.id_regulasi);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-neutral-200">
        <div>
          <h1 className="text-xl font-bold text-neutral-900 tracking-tight flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#064E3B]" />
            <span>Pustaka Regulasi</span>
          </h1>
          <p className="text-xs text-neutral-500 mt-1">
            Repositori resmi peraturan perundang-undangan desa, Permendagri, Perda, dan pedoman PPDI dalam format PDF untuk anggota dan publik.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={fetchRegulasi}
            disabled={isLoading}
            className="px-3 py-2 text-xs font-medium text-neutral-700 bg-white hover:bg-neutral-50 border border-neutral-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Segarkan</span>
          </button>

          <PermissionGate module="regulasi" action="create">
            <button
              type="button"
              onClick={openAddModal}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#064E3B] hover:bg-[#043d2e] rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5 text-amber-300" />
              <span>Unggah Regulasi PDF</span>
            </button>
          </PermissionGate>
        </div>
      </div>

      {/* Toast Feedback */}
      {toastMsg && (
        <div
          className={`p-3 rounded-lg border flex items-center justify-between text-xs ${
            toastMsg.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {toastMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span className="font-medium">{toastMsg.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setToastMsg(null)}
            className="p-1 text-neutral-400 hover:text-neutral-700 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Summary Metrics (Single-Elevation Flat Grid, Tabular Figures) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-white border border-neutral-200 rounded-lg p-4">
          <div className="text-xs text-neutral-500 font-medium">Total Dokumen</div>
          <div className="text-2xl font-bold text-neutral-900 font-mono tabular-nums mt-1">
            {stats.total}
          </div>
          <div className="text-[11px] text-neutral-500 mt-1">Arsip aturan PDF tersimpan</div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-lg p-4">
          <div className="text-xs text-neutral-500 font-medium">Terbit di Halaman Publik</div>
          <div className="text-2xl font-bold text-[#064E3B] font-mono tabular-nums mt-1">
            {stats.publicCount}
          </div>
          <div className="text-[11px] text-neutral-500 mt-1">Dapat diakses tanpa login</div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-lg p-4">
          <div className="text-xs text-neutral-500 font-medium">Kategori Hukum</div>
          <div className="text-2xl font-bold text-neutral-900 font-mono tabular-nums mt-1">
            {stats.categoriesCount}
          </div>
          <div className="text-[11px] text-neutral-500 mt-1">Klasifikasi peraturan aktif</div>
        </div>
        <div className="bg-white border border-neutral-200 rounded-lg p-4">
          <div className="text-xs text-neutral-500 font-medium">Total Unduhan</div>
          <div className="text-2xl font-bold text-neutral-900 font-mono tabular-nums mt-1">
            {stats.totalDownloads}
          </div>
          <div className="text-[11px] text-neutral-500 mt-1">Akses unduhan dokumen PDF</div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white p-3.5 rounded-lg border border-neutral-200 flex flex-col lg:flex-row items-stretch lg:items-center gap-3 text-xs">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nomor regulasi, judul peraturan, tahun, atau pokok bahasan..."
            className="w-full pl-9 pr-8 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-[#064E3B] focus:bg-white"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Filter Kategori Regulasi"
            value={filterKategori}
            onChange={(e) => setFilterKategori(e.target.value)}
            className="px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-800 focus:outline-hidden focus:ring-1 focus:ring-[#064E3B]"
          >
            <option value="all">Semua Kategori</option>
            {KATEGORI_OPTIONS.map((kat) => (
              <option key={kat} value={kat}>
                {kat}
              </option>
            ))}
          </select>

          <select
            aria-label="Filter Tahun Regulasi"
            value={filterTahun}
            onChange={(e) => setFilterTahun(e.target.value)}
            className="px-3 py-2 bg-neutral-50 border border-neutral-200 rounded-lg text-neutral-800 font-mono focus:outline-hidden focus:ring-1 focus:ring-[#064E3B]"
          >
            <option value="all">Semua Tahun</option>
            {availableYears.map((yr) => (
              <option key={yr} value={String(yr)}>
                Tahun {yr}
              </option>
            ))}
          </select>

          {(canCreate || canEdit) && (
            <div className="flex items-center gap-1 p-1 bg-neutral-100 rounded-lg">
              {(['all', 'public', 'internal'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setFilterVisibilitas(mode)}
                  className={`px-2.5 py-1 text-[11px] font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    filterVisibilitas === mode
                      ? 'bg-white text-neutral-900 shadow-2xs'
                      : 'text-neutral-600 hover:text-neutral-900'
                  }`}
                >
                  {mode === 'all' ? 'Semua' : mode === 'public' ? 'Publik' : 'Internal'}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Document Directory List */}
      <div className="bg-white border border-neutral-200 rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="divide-y divide-neutral-100">
            {[1, 2, 3].map((row) => (
              <div key={row} className="p-4 animate-pulse flex items-center justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="h-4 bg-neutral-200 rounded w-2/3" />
                  <div className="h-3 bg-neutral-100 rounded w-1/2" />
                </div>
                <div className="h-8 bg-neutral-100 rounded w-32" />
              </div>
            ))}
          </div>
        ) : errorMsg ? (
          <div className="p-8 text-center space-y-3">
            <AlertCircle className="w-8 h-8 text-red-500 mx-auto" />
            <div className="text-sm font-semibold text-neutral-900">Gagal Memuat Regulasi</div>
            <p className="text-xs text-neutral-500">{errorMsg}</p>
            <button
              type="button"
              onClick={fetchRegulasi}
              className="px-4 py-2 text-xs font-semibold text-white bg-[#064E3B] rounded-lg hover:bg-[#043d2e] cursor-pointer"
            >
              Coba Lagi
            </button>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-10 text-center space-y-3">
            <BookOpen className="w-10 h-10 text-neutral-300 mx-auto" />
            <div className="text-sm font-semibold text-neutral-800">
              {items.length === 0
                ? 'Belum Ada Dokumen Regulasi Diunggah'
                : 'Tidak Ada Dokumen yang Sesuai Filter'}
            </div>
            <p className="text-xs text-neutral-500 max-w-md mx-auto">
              {items.length === 0
                ? 'Admin dapat mengunggah berkas PDF peraturan perundang-undangan (UU Desa, PP, Permendagri, Perda, atau AD/ART PPDI) agar dapat dibaca dan diunduh anggota serta pengunjung halaman publik.'
                : 'Ubah kata kunci pencarian atau setel ulang filter kategori dan tahun untuk menampilkan regulasi lainnya.'}
            </p>
            {items.length === 0 && canCreate && (
              <button
                type="button"
                onClick={openAddModal}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#064E3B] hover:bg-[#043d2e] rounded-lg transition-colors cursor-pointer inline-flex items-center gap-1.5"
              >
                <Upload className="w-3.5 h-3.5 text-amber-300" />
                <span>Unggah Regulasi Pertama</span>
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-neutral-200">
            {filteredItems.map((item) => (
              <div
                key={item.id_regulasi}
                className="p-4 hover:bg-neutral-50/70 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="min-w-0 flex-1 space-y-1.5">
                  {/* Quiet single-line metadata header without pill clutter */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-neutral-500 font-mono">
                    <span className="font-semibold text-[#064E3B]">{item.kategori}</span>
                    <span aria-hidden="true">·</span>
                    <span className="text-neutral-700 font-medium">{item.nomor_regulasi}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">Tahun {item.tahun}</span>
                    {item.tanggal_penetapan && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>Ditetapkan {formatDateIndo(item.tanggal_penetapan)}</span>
                      </>
                    )}
                    <span aria-hidden="true">·</span>
                    <span className="inline-flex items-center gap-1 text-neutral-600">
                      {item.is_public ? (
                        <>
                          <Globe className="w-3 h-3 text-emerald-700" />
                          <span>Publik & Anggota</span>
                        </>
                      ) : (
                        <>
                          <Lock className="w-3 h-3 text-amber-700" />
                          <span>Khusus Anggota</span>
                        </>
                      )}
                    </span>
                  </div>

                  {/* Primary Title */}
                  <h3
                    onClick={() => setPreviewItem(item)}
                    className="text-sm font-bold text-neutral-900 hover:text-[#064E3B] cursor-pointer leading-snug"
                  >
                    {item.judul}
                  </h3>

                  {/* Summary / Tentang */}
                  {item.tentang && (
                    <p className="text-xs text-neutral-600 line-clamp-2 leading-relaxed">
                      {item.tentang}
                    </p>
                  )}

                  {/* Technical File Info */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-500 font-mono pt-0.5">
                    <span className="truncate max-w-xs">{item.file_name}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{formatBytes(item.file_size)}</span>
                    <span aria-hidden="true">·</span>
                    <span className="tabular-nums">{item.download_count || 0} unduhan</span>
                    {item.uploaded_by && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>Oleh {item.uploaded_by}</span>
                      </>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setPreviewItem(item)}
                    className="px-3 py-1.5 text-xs font-medium text-[#064E3B] bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Baca PDF</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDownload(item)}
                    className="px-3 py-1.5 text-xs font-medium text-white bg-[#064E3B] hover:bg-[#043d2e] rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-300" />
                    <span>Unduh</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleCopyShareLink(item)}
                    title="Salin tautan langsung berkas PDF"
                    className="p-2 text-neutral-600 hover:text-neutral-900 bg-white hover:bg-neutral-100 border border-neutral-200 rounded-lg transition-colors cursor-pointer"
                  >
                    {copiedId === item.id_regulasi ? (
                      <Check className="w-3.5 h-3.5 text-emerald-700" />
                    ) : (
                      <Share2 className="w-3.5 h-3.5" />
                    )}
                  </button>

                  {canEdit && (
                    <>
                      <button
                        type="button"
                        onClick={() => handleTogglePublic(item)}
                        title={
                          item.is_public
                            ? 'Sembunyikan dari Halaman Publik (Khusus Anggota)'
                            : 'Terbitkan ke Halaman Publik'
                        }
                        className="p-2 text-neutral-600 hover:text-[#064E3B] bg-white hover:bg-neutral-100 border border-neutral-200 rounded-lg transition-colors cursor-pointer"
                      >
                        {item.is_public ? (
                          <Globe className="w-3.5 h-3.5 text-emerald-700" />
                        ) : (
                          <Lock className="w-3.5 h-3.5 text-amber-700" />
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditModal(item)}
                        title="Ubah metadata atau ganti berkas PDF"
                        className="p-2 text-neutral-600 hover:text-neutral-900 bg-white hover:bg-neutral-100 border border-neutral-200 rounded-lg transition-colors cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  )}

                  {canDelete && (
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(item)}
                      title="Hapus regulasi"
                      className="p-2 text-red-600 hover:text-red-800 bg-white hover:bg-red-50 border border-neutral-200 rounded-lg transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upload / Edit Modal */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-neutral-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl border border-neutral-200 shadow-2xl max-w-2xl w-full my-6 overflow-hidden">
            <div className="px-5 py-4 border-b border-neutral-200 flex items-center justify-between bg-[#064E3B] text-white">
              <div className="flex items-center gap-2.5">
                <Upload className="w-4 h-4 text-amber-300" />
                <h2 className="text-sm font-bold">
                  {editingItem ? 'Edit Dokumen Regulasi' : 'Unggah Regulasi PDF Baru'}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="p-1 text-emerald-200 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSubmit} className="p-5 space-y-4 text-xs">
              {formError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">
                    Kategori Peraturan *
                  </label>
                  <select
                    value={formKategori}
                    onChange={(e) => setFormKategori(e.target.value as RegulasiKategori)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg bg-white text-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-[#064E3B]"
                  >
                    {KATEGORI_OPTIONS.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">
                    Nomor Regulasi *
                  </label>
                  <input
                    type="text"
                    value={formNomor}
                    onChange={(e) => setFormNomor(e.target.value)}
                    placeholder="Contoh: UU No. 3 Tahun 2024"
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg font-mono focus:outline-hidden focus:ring-1 focus:ring-[#064E3B]"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Judul / Nama Peraturan *
                </label>
                <input
                  type="text"
                  value={formJudul}
                  onChange={(e) => setFormJudul(e.target.value)}
                  placeholder="Contoh: Perubahan Kedua Atas Undang-Undang Nomor 6 Tahun 2014 Tentang Desa"
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#064E3B]"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">
                    Tahun Peraturan *
                  </label>
                  <input
                    type="number"
                    min={1945}
                    max={2100}
                    value={formTahun}
                    onChange={(e) => setFormTahun(Number(e.target.value) || new Date().getFullYear())}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg font-mono tabular-nums focus:outline-hidden focus:ring-1 focus:ring-[#064E3B]"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-neutral-700 mb-1">
                    Tanggal Penetapan (Opsional)
                  </label>
                  <div className="relative">
                    <Calendar className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="date"
                      value={formTanggal}
                      onChange={(e) => setFormTanggal(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 border border-neutral-300 rounded-lg font-mono focus:outline-hidden focus:ring-1 focus:ring-[#064E3B]"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Ringkasan / Pokok Bahasan (Tentang)
                </label>
                <textarea
                  rows={3}
                  value={formTentang}
                  onChange={(e) => setFormTentang(e.target.value)}
                  placeholder="Ringkasan singkat isi regulasi, relevansi bagi perangkat desa, atau catatan pemberlakuan..."
                  className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#064E3B]"
                />
              </div>

              <div>
                <label className="block font-semibold text-neutral-700 mb-1">
                  Berkas Dokumen PDF {editingItem ? '(Kosongkan jika tidak mengganti file)' : '*'}
                </label>
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border border-dashed border-neutral-300 hover:border-[#064E3B] rounded-lg p-4 bg-neutral-50 hover:bg-emerald-50/40 transition-colors cursor-pointer flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-emerald-100 text-[#064E3B] flex items-center justify-center shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold text-neutral-800 truncate">
                        {formFileName || 'Pilih file PDF regulasi (Maks. 25 MB)'}
                      </div>
                      <div className="text-[11px] text-neutral-500 font-mono">
                        {formFileSize > 0
                          ? `Ukuran: ${formatBytes(formFileSize)}${formFileData ? ' · Siap diunggah' : ' · File terpasang'}`
                          : 'Format diterima: .pdf'}
                      </div>
                    </div>
                  </div>
                  <span className="px-3 py-1.5 text-[11px] font-semibold bg-white border border-neutral-300 rounded-md text-neutral-700 shrink-0">
                    Pilih File
                  </span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/pdf,.pdf"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {/* Public Visibility Switch */}
              <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200 flex items-center justify-between gap-3">
                <div>
                  <div className="font-semibold text-neutral-900 flex items-center gap-1.5">
                    {formIsPublic ? (
                      <Globe className="w-3.5 h-3.5 text-emerald-700" />
                    ) : (
                      <Lock className="w-3.5 h-3.5 text-amber-700" />
                    )}
                    <span>Publikasikan ke Halaman Publik & Seluruh Anggota</span>
                  </div>
                  <p className="text-[11px] text-neutral-500 mt-0.5">
                    {formIsPublic
                      ? 'Dokumen dapat dilihat dan diunduh oleh seluruh anggota maupun pengunjung halaman utama publik.'
                      : 'Dokumen hanya muncul di menu internal anggota yang telah login.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFormIsPublic((v) => !v)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer shrink-0 ${
                    formIsPublic
                      ? 'bg-[#064E3B] text-white'
                      : 'bg-neutral-200 text-neutral-700'
                  }`}
                >
                  {formIsPublic ? 'Publik Aktif' : 'Internal Saja'}
                </button>
              </div>

              <div className="pt-3 border-t border-neutral-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  disabled={isSaving}
                  className="px-4 py-2 text-xs font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#064E3B] hover:bg-[#043d2e] rounded-lg cursor-pointer flex items-center gap-1.5 disabled:opacity-60"
                >
                  {isSaving && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>{editingItem ? 'Simpan Perubahan' : 'Unggah & Terbitkan'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Inline PDF Reader Preview Modal */}
      {previewItem && (
        <div className="fixed inset-0 z-50 bg-neutral-900/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
          <div className="bg-white rounded-xl border border-neutral-200 shadow-2xl max-w-5xl w-full h-[90vh] flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-neutral-200 bg-[#064E3B] text-white flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[10px] font-mono text-amber-300">
                  {previewItem.kategori} · {previewItem.nomor_regulasi} · Tahun {previewItem.tahun}
                </div>
                <h3 className="text-xs sm:text-sm font-bold truncate">{previewItem.judul}</h3>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={previewItem.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1.5 text-[11px] font-medium bg-white/10 hover:bg-white/20 text-white rounded-lg flex items-center gap-1"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Tab Baru</span>
                </a>
                <button
                  type="button"
                  onClick={() => handleDownload(previewItem)}
                  className="px-3 py-1.5 text-[11px] font-semibold bg-amber-400 hover:bg-amber-300 text-neutral-950 rounded-lg cursor-pointer flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewItem(null)}
                  className="p-1.5 text-emerald-200 hover:text-white rounded-lg cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {previewItem.tentang && (
              <div className="px-4 py-2 bg-neutral-50 border-b border-neutral-200 text-xs text-neutral-700">
                {previewItem.tentang}
              </div>
            )}

            <div className="flex-1 bg-neutral-100 relative">
              <iframe
                src={previewItem.file_url}
                title={previewItem.judul}
                className="w-full h-full border-0"
              />
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-neutral-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-neutral-200 shadow-2xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-red-100 text-red-700 flex items-center justify-center shrink-0">
                <Trash2 className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-neutral-900">Hapus Dokumen Regulasi?</h3>
                <p className="text-xs text-neutral-600 mt-1">
                  Anda akan menghapus <strong>{deleteTarget.nomor_regulasi}</strong> ({deleteTarget.judul}) beserta berkas PDF terkait dari server.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={isDeleting}
                className="px-3.5 py-2 text-xs font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-3.5 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg cursor-pointer flex items-center gap-1.5 disabled:opacity-60"
              >
                {isDeleting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                <span>Ya, Hapus Permanen</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
