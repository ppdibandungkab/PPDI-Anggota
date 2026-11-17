import React, { useState, useRef, useEffect, useMemo, useId } from 'react';
import { AnggotaFullDetail } from '../types/ppdi';
import { Search, ChevronDown, X, Check } from 'lucide-react';

interface MemberComboboxProps {
  options: AnggotaFullDetail[];
  value: string;
  onChange: (memberId: string, member: AnggotaFullDetail) => void;
  disabled?: boolean;
  ariaLabel?: string;
  placeholder?: string;
  className?: string;
  showNoKta?: boolean;
}

export const MemberCombobox: React.FC<MemberComboboxProps> = ({
  options,
  value,
  onChange,
  disabled = false,
  ariaLabel = 'Pilih Perangkat Desa',
  placeholder = 'Ketik Nama, Desa, Kec., NIK, atau No. KTA...',
  className = '',
  showNoKta = true,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const listboxId = useId();

  const selectedMember = useMemo(
    () => options.find((m) => m.anggota.id_anggota === value) || options[0],
    [options, value]
  );

  const formatSelectedLabel = (m?: AnggotaFullDetail): string => {
    if (!m) return '';
    const ktaPart = showNoKta ? ` (${m.keanggotaan?.no_kta || 'KTA Pending'})` : '';
    return `${m.anggota.nama_lengkap} - Desa ${m.desa?.nama_desa || '-'}${ktaPart}`;
  };

  const filteredOptions = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return options;
    return options.filter((m) => {
      const fullName = [
        m.anggota.gelar_depan,
        m.anggota.nama_lengkap,
        m.anggota.gelar_belakang,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const desa = (m.desa?.nama_desa || '').toLowerCase();
      const kec = (m.kecamatan?.nama_kecamatan || '').toLowerCase();
      const kta = (m.keanggotaan?.no_kta || '').toLowerCase();
      const nik = (m.anggota.nik || '').toLowerCase();
      const jabatan = (m.jabatanRef?.nama_jabatan || '').toLowerCase();
      return (
        fullName.includes(q) ||
        desa.includes(q) ||
        kec.includes(q) ||
        kta.includes(q) ||
        nik.includes(q) ||
        jabatan.includes(q)
      );
    });
  }, [options, searchQuery]);

  // Reset highlighted index when filtered list changes
  useEffect(() => {
    if (!isOpen) return;
    if (searchQuery.trim()) {
      setHighlightedIndex(0);
    } else {
      const selectedIdx = filteredOptions.findIndex((m) => m.anggota.id_anggota === value);
      setHighlightedIndex(selectedIdx >= 0 ? selectedIdx : 0);
    }
  }, [searchQuery, isOpen, filteredOptions, value]);

  // Auto-scroll highlighted option into view during keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const el = optionRefs.current[highlightedIndex];
    if (el) {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex, isOpen]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (member: AnggotaFullDetail) => {
    onChange(member.anggota.id_anggota, member);
    setSearchQuery('');
    setIsOpen(false);
  };

  if (disabled) {
    return (
      <div
        className={`bg-neutral-100 border border-neutral-300 rounded-lg px-3 py-1.5 text-xs font-medium text-neutral-700 opacity-80 truncate ${className}`}
      >
        {formatSelectedLabel(selectedMember) || '-'}
      </div>
    );
  }

  const activeDescendantId =
    isOpen && filteredOptions[highlightedIndex]
      ? `${listboxId}-option-${filteredOptions[highlightedIndex].anggota.id_anggota}`
      : undefined;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div
        className={`flex items-center gap-1.5 bg-neutral-50 border rounded-lg px-2.5 py-1.5 transition-all cursor-text ${
          isOpen
            ? 'border-[#064E3B] ring-2 ring-[#064E3B]/20 bg-white'
            : 'border-neutral-300 hover:border-neutral-400'
        }`}
        onClick={() => {
          setIsOpen(true);
          setTimeout(() => inputRef.current?.focus(), 0);
        }}
      >
        <Search className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-controls={listboxId}
          aria-activedescendant={activeDescendantId}
          aria-autocomplete="list"
          value={isOpen ? searchQuery : formatSelectedLabel(selectedMember)}
          placeholder={
            isOpen && selectedMember
              ? `Cari (${selectedMember.anggota.nama_lengkap}) — ketik nama/desa...`
              : placeholder
          }
          onFocus={() => {
            setIsOpen(true);
          }}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            if (!isOpen) setIsOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              if (!isOpen) {
                setIsOpen(true);
              } else if (filteredOptions.length > 0) {
                setHighlightedIndex((prev) => (prev + 1) % filteredOptions.length);
              }
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              if (!isOpen) {
                setIsOpen(true);
              } else if (filteredOptions.length > 0) {
                setHighlightedIndex((prev) =>
                  prev <= 0 ? filteredOptions.length - 1 : prev - 1
                );
              }
            } else if (e.key === 'Escape') {
              setIsOpen(false);
              setSearchQuery('');
              inputRef.current?.blur();
            } else if (e.key === 'Enter') {
              if (isOpen && filteredOptions.length > 0) {
                e.preventDefault();
                const picked = filteredOptions[highlightedIndex] || filteredOptions[0];
                handleSelect(picked);
                inputRef.current?.blur();
              } else if (!isOpen) {
                e.preventDefault();
                setIsOpen(true);
              }
            }
          }}
          className="w-full bg-transparent text-xs font-medium text-neutral-900 placeholder:text-neutral-400 focus:outline-none truncate"
        />

        {isOpen && searchQuery && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setSearchQuery('');
              inputRef.current?.focus();
            }}
            className="p-0.5 text-neutral-400 hover:text-neutral-700 rounded cursor-pointer shrink-0"
            title="Hapus kata kunci pencarian"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          type="button"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            const next = !isOpen;
            setIsOpen(next);
            if (next) {
              setTimeout(() => inputRef.current?.focus(), 0);
            } else {
              setSearchQuery('');
            }
          }}
          className="p-0.5 text-neutral-500 hover:text-neutral-800 cursor-pointer shrink-0"
          title="Buka / Tutup Daftar Perangkat Desa"
        >
          <ChevronDown
            className={`w-4 h-4 transition-transform ${
              isOpen ? 'rotate-180 text-[#064E3B]' : ''
            }`}
          />
        </button>
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 mt-1.5 bg-white border border-neutral-200 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="px-3 py-1.5 bg-neutral-50 border-b border-neutral-100 flex items-center justify-between text-[10px] font-mono text-neutral-500">
            <span>
              {searchQuery.trim()
                ? `Ditemukan ${filteredOptions.length} dari ${options.length} perangkat desa`
                : `Total ${options.length} Perangkat Desa`}
            </span>
            <span className="text-neutral-400 hidden sm:inline">↑↓ Navigasi · Enter Pilih</span>
          </div>

          <div
            id={listboxId}
            role="listbox"
            aria-label={ariaLabel}
            className="max-h-64 overflow-y-auto divide-y divide-neutral-100"
          >
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-5 text-center text-neutral-400 text-xs">
                Tidak ada perangkat desa yang cocok dengan &quot;{searchQuery}&quot;
              </div>
            ) : (
              filteredOptions.map((m, idx) => {
                const isSelected = m.anggota.id_anggota === value;
                const isHighlighted = idx === highlightedIndex;
                return (
                  <button
                    key={m.anggota.id_anggota}
                    id={`${listboxId}-option-${m.anggota.id_anggota}`}
                    ref={(el) => {
                      optionRefs.current[idx] = el;
                    }}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    onClick={() => handleSelect(m)}
                    className={`w-full px-3 py-2 text-left flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-emerald-50 text-emerald-950'
                        : isHighlighted
                        ? 'bg-neutral-100 text-neutral-900'
                        : 'hover:bg-neutral-50 text-neutral-800'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="font-bold uppercase text-[11px] truncate">
                        {m.anggota.nama_lengkap}
                      </div>
                      <div className="text-[10px] text-neutral-500 font-mono truncate">
                        Desa {m.desa?.nama_desa || '-'} · Kec. {m.kecamatan?.nama_kecamatan || '-'} ·{' '}
                        <span className="text-emerald-800 font-semibold">
                          {m.keanggotaan?.no_kta || 'KTA Pending'}
                        </span>
                      </div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-[#064E3B] shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
