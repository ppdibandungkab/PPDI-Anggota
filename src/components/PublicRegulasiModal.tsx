import React, { useState, useEffect, useMemo } from 'react';
import { RegulasiItem } from '../types/ppdi';
import { formatDateIndo, safeFetchJson } from '../utils/ppdiHelpers';
import {
  BookOpen,
  Search,
  Eye,
  Download,
  X,
  ExternalLink,
  RefreshCw,
  FileText,
  ArrowLeft,
} from 'lucide-react';

interface PublicRegulasiModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialItem?: RegulasiItem | null;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const PublicRegulasiModal: React.FC<PublicRegulasiModalProps> = ({
  isOpen,
  onClose,
  initialItem = null,
}) => {
  const [items, setItems] = useState<RegulasiItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedKategori, setSelectedKategori] = useState('all');
  const [activeReaderItem, setActiveReaderItem] = useState<RegulasiItem | null>(null);

  const fetchPublicRegulasi = async () => {
    setIsLoading(true);
    try {
      const res = await safeFetchJson('/api/regulasi?publicOnly=true');
      if (res.ok && res.data?.success && Array.isArray(res.data.items)) {
        setItems(res.data.items);
      }
    } catch (_) {
      // ignore error
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchPublicRegulasi();
      setActiveReaderItem(initialItem || null);
    }
  }, [isOpen, initialItem]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activeReaderItem) {
          setActiveReaderItem(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, activeReaderItem, onClose]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    items.forEach((it) => {
      if (it.kategori) set.add(it.kategori);
    });
    return Array.from(set);
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return items.filter((item) => {
      if (selectedKategori !== 'all' && item.kategori !== selectedKategori) return false;
      if (q) {
        const hay = `${item.judul} ${item.nomor_regulasi} ${item.kategori} ${item.tentang} ${item.tahun}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [items, searchQuery, selectedKategori]);

  const handleDownload = async (item: RegulasiItem) => {
    const link = document.createElement('a');
    link.href = item.file_url;
    link.download = item.file_name || `${item.nomor_regulasi}.pdf`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    try {
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
        if (activeReaderItem?.id_regulasi === item.id_regulasi) {
          setActiveReaderItem((prev) =>
            prev ? { ...prev, download_count: res.data.download_count } : null
          );
        }
      }
    } catch (_) {}
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-neutral-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
      <div className="bg-white rounded-xl border border-neutral-200 shadow-2xl max-w-5xl w-full h-[88vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-neutral-200 bg-[#064E3B] text-white flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {activeReaderItem ? (
              <button
                type="button"
                onClick={() => setActiveReaderItem(null)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer shrink-0"
                title="Kembali ke daftar regulasi"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            ) : (
              <BookOpen className="w-5 h-5 text-amber-300 shrink-0" />
            )}
            <div className="min-w-0">
              <h2 className="text-sm font-bold truncate">
                {activeReaderItem
                  ? activeReaderItem.judul
                  : 'Pustaka Regulasi Publik PPDI Kabupaten Bandung'}
              </h2>
              <p className="text-[11px] text-emerald-200 truncate">
                {activeReaderItem
                  ? `${activeReaderItem.kategori} · ${activeReaderItem.nomor_regulasi} · Tahun ${activeReaderItem.tahun}`
                  : 'Dokumen peraturan perundang-undangan desa terbaru dalam format PDF'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {activeReaderItem && (
              <>
                <a
                  href={activeReaderItem.file_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1.5 text-[11px] font-medium bg-white/10 hover:bg-white/20 text-white rounded-lg flex items-center gap-1"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Buka Tab Baru</span>
                </a>
                <button
                  type="button"
                  onClick={() => handleDownload(activeReaderItem)}
                  className="px-3 py-1.5 text-[11px] font-semibold bg-amber-400 hover:bg-amber-300 text-neutral-950 rounded-lg cursor-pointer flex items-center gap-1"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Unduh PDF</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-emerald-200 hover:text-white rounded-lg cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        {activeReaderItem ? (
          <div className="flex-1 flex flex-col bg-neutral-100 min-h-0">
            {activeReaderItem.tentang && (
              <div className="px-5 py-2.5 bg-neutral-50 border-b border-neutral-200 text-xs text-neutral-700">
                {activeReaderItem.tentang}
              </div>
            )}
            <iframe
              src={activeReaderItem.file_url}
              title={activeReaderItem.judul}
              className="w-full flex-1 border-0"
            />
          </div>
        ) : (
          <>
            {/* Search & Category Tabs */}
            <div className="p-4 border-b border-neutral-200 bg-neutral-50 space-y-3 shrink-0">
              <div className="flex flex-col sm:flex-row gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari nomor peraturan, judul, tahun, atau topik regulasi..."
                    className="w-full pl-9 pr-8 py-2 text-xs bg-white border border-neutral-300 rounded-lg text-neutral-900 focus:outline-hidden focus:ring-1 focus:ring-[#064E3B]"
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
                <button
                  type="button"
                  onClick={fetchPublicRegulasi}
                  disabled={isLoading}
                  className="px-3 py-2 text-xs font-medium text-neutral-700 bg-white hover:bg-neutral-100 border border-neutral-300 rounded-lg cursor-pointer flex items-center justify-center gap-1.5 shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                  <span>Segarkan</span>
                </button>
              </div>

              {categories.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
                  <button
                    type="button"
                    onClick={() => setSelectedKategori('all')}
                    className={`px-3 py-1.5 text-[11px] font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                      selectedKategori === 'all'
                        ? 'bg-[#064E3B] text-white'
                        : 'bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-100'
                    }`}
                  >
                    Semua ({items.length})
                  </button>
                  {categories.map((kat) => (
                    <button
                      key={kat}
                      type="button"
                      onClick={() => setSelectedKategori(kat)}
                      className={`px-3 py-1.5 text-[11px] font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                        selectedKategori === kat
                          ? 'bg-[#064E3B] text-white'
                          : 'bg-white border border-neutral-200 text-neutral-700 hover:bg-neutral-100'
                      }`}
                    >
                      {kat}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto divide-y divide-neutral-200">
              {isLoading ? (
                <div className="p-8 text-center text-xs text-neutral-500">
                  Memuat daftar regulasi publik...
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="p-10 text-center space-y-2">
                  <FileText className="w-10 h-10 text-neutral-300 mx-auto" />
                  <div className="text-sm font-semibold text-neutral-800">
                    {items.length === 0
                      ? 'Belum Ada Regulasi Publik yang Diterbitkan'
                      : 'Tidak Ada Regulasi yang Cocok'}
                  </div>
                  <p className="text-xs text-neutral-500 max-w-md mx-auto">
                    {items.length === 0
                      ? 'Admin belum mengunggah dokumen peraturan perundang-undangan untuk akses publik.'
                      : 'Coba kata kunci atau kategori regulasi lain.'}
                  </p>
                </div>
              ) : (
                filteredItems.map((item) => (
                  <div
                    key={item.id_regulasi}
                    className="p-4 sm:px-5 hover:bg-neutral-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-mono text-neutral-500">
                        <span className="font-semibold text-[#064E3B]">{item.kategori}</span>
                        <span aria-hidden="true">·</span>
                        <span className="text-neutral-700 font-medium">{item.nomor_regulasi}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">Tahun {item.tahun}</span>
                        {item.tanggal_penetapan && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{formatDateIndo(item.tanggal_penetapan)}</span>
                          </>
                        )}
                      </div>
                      <h3
                        onClick={() => setActiveReaderItem(item)}
                        className="text-sm font-bold text-neutral-900 hover:text-[#064E3B] cursor-pointer leading-snug"
                      >
                        {item.judul}
                      </h3>
                      {item.tentang && (
                        <p className="text-xs text-neutral-600 line-clamp-2">{item.tentang}</p>
                      )}
                      <div className="text-[11px] font-mono text-neutral-500 flex items-center gap-2">
                        <span>{formatBytes(item.file_size)}</span>
                        <span aria-hidden="true">·</span>
                        <span className="tabular-nums">{item.download_count || 0} unduhan</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setActiveReaderItem(item)}
                        className="px-3 py-1.5 text-xs font-medium text-[#064E3B] bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-lg cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Baca PDF</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDownload(item)}
                        className="px-3 py-1.5 text-xs font-semibold text-white bg-[#064E3B] hover:bg-[#043d2e] rounded-lg cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                      >
                        <Download className="w-3.5 h-3.5 text-amber-300" />
                        <span>Unduh</span>
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
