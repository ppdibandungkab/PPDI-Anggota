import React, { useState, useMemo, useEffect } from 'react';
import { usePPDI } from '../context/PPDIContext';
import {
  buildMemberQrLabelData,
  exportQrLabelsToPDF,
  QrLabelItemData,
  QrLabelSizePreset,
} from '../utils/pdfQrLabelExport';
import {
  QrCode,
  X,
  Search,
  Printer,
  Download,
  CheckSquare,
  Square,
  CheckCircle2,
  MapPin,
  Barcode,
  RefreshCw,
  Shield,
} from 'lucide-react';

interface QrLabelPrintModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialKecamatan?: string;
  initialDesa?: string;
}

const cleanWilayahId = (id?: string | null) =>
  id ? String(id).replace(/\./g, '').trim() : '';

/**
 * Crisp inline SVG 1D barcode strip rendered from deterministic bar widths.
 */
const Barcode1DStrip: React.FC<{ bars: number[]; height?: number }> = ({
  bars,
  height = 18,
}) => {
  const totalUnits = bars.reduce((acc, w) => acc + w, 0) || 1;
  let cursor = 0;
  const rects: { x: number; w: number }[] = [];

  bars.forEach((units, idx) => {
    if (idx % 2 === 0) {
      rects.push({ x: cursor, w: units });
    }
    cursor += units;
  });

  return (
    <svg
      viewBox={`0 0 ${totalUnits} ${height}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height: `${height}px` }}
      aria-hidden="true"
    >
      {rects.map((r, i) => (
        <rect key={i} x={r.x} y={0} width={r.w} height={height} fill="#111113" />
      ))}
    </svg>
  );
};

export const QrLabelPrintModal: React.FC<QrLabelPrintModalProps> = ({
  isOpen,
  onClose,
  initialKecamatan = 'all',
  initialDesa = 'all',
}) => {
  const {
    visibleMembers,
    kecamatanList,
    desaList,
    appSettings,
    currentUser,
    selectedKecamatanFilter,
  } = usePPDI();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedKecId, setSelectedKecId] = useState(initialKecamatan);
  const [selectedDesaId, setSelectedDesaId] = useState(initialDesa);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sizePreset, setSizePreset] = useState<QrLabelSizePreset>('medium');
  const [show1DBarcode, setShow1DBarcode] = useState(true);

  const [labelCache, setLabelCache] = useState<Record<string, QrLabelItemData>>({});
  const [isGeneratingPreview, setIsGeneratingPreview] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [exportSuccessMsg, setExportSuccessMsg] = useState<string | null>(null);

  const role = currentUser?.role || 'Anggota';

  // Role-scoped Kecamatan options
  const roleScopedKecamatan = useMemo(() => {
    const allKec = kecamatanList || [];
    if (role === 'Admin_Kecamatan' && currentUser?.id_kecamatan) {
      const targetKec = cleanWilayahId(currentUser.id_kecamatan);
      return allKec.filter((k) => cleanWilayahId(k.id_kecamatan) === targetKec);
    }
    if (role === 'Admin_Desa') {
      const targetKec = cleanWilayahId(
        currentUser?.id_kecamatan ||
          (currentUser?.id_desa ? currentUser.id_desa.slice(0, 6) : '')
      );
      if (targetKec) {
        return allKec.filter((k) => cleanWilayahId(k.id_kecamatan) === targetKec);
      }
    }
    if (role === 'Anggota') {
      const ownKecIds = new Set(
        (visibleMembers || [])
          .map((m) => cleanWilayahId(m.kecamatan?.id_kecamatan || m.desa?.id_kecamatan))
          .filter(Boolean)
      );
      return allKec.filter((k) => ownKecIds.has(cleanWilayahId(k.id_kecamatan)));
    }
    if (
      (role === 'Superadmin_Kabupaten' || role === 'Admin_Kabupaten') &&
      selectedKecamatanFilter &&
      selectedKecamatanFilter !== 'all'
    ) {
      const targetKec = cleanWilayahId(selectedKecamatanFilter);
      return allKec.filter((k) => cleanWilayahId(k.id_kecamatan) === targetKec);
    }
    return allKec;
  }, [kecamatanList, role, currentUser, visibleMembers, selectedKecamatanFilter]);

  // Role-scoped Desa options (further filtered by selectedKecId)
  const availableDesa = useMemo(() => {
    let baseDesa = desaList || [];

    if (role === 'Admin_Desa' && currentUser?.id_desa) {
      const targetDesa = cleanWilayahId(currentUser.id_desa);
      baseDesa = baseDesa.filter((d) => cleanWilayahId(d.id_desa) === targetDesa);
    } else if (role === 'Admin_Kecamatan' && currentUser?.id_kecamatan) {
      const targetKec = cleanWilayahId(currentUser.id_kecamatan);
      baseDesa = baseDesa.filter((d) => cleanWilayahId(d.id_kecamatan) === targetKec);
    } else if (role === 'Anggota') {
      const ownDesaIds = new Set(
        (visibleMembers || [])
          .map((m) => cleanWilayahId(m.desa?.id_desa || m.jabatanTerkini?.id_desa))
          .filter(Boolean)
      );
      baseDesa = baseDesa.filter((d) => ownDesaIds.has(cleanWilayahId(d.id_desa)));
    } else if (
      (role === 'Superadmin_Kabupaten' || role === 'Admin_Kabupaten') &&
      selectedKecamatanFilter &&
      selectedKecamatanFilter !== 'all'
    ) {
      const targetKec = cleanWilayahId(selectedKecamatanFilter);
      baseDesa = baseDesa.filter((d) => cleanWilayahId(d.id_kecamatan) === targetKec);
    }

    if (selectedKecId !== 'all') {
      const cleanKec = cleanWilayahId(selectedKecId);
      return baseDesa.filter((d) => cleanWilayahId(d.id_kecamatan) === cleanKec);
    }
    return baseDesa;
  }, [desaList, role, currentUser, visibleMembers, selectedKecamatanFilter, selectedKecId]);

  // Human-readable role scope badge
  const roleScopeLabel = useMemo(() => {
    if (role === 'Anggota') return 'Profil Saya';
    if (role === 'Admin_Desa') {
      const desaName = availableDesa[0]?.nama_desa;
      return desaName ? `Desa ${desaName}` : 'Lingkup Desa';
    }
    if (role === 'Admin_Kecamatan') {
      const kecName = roleScopedKecamatan[0]?.nama_kecamatan;
      return kecName ? `Kec. ${kecName}` : 'Lingkup Kecamatan';
    }
    if (selectedKecamatanFilter && selectedKecamatanFilter !== 'all') {
      const kecName = roleScopedKecamatan[0]?.nama_kecamatan;
      return kecName ? `Kec. ${kecName}` : 'Filter Kecamatan';
    }
    return 'Seluruh Kab. Bandung';
  }, [role, availableDesa, roleScopedKecamatan, selectedKecamatanFilter]);

  // Sync initial filters when modal opens
  useEffect(() => {
    if (isOpen) {
      if (roleScopedKecamatan.length === 1) {
        setSelectedKecId(roleScopedKecamatan[0].id_kecamatan);
      } else {
        setSelectedKecId(initialKecamatan || 'all');
      }

      if (role === 'Admin_Desa' && currentUser?.id_desa) {
        setSelectedDesaId(currentUser.id_desa);
      } else {
        setSelectedDesaId(initialDesa || 'all');
      }
    }
  }, [isOpen, initialKecamatan, initialDesa, role, currentUser?.id_desa, roleScopedKecamatan]);

  // Reset desa filter if kecamatan changes manually (when not locked to Admin_Desa)
  useEffect(() => {
    if (role !== 'Admin_Desa') {
      setSelectedDesaId('all');
    }
  }, [selectedKecId, role]);

  // Filtered member list strictly scoped to visibleMembers (already enforces user role)
  const filteredMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const cleanKec = selectedKecId === 'all' ? '' : cleanWilayahId(selectedKecId);
    const cleanDesa = selectedDesaId === 'all' ? '' : cleanWilayahId(selectedDesaId);

    return (visibleMembers || []).filter((m) => {
      if (cleanKec) {
        const mKec = cleanWilayahId(m.kecamatan?.id_kecamatan || m.desa?.id_kecamatan);
        const mDesa = cleanWilayahId(m.desa?.id_desa || m.jabatanTerkini?.id_desa);
        if (mKec !== cleanKec && !mDesa.startsWith(cleanKec)) return false;
      }

      if (cleanDesa) {
        const mDesa = cleanWilayahId(m.desa?.id_desa || m.jabatanTerkini?.id_desa);
        if (mDesa !== cleanDesa) return false;
      }

      if (q) {
        const nama = (m.anggota.nama_lengkap || '').toLowerCase();
        const nik = (m.anggota.nik || '').toLowerCase();
        const nipd = (m.anggota.nipd || '').toLowerCase();
        const kta = (m.keanggotaan?.no_kta || '').toLowerCase();
        const desa = (m.desa?.nama_desa || '').toLowerCase();
        const kec = (m.kecamatan?.nama_kecamatan || '').toLowerCase();
        return (
          nama.includes(q) ||
          nik.includes(q) ||
          nipd.includes(q) ||
          kta.includes(q) ||
          desa.includes(q) ||
          kec.includes(q)
        );
      }

      return true;
    });
  }, [visibleMembers, searchQuery, selectedKecId, selectedDesaId]);

  // Prune unauthorized selections when visibleMembers changes & pre-select up to 6 authorized members
  useEffect(() => {
    if (!isOpen) return;
    const allowedIds = new Set((visibleMembers || []).map((m) => m.anggota.id_anggota));
    setSelectedIds((prev) => {
      const validPrev = prev.filter((id) => allowedIds.has(id));
      if (validPrev.length > 0) return validPrev;
      return (visibleMembers || []).slice(0, 6).map((m) => m.anggota.id_anggota);
    });
  }, [isOpen, visibleMembers]);

  const selectedMembers = useMemo(() => {
    const idSet = new Set(selectedIds);
    return (visibleMembers || []).filter((m) => idSet.has(m.anggota.id_anggota));
  }, [visibleMembers, selectedIds]);

  // Generate QR Code data URLs for any newly selected members
  useEffect(() => {
    if (!isOpen || selectedMembers.length === 0) return;

    const missing = selectedMembers.filter((m) => !labelCache[m.anggota.id_anggota]);
    if (missing.length === 0) return;

    let cancelled = false;
    setIsGeneratingPreview(true);

    Promise.all(missing.map((m) => buildMemberQrLabelData(m)))
      .then((results) => {
        if (cancelled) return;
        setLabelCache((prev) => {
          const next = { ...prev };
          results.forEach((item) => {
            next[item.member.anggota.id_anggota] = item;
          });
          return next;
        });
      })
      .finally(() => {
        if (!cancelled) setIsGeneratingPreview(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedMembers, labelCache]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const selectedLabelItems: QrLabelItemData[] = selectedMembers
    .map((m) => labelCache[m.anggota.id_anggota])
    .filter(Boolean);

  const toggleMember = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleSelectAllFiltered = () => {
    const filteredIds = filteredMembers.map((m) => m.anggota.id_anggota);
    setSelectedIds((prev) => Array.from(new Set([...prev, ...filteredIds])));
  };

  const handleClearSelection = () => {
    setSelectedIds([]);
  };

  const handleExportPdf = async () => {
    if (selectedMembers.length === 0) return;
    setIsExportingPdf(true);
    setExportSuccessMsg(null);
    try {
      const missing = selectedMembers.filter((m) => !labelCache[m.anggota.id_anggota]);
      const mergedCache = { ...labelCache };
      if (missing.length > 0) {
        const built = await Promise.all(missing.map((m) => buildMemberQrLabelData(m)));
        built.forEach((item) => {
          mergedCache[item.member.anggota.id_anggota] = item;
        });
        setLabelCache(mergedCache);
      }

      const items = selectedMembers
        .map((m) => mergedCache[m.anggota.id_anggota])
        .filter(Boolean);

      exportQrLabelsToPDF({
        items,
        sizePreset,
        appName: appSettings?.appName || 'PPDI KAB. BANDUNG',
        show1DBarcode,
      });

      setExportSuccessMsg(
        `Berhasil mengunduh PDF berisi ${items.length} label QR barcode siap cetak.`
      );
      setTimeout(() => setExportSuccessMsg(null), 5000);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleBrowserPrint = () => {
    if (selectedLabelItems.length === 0) return;
    window.print();
  };

  const previewGridCols =
    sizePreset === 'large'
      ? 'grid-cols-1 sm:grid-cols-2'
      : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3';

  const printGridCols =
    sizePreset === 'large' ? 'grid-cols-2 gap-3' : 'grid-cols-3 gap-2.5';

  return (
    <>
      {/* Screen Modal Overlay (Hidden when printing) */}
      <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto no-print">
        <div className="bg-white text-[#111113] rounded-2xl shadow-2xl border border-neutral-200 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          {/* Modal Header */}
          <div className="px-4 sm:px-6 py-4 bg-[#064E3B] text-white flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-amber-400 text-[#064E3B] flex items-center justify-center shrink-0 shadow-sm">
                <QrCode className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm sm:text-base font-extrabold tracking-tight uppercase truncate">
                    Cetak Label QR Barcode Anggota
                  </h2>
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white/15 border border-white/20 text-[10px] font-mono text-amber-300">
                    <Shield className="w-3 h-3" />
                    <span>{roleScopeLabel}</span>
                  </span>
                </div>
                <p className="text-[11px] text-emerald-200 truncate mt-0.5">
                  Buat & cetak label QR unik terenkripsi sesuai hak akses role ({(visibleMembers || []).length} anggota tersedia)
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup modal cetak label QR"
              className="p-1.5 rounded-lg text-white/75 hover:text-white hover:bg-white/15 transition-colors cursor-pointer shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Modal Body: Split Pane (Left Member Picker, Right Label Preview & Controls) */}
          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[360px_1fr] divide-y lg:divide-y-0 lg:divide-x divide-neutral-200 overflow-hidden">
            {/* Left Pane: Filter & Checklist */}
            <div className="flex flex-col min-h-0 bg-[#F8F7F4] p-4 space-y-3 overflow-hidden">
              <div className="space-y-2 shrink-0">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Cari Nama, NIK, NIPD, No. KTA..."
                    className="w-full pl-8 pr-3 py-2 text-xs bg-white border border-neutral-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#064E3B]/20 focus:border-[#064E3B]"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <select
                    aria-label="Filter Kecamatan"
                    value={selectedKecId}
                    disabled={roleScopedKecamatan.length <= 1}
                    onChange={(e) => setSelectedKecId(e.target.value)}
                    className="w-full text-[11px] font-mono bg-white border border-neutral-300 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#064E3B] disabled:bg-neutral-100 disabled:text-neutral-600"
                  >
                    {roleScopedKecamatan.length > 1 && (
                      <option value="all">Semua Kecamatan</option>
                    )}
                    {roleScopedKecamatan.map((k) => (
                      <option key={k.id_kecamatan} value={k.id_kecamatan}>
                        Kec. {k.nama_kecamatan}
                      </option>
                    ))}
                  </select>

                  <select
                    aria-label="Filter Desa"
                    value={selectedDesaId}
                    disabled={availableDesa.length <= 1}
                    onChange={(e) => setSelectedDesaId(e.target.value)}
                    className="w-full text-[11px] font-mono bg-white border border-neutral-300 rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#064E3B] disabled:bg-neutral-100 disabled:text-neutral-600"
                  >
                    {availableDesa.length > 1 && <option value="all">Semua Desa</option>}
                    {availableDesa.map((d) => (
                      <option key={d.id_desa} value={d.id_desa}>
                        Ds. {d.nama_desa}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Selection Controls */}
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-[11px] font-mono font-bold text-[#064E3B]">
                    {selectedIds.length} Dipilih ({filteredMembers.length} Tampil)
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={handleSelectAllFiltered}
                      className="px-2 py-1 rounded bg-emerald-100 hover:bg-emerald-200 text-[#064E3B] text-[10px] font-mono font-bold cursor-pointer transition-colors"
                    >
                      Pilih Semua
                    </button>
                    <button
                      type="button"
                      onClick={handleClearSelection}
                      className="px-2 py-1 rounded bg-neutral-200 hover:bg-neutral-300 text-neutral-700 text-[10px] font-mono font-bold cursor-pointer transition-colors"
                    >
                      Reset
                    </button>
                  </div>
                </div>
              </div>

              {/* Member Checklist */}
              <div className="flex-1 min-h-0 overflow-y-auto space-y-1.5 pr-1">
                {filteredMembers.length === 0 ? (
                  <div className="p-6 text-center text-xs text-neutral-500 bg-white rounded-xl border border-neutral-200">
                    Tidak ada anggota yang sesuai dengan filter atau cakupan role.
                  </div>
                ) : (
                  filteredMembers.map((m) => {
                    const isChecked = selectedIds.includes(m.anggota.id_anggota);
                    return (
                      <label
                        key={m.anggota.id_anggota}
                        className={`flex items-start gap-2.5 p-2.5 rounded-xl border cursor-pointer transition-all select-none ${
                          isChecked
                            ? 'bg-emerald-50 border-[#064E3B]/40 shadow-2xs'
                            : 'bg-white border-neutral-200 hover:border-neutral-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleMember(m.anggota.id_anggota)}
                          className="sr-only"
                        />
                        {isChecked ? (
                          <CheckSquare className="w-4 h-4 text-[#064E3B] shrink-0 mt-0.5" />
                        ) : (
                          <Square className="w-4 h-4 text-neutral-400 shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-neutral-900 truncate">
                            {m.anggota.nama_lengkap}
                          </div>
                          <div className="text-[10px] font-mono text-[#064E3B] truncate">
                            {m.keanggotaan?.no_kta || m.anggota.nipd || `ID-${m.anggota.id_anggota}`}
                          </div>
                          <div className="text-[10px] text-neutral-500 flex items-center gap-1 truncate mt-0.5">
                            <MapPin className="w-2.5 h-2.5 shrink-0" />
                            <span className="truncate">
                              {m.desa?.nama_desa ? `Ds. ${m.desa.nama_desa}` : '-'}
                              {m.kecamatan?.nama_kecamatan
                                ? `, Kec. ${m.kecamatan.nama_kecamatan}`
                                : ''}
                            </span>
                          </div>
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            {/* Right Pane: Layout Settings & Label Preview */}
            <div className="flex flex-col min-h-0 bg-white overflow-hidden">
              {/* Toolbar Controls */}
              <div className="p-4 border-b border-neutral-200 bg-neutral-50/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-neutral-200">
                    {(
                      [
                        { id: 'compact', label: 'Kecil (3×8)' },
                        { id: 'medium', label: 'Sedang (3×6)' },
                        { id: 'large', label: 'Besar (2×5)' },
                      ] as const
                    ).map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => setSizePreset(preset.id)}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-bold transition-colors cursor-pointer ${
                          sizePreset === preset.id
                            ? 'bg-[#064E3B] text-white'
                            : 'text-neutral-600 hover:bg-neutral-100'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>

                  <label className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-700 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={show1DBarcode}
                      onChange={(e) => setShow1DBarcode(e.target.checked)}
                      className="rounded border-neutral-300 text-[#064E3B] focus:ring-[#064E3B]"
                    />
                    <Barcode className="w-3.5 h-3.5 text-[#064E3B]" />
                    <span>Strip Barcode 1D</span>
                  </label>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleBrowserPrint}
                    disabled={selectedLabelItems.length === 0 || isGeneratingPreview}
                    className="px-3.5 py-2 rounded-lg bg-white hover:bg-neutral-100 text-neutral-800 border border-neutral-300 text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-40 transition-colors"
                  >
                    <Printer className="w-3.5 h-3.5 text-[#064E3B]" />
                    <span>Cetak Langsung</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleExportPdf}
                    disabled={selectedMembers.length === 0 || isExportingPdf}
                    className="px-3.5 py-2 rounded-lg bg-[#064E3B] hover:bg-[#043d2e] text-white text-xs font-mono font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-40 transition-colors shadow-xs"
                  >
                    {isExportingPdf ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-300" />
                    ) : (
                      <Download className="w-3.5 h-3.5 text-amber-300" />
                    )}
                    <span>
                      {isExportingPdf
                        ? 'Menyiapkan PDF...'
                        : `Unduh PDF (${selectedMembers.length})`}
                    </span>
                  </button>
                </div>
              </div>

              {exportSuccessMsg && (
                <div className="mx-4 mt-3 px-3.5 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 shrink-0">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{exportSuccessMsg}</span>
                </div>
              )}

              {/* Preview Grid */}
              <div className="flex-1 min-h-0 overflow-y-auto p-4 bg-neutral-100/70">
                {selectedMembers.length === 0 ? (
                  <div className="h-full min-h-[240px] flex flex-col items-center justify-center text-center p-6 text-neutral-500">
                    <QrCode className="w-10 h-10 text-neutral-300 mb-2" />
                    <p className="text-sm font-bold text-neutral-700">
                      Belum ada anggota dipilih
                    </p>
                    <p className="text-xs mt-1 max-w-sm">
                      Centang satu atau lebih anggota di panel kiri untuk membuat pratinjau label QR barcode unik siap cetak.
                    </p>
                  </div>
                ) : isGeneratingPreview && selectedLabelItems.length === 0 ? (
                  <div className="h-full min-h-[240px] flex flex-col items-center justify-center text-center p-6 text-neutral-500">
                    <RefreshCw className="w-7 h-7 animate-spin text-[#064E3B] mb-2" />
                    <p className="text-xs font-mono">Menghasilkan QR Barcode unik...</p>
                  </div>
                ) : (
                  <div className={`grid ${previewGridCols} gap-3`}>
                    {selectedLabelItems.map((item) => {
                      const statusKta = item.member.keanggotaan?.status_kta || 'Pending';
                      const fullName = [
                        item.member.anggota.gelar_depan,
                        item.member.anggota.nama_lengkap,
                        item.member.anggota.gelar_belakang,
                      ]
                        .filter(Boolean)
                        .join(' ');

                      return (
                        <div
                          key={item.member.anggota.id_anggota}
                          className="bg-white rounded-lg border border-dashed border-neutral-400 overflow-hidden shadow-xs flex flex-col justify-between"
                        >
                          {/* Mini Label Header */}
                          <div className="px-2.5 py-1 bg-[#064E3B] text-white flex items-center justify-between gap-2 text-[9px] font-mono font-bold">
                            <span className="text-amber-300 truncate">
                              {(appSettings?.appName || 'PPDI KAB. BANDUNG').toUpperCase()}
                            </span>
                            <span className="uppercase px-1 rounded bg-white/15 shrink-0">
                              {statusKta}
                            </span>
                          </div>

                          {/* Label Body */}
                          <div className="p-2.5 flex items-center gap-2.5">
                            <img
                              src={item.qrDataUrl}
                              alt={`QR ${fullName}`}
                              className={`${
                                sizePreset === 'large'
                                  ? 'w-20 h-20'
                                  : sizePreset === 'compact'
                                  ? 'w-14 h-14'
                                  : 'w-16 h-16'
                              } shrink-0 border border-neutral-200 rounded p-0.5 bg-white`}
                            />
                            <div className="min-w-0 flex-1 space-y-0.5">
                              <div className="text-xs font-extrabold text-neutral-900 leading-tight line-clamp-2">
                                {fullName}
                              </div>
                              <div className="text-[10px] text-neutral-600 truncate">
                                {item.member.jabatanRef?.nama_jabatan || 'Perangkat Desa'}
                              </div>
                              <div className="text-[10px] text-neutral-500 truncate">
                                {item.member.desa?.nama_desa
                                  ? `Ds. ${item.member.desa.nama_desa}`
                                  : ''}
                                {item.member.kecamatan?.nama_kecamatan
                                  ? `, Kec. ${item.member.kecamatan.nama_kecamatan}`
                                  : ''}
                              </div>
                              <div className="text-[9px] font-mono font-bold text-[#064E3B] truncate pt-0.5">
                                {item.uniqueSerial}
                              </div>
                              <div className="text-[9px] font-mono text-neutral-500 truncate">
                                NIK: {item.member.anggota.nik || '-'}
                              </div>
                            </div>
                          </div>

                          {/* Optional 1D Barcode Strip */}
                          {show1DBarcode && (
                            <div className="px-2.5 pb-2">
                              <Barcode1DStrip
                                bars={item.barcodeBars}
                                height={sizePreset === 'large' ? 18 : 13}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dedicated A4 Print Output Sheet (Visible ONLY in @media print) */}
      <div className="hidden print:block p-2 bg-white text-black">
        <div className="flex items-center justify-between border-b border-neutral-300 pb-1.5 mb-3 text-[9px] font-mono">
          <span className="font-bold uppercase text-[#064E3B]">
            {(appSettings?.appName || 'PPDI KAB. BANDUNG').toUpperCase()} — LABEL QR BARCODE ANGGOTA
          </span>
          <span>
            {roleScopeLabel} · Total: {selectedLabelItems.length} Label |{' '}
            {new Date().toLocaleDateString('id-ID')}
          </span>
        </div>

        <div className={`grid ${printGridCols}`}>
          {selectedLabelItems.map((item) => {
            const fullName = [
              item.member.anggota.gelar_depan,
              item.member.anggota.nama_lengkap,
              item.member.anggota.gelar_belakang,
            ]
              .filter(Boolean)
              .join(' ');
            const statusKta = item.member.keanggotaan?.status_kta || 'Pending';

            return (
              <div
                key={`print-${item.member.anggota.id_anggota}`}
                className="border border-dashed border-neutral-400 rounded-md overflow-hidden break-inside-avoid bg-white"
              >
                <div className="px-2 py-0.5 bg-[#064E3B] text-white flex items-center justify-between text-[8px] font-mono font-bold">
                  <span className="text-amber-300 truncate">PPDI KAB. BANDUNG</span>
                  <span>{statusKta.toUpperCase()}</span>
                </div>
                <div className="p-2 flex items-center gap-2">
                  <img
                    src={item.qrDataUrl}
                    alt={fullName}
                    className={
                      sizePreset === 'large'
                        ? 'w-20 h-20 shrink-0'
                        : sizePreset === 'compact'
                        ? 'w-14 h-14 shrink-0'
                        : 'w-16 h-16 shrink-0'
                    }
                  />
                  <div className="min-w-0 flex-1 space-y-0.5">
                    <div className="text-[10px] font-bold text-black leading-tight line-clamp-2">
                      {fullName}
                    </div>
                    <div className="text-[8px] text-neutral-700 truncate">
                      {item.member.jabatanRef?.nama_jabatan || 'Perangkat Desa'}
                    </div>
                    <div className="text-[8px] text-neutral-600 truncate">
                      {item.member.desa?.nama_desa
                        ? `Ds. ${item.member.desa.nama_desa}`
                        : ''}
                      {item.member.kecamatan?.nama_kecamatan
                        ? `, Kec. ${item.member.kecamatan.nama_kecamatan}`
                        : ''}
                    </div>
                    <div className="text-[8px] font-mono font-bold text-[#064E3B] truncate">
                      {item.uniqueSerial}
                    </div>
                    <div className="text-[8px] font-mono text-neutral-600 truncate">
                      NIK: {item.member.anggota.nik || '-'}
                    </div>
                  </div>
                </div>
                {show1DBarcode && (
                  <div className="px-2 pb-1.5">
                    <Barcode1DStrip
                      bars={item.barcodeBars}
                      height={sizePreset === 'large' ? 16 : 12}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
};
