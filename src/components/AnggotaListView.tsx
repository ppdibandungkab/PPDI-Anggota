import React, { useState, useMemo, useEffect, useRef } from 'react';
import { usePPDI } from '../context/PPDIContext';
import { AnggotaFullDetail } from '../types/ppdi';
import {
  formatDateIndo,
  getWhatsAppKTAReminderUrl,
  getWhatsAppIuranReminderUrl,
  buildWhatsAppKTAReminderMessage,
  buildWhatsAppIuranReminderMessage,
  getPortalVerifikasiEktaUrl,
  formatPhoneForWhatsApp,
  dispatchWhatsAppNotification,
  isFonnteWebhookActive,
  formatNIPDDisplay,
} from '../utils/ppdiHelpers';
import { getPhotoUrl, getSkFileUrl, handleImageError } from '../utils/fileHelpers';
import { exportAnggotaToExcel, exportAnggotaToCSV, exportAnggotaToSheetJS } from '../utils/excelExport';
import {
  Search,
  Filter,
  Download,
  Plus,
  Eye,
  Edit2,
  Trash2,
  CreditCard,
  FileCheck,
  Building2,
  Phone,
  ClockAlert,
  AlertTriangle,
  CheckCircle,
  X,
  FileSpreadsheet,
  RefreshCw,
  MessageSquare,
  Send,
  Wallet,
  QrCode,
  ChevronLeft,
  ChevronRight,
  Printer,
} from 'lucide-react';
import { ExcelImportModal } from './ExcelImportModal';
import { QrLabelPrintModal } from './QrLabelPrintModal';
import { BulkKtaExportModal } from './BulkKtaExportModal';
import { BulkWhatsAppModal } from './BulkWhatsAppModal';
import { PermissionGate } from './PermissionGate';

interface AnggotaListViewProps {
  onOpenAddModal: () => void;
  onOpenDetailModal: (member: AnggotaFullDetail) => void;
  onOpenEditModal: (member: AnggotaFullDetail) => void;
  onSelectForKTA: (member: AnggotaFullDetail) => void;
  hasExternalModalOpen?: boolean;
}

export const AnggotaListView: React.FC<AnggotaListViewProps> = ({
  onOpenAddModal,
  onOpenDetailModal,
  onOpenEditModal,
  onSelectForKTA,
  hasExternalModalOpen = false,
}) => {
  const {
    visibleMembers,
    kecamatanList,
    desaList,
    jabatanList,
    deleteAnggota,
    currentUser,
    hasPermission,
    appSettings,
  } = usePPDI();

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterKecamatan, setFilterKecamatan] = useState('all');
  const [filterDesa, setFilterDesa] = useState('all');
  const [filterKategori, setFilterKategori] = useState('all');
  const [filterJabatan, setFilterJabatan] = useState('all');
  const [filterStatusKTA, setFilterStatusKTA] = useState('all');
  const [filterStatusPensiun, setFilterStatusPensiun] = useState('all');

  // Pagination state (default 25 rows per page)
  const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 250, 500] as const;
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [highlightedRowIndex, setHighlightedRowIndex] = useState<number>(-1);
  const rowRefs = useRef<Array<HTMLTableRowElement | null>>([]);

  // Delete Confirmation Modal & Notification State
  const [memberToDelete, setMemberToDelete] = useState<AnggotaFullDetail | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isQrLabelModalOpen, setIsQrLabelModalOpen] = useState(false);
  const [isBulkKtaModalOpen, setIsBulkKtaModalOpen] = useState(false);
  const [isBulkWaModalOpen, setIsBulkWaModalOpen] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());

  // WhatsApp Notification Dispatch Modal State
  const [waModalMember, setWaModalMember] = useState<AnggotaFullDetail | null>(null);
  const [waType, setWaType] = useState<'kta' | 'iuran'>('kta');
  const [isSendingWa, setIsSendingWa] = useState(false);

  const handleConfirmDelete = async () => {
    if (!memberToDelete) return;
    try {
      setIsDeleting(true);
      const deletedId = memberToDelete.anggota.id_anggota;
      const res = await deleteAnggota(deletedId);
      setSelectedMemberIds((prev) => {
        if (!prev.has(deletedId)) return prev;
        const next = new Set(prev);
        next.delete(deletedId);
        return next;
      });
      setToastMessage({
        type: 'success',
        text: res?.message || `Data perangkat desa "${memberToDelete.anggota.nama_lengkap}" berhasil dihapus.`,
      });
      setMemberToDelete(null);
    } catch (err: any) {
      setToastMessage({
        type: 'error',
        text: err?.message || 'Gagal menghapus anggota dari sistem.',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Filtered desa dropdown options based on selected kecamatan
  const availableDesa = useMemo(() => {
    if (filterKecamatan === 'all') return desaList;
    const cleanKec = filterKecamatan.replace(/\./g, '');
    return desaList.filter((d) => d.id_kecamatan.replace(/\./g, '') === cleanKec);
  }, [filterKecamatan, desaList]);

  // Apply filters
  const filteredList = useMemo(() => {
    return visibleMembers.filter((m) => {
      // Search
      const q = searchQuery.toLowerCase().trim();
      if (q) {
        const matchNik = m.anggota.nik.toLowerCase().includes(q);
        const matchName = m.anggota.nama_lengkap.toLowerCase().includes(q);
        const compactQ = q.replace(/\s+/g, '');
        const rawNipd = (m.anggota.nipd || '').toLowerCase();
        const matchNiap =
          rawNipd.includes(q) ||
          (compactQ.length > 0 && rawNipd.replace(/\s+/g, '').includes(compactQ));
        const matchKta = m.keanggotaan?.no_kta.toLowerCase().includes(q) ?? false;
        const matchDesa = m.desa?.nama_desa.toLowerCase().includes(q) ?? false;
        const matchKec = m.kecamatan?.nama_kecamatan.toLowerCase().includes(q) ?? false;
        if (!matchNik && !matchName && !matchNiap && !matchKta && !matchDesa && !matchKec) {
          return false;
        }
      }

      // Kecamatan filter
      if (filterKecamatan !== 'all') {
        const cleanKec = filterKecamatan.replace(/\./g, '');
        const memberKec = (m.kecamatan?.id_kecamatan || m.desa?.id_kecamatan || '').replace(/\./g, '');
        if (memberKec !== cleanKec) return false;
      }

      // Desa filter
      if (filterDesa !== 'all') {
        const cleanDesa = filterDesa.replace(/\./g, '');
        const memberDesa = (m.desa?.id_desa || m.jabatanTerkini?.id_desa || '').replace(/\./g, '');
        if (memberDesa !== cleanDesa) return false;
      }

      // Kategori Jabatan / Unit Kerja filter
      if (filterKategori !== 'all') {
        const kat = m.jabatanRef?.kategori_jabatan;
        if (kat !== filterKategori) return false;
      }

      // Specific Jabatan filter
      if (filterJabatan !== 'all') {
        const jId = String(m.jabatanRef?.id_jabatan || m.jabatanTerkini?.id_jabatan || '');
        if (jId !== filterJabatan) return false;
      }

      // KTA status filter
      if (filterStatusKTA !== 'all' && m.keanggotaan?.status_kta !== filterStatusKTA) {
        return false;
      }

      // Pensiun filter
      if (filterStatusPensiun !== 'all') {
        if (filterStatusPensiun === 'kritis' && m.statusPensiun !== 'Kritis (<6 Bln)' && m.statusPensiun !== 'Siaga (<1 Thn)') {
          return false;
        }
        if (filterStatusPensiun === 'purna' && m.statusPensiun !== 'Sudah Purna Tugas') {
          return false;
        }
      }

      return true;
    });
  }, [
    visibleMembers,
    searchQuery,
    filterKecamatan,
    filterDesa,
    filterKategori,
    filterJabatan,
    filterStatusKTA,
    filterStatusPensiun,
  ]);

  // Pagination derived values
  const totalFiltered = filteredList.length;
  const totalPages = Math.max(1, Math.ceil(totalFiltered / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const startIndex = (safeCurrentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalFiltered);

  const paginatedList = useMemo(() => {
    return filteredList.slice(startIndex, startIndex + pageSize);
  }, [filteredList, startIndex, pageSize]);

  // Reset to page 1 when filters, search, or page size change
  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchQuery,
    filterKecamatan,
    filterDesa,
    filterKategori,
    filterJabatan,
    filterStatusKTA,
    filterStatusPensiun,
    pageSize,
  ]);

  // Keep currentPage valid if filteredList shrinks (e.g. after delete)
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const pageNumbers = useMemo<(number | 'ellipsis-left' | 'ellipsis-right')[]>(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: (number | 'ellipsis-left' | 'ellipsis-right')[] = [1];
    const left = Math.max(2, safeCurrentPage - 1);
    const right = Math.min(totalPages - 1, safeCurrentPage + 1);
    if (left > 2) pages.push('ellipsis-left');
    for (let p = left; p <= right; p++) pages.push(p);
    if (right < totalPages - 1) pages.push('ellipsis-right');
    pages.push(totalPages);
    return pages;
  }, [totalPages, safeCurrentPage]);

  // Reset highlighted row when page or filter criteria change
  useEffect(() => {
    setHighlightedRowIndex(-1);
  }, [
    safeCurrentPage,
    pageSize,
    searchQuery,
    filterKecamatan,
    filterDesa,
    filterKategori,
    filterJabatan,
    filterStatusKTA,
    filterStatusPensiun,
  ]);

  // Clamp highlightedRowIndex if paginatedList shrinks
  useEffect(() => {
    if (highlightedRowIndex >= paginatedList.length) {
      setHighlightedRowIndex(paginatedList.length - 1);
    }
  }, [highlightedRowIndex, paginatedList.length]);

  // Auto-scroll highlighted table row into view
  useEffect(() => {
    if (highlightedRowIndex >= 0) {
      rowRefs.current[highlightedRowIndex]?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [highlightedRowIndex]);

  // Global keyboard navigation: ArrowUp / ArrowDown / Enter on table, Esc to close active modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (waModalMember) {
          if (!isSendingWa) {
            e.preventDefault();
            setWaModalMember(null);
          }
          return;
        }
        if (memberToDelete) {
          if (!isDeleting) {
            e.preventDefault();
            setMemberToDelete(null);
          }
          return;
        }
        if (isBulkWaModalOpen) {
          e.preventDefault();
          setIsBulkWaModalOpen(false);
          return;
        }
        if (isBulkKtaModalOpen) {
          e.preventDefault();
          setIsBulkKtaModalOpen(false);
          return;
        }
        if (isQrLabelModalOpen) {
          e.preventDefault();
          setIsQrLabelModalOpen(false);
          return;
        }
        if (isImportModalOpen) {
          e.preventDefault();
          setIsImportModalOpen(false);
          return;
        }
        if (!hasExternalModalOpen && !document.querySelector('.fixed.inset-0') && highlightedRowIndex >= 0) {
          setHighlightedRowIndex(-1);
        }
        return;
      }

      const anyInternalModalOpen = Boolean(
        waModalMember ||
          memberToDelete ||
          isBulkWaModalOpen ||
          isBulkKtaModalOpen ||
          isQrLabelModalOpen ||
          isImportModalOpen
      );
      if (anyInternalModalOpen || hasExternalModalOpen || document.querySelector('.fixed.inset-0')) {
        return;
      }

      const target = e.target as HTMLElement | null;
      const tagName = target?.tagName?.toUpperCase() || '';
      const isEditable =
        tagName === 'INPUT' ||
        tagName === 'TEXTAREA' ||
        tagName === 'SELECT' ||
        Boolean(target?.isContentEditable);
      if (isEditable) return;

      if (e.key === 'ArrowDown') {
        if (paginatedList.length === 0) return;
        e.preventDefault();
        setHighlightedRowIndex((prev) =>
          prev < 0 ? 0 : Math.min(paginatedList.length - 1, prev + 1)
        );
      } else if (e.key === 'ArrowUp') {
        if (paginatedList.length === 0) return;
        e.preventDefault();
        setHighlightedRowIndex((prev) =>
          prev < 0 ? paginatedList.length - 1 : Math.max(0, prev - 1)
        );
      } else if (e.key === 'Enter') {
        const isButtonOrLink = tagName === 'BUTTON' || tagName === 'A';
        if (!isButtonOrLink && highlightedRowIndex >= 0 && paginatedList[highlightedRowIndex]) {
          e.preventDefault();
          onOpenDetailModal(paginatedList[highlightedRowIndex]);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    paginatedList,
    highlightedRowIndex,
    onOpenDetailModal,
    waModalMember,
    isSendingWa,
    memberToDelete,
    isDeleting,
    isBulkWaModalOpen,
    isBulkKtaModalOpen,
    isQrLabelModalOpen,
    isImportModalOpen,
    hasExternalModalOpen,
  ]);

  // Selection helpers (scoped safely by visibleMembers)
  const selectedMembersList = useMemo(() => {
    if (selectedMemberIds.size === 0) return [];
    return visibleMembers.filter((m) => selectedMemberIds.has(m.anggota.id_anggota));
  }, [visibleMembers, selectedMemberIds]);

  const allPageSelected =
    paginatedList.length > 0 &&
    paginatedList.every((m) => selectedMemberIds.has(m.anggota.id_anggota));

  const somePageSelected = paginatedList.some((m) =>
    selectedMemberIds.has(m.anggota.id_anggota)
  );

  const toggleMemberSelection = (idAnggota: string) => {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(idAnggota)) {
        next.delete(idAnggota);
      } else {
        next.add(idAnggota);
      }
      return next;
    });
  };

  const toggleSelectAllPage = () => {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev);
      if (allPageSelected) {
        paginatedList.forEach((m) => next.delete(m.anggota.id_anggota));
      } else {
        paginatedList.forEach((m) => next.add(m.anggota.id_anggota));
      }
      return next;
    });
  };

  const selectAllFiltered = () => {
    setSelectedMemberIds((prev) => {
      const next = new Set(prev);
      filteredList.forEach((m) => next.add(m.anggota.id_anggota));
      return next;
    });
  };

  const clearSelection = () => {
    setSelectedMemberIds(new Set());
  };

  const [isExportingExcel, setIsExportingExcel] = useState(false);

  // Export to Excel function using ExcelJS
  const handleExportExcel = async () => {
    try {
      setIsExportingExcel(true);
      await exportAnggotaToExcel(filteredList);
    } catch (err: any) {
      console.error('Error exporting Excel:', err);
      alert('Gagal mendownload file Excel: ' + (err.message || 'Error'));
    } finally {
      setIsExportingExcel(false);
    }
  };

  const [isExportingSheetJS, setIsExportingSheetJS] = useState(false);
  const handleExportSheetJS = () => {
    try {
      setIsExportingSheetJS(true);
      exportAnggotaToSheetJS(filteredList);
    } catch (err: any) {
      console.error('Error exporting SheetJS:', err);
      alert('Gagal mendownload file SheetJS: ' + (err.message || 'Error'));
    } finally {
      setIsExportingSheetJS(false);
    }
  };

  // Export to CSV function
  const handleExportCSVClick = () => {
    exportAnggotaToCSV(filteredList);
  };

  // Trigger print-friendly table view
  const handlePrintTable = () => {
    setHighlightedRowIndex(-1);
    requestAnimationFrame(() => {
      window.print();
    });
  };

  return (
    <>
    <div className={`space-y-4 print:space-y-0 ${isQrLabelModalOpen ? 'no-print' : 'anggota-print-root'}`}>
      {/* Page Header */}
      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-neutral-200 gap-3">
        <div>
          <h1 className="text-xl font-bold text-neutral-900 tracking-tight">
            Data Induk Perangkat Desa (Anggota PPDI)
          </h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Database relasional aparatur pemerintah desa dengan NIK, NIPD, SK Pengangkatan, & No KTA
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <PermissionGate module="anggota" action="create">
            <button
              onClick={() => setIsImportModalOpen(true)}
              className="px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
              <span>Import Data Excel</span>
            </button>
          </PermissionGate>

          <PermissionGate module="anggota" action="view">
            <button
              onClick={handleExportExcel}
              disabled={isExportingExcel}
              title="Download Data Anggota Terfilter dalam Format Excel (.xlsx)"
              className="px-3 py-1.5 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 border border-emerald-800 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs disabled:opacity-50"
            >
              {isExportingExcel ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-white" />
              ) : (
                <FileSpreadsheet className="w-3.5 h-3.5 text-amber-300" />
              )}
              <span>{isExportingExcel ? 'Mengekspor...' : 'Ekspor Excel (.xlsx)'}</span>
            </button>

            <button
              onClick={handleExportSheetJS}
              disabled={isExportingSheetJS}
              title="Download Data Anggota Terfilter menggunakan SheetJS (.xlsx)"
              className="px-3 py-1.5 text-xs font-bold text-emerald-900 bg-emerald-100 hover:bg-emerald-200 border border-emerald-300 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs disabled:opacity-50"
            >
              {isExportingSheetJS ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-800" />
              ) : (
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" />
              )}
              <span>{isExportingSheetJS ? 'Memproses...' : 'Ekspor SheetJS (.xlsx)'}</span>
            </button>

            <button
              onClick={handleExportCSVClick}
              title="Download Data Anggota Terfilter dalam Format CSV"
              className="px-3 py-1.5 text-xs font-semibold text-neutral-700 bg-white hover:bg-neutral-50 border border-neutral-300 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <Download className="w-3.5 h-3.5 text-neutral-600" />
              <span>Ekspor CSV</span>
            </button>

            <button
              type="button"
              onClick={handlePrintTable}
              aria-label="Print tabel anggota"
              title="Cetak tampilan tabel data anggota saat ini (Print-friendly)"
              className="px-3 py-1.5 text-xs font-semibold text-neutral-800 bg-white hover:bg-neutral-100 border border-neutral-300 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <Printer className="w-3.5 h-3.5 text-[#064E3B]" />
              <span>Print</span>
            </button>

            <button
              type="button"
              onClick={() => setIsQrLabelModalOpen(true)}
              title="Cetak Label QR Barcode Unik Anggota sesuai hak akses role"
              className="px-3 py-1.5 text-xs font-bold text-neutral-950 bg-amber-400 hover:bg-amber-300 border border-amber-500/60 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <QrCode className="w-3.5 h-3.5 text-[#064E3B]" />
              <span>Cetak Label QR</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (selectedMembersList.length === 0) {
                  setToastMessage({
                    type: 'error',
                    text: 'Centang terlebih dahulu minimal 1 anggota pada tabel untuk mengunduh E-KTA massal.',
                  });
                  return;
                }
                setIsBulkKtaModalOpen(true);
              }}
              title="Unduh Massal E-KTA ke PDF untuk anggota yang dicentang"
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs border ${
                selectedMembersList.length > 0
                  ? 'text-white bg-[#064E3B] hover:bg-[#043d2e] border-[#064E3B]'
                  : 'text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border-emerald-300'
              }`}
            >
              <CreditCard className="w-3.5 h-3.5 text-amber-300" />
              <span>
                Export PDF
                {selectedMembersList.length > 0 ? ` (${selectedMembersList.length})` : ''}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (selectedMembersList.length === 0) {
                  setToastMessage({
                    type: 'error',
                    text: 'Centang terlebih dahulu minimal 1 anggota pada tabel untuk mengirim notifikasi WhatsApp massal.',
                  });
                  return;
                }
                setIsBulkWaModalOpen(true);
              }}
              title="Kirim Notifikasi WhatsApp Massal via Fonnte untuk anggota yang dicentang"
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs border ${
                selectedMembersList.length > 0
                  ? 'text-white bg-emerald-700 hover:bg-emerald-800 border-emerald-800'
                  : 'text-emerald-900 bg-emerald-50 hover:bg-emerald-100 border-emerald-300'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 text-emerald-200" />
              <span>
                Kirim WA Massal
                {selectedMembersList.length > 0 ? ` (${selectedMembersList.length})` : ''}
              </span>
            </button>
          </PermissionGate>

          <PermissionGate module="anggota" action="create">
            <button
              onClick={onOpenAddModal}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-800 hover:bg-emerald-900 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Perangkat</span>
            </button>
          </PermissionGate>
        </div>
      </div>

      {/* Toast Notification Banner */}
      {toastMessage && (
        <div
          className={`no-print p-3 rounded-xl border flex items-center justify-between text-xs shadow-xs transition-all ${
            toastMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-red-50 border-red-200 text-red-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {toastMessage.type === 'success' ? (
              <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span className="font-medium">{toastMessage.text}</span>
          </div>
          <button
            onClick={() => setToastMessage(null)}
            className="text-neutral-400 hover:text-neutral-700 p-1 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Real-time Quick Search & Filter Container */}
      <div className="no-print bg-white p-4 rounded-xl border border-neutral-200 shadow-2xs space-y-3">
        {/* Prominent Real-time Search Input Column */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-neutral-700">
            <span className="flex items-center gap-1.5 uppercase font-mono tracking-wider text-[11px] text-[#064E3B]">
              <Search className="w-3.5 h-3.5 text-emerald-700" />
              <span>Pencarian Real-Time Anggota / Nomor KTA</span>
            </span>
            {searchQuery && (
              <span className="text-[11px] font-mono text-emerald-800 font-bold bg-emerald-50 px-2.5 py-0.5 rounded-md border border-emerald-200">
                Ditemukan {filteredList.length} dari {visibleMembers.length} Anggota
              </span>
            )}
          </div>
          <div className="relative flex items-center">
            <Search className="w-4.5 h-4.5 text-emerald-700 absolute left-3.5 pointer-events-none" />
            <input
              type="text"
              placeholder="Ketik Nama Lengkap, Nomor KTA Digital (mis. 32.04...), NIK 16 digit, NIPD , Desa, atau Kecamatan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-10 py-2.5 text-xs font-mono bg-emerald-50/40 border border-emerald-300/80 rounded-xl text-neutral-900 focus:outline-none focus:ring-2 focus:ring-[#064E3B] focus:border-transparent focus:bg-white shadow-2xs transition-all font-medium placeholder:text-neutral-400"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 p-1 text-neutral-400 hover:text-neutral-700 rounded-full hover:bg-neutral-200 transition-colors cursor-pointer"
                title="Hapus kata kunci pencarian"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Filter Controls Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
          {/* Kecamatan */}
          <div>
            <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">
              Kecamatan
            </label>
            <select
              aria-label="Filter Kecamatan"
              value={filterKecamatan}
              onChange={(e) => {
                setFilterKecamatan(e.target.value);
                setFilterDesa('all');
              }}
              className="w-full bg-neutral-50 border border-neutral-200 rounded-md px-2 py-1.5 text-xs text-neutral-800 focus:outline-hidden font-mono"
            >
              <option value="all">Semua Kecamatan</option>
              {kecamatanList.map((k) => (
                <option key={k.id_kecamatan} value={k.id_kecamatan}>
                  Kec. {k.nama_kecamatan}
                </option>
              ))}
            </select>
          </div>

          {/* Desa */}
          <div>
            <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">
              Desa / Unit Wilayah
            </label>
            <select
              aria-label="Filter Desa"
              value={filterDesa}
              onChange={(e) => setFilterDesa(e.target.value)}
              className="w-full bg-neutral-50 border border-neutral-200 rounded-md px-2 py-1.5 text-xs text-neutral-800 focus:outline-hidden font-mono"
            >
              <option value="all">Semua Desa</option>
              {availableDesa.map((d) => (
                <option key={d.id_desa} value={d.id_desa}>
                  Desa {d.nama_desa}
                </option>
              ))}
            </select>
          </div>

          {/* Unit Kerja / Kategori Jabatan */}
          <div>
            <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">
              Unit Kerja Pemdes
            </label>
            <select
              aria-label="Filter Unit Kerja Pemdes"
              value={filterKategori}
              onChange={(e) => setFilterKategori(e.target.value)}
              className="w-full bg-neutral-50 border border-neutral-200 rounded-md px-2 py-1.5 text-xs text-neutral-800 focus:outline-hidden font-mono"
            >
              <option value="all">Semua Unit Kerja</option>
              <option value="Kepala Desa">Kepala Desa</option>
              <option value="Sekretariat">Sekretariat Desa (Kaur/Sekdes)</option>
              <option value="Pelaksana Teknis">Pelaksana Teknis (Kasi)</option>
              <option value="Pelaksana Kewilayahan">Pelaksana Kewilayahan (Kadus)</option>
              <option value="Staf Desa">Staf Desa</option>
            </select>
          </div>

          {/* Formasi Jabatan */}
          <div>
            <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">
              Formasi Jabatan
            </label>
            <select
              aria-label="Filter Formasi Jabatan"
              value={filterJabatan}
              onChange={(e) => setFilterJabatan(e.target.value)}
              className="w-full bg-neutral-50 border border-neutral-200 rounded-md px-2 py-1.5 text-xs text-neutral-800 focus:outline-hidden font-mono"
            >
              <option value="all">Semua Formasi</option>
              {jabatanList.map((j) => (
                <option key={j.id_jabatan} value={String(j.id_jabatan)}>
                  {j.nama_jabatan}
                </option>
              ))}
            </select>
          </div>

          {/* Status KTA */}
          <div>
            <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">
              Status KTA
            </label>
            <select
              aria-label="Filter Status KTA"
              value={filterStatusKTA}
              onChange={(e) => setFilterStatusKTA(e.target.value)}
              className="w-full bg-neutral-50 border border-neutral-200 rounded-md px-2 py-1.5 text-xs text-neutral-800 focus:outline-hidden font-mono"
            >
              <option value="all">Semua Status KTA</option>
              <option value="Aktif">Aktif</option>
              <option value="Pending">Pending / Verifikasi</option>
              <option value="Non-Aktif">Non-Aktif</option>
            </select>
          </div>

          {/* Batas Pensiun */}
          <div>
            <label className="block text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1">
              Purna Tugas (60 Th)
            </label>
            <select
              aria-label="Filter Status Purna Tugas"
              value={filterStatusPensiun}
              onChange={(e) => setFilterStatusPensiun(e.target.value)}
              className="w-full bg-neutral-50 border border-neutral-200 rounded-md px-2 py-1.5 text-xs text-neutral-800 focus:outline-hidden font-mono"
            >
              <option value="all">Semua Usia</option>
              <option value="kritis">Mendekati Pensiun (&lt; 1 Thn)</option>
              <option value="purna">Sudah Genap 60 Thn</option>
            </select>
          </div>
        </div>

        {/* Reset Filter Bar if any filter is active */}
        {(filterKecamatan !== 'all' ||
          filterDesa !== 'all' ||
          filterKategori !== 'all' ||
          filterJabatan !== 'all' ||
          filterStatusKTA !== 'all' ||
          filterStatusPensiun !== 'all' ||
          searchQuery) && (
          <div className="pt-2 border-t border-neutral-100 flex items-center justify-between text-xs animate-in fade-in duration-150">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-neutral-600 font-mono">
              <span className="font-bold text-emerald-800">Filter Aktif:</span>
              {filterKecamatan !== 'all' && (
                <span className="bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded border border-emerald-300 font-bold">
                  Kec. {kecamatanList.find((k) => k.id_kecamatan === filterKecamatan)?.nama_kecamatan || filterKecamatan}
                </span>
              )}
              {filterDesa !== 'all' && (
                <span className="bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded border border-emerald-300 font-bold">
                  Desa {desaList.find((d) => d.id_desa === filterDesa)?.nama_desa || filterDesa}
                </span>
              )}
              {filterKategori !== 'all' && (
                <span className="bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded border border-emerald-300 font-bold">
                  Unit: {filterKategori}
                </span>
              )}
              {filterJabatan !== 'all' && (
                <span className="bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded border border-emerald-300 font-bold">
                  Jabatan: {jabatanList.find((j) => String(j.id_jabatan) === filterJabatan)?.nama_jabatan || filterJabatan}
                </span>
              )}
              {filterStatusKTA !== 'all' && (
                <span className="bg-emerald-100 text-emerald-900 px-2 py-0.5 rounded border border-emerald-300 font-bold">
                  KTA: {filterStatusKTA}
                </span>
              )}
              {filterStatusPensiun !== 'all' && (
                <span className="bg-amber-100 text-amber-900 px-2 py-0.5 rounded border border-amber-300 font-bold">
                  Pensiun: {filterStatusPensiun}
                </span>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setFilterKecamatan('all');
                setFilterDesa('all');
                setFilterKategori('all');
                setFilterJabatan('all');
                setFilterStatusKTA('all');
                setFilterStatusPensiun('all');
              }}
              className="px-2.5 py-1 text-[11px] font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg cursor-pointer transition-colors shrink-0"
            >
              Reset Semua Filter
            </button>
          </div>
        )}
      </div>

      {/* Total Found & Page Size Dropdown Bar */}
      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-neutral-500 px-1">
        <span>
          {totalFiltered === 0 ? (
            <>
              Menampilkan <strong className="text-neutral-900 font-semibold tabular-nums">0</strong> dari{' '}
              <span className="tabular-nums">{visibleMembers.length}</span> perangkat desa
            </>
          ) : (
            <>
              Menampilkan{' '}
              <strong className="text-neutral-900 font-semibold tabular-nums">
                {startIndex + 1}–{endIndex}
              </strong>{' '}
              dari <strong className="text-neutral-900 font-semibold tabular-nums">{totalFiltered}</strong> perangkat desa
              {totalFiltered !== visibleMembers.length && (
                <span className="text-neutral-400"> (total {visibleMembers.length})</span>
              )}
            </>
          )}
        </span>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <label htmlFor="anggota-page-size" className="text-neutral-600 font-medium whitespace-nowrap">
              Tampilkan:
            </label>
            <select
              id="anggota-page-size"
              aria-label="Jumlah data yang ditampilkan"
              value={pageSize}
              onChange={(e) => setPageSize(Number(e.target.value))}
              className="bg-white border border-neutral-300 rounded-md px-2 py-1 text-xs font-mono font-semibold text-neutral-800 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#064E3B]/20 focus:border-[#064E3B] shadow-2xs"
            >
              {PAGE_SIZE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>
                  {opt} data
                </option>
              ))}
            </select>
          </div>
          <span className="text-[11px] hidden lg:inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-neutral-100 border border-neutral-200 font-mono text-neutral-600">
            ↑↓ Sorot Baris · Enter Detail · Esc Tutup Modal
          </span>
          <span className="text-[11px] hidden md:inline text-neutral-400">
            Format No. KTA: 32.04.[KodeKec].[KodeDesa].[NoUrut]
          </span>
        </div>
      </div>

      {/* Bulk Selection Action Bar */}
      {selectedMembersList.length > 0 && (
        <div className="no-print bg-emerald-900 text-white px-4 py-2.5 rounded-xl shadow-md border border-emerald-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-amber-400 text-neutral-950 font-extrabold text-[11px] flex items-center justify-center shrink-0">
              {selectedMembersList.length}
            </span>
            <div>
              <span className="font-bold">
                {selectedMembersList.length} Perangkat Desa Dipilih
              </span>
              <span className="text-emerald-200 ml-2 hidden sm:inline">
                Siap diunduh ke PDF E-KTA atau dikirimi notifikasi WhatsApp massal
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {allPageSelected && filteredList.length > selectedMembersList.length && (
              <button
                type="button"
                onClick={selectAllFiltered}
                className="px-3 py-1.5 text-xs font-semibold text-amber-200 hover:text-amber-100 hover:bg-emerald-800 rounded-lg border border-amber-400/40 transition-colors cursor-pointer"
              >
                Pilih Semua ({filteredList.length})
              </button>
            )}
            <button
              type="button"
              onClick={clearSelection}
              className="px-3 py-1.5 text-xs font-medium text-emerald-100 hover:text-white hover:bg-emerald-800 rounded-lg border border-emerald-700 transition-colors cursor-pointer"
            >
              Kosongkan Pilihan
            </button>
            <button
              type="button"
              onClick={() => setIsBulkWaModalOpen(true)}
              className="px-3.5 py-1.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 border border-emerald-400/50 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Kirim Notif WA Massal</span>
            </button>
            <button
              type="button"
              onClick={() => setIsBulkKtaModalOpen(true)}
              className="px-3.5 py-1.5 text-xs font-bold text-neutral-950 bg-amber-400 hover:bg-amber-300 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export PDF ({selectedMembersList.length})</span>
            </button>
          </div>
        </div>
      )}

      {/* Print-Only Report Header */}
      <div className="hidden print:block mb-3 pb-2 border-b-2 border-neutral-800">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-600">
              {appSettings?.appName || 'PPDI KABUPATEN BANDUNG'}
            </p>
            <h2 className="text-base font-bold text-neutral-900 uppercase tracking-tight">
              Data Induk Perangkat Desa (Anggota PPDI)
            </h2>
          </div>
          <div className="text-right text-[10px] font-mono text-neutral-600">
            <div>
              Menampilkan {totalFiltered === 0 ? '0' : `${startIndex + 1}–${endIndex}`} dari {totalFiltered} data
              {totalPages > 1 ? ` (Hal. ${safeCurrentPage}/${totalPages})` : ''}
            </div>
            <div>
              Dicetak:{' '}
              {new Date().toLocaleString('id-ID', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </div>
          </div>
        </div>
        {(filterKecamatan !== 'all' ||
          filterDesa !== 'all' ||
          filterKategori !== 'all' ||
          filterJabatan !== 'all' ||
          filterStatusKTA !== 'all' ||
          filterStatusPensiun !== 'all' ||
          searchQuery) && (
          <div className="mt-1.5 text-[10px] font-mono text-neutral-700 flex flex-wrap gap-x-3 gap-y-0.5">
            <span className="font-bold">Filter aktif:</span>
            {searchQuery && <span>Cari: "{searchQuery}"</span>}
            {filterKecamatan !== 'all' && (
              <span>
                Kec.{' '}
                {kecamatanList.find((k) => k.id_kecamatan === filterKecamatan)?.nama_kecamatan ||
                  filterKecamatan}
              </span>
            )}
            {filterDesa !== 'all' && (
              <span>
                Desa {desaList.find((d) => d.id_desa === filterDesa)?.nama_desa || filterDesa}
              </span>
            )}
            {filterKategori !== 'all' && <span>Unit: {filterKategori}</span>}
            {filterJabatan !== 'all' && (
              <span>
                Jabatan:{' '}
                {jabatanList.find((j) => String(j.id_jabatan) === filterJabatan)?.nama_jabatan ||
                  filterJabatan}
              </span>
            )}
            {filterStatusKTA !== 'all' && <span>KTA: {filterStatusKTA}</span>}
            {filterStatusPensiun !== 'all' && <span>Pensiun: {filterStatusPensiun}</span>}
          </div>
        )}
      </div>

      {/* Main High-Density Table */}
      <div className="bg-white rounded-xl border border-neutral-200 overflow-hidden shadow-xs anggota-print-table-wrapper">
        <div className="overflow-x-auto anggota-print-table-scroll">
          <table className="w-full text-left border-collapse text-xs anggota-print-table">
            <thead>
              <tr className="bg-neutral-50 border-b border-neutral-200 text-neutral-600 font-semibold">
                <th className="no-print py-3 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    aria-label="Pilih semua anggota pada halaman ini"
                    checked={allPageSelected}
                    ref={(el) => {
                      if (el) {
                        el.indeterminate = somePageSelected && !allPageSelected;
                      }
                    }}
                    onChange={toggleSelectAllPage}
                    className="w-4 h-4 rounded border-neutral-300 text-[#064E3B] focus:ring-[#064E3B] cursor-pointer accent-[#064E3B]"
                  />
                </th>
                <th className="py-3 px-3 w-11 text-center">No</th>
                <th className="py-3 px-4">Profil & NIK</th>
                <th className="py-3 px-4">Wilayah Tugas</th>
                <th className="py-3 px-4">Jabatan & SK</th>
                <th className="py-3 px-4">No. KTA PPDI</th>
                <th className="py-3 px-4">Usia & Pensiun</th>
                <th className="py-3 px-4 text-center">Status KTA</th>
                <th className="no-print py-3 px-4 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 text-neutral-800">
              {paginatedList.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-neutral-400">
                    <p className="font-medium text-neutral-600">Tidak ada data perangkat desa yang sesuai</p>
                    <p className="text-xs mt-1">Coba sesuaikan kata kunci pencarian atau reset filter wilayah</p>
                  </td>
                </tr>
              ) : (
                paginatedList.map((item, idx) => {
                  const hasFullName = (
                    (item.anggota.gelar_depan ? `${item.anggota.gelar_depan} ` : '') +
                    item.anggota.nama_lengkap +
                    (item.anggota.gelar_belakang ? `, ${item.anggota.gelar_belakang}` : '')
                  ).toUpperCase();
                  const isSelected = selectedMemberIds.has(item.anggota.id_anggota);
                  const isHighlighted = idx === highlightedRowIndex;

                  return (
                    <tr
                      key={item.anggota.id_anggota}
                      ref={(el) => {
                        rowRefs.current[idx] = el;
                      }}
                      aria-selected={isHighlighted}
                      onClick={(e) => {
                        const targetEl = e.target as HTMLElement;
                        if (targetEl.closest('button, input, a')) return;
                        setHighlightedRowIndex(idx);
                      }}
                      className={`transition-colors print:bg-transparent print:ring-0 ${
                        isHighlighted
                          ? 'bg-amber-50/90 ring-2 ring-inset ring-[#064E3B]'
                          : isSelected
                          ? 'bg-emerald-50/70 hover:bg-emerald-50'
                          : 'hover:bg-neutral-50/70'
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="no-print py-2.5 px-3 text-center">
                        <input
                          type="checkbox"
                          aria-label={`Pilih ${item.anggota.nama_lengkap}`}
                          checked={isSelected}
                          onChange={() => toggleMemberSelection(item.anggota.id_anggota)}
                          className="w-4 h-4 rounded border-neutral-300 text-[#064E3B] focus:ring-[#064E3B] cursor-pointer accent-[#064E3B]"
                        />
                      </td>

                      {/* No */}
                      <td className="py-2.5 px-3 text-center font-mono text-neutral-400 print:text-neutral-700 tabular-nums">
                        {startIndex + idx + 1}
                      </td>

                      {/* Profil & NIK */}
                      <td className="py-2.5 px-4">
                        <div className="flex items-center gap-2.5">
                          <img
                            src={getPhotoUrl(item.anggota.foto, item.anggota.jenis_kelamin)}
                            alt={item.anggota.nama_lengkap.toUpperCase()}
                            className="w-8 h-8 rounded-full object-cover shrink-0 border border-neutral-200 print:hidden"
                            onError={(e) => handleImageError(e, item.anggota.jenis_kelamin)}
                            referrerPolicy="no-referrer"
                          />
                          <div>
                            <div className="font-semibold text-neutral-900 hover:text-emerald-800 cursor-pointer uppercase tracking-tight" onClick={() => onOpenDetailModal(item)}>
                              {hasFullName}
                            </div>
                            <div className="text-[11px] text-neutral-500 font-mono flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                              <span>NIK: {item.anggota.nik}</span>
                              {item.anggota.nipd && (
                                <>
                                  <span>·</span>
                                  <span>NIPD: {formatNIPDDisplay(item.anggota.nipd)}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Wilayah Tugas */}
                      <td className="py-2.5 px-4">
                        <div className="font-medium text-neutral-900">
                          Desa {item.desa?.nama_desa || '-'}
                        </div>
                        <div className="text-[11px] text-neutral-500">
                          Kec. {item.kecamatan?.nama_kecamatan || '-'}
                        </div>
                      </td>

                      {/* Jabatan & SK */}
                      <td className="py-2.5 px-4">
                        <div className="font-semibold text-neutral-800">
                          {item.jabatanRef?.nama_jabatan || '-'}
                        </div>
                        <div className="text-[11px] text-neutral-500 font-mono">
                          {item.jabatanTerkini?.no_sk_pengangkatan ? (
                            <span>SK: {item.jabatanTerkini.no_sk_pengangkatan}</span>
                          ) : (
                            <span>Belum ada SK terinput</span>
                          )}
                        </div>
                      </td>

                      {/* No KTA PPDI */}
                      <td className="py-2.5 px-4 font-mono text-[11px]">
                        {item.keanggotaan?.no_kta ? (
                          <div className="font-medium text-neutral-900">{item.keanggotaan.no_kta}</div>
                        ) : (
                          <span className="text-neutral-400">Belum Terbit</span>
                        )}
                        <div className="text-neutral-500 text-[10px]">
                          {item.keanggotaan?.jabatan_pengurus || 'Anggota Biasa'}
                        </div>
                      </td>

                      {/* Usia & Pensiun */}
                      <td className="py-2.5 px-4">
                        <div className="tabular-nums font-medium text-neutral-900">
                          {item.usia} Thn{' '}
                          <span className="text-neutral-400 text-[11px]">
                            ({formatDateIndo(item.anggota.tanggal_lahir)})
                          </span>
                        </div>
                        <div className="text-[11px] mt-0.5">
                          {item.statusPensiun === 'Kritis (<6 Bln)' ? (
                            <span className="text-red-700 font-semibold flex items-center gap-1">
                              <ClockAlert className="w-3 h-3" />
                              Pensiun &lt;6 Bulan
                            </span>
                          ) : item.statusPensiun === 'Siaga (<1 Thn)' ? (
                            <span className="text-amber-700 font-semibold flex items-center gap-1">
                              <ClockAlert className="w-3 h-3" />
                              Pensiun &lt;1 Tahun
                            </span>
                          ) : item.statusPensiun === 'Sudah Purna Tugas' ? (
                            <span className="text-neutral-500 font-medium">Purna Tugas (60 Th)</span>
                          ) : (
                            <span className="text-neutral-500">Sisa {item.sisaMasaPensiunTahun} Thn</span>
                          )}
                        </div>
                      </td>

                      {/* Status KTA */}
                      <td className="py-2.5 px-4 text-center">
                        {item.keanggotaan?.status_kta === 'Aktif' ? (
                          <span className="inline-block px-2 py-0.5 rounded-sm text-[11px] font-semibold bg-emerald-50 text-emerald-800">
                            Aktif
                          </span>
                        ) : item.keanggotaan?.status_kta === 'Pending' ? (
                          <span className="inline-block px-2 py-0.5 rounded-sm text-[11px] font-semibold bg-amber-50 text-amber-800">
                            Pending
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded-sm text-[11px] font-semibold bg-neutral-100 text-neutral-600">
                            Non-Aktif
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="no-print py-2.5 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => onOpenDetailModal(item)}
                            title="Detail Profil & Riwayat"
                            className="p-1 text-neutral-500 hover:text-emerald-700 hover:bg-neutral-100 rounded-md transition-colors cursor-pointer"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onSelectForKTA(item)}
                            title="Cetak E-KTA Digital"
                            className="p-1 text-neutral-500 hover:text-emerald-700 hover:bg-neutral-100 rounded-md transition-colors cursor-pointer"
                          >
                            <CreditCard className="w-4 h-4" />
                          </button>
                          {item.anggota.no_hp_wa && (
                            <button
                              onClick={() => {
                                setWaModalMember(item);
                                setWaType('kta');
                              }}
                              title="Kirim Notifikasi WhatsApp (E-KTA / Iuran)"
                              className="p-1 text-[#064E3B] hover:text-emerald-800 hover:bg-emerald-50 rounded-md transition-colors cursor-pointer"
                            >
                              <MessageSquare className="w-4 h-4 text-emerald-700" />
                            </button>
                          )}
                          <PermissionGate module="anggota" action="update">
                            <button
                              onClick={() => onOpenEditModal(item)}
                              title="Edit Data"
                              className="p-1 text-neutral-500 hover:text-blue-700 hover:bg-neutral-100 rounded-md transition-colors cursor-pointer"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          </PermissionGate>
                          <PermissionGate module="anggota" action="delete">
                            <button
                              onClick={() => setMemberToDelete(item)}
                              title={`Hapus data ${item.anggota.nama_lengkap}`}
                              className="p-1 text-neutral-500 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4 text-red-600" />
                            </button>
                          </PermissionGate>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table Pagination Footer */}
        {totalFiltered > 0 && (
          <div className="no-print px-4 py-2.5 bg-neutral-50/80 border-t border-neutral-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
            <div className="flex items-center gap-3 text-neutral-600">
              <span className="tabular-nums">
                Halaman <strong className="text-neutral-900">{safeCurrentPage}</strong> dari{' '}
                <strong className="text-neutral-900">{totalPages}</strong> ·{' '}
                <span className="text-neutral-500">
                  ({startIndex + 1}–{endIndex} dari {totalFiltered} data)
                </span>
              </span>
            </div>

            <div className="flex items-center gap-1 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safeCurrentPage <= 1}
                className="px-2 py-1 rounded-md border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer inline-flex items-center gap-1 transition-colors"
                aria-label="Halaman sebelumnya"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Prev</span>
              </button>

              {pageNumbers.map((pageItem) => {
                if (pageItem === 'ellipsis-left' || pageItem === 'ellipsis-right') {
                  return (
                    <span
                      key={pageItem}
                      className="px-1.5 py-1 text-neutral-400 font-mono select-none"
                    >
                      …
                    </span>
                  );
                }
                const isActive = pageItem === safeCurrentPage;
                return (
                  <button
                    key={pageItem}
                    type="button"
                    onClick={() => setCurrentPage(pageItem)}
                    className={`min-w-[28px] px-2 py-1 rounded-md font-mono font-semibold tabular-nums transition-colors cursor-pointer border ${
                      isActive
                        ? 'bg-[#064E3B] text-white border-[#064E3B] shadow-2xs'
                        : 'bg-white text-neutral-700 border-neutral-300 hover:bg-neutral-100'
                    }`}
                  >
                    {pageItem}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safeCurrentPage >= totalPages}
                className="px-2 py-1 rounded-md border border-neutral-300 bg-white text-neutral-700 hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer inline-flex items-center gap-1 transition-colors"
                aria-label="Halaman berikutnya"
              >
                <span className="hidden sm:inline">Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* MODAL KONFIRMASI HAPUS ANGGOTA (REPLACE NATIVE WINDOW.CONFIRM) */}
      {memberToDelete && (
        <div className="no-print fixed inset-0 z-50 bg-[#111113]/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-neutral-200 overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-neutral-100 flex items-start gap-3 bg-red-50/70">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0 text-red-600">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="text-sm font-bold text-neutral-900">
                  Konfirmasi Hapus Data Perangkat Desa
                </h3>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  Tindakan ini akan menghapus data dari database server MySQL
                </p>
              </div>
              <button
                onClick={() => !isDeleting && setMemberToDelete(null)}
                className="text-neutral-400 hover:text-neutral-600 p-1 cursor-pointer rounded-lg"
                disabled={isDeleting}
                title="Tutup Modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 text-xs">
              {/* Member Card Preview */}
              <div className="p-3.5 rounded-xl border border-neutral-200 bg-neutral-50/70 flex items-center gap-3">
                <img
                  src={getPhotoUrl(memberToDelete.anggota.foto)}
                  alt={memberToDelete.anggota.nama_lengkap}
                  className="w-12 h-12 rounded-full object-cover border border-neutral-300 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <h4 className="font-bold text-neutral-900 truncate">
                    {(memberToDelete.anggota.gelar_depan ? `${memberToDelete.anggota.gelar_depan} ` : '') +
                      memberToDelete.anggota.nama_lengkap +
                      (memberToDelete.anggota.gelar_belakang ? `, ${memberToDelete.anggota.gelar_belakang}` : '')}
                  </h4>
                  <div className="text-[11px] font-mono text-neutral-600 mt-0.5">
                    NIK: <strong className="text-neutral-900">{memberToDelete.anggota.nik}</strong>
                  </div>
                  <div className="text-[10px] text-neutral-500 truncate mt-0.5">
                    {memberToDelete.jabatanRef?.nama_jabatan} · Desa {memberToDelete.desa?.nama_desa}
                  </div>
                </div>
              </div>

              {/* Warning Card */}
              <div className="p-3 bg-amber-50/90 border border-amber-200 rounded-xl text-amber-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-amber-900 text-[11px] uppercase tracking-wider">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                  <span>Peringatan Penghapusan Permanen</span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Seluruh data relasional meliputi rekam jejak jabatan, nomor KTA Digital, dan arsip iuran anggota ini akan dihapus dari sistem.
                </p>
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="p-4 bg-neutral-50 border-t border-neutral-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => setMemberToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-neutral-700 bg-white hover:bg-neutral-100 border border-neutral-300 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleConfirmDelete}
                className="px-4 py-2 text-xs font-bold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-400 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                {isDeleting ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Menghapus...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Ya, Hapus Anggota</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Excel Import Modal */}
      <ExcelImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onSuccess={() => {
          setToastMessage({
            type: 'success',
            text: 'Data anggota perangkat desa dari Excel berhasil diimpor & E-KTA siap dicetak!',
          });
        }}
      />

      {/* MODAL KIRIM NOTIFIKASI WHATSAPP ANGGOTA */}
      {waModalMember && (
        <div className="no-print fixed inset-0 z-50 bg-[#111113]/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full border border-neutral-200 overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-150 text-neutral-900">
            {/* Modal Header */}
            <div className="p-5 border-b border-neutral-100 flex items-start gap-3 bg-emerald-50/80">
              <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 text-emerald-800 border border-emerald-300">
                <MessageSquare className="w-5 h-5 text-emerald-700" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-neutral-900 uppercase">
                    Kirim Notifikasi WhatsApp Anggota
                  </h3>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${
                      isFonnteWebhookActive(appSettings?.whatsappSettings)
                        ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                        : 'bg-neutral-100 text-neutral-700 border-neutral-300'
                    }`}
                  >
                    {isFonnteWebhookActive(appSettings?.whatsappSettings) ? 'Via Fonnte API' : 'Via API wa.me'}
                  </span>
                </div>
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  {isFonnteWebhookActive(appSettings?.whatsappSettings)
                    ? 'Webhook aktif: pesan dikirim otomatis melalui Gateway Fonnte.'
                    : 'Webhook nonaktif: pengiriman otomatis membuka API wa.me standar.'}
                </p>
              </div>
              <button
                onClick={() => setWaModalMember(null)}
                className="text-neutral-400 hover:text-neutral-600 p-1 cursor-pointer rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 text-xs font-mono">
              {/* Member Summary Card */}
              <div className="p-3 rounded-xl border border-neutral-200 bg-neutral-50 flex items-center gap-3">
                <img
                  src={getPhotoUrl(waModalMember.anggota.foto, waModalMember.anggota.jenis_kelamin)}
                  alt={waModalMember.anggota.nama_lengkap}
                  className="w-10 h-10 rounded-full object-cover border border-neutral-300 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-neutral-900 truncate uppercase">
                    {waModalMember.anggota.nama_lengkap}
                  </div>
                  <div className="text-[11px] text-emerald-800 font-semibold mt-0.5">
                    No. WA: {waModalMember.anggota.no_hp_wa || 'Belum diisi'}
                  </div>
                  <div className="text-[10px] text-neutral-500 truncate mt-0.5">
                    Desa {waModalMember.desa?.nama_desa}, Kec. {waModalMember.kecamatan?.nama_kecamatan}
                  </div>
                </div>
              </div>

              {/* Template Type Selector */}
              <div className="space-y-1.5 font-sans">
                <label className="text-xs font-bold text-neutral-800 uppercase tracking-wider block">
                  Pilih Kategori Pesan Notifikasi:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setWaType('kta')}
                    className={`p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                      waType === 'kta'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-950 font-bold shadow-2xs'
                        : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Status E-KTA & Keanggotaan</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setWaType('iuran')}
                    className={`p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                      waType === 'iuran'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-950 font-bold shadow-2xs'
                        : 'bg-white border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Wallet className="w-3.5 h-3.5 text-emerald-700" />
                      <span>Pemberitahuan Iuran Kas</span>
                    </div>
                  </button>
                </div>
              </div>

              {/* Portal Verifikasi Link & Message Preview Box */}
              {(() => {
                const portalVerifyUrl = getPortalVerifikasiEktaUrl({
                  noKta: waModalMember.keanggotaan?.no_kta,
                  nik: waModalMember.anggota.nik,
                  idAnggota: waModalMember.anggota.id_anggota,
                });
                const previewMessage =
                  waType === 'kta'
                    ? buildWhatsAppKTAReminderMessage({
                        name: waModalMember.anggota.nama_lengkap,
                        noKta: waModalMember.keanggotaan?.no_kta,
                        nik: waModalMember.anggota.nik,
                        idAnggota: waModalMember.anggota.id_anggota,
                        statusKta: waModalMember.keanggotaan?.status_kta,
                        desa: waModalMember.desa?.nama_desa,
                        kecamatan: waModalMember.kecamatan?.nama_kecamatan,
                        verifyUrl: portalVerifyUrl,
                      })
                    : buildWhatsAppIuranReminderMessage({
                        name: waModalMember.anggota.nama_lengkap,
                        desa: waModalMember.desa?.nama_desa,
                        noKta: waModalMember.keanggotaan?.no_kta,
                        nik: waModalMember.anggota.nik,
                        idAnggota: waModalMember.anggota.id_anggota,
                        verifyUrl: portalVerifyUrl,
                      });

                return (
                  <>
                    <div className="p-2.5 bg-amber-50/70 border border-amber-200 rounded-xl space-y-1 font-sans">
                      <span className="text-[10px] text-amber-900 font-bold uppercase tracking-wider block">
                        Link Portal Verifikasi Keabsahan E-KTA (Terlampir di Pesan):
                      </span>
                      <div className="text-[11px] font-mono text-emerald-900 bg-white border border-amber-200/80 rounded-lg px-2.5 py-1.5 break-all select-all">
                        {portalVerifyUrl}
                      </div>
                    </div>

                    <div className="p-3 bg-[#064E3B]/5 border border-emerald-200 rounded-xl space-y-1">
                      <span className="text-[10px] text-emerald-900 font-bold uppercase tracking-wider block">
                        Pratinjau Format Pesan WhatsApp:
                      </span>
                      <p className="text-[11px] text-neutral-700 leading-relaxed font-mono whitespace-pre-line max-h-44 overflow-y-auto">
                        {previewMessage}
                      </p>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Modal Footer Actions */}
            <div className="p-4 bg-neutral-50 border-t border-neutral-200 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setWaModalMember(null)}
                disabled={isSendingWa}
                className="px-4 py-2 text-xs font-semibold text-neutral-700 bg-white hover:bg-neutral-100 border border-neutral-300 rounded-lg cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="button"
                disabled={isSendingWa}
                onClick={async () => {
                  const targetMember = waModalMember;
                  const verifyUrl = getPortalVerifikasiEktaUrl({
                    noKta: targetMember.keanggotaan?.no_kta,
                    nik: targetMember.anggota.nik,
                    idAnggota: targetMember.anggota.id_anggota,
                  });
                  const messageText =
                    waType === 'kta'
                      ? buildWhatsAppKTAReminderMessage({
                          name: targetMember.anggota.nama_lengkap,
                          noKta: targetMember.keanggotaan?.no_kta,
                          nik: targetMember.anggota.nik,
                          idAnggota: targetMember.anggota.id_anggota,
                          statusKta: targetMember.keanggotaan?.status_kta,
                          desa: targetMember.desa?.nama_desa,
                          kecamatan: targetMember.kecamatan?.nama_kecamatan,
                          verifyUrl,
                        })
                      : buildWhatsAppIuranReminderMessage({
                          name: targetMember.anggota.nama_lengkap,
                          desa: targetMember.desa?.nama_desa,
                          noKta: targetMember.keanggotaan?.no_kta,
                          nik: targetMember.anggota.nik,
                          idAnggota: targetMember.anggota.id_anggota,
                          verifyUrl,
                        });

                  setIsSendingWa(true);
                  try {
                    const result = await dispatchWhatsAppNotification({
                      phone: targetMember.anggota.no_hp_wa,
                      message: messageText,
                      recipientName: targetMember.anggota.nama_lengkap,
                      idAnggota: targetMember.anggota.id_anggota,
                      category: waType === 'kta' ? 'notifikasi-kta' : 'notifikasi-iuran',
                      whatsappSettings: appSettings?.whatsappSettings,
                    });
                    setToastMessage({
                      type: result.success ? 'success' : 'error',
                      text: result.message,
                    });
                    if (result.success) {
                      setWaModalMember(null);
                    }
                  } finally {
                    setIsSendingWa(false);
                  }
                }}
                className="px-5 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-md disabled:opacity-60"
              >
                {isSendingWa ? (
                  <RefreshCw className="w-3.5 h-3.5 text-emerald-200 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5 text-emerald-200" />
                )}
                <span>
                  {isSendingWa
                    ? 'Mengirim...'
                    : isFonnteWebhookActive(appSettings?.whatsappSettings)
                    ? 'Kirim via Fonnte'
                    : 'Kirim via WhatsApp'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>

    <QrLabelPrintModal
      isOpen={isQrLabelModalOpen}
      onClose={() => setIsQrLabelModalOpen(false)}
      initialKecamatan={filterKecamatan}
      initialDesa={filterDesa}
    />

    <BulkKtaExportModal
      isOpen={isBulkKtaModalOpen}
      onClose={() => setIsBulkKtaModalOpen(false)}
      selectedMembers={selectedMembersList}
      onRemoveMember={(id) => toggleMemberSelection(id)}
      onSuccess={(count) => {
        setToastMessage({
          type: 'success',
          text: `Berhasil mengunduh PDF E-KTA massal untuk ${count} perangkat desa terpilih.`,
        });
      }}
      onError={(msg) => {
        setToastMessage({
          type: 'error',
          text: msg,
        });
      }}
    />

    <BulkWhatsAppModal
      isOpen={isBulkWaModalOpen}
      onClose={() => setIsBulkWaModalOpen(false)}
      selectedMembers={selectedMembersList}
      onRemoveMember={(id) => toggleMemberSelection(id)}
      onComplete={({ sentCount, failedCount }) => {
        setToastMessage({
          type: sentCount > 0 ? 'success' : 'error',
          text:
            failedCount === 0
              ? `Notifikasi WhatsApp massal berhasil dikirim ke ${sentCount} anggota melalui Fonnte.`
              : `Pengiriman WhatsApp massal selesai: ${sentCount} berhasil, ${failedCount} gagal.`,
        });
      }}
    />
    </>
  );
};
