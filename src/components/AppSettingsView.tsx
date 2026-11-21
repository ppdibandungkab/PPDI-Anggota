import React, { useState, useRef, useEffect } from 'react';
import { usePPDI } from '../context/PPDIContext';
import {
  Settings,
  Paintbrush,
  Image,
  Upload,
  CheckCircle,
  AlertCircle,
  Save,
  RotateCcw,
  Sliders,
  Shield,
  Eye,
  Sparkles,
  CreditCard,
  Quote,
  User,
  Trash2,
} from 'lucide-react';
import { ChairmanGreetingCard } from './ChairmanGreetingCard';

const ALLOWED_CHAIRMAN_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_CHAIRMAN_PHOTO_BYTES = 2 * 1024 * 1024; // 2 MB

export const AppSettingsView: React.FC = () => {
  const { appSettings, updateAppSettings, updateChairmanSettings, hasPermission } = usePPDI();
  const canEdit = hasPermission('settings-app', 'edit');

  const resolveInitialOpacity = () => {
    if (typeof appSettings?.watermarkOpacity === 'number') return appSettings.watermarkOpacity;
    if (typeof appSettings?.watermarkOpacityFront === 'number') return appSettings.watermarkOpacityFront;
    return 0.09;
  };

  const [activeSettingsTab, setActiveSettingsTab] = useState<'general' | 'chairman'>('general');

  const [appName, setAppName] = useState(appSettings?.appName || 'PPDI KABUPATEN BANDUNG');
  const [appSubtitle, setAppSubtitle] = useState(
    appSettings?.appSubtitle || 'SISTEM INFORMASI DATABASE & E-KTA PERANGKAT DESA'
  );
  const [logoUrl, setLogoUrl] = useState(appSettings?.logoUrl || '');
  const [loginBackgroundType, setLoginBackgroundType] = useState<
    'preset_emerald' | 'gradient_mesh' | 'custom_image' | 'dark_slate'
  >(appSettings?.loginBackgroundType || 'preset_emerald');
  const [loginBackgroundImage, setLoginBackgroundImage] = useState(appSettings?.loginBackgroundImage || '');
  const [loginOverlayOpacity, setLoginOverlayOpacity] = useState(appSettings?.loginOverlayOpacity || '0.5');
  const [syncInterval, setSyncInterval] = useState(String(appSettings?.syncIntervalSeconds || 60));
  const [watermarkLogoUrl, setWatermarkLogoUrl] = useState(appSettings?.watermarkLogoUrl || '');
  const [watermarkOpacity, setWatermarkOpacity] = useState<number>(resolveInitialOpacity);

  // Sambutan Ketua PPDI Kabupaten Bandung
  const [chairmanName, setChairmanName] = useState(
    appSettings?.chairman_name || 'Ketua PPDI Kabupaten Bandung'
  );
  const [chairmanTitle, setChairmanTitle] = useState(
    appSettings?.chairman_title || 'Ketua Pengurus Daerah PPDI Kabupaten Bandung'
  );
  const [chairmanPhoto, setChairmanPhoto] = useState(appSettings?.chairman_photo || '');
  const [chairmanGreeting, setChairmanGreeting] = useState(appSettings?.chairman_greeting || '');

  const isDirtyRef = useRef(false);
  const lastSyncedSignatureRef = useRef('');
  const formContainerRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!appSettings) return;
    const incomingOpacity =
      typeof appSettings.watermarkOpacity === 'number'
        ? appSettings.watermarkOpacity
        : typeof appSettings.watermarkOpacityFront === 'number'
        ? appSettings.watermarkOpacityFront
        : 0.09;

    const signature = JSON.stringify({
      appName: appSettings.appName || 'PPDI KABUPATEN BANDUNG',
      appSubtitle: appSettings.appSubtitle || 'SISTEM INFORMASI DATABASE & E-KTA PERANGKAT DESA',
      logoUrl: appSettings.logoUrl || '',
      loginBackgroundType: appSettings.loginBackgroundType || 'preset_emerald',
      loginBackgroundImage: appSettings.loginBackgroundImage || '',
      loginOverlayOpacity: appSettings.loginOverlayOpacity || '0.5',
      syncIntervalSeconds: appSettings.syncIntervalSeconds || 60,
      watermarkLogoUrl: appSettings.watermarkLogoUrl || '',
      watermarkOpacity: incomingOpacity,
      chairman_name: appSettings.chairman_name || 'Ketua PPDI Kabupaten Bandung',
      chairman_title: appSettings.chairman_title || 'Ketua Pengurus Daerah PPDI Kabupaten Bandung',
      chairman_photo: appSettings.chairman_photo || '',
      chairman_greeting: appSettings.chairman_greeting || '',
    });

    const isFocusedInsideForm =
      typeof document !== 'undefined' &&
      Boolean(formContainerRef.current && document.activeElement && formContainerRef.current.contains(document.activeElement));

    if (isDirtyRef.current || isFocusedInsideForm || lastSyncedSignatureRef.current === signature) {
      return;
    }

    lastSyncedSignatureRef.current = signature;
    setAppName(appSettings.appName || 'PPDI KABUPATEN BANDUNG');
    setAppSubtitle(appSettings.appSubtitle || 'SISTEM INFORMASI DATABASE & E-KTA PERANGKAT DESA');
    setLogoUrl(appSettings.logoUrl || '');
    setLoginBackgroundType(appSettings.loginBackgroundType || 'preset_emerald');
    setLoginBackgroundImage(appSettings.loginBackgroundImage || '');
    setLoginOverlayOpacity(appSettings.loginOverlayOpacity || '0.5');
    setSyncInterval(String(appSettings.syncIntervalSeconds || 60));
    setWatermarkLogoUrl(appSettings.watermarkLogoUrl || '');
    setWatermarkOpacity(incomingOpacity);
    setChairmanName(appSettings.chairman_name || 'Ketua PPDI Kabupaten Bandung');
    setChairmanTitle(appSettings.chairman_title || 'Ketua Pengurus Daerah PPDI Kabupaten Bandung');
    setChairmanPhoto(appSettings.chairman_photo || '');
    setChairmanGreeting(appSettings.chairman_greeting || '');
  }, [appSettings]);

  const [saving, setSaving] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const bgInputRef = useRef<HTMLInputElement>(null);
  const watermarkInputRef = useRef<HTMLInputElement>(null);
  const chairmanPhotoInputRef = useRef<HTMLInputElement>(null);

  // Handle Logo File Upload
  const handleLogoFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        setErrorBanner('Ukuran berkas logo maksimal 2 MB.');
        return;
      }
      setErrorBanner(null);
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          isDirtyRef.current = true;
          setLogoUrl(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle Background Image File Upload
  const handleBgFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setErrorBanner('Ukuran gambar latar maksimal 5 MB.');
        return;
      }
      setErrorBanner(null);
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          isDirtyRef.current = true;
          setLoginBackgroundImage(event.target.result as string);
          setLoginBackgroundType('custom_image');
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle Watermark Logo File Upload
  const handleWatermarkFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        setErrorBanner('Ukuran berkas logo watermark maksimal 2 MB.');
        return;
      }
      setErrorBanner(null);
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          isDirtyRef.current = true;
          setWatermarkLogoUrl(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle Chairman Photo Upload (JPG, PNG, WEBP, max 2 MB)
  const handleChairmanPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    const validType =
      ALLOWED_CHAIRMAN_IMAGE_TYPES.includes(file.type.toLowerCase()) ||
      ['jpg', 'jpeg', 'png', 'webp'].includes(ext);

    if (!validType) {
      setErrorBanner('Format foto Ketua tidak didukung. Gunakan file JPG, PNG, atau WEBP.');
      e.target.value = '';
      return;
    }

    if (file.size > MAX_CHAIRMAN_PHOTO_BYTES) {
      setErrorBanner('Ukuran foto Ketua terlalu besar. Batas maksimal adalah 2 MB.');
      e.target.value = '';
      return;
    }

    setErrorBanner(null);
    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        isDirtyRef.current = true;
        setChairmanPhoto(event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const effectiveWatermarkPreviewLogo =
    watermarkLogoUrl.trim() || logoUrl.trim() || '/logo_kabupaten_bandung.svg';

  const watermarkOpacityPercent = Math.round(
    Math.min(1, Math.max(0, Number.isFinite(watermarkOpacity) ? watermarkOpacity : 0.09)) * 100
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSavedSuccess(null);
    setErrorBanner(null);

    const normalizedOpacity = Math.round(Math.min(1, Math.max(0, watermarkOpacity)) * 100) / 100;

    try {
      if (activeSettingsTab === 'chairman') {
        const result = await updateChairmanSettings({
          chairman_name: chairmanName.trim() || 'Ketua PPDI Kabupaten Bandung',
          chairman_title: chairmanTitle.trim() || 'Ketua Pengurus Daerah PPDI Kabupaten Bandung',
          chairman_photo: chairmanPhoto.trim(),
          chairman_greeting: chairmanGreeting,
          remove_photo: chairmanPhoto.trim() === '',
        });

        if (!result?.success) {
          setErrorBanner(result?.message || 'Gagal menyimpan sambutan Ketua PPDI. Silakan periksa kembali isian Anda.');
          return;
        }

        if (result.data) {
          setChairmanPhoto(result.data.chairman_photo || '');
          setChairmanName(result.data.chairman_name || 'Ketua PPDI Kabupaten Bandung');
          setChairmanTitle(result.data.chairman_title || 'Ketua Pengurus Daerah PPDI Kabupaten Bandung');
          setChairmanGreeting(result.data.chairman_greeting || '');
        }

        isDirtyRef.current = false;
        setSavedSuccess('Sambutan Ketua PPDI Kabupaten Bandung berhasil disimpan dan langsung tampil di halaman depan publik!');
        setTimeout(() => setSavedSuccess(null), 5000);
        return;
      }

      const result = await updateAppSettings({
        appName: appName.trim().toUpperCase(),
        appSubtitle: appSubtitle.trim(),
        logoUrl: logoUrl.trim(),
        watermarkLogoUrl: watermarkLogoUrl.trim(),
        watermarkOpacity: normalizedOpacity,
        watermarkOpacityFront: normalizedOpacity,
        watermarkOpacityBack: normalizedOpacity,
        loginBackgroundType,
        loginBackgroundImage: loginBackgroundImage.trim(),
        loginOverlayOpacity,
        syncIntervalSeconds: Number(syncInterval) || 60,
        chairman_name: chairmanName.trim() || 'Ketua PPDI Kabupaten Bandung',
        chairman_title: chairmanTitle.trim() || 'Ketua Pengurus Daerah PPDI Kabupaten Bandung',
        chairman_photo: chairmanPhoto.trim(),
        chairman_greeting: chairmanGreeting,
      });

      if (!result?.success) {
        setErrorBanner(result?.message || 'Gagal menyimpan pengaturan aplikasi. Silakan periksa kembali isian Anda.');
        return;
      }

      if (result.settings) {
        setChairmanPhoto(result.settings.chairman_photo || '');
        setChairmanName(result.settings.chairman_name || 'Ketua PPDI Kabupaten Bandung');
        setChairmanTitle(result.settings.chairman_title || 'Ketua Pengurus Daerah PPDI Kabupaten Bandung');
        setChairmanGreeting(result.settings.chairman_greeting || '');
      }

      isDirtyRef.current = false;
      setSavedSuccess('Pengaturan aplikasi berhasil disimpan dan langsung diterapkan ke seluruh sistem!');
      setTimeout(() => setSavedSuccess(null), 5000);
    } catch (err: any) {
      setErrorBanner('Gagal menyimpan pengaturan: ' + (err?.message || 'Kesalahan jaringan'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-16 text-neutral-900">
      {/* Top Banner */}
      <div className="bg-[#064E3B] text-white p-6 rounded-xl shadow-md flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-amber-300" />
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Setting & Kustomisasi Aplikasi</h1>
          </div>
          <p className="text-emerald-100 text-xs sm:text-sm mt-1">
            Konfigurasi Logo Resmi, Latar Belakang Halaman Login, Sambutan Ketua PPDI, Branding Organisasi, dan Sinkronisasi Database.
          </p>
        </div>
      </div>

      {/* Section Navigation Tabs */}
      <div className="bg-white border border-neutral-200 rounded-xl p-1.5 shadow-xs flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => {
            setActiveSettingsTab('general');
            setErrorBanner(null);
          }}
          className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeSettingsTab === 'general'
              ? 'bg-[#064E3B] text-white shadow-xs'
              : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span>Identitas, Logo & Tampilan</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setActiveSettingsTab('chairman');
            setErrorBanner(null);
          }}
          className={`flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeSettingsTab === 'chairman'
              ? 'bg-[#064E3B] text-white shadow-xs'
              : 'text-neutral-600 hover:text-neutral-900 hover:bg-neutral-100'
          }`}
        >
          <Quote className="w-4 h-4 text-amber-400" />
          <span>Sambutan Ketua PPDI</span>
        </button>
      </div>

      {savedSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs sm:text-sm rounded-xl flex items-center gap-2.5 shadow-xs">
          <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="font-semibold">{savedSuccess}</span>
        </div>
      )}

      {errorBanner && (
        <div className="p-4 bg-red-50 border border-red-300 text-red-900 text-xs sm:text-sm rounded-xl flex items-center justify-between gap-2.5 shadow-xs">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
            <span className="font-semibold">{errorBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorBanner(null)}
            className="text-red-500 hover:text-red-700 text-xs font-bold px-2 py-1 cursor-pointer"
          >
            Tutup
          </button>
        </div>
      )}

      <form
        ref={formContainerRef}
        onSubmit={handleSave}
        onChange={() => {
          isDirtyRef.current = true;
        }}
        className="space-y-6"
      >
        {activeSettingsTab === 'chairman' ? (
          /* ============================================================== */
          /* TAB KHUSUS: SAMBUTAN KETUA PPDI KABUPATEN BANDUNG              */
          /* ============================================================== */
          <div className="space-y-6">
            <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-xs space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-neutral-100 pb-4">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-[#064E3B] shrink-0">
                    <Quote className="w-4 h-4" />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-800">
                      Sambutan Ketua PPDI Kabupaten Bandung
                    </h2>
                    <p className="text-xs text-neutral-500 mt-0.5">
                      Ditampilkan di halaman depan (Publik) pada posisi sebelah kanan paling atas tanpa memerlukan login.
                    </p>
                  </div>
                </div>
                <span className="text-[11px] font-mono text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md self-start sm:self-center">
                  Halaman Publik · Kanan Atas
                </span>
              </div>

              {/* Photo Upload + Preview */}
              <div className="grid grid-cols-1 md:grid-cols-[220px_1fr] gap-6 items-start">
                <div className="flex flex-col items-center p-5 bg-neutral-50 border border-neutral-200 rounded-xl text-center">
                  <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wide mb-3">
                    Foto Ketua PPDI
                  </span>
                  <div className="w-28 h-28 rounded-full bg-white border-2 border-[#064E3B]/30 ring-2 ring-amber-400/50 ring-offset-2 flex items-center justify-center overflow-hidden shadow-sm">
                    {chairmanPhoto ? (
                      <img
                        src={chairmanPhoto}
                        alt={chairmanName || 'Foto Ketua PPDI'}
                        className="w-full h-full object-cover object-top"
                      />
                    ) : (
                      <div className="flex flex-col items-center text-neutral-400">
                        <User className="w-10 h-10 text-[#064E3B]/60" />
                        <span className="text-[10px] mt-1 font-mono text-neutral-500">Belum Ada Foto</span>
                      </div>
                    )}
                  </div>

                  <input
                    ref={chairmanPhotoInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleChairmanPhotoChange}
                    className="hidden"
                  />

                  <div className="mt-4 flex flex-col gap-2 w-full">
                    <button
                      type="button"
                      disabled={!canEdit}
                      onClick={() => chairmanPhotoInputRef.current?.click()}
                      className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-[#064E3B] hover:bg-[#043d2e] text-white rounded-lg text-xs font-bold transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <Upload className="w-3.5 h-3.5 text-amber-300" />
                      <span>{chairmanPhoto ? 'Ganti Foto' : 'Unggah Foto'}</span>
                    </button>

                    {chairmanPhoto && (
                      <button
                        type="button"
                        disabled={!canEdit}
                        onClick={() => {
                          isDirtyRef.current = true;
                          setChairmanPhoto('');
                        }}
                        className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Hapus Foto</span>
                      </button>
                    )}
                  </div>

                  <p className="text-[10px] text-neutral-500 mt-3 leading-relaxed">
                    Format: <strong>JPG, PNG, WEBP</strong> · Maks. <strong>2 MB</strong>. Disarankan foto potret resmi rasio 1:1.
                  </p>
                </div>

                {/* Text Fields: Name, Title, Greeting */}
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-neutral-700 uppercase mb-1.5">
                        Nama Ketua PPDI
                      </label>
                      <input
                        type="text"
                        maxLength={150}
                        disabled={!canEdit}
                        value={chairmanName}
                        onChange={(e) => {
                          isDirtyRef.current = true;
                          setChairmanName(e.target.value);
                        }}
                        placeholder="Contoh: H. Ahmad Suryana, S.IP."
                        className="w-full p-2.5 border border-neutral-300 rounded-lg text-xs font-semibold text-neutral-900 focus:ring-2 focus:ring-[#064E3B] outline-none disabled:bg-neutral-100"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-neutral-700 uppercase mb-1.5">
                        Jabatan
                      </label>
                      <input
                        type="text"
                        maxLength={200}
                        disabled={!canEdit}
                        value={chairmanTitle}
                        onChange={(e) => {
                          isDirtyRef.current = true;
                          setChairmanTitle(e.target.value);
                        }}
                        placeholder="Ketua Pengurus Daerah PPDI Kabupaten Bandung"
                        className="w-full p-2.5 border border-neutral-300 rounded-lg text-xs text-neutral-900 focus:ring-2 focus:ring-[#064E3B] outline-none disabled:bg-neutral-100"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-bold text-neutral-700 uppercase">
                        Kata-Kata Sambutan Ketua
                      </label>
                      <span className="text-[11px] font-mono text-neutral-500 tabular-nums">
                        {chairmanGreeting.length.toLocaleString('id-ID')} / 10.000 karakter
                      </span>
                    </div>
                    <textarea
                      rows={8}
                      maxLength={10000}
                      disabled={!canEdit}
                      value={chairmanGreeting}
                      onChange={(e) => {
                        isDirtyRef.current = true;
                        setChairmanGreeting(e.target.value);
                      }}
                      placeholder={
                        "Assalamu'alaikum Warahmatullahi Wabarakatuh.\n\nTulis pesan sambutan resmi Ketua PPDI Kabupaten Bandung untuk seluruh perangkat desa dan masyarakat Kabupaten Bandung..."
                      }
                      className="w-full p-3 border border-neutral-300 rounded-lg text-xs sm:text-sm leading-relaxed text-neutral-900 focus:ring-2 focus:ring-[#064E3B] outline-none resize-y disabled:bg-neutral-100"
                    />
                    <p className="text-[11px] text-neutral-500 mt-1.5">
                      Tekan <kbd className="px-1 py-0.5 bg-neutral-100 border border-neutral-200 rounded text-[10px]">Enter</kbd> untuk membuat paragraf baru. Jika sambutan cukup panjang, tombol <strong>&ldquo;Baca Selengkapnya&rdquo;</strong> akan muncul otomatis di halaman publik.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Live Public Preview */}
            <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-xs space-y-4">
              <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-[#064E3B]" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-800">
                    Pratinjau Kartu di Halaman Depan (Publik)
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-neutral-500">Simulasi Kolom Kanan Atas (420px)</span>
              </div>

              <div
                className="rounded-xl p-5 sm:p-6 flex justify-center"
                style={{
                  background: 'radial-gradient(circle at top left, #064E3B 0%, #052e23 55%, #031712 100%)',
                }}
              >
                <div className="w-full max-w-[420px]">
                  <ChairmanGreetingCard
                    chairmanName={chairmanName}
                    chairmanTitle={chairmanTitle}
                    chairmanPhoto={chairmanPhoto}
                    chairmanGreeting={chairmanGreeting}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
        {/* ============================================================== */}
        {/* SECTION 1: PENGATURAN LOGO APLIKASI */}
        {/* ============================================================== */}
        <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-xs space-y-5">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-[#064E3B]" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-800">
                1. Pengaturan Logo Aplikasi & Organisasi
              </h2>
            </div>
            <span className="text-[11px] font-mono text-neutral-500">Tampil di Header & Login</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            {/* Logo Preview Box */}
            <div className="flex flex-col items-center justify-center p-4 bg-neutral-50 border border-neutral-200 rounded-xl text-center">
              <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wide mb-3">
                Pratinjau Logo
              </span>
              <div className="w-28 h-28 rounded-xl bg-white border border-neutral-200 flex items-center justify-center p-2 shadow-xs overflow-hidden">
                {logoUrl ? (
                  <img src={logoUrl} alt="Logo Preview" className="max-w-full max-h-full object-contain" />
                ) : (
                  <div className="flex flex-col items-center text-neutral-400">
                    <Shield className="w-10 h-10 text-[#064E3B]" />
                    <span className="text-[10px] mt-1 font-mono text-neutral-500">Garuda Default</span>
                  </div>
                )}
              </div>
              {logoUrl && (
                <button
                  type="button"
                  onClick={() => {
                    isDirtyRef.current = true;
                    setLogoUrl('');
                  }}
                  className="mt-2 text-[11px] text-red-600 hover:text-red-700 font-medium cursor-pointer"
                >
                  Reset ke Logo Default
                </button>
              )}

              {/* Favicon Browser Tab Preview */}
              <div className="mt-3 p-2 bg-neutral-100 rounded-lg border border-neutral-200 w-full text-left space-y-1">
                <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide block">
                  Favicon & Tab Browser:
                </span>
                <div className="flex items-center gap-2 p-1.5 bg-white rounded border border-neutral-200 shadow-xs">
                  <div className="w-4 h-4 rounded-xs flex items-center justify-center shrink-0 overflow-hidden bg-neutral-50">
                    {logoUrl ? (
                      <img src={logoUrl} alt="Favicon" className="w-full h-full object-contain" />
                    ) : (
                      <Shield className="w-3.5 h-3.5 text-[#064E3B]" />
                    )}
                  </div>
                  <span className="text-[10px] font-medium text-neutral-800 truncate font-sans">
                    {appName || 'PPDI KAB. BANDUNG'}
                  </span>
                </div>
                <span className="text-[9px] text-neutral-500 block font-mono">
                  * Otomatis sinkron ke favicon tab browser
                </span>
              </div>
            </div>

            {/* Logo Inputs */}
            <div className="md:col-span-2 space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-700 uppercase mb-1">
                  URL Gambar Logo (Direct Web Link)
                </label>
                <input
                  type="text"
                  placeholder="https://example.com/logo-ppdi.png"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  className="w-full p-2.5 border border-neutral-300 rounded-lg text-xs font-mono text-neutral-900 focus:ring-2 focus:ring-[#064E3B] outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-neutral-700 uppercase mb-1">
                  Atau Unggah Berkas Logo dari Komputer
                </label>
                <input
                  type="file"
                  ref={logoInputRef}
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  onChange={handleLogoFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => logoInputRef.current?.click()}
                  className="px-4 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 border border-neutral-300 rounded-lg text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <Upload className="w-4 h-4 text-neutral-600" />
                  <span>Pilih File Logo (PNG / JPG / SVG)</span>
                </button>
              </div>

              {/* Logo Presets */}
              <div className="pt-2">
                <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wide block mb-1.5">
                  Pilihan Logo Standar:
                </span>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      isDirtyRef.current = true;
                      setLogoUrl('/logo_kabupaten_bandung.svg');
                    }}
                    className="px-3 py-1 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-md text-[11px] text-neutral-700 cursor-pointer font-medium"
                  >
                    Logo Lambang Kab. Bandung
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      isDirtyRef.current = true;
                      setLogoUrl('');
                    }}
                    className="px-3 py-1 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-md text-[11px] text-neutral-700 cursor-pointer font-medium"
                  >
                    Icon Garuda PPDI (Default)
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* SECTION 2: PENGATURAN LATAR BELAKANG HALAMAN LOGIN */}
        {/* ============================================================== */}
        <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-xs space-y-5">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <div className="flex items-center gap-2">
              <Paintbrush className="w-5 h-5 text-[#064E3B]" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-800">
                2. Pengaturan Latar Belakang Halaman Login
              </h2>
            </div>
            <span className="text-[11px] font-mono text-neutral-500">Tampilan Auth Gateway</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Style Selector */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-neutral-700 uppercase mb-2">
                  Pilih Tema Latar Belakang
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      isDirtyRef.current = true;
                      setLoginBackgroundType('preset_emerald');
                    }}
                    className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                      loginBackgroundType === 'preset_emerald'
                        ? 'border-[#064E3B] bg-emerald-50 ring-2 ring-[#064E3B]/20 text-[#064E3B]'
                        : 'border-neutral-200 hover:border-neutral-300 text-neutral-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-3.5 h-3.5 rounded-full bg-[#064E3B]" />
                      <span className="text-xs font-bold">Deep Emerald</span>
                    </div>
                    <p className="text-[10px] text-neutral-500 leading-tight">Warna klasik kelembagaan PPDI</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      isDirtyRef.current = true;
                      setLoginBackgroundType('gradient_mesh');
                    }}
                    className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                      loginBackgroundType === 'gradient_mesh'
                        ? 'border-[#064E3B] bg-emerald-50 ring-2 ring-[#064E3B]/20 text-[#064E3B]'
                        : 'border-neutral-200 hover:border-neutral-300 text-neutral-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      <span className="text-xs font-bold">Gradient Mesh</span>
                    </div>
                    <p className="text-[10px] text-neutral-500 leading-tight">Kombinasi hijau zamrud & kuning tropis</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      isDirtyRef.current = true;
                      setLoginBackgroundType('dark_slate');
                    }}
                    className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                      loginBackgroundType === 'dark_slate'
                        ? 'border-[#064E3B] bg-emerald-50 ring-2 ring-[#064E3B]/20 text-[#064E3B]'
                        : 'border-neutral-200 hover:border-neutral-300 text-neutral-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-3.5 h-3.5 rounded-full bg-slate-800" />
                      <span className="text-xs font-bold">Dark Slate</span>
                    </div>
                    <p className="text-[10px] text-neutral-500 leading-tight">Nuansa gelap modern & eksklusif</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      isDirtyRef.current = true;
                      setLoginBackgroundType('custom_image');
                    }}
                    className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                      loginBackgroundType === 'custom_image'
                        ? 'border-[#064E3B] bg-emerald-50 ring-2 ring-[#064E3B]/20 text-[#064E3B]'
                        : 'border-neutral-200 hover:border-neutral-300 text-neutral-700'
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <Image className="w-3.5 h-3.5 text-blue-600" />
                      <span className="text-xs font-bold">Gambar Kustom</span>
                    </div>
                    <p className="text-[10px] text-neutral-500 leading-tight">Unggah foto kantor/desa sendiri</p>
                  </button>
                </div>
              </div>

              {/* If Custom Image selected */}
              {loginBackgroundType === 'custom_image' && (
                <div className="space-y-3 pt-2 p-3 bg-neutral-50 border border-neutral-200 rounded-lg">
                  <div>
                    <label className="block text-xs font-bold text-neutral-700 uppercase mb-1">
                      URL Gambar Latar Belakang
                    </label>
                    <input
                      type="text"
                      placeholder="https://images.unsplash.com/... atau URL lain"
                      value={loginBackgroundImage}
                      onChange={(e) => setLoginBackgroundImage(e.target.value)}
                      className="w-full p-2 border border-neutral-300 rounded-md text-xs font-mono text-neutral-900 focus:ring-2 focus:ring-[#064E3B] outline-none"
                    />
                  </div>

                  <div>
                    <input
                      type="file"
                      ref={bgInputRef}
                      accept="image/*"
                      onChange={handleBgFileChange}
                      className="hidden"
                    />
                    <button
                      type="button"
                      onClick={() => bgInputRef.current?.click()}
                      className="px-3 py-1.5 bg-white hover:bg-neutral-100 text-neutral-800 border border-neutral-300 rounded-md text-xs font-semibold flex items-center gap-2 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5 text-neutral-600" />
                      <span>Unggah Gambar Latar dari Komputer</span>
                    </button>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs font-medium mb-1">
                      <label className="text-neutral-700 font-bold uppercase text-[10px]">
                        Tingkat Kegelapan Lapisan Overlay (Filter Pembaca Teks)
                      </label>
                      <span className="font-mono text-neutral-600">{loginOverlayOpacity}</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="0.85"
                      step="0.05"
                      value={loginOverlayOpacity}
                      onChange={(e) => setLoginOverlayOpacity(e.target.value)}
                      className="w-full accent-[#064E3B] cursor-pointer"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Live Mini Preview of Login Background */}
            <div className="flex flex-col">
              <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" />
                <span>Simulasi Tampilan Layar Login</span>
              </span>
              <div
                className="w-full flex-1 min-h-[220px] rounded-xl relative overflow-hidden flex items-center justify-center p-4 border border-neutral-300 shadow-inner"
                style={{
                  backgroundColor:
                    loginBackgroundType === 'dark_slate'
                      ? '#090d16'
                      : loginBackgroundType === 'gradient_mesh'
                      ? '#064E3B'
                      : '#064E3B',
                  backgroundImage:
                    loginBackgroundType === 'custom_image' && loginBackgroundImage
                      ? `linear-gradient(rgba(6, 78, 59, ${loginOverlayOpacity}), rgba(17, 17, 19, ${loginOverlayOpacity})), url("${loginBackgroundImage}")`
                      : loginBackgroundType === 'gradient_mesh'
                      ? 'radial-gradient(at 0% 0%, #064E3B 0px, transparent 50%), radial-gradient(at 100% 0%, #047857 0px, transparent 50%), radial-gradient(at 100% 100%, #15803d 0px, transparent 50%), #064E3B'
                      : loginBackgroundType === 'dark_slate'
                      ? 'radial-gradient(circle at 50% 20%, #1e293b 0%, #090d16 100%)'
                      : undefined,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              >
                {/* Simulated Login Card in Mini Preview */}
                <div className="bg-white/15 backdrop-blur-md border border-white/20 p-4 rounded-lg w-full max-w-[230px] text-center shadow-lg">
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo" className="w-8 h-8 object-contain mx-auto mb-1.5 drop-shadow-sm" />
                  ) : (
                    <Shield className="w-6 h-6 text-amber-300 mx-auto mb-1.5" />
                  )}
                  <div className="text-[11px] font-extrabold text-amber-300 uppercase tracking-tight">
                    {appName || 'PPDI KAB. BANDUNG'}
                  </div>
                  <div className="text-[8px] text-white/80 mt-1 line-clamp-1">Portal Keanggotaan Resmi</div>
                  <div className="mt-2.5 space-y-1">
                    <div className="w-full h-4 bg-white/20 rounded-xs" />
                    <div className="w-full h-4 bg-white/20 rounded-xs" />
                    <div className="w-full h-4 bg-amber-400 rounded-xs mt-1" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* SECTION 3: PDF & KTA STYLING */}
        {/* ============================================================== */}
        <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-xs space-y-5">
          <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
            <div className="flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-[#064E3B]" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-800">
                3. PDF &amp; KTA Styling
              </h2>
            </div>
            <span className="text-[11px] font-mono text-neutral-500">
              Berlaku Global di E-KTA &amp; Ekspor PDF
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Watermark Controls */}
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-neutral-700 uppercase">
                    URL Logo Watermark Organisasi
                  </label>
                  {watermarkLogoUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        isDirtyRef.current = true;
                        setWatermarkLogoUrl('');
                      }}
                      className="text-[11px] text-emerald-700 hover:text-emerald-800 font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Ikuti Logo Utama</span>
                    </button>
                  )}
                </div>
                <input
                  type="text"
                  placeholder="Kosongkan untuk otomatis mengikuti Logo Aplikasi Utama"
                  value={watermarkLogoUrl}
                  onChange={(e) => setWatermarkLogoUrl(e.target.value)}
                  className="w-full p-2.5 border border-neutral-300 rounded-lg text-xs font-mono text-neutral-900 focus:ring-2 focus:ring-[#064E3B] outline-none"
                />
                <p className="text-[11px] text-neutral-500 mt-1">
                  {watermarkLogoUrl.trim()
                    ? 'Menggunakan logo watermark khusus yang diunggah/diatur di atas.'
                    : 'Sinkron otomatis dengan Logo Aplikasi pada Bagian 1.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="file"
                  ref={watermarkInputRef}
                  accept="image/png,image/jpeg,image/svg+xml,image/webp"
                  onChange={handleWatermarkFileChange}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => watermarkInputRef.current?.click()}
                  className="px-3.5 py-2 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 border border-neutral-300 rounded-lg text-xs font-semibold flex items-center gap-2 cursor-pointer transition-colors"
                >
                  <Upload className="w-3.5 h-3.5 text-neutral-600" />
                  <span>Unggah Logo Watermark</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    isDirtyRef.current = true;
                    setWatermarkLogoUrl('/logo_kabupaten_bandung.svg');
                  }}
                  className="px-3 py-2 bg-neutral-50 hover:bg-neutral-100 border border-neutral-200 rounded-lg text-[11px] text-neutral-700 cursor-pointer font-medium"
                >
                  Preset Lambang Kab. Bandung
                </button>
              </div>

              {/* Global Watermark Opacity Slider (0 - 100%) */}
              <div className="p-4 bg-neutral-50 border border-neutral-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-neutral-700 uppercase tracking-wide">
                    Global Watermark Opacity (0–100%)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      isDirtyRef.current = true;
                      setWatermarkOpacity(0.09);
                    }}
                    className="text-[11px] text-emerald-700 hover:text-emerald-900 font-semibold cursor-pointer flex items-center gap-1 shrink-0"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Default (9%)</span>
                  </button>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <label htmlFor="global-watermark-opacity" className="font-semibold text-neutral-700">
                      Transparansi Watermark (Depan &amp; Belakang)
                    </label>
                    <span className="font-mono font-bold text-emerald-900 tabular-nums bg-emerald-100/70 px-2 py-0.5 rounded border border-emerald-200">
                      {watermarkOpacityPercent}%
                    </span>
                  </div>
                  <input
                    id="global-watermark-opacity"
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={watermarkOpacityPercent}
                    onChange={(e) => setWatermarkOpacity(Number(e.target.value) / 100)}
                    className="w-full accent-[#064E3B] cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-neutral-400 font-mono mt-1">
                    <span>0% (Nonaktif)</span>
                    <span>9% (Standar)</span>
                    <span>50%</span>
                    <span>100% (Penuh)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Live Card Watermark Preview */}
            <div className="flex flex-col space-y-2.5">
              <span className="text-[11px] font-bold text-neutral-500 uppercase tracking-wide flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" />
                <span>Simulasi Watermark pada Kartu E-KTA &amp; PDF</span>
              </span>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-1 gap-3 flex-1">
                {/* Mini Front Card Preview */}
                <div
                  className="rounded-xl p-3.5 relative overflow-hidden text-white flex flex-col justify-between aspect-[85.6/54] border border-amber-400/50 shadow-sm"
                  style={{
                    background: 'linear-gradient(135deg, #064e3b 0%, #065f46 50%, #042f2e 100%)',
                  }}
                >
                  <div
                    className="absolute inset-0 opacity-10 pointer-events-none"
                    style={{
                      backgroundImage: 'radial-gradient(circle, #fde047 1px, transparent 1px)',
                      backgroundSize: '14px 14px',
                    }}
                  />
                  <div
                    className="absolute -top-10 -right-10 w-36 h-36 rounded-full blur-xl pointer-events-none"
                    style={{ backgroundColor: 'rgba(251, 191, 36, 0.12)' }}
                  />
                  {effectiveWatermarkPreviewLogo && watermarkOpacityPercent > 0 && (
                    <div
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-28 h-28 pointer-events-none select-none flex items-center justify-center"
                      style={{ opacity: watermarkOpacityPercent / 100 }}
                    >
                      <img
                        src={effectiveWatermarkPreviewLogo}
                        alt="Watermark Depan"
                        className="w-full h-full object-contain filter grayscale brightness-200"
                      />
                    </div>
                  )}
                  <div className="relative z-10 flex items-center justify-between border-b border-amber-400/30 pb-1.5">
                    <span className="text-[9px] font-extrabold text-amber-300 uppercase tracking-wider truncate">
                      {appName || 'PPDI KAB. BANDUNG'}
                    </span>
                    <span className="text-[8px] font-mono text-emerald-200 shrink-0 tabular-nums">
                      Depan · {watermarkOpacityPercent}%
                    </span>
                  </div>
                  <div className="relative z-10 flex items-center gap-2.5 my-auto py-1">
                    <div className="w-9 h-12 rounded-md bg-emerald-950/80 border border-amber-300/80 shrink-0" />
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="h-2.5 w-3/4 rounded bg-amber-300/80" />
                      <div className="h-2 w-1/2 rounded bg-white/50" />
                      <div className="h-4 w-full rounded bg-emerald-950/90 border border-amber-400/70 mt-1" />
                    </div>
                  </div>
                  <div className="relative z-10 text-[7.5px] text-emerald-200 border-t border-amber-400/30 pt-1 flex justify-between">
                    <span>STATUS: AKTIF</span>
                    <span>E-KTA DIGITAL</span>
                  </div>
                </div>

                {/* Mini Back Card Preview */}
                <div
                  className="rounded-xl p-3.5 relative overflow-hidden text-white flex flex-col justify-between aspect-[85.6/54] border border-amber-400/50 shadow-sm"
                  style={{
                    background: 'linear-gradient(315deg, #022c22 0%, #064e3b 50%, #065f46 100%)',
                  }}
                >
                  <div
                    className="absolute inset-0 opacity-10 pointer-events-none"
                    style={{
                      backgroundImage: 'radial-gradient(circle, #fde047 1px, transparent 1px)',
                      backgroundSize: '12px 12px',
                    }}
                  />
                  <div
                    className="absolute -bottom-10 -left-10 w-36 h-36 rounded-full blur-xl pointer-events-none"
                    style={{ backgroundColor: 'rgba(5, 150, 105, 0.22)' }}
                  />
                  {effectiveWatermarkPreviewLogo && watermarkOpacityPercent > 0 && (
                    <div
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-28 h-28 pointer-events-none select-none flex items-center justify-center"
                      style={{ opacity: watermarkOpacityPercent / 100 }}
                    >
                      <img
                        src={effectiveWatermarkPreviewLogo}
                        alt="Watermark Belakang"
                        className="w-full h-full object-contain filter grayscale brightness-200"
                      />
                    </div>
                  )}
                  <div className="relative z-10 flex items-center justify-between border-b border-amber-400/30 pb-1.5">
                    <span className="text-[9px] font-extrabold text-amber-300 uppercase tracking-wider">
                      KETENTUAN KARTU
                    </span>
                    <span className="text-[8px] font-mono text-emerald-200 shrink-0 tabular-nums">
                      Belakang · {watermarkOpacityPercent}%
                    </span>
                  </div>
                  <div className="relative z-10 flex items-center justify-between gap-3 my-auto py-1">
                    <div className="space-y-1.5 flex-1">
                      <div className="h-1.5 w-full rounded bg-emerald-100/50" />
                      <div className="h-1.5 w-11/12 rounded bg-emerald-100/40" />
                      <div className="h-1.5 w-4/5 rounded bg-emerald-100/40" />
                    </div>
                    <div className="w-11 h-11 rounded-md bg-white border border-amber-400 shrink-0" />
                  </div>
                  <div className="relative z-10 text-[7.5px] text-amber-300 border-t border-amber-400/30 pt-1 flex justify-between">
                    <span>PPDI KAB. BANDUNG</span>
                    <span>[TTD &amp; CAP]</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ============================================================== */}
        {/* SECTION 4: NAMA APLIKASI & SINKRONISASI */}
        {/* ============================================================== */}
        <div className="bg-white border border-neutral-200 rounded-xl p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2 border-b border-neutral-100 pb-3">
            <Settings className="w-5 h-5 text-[#064E3B]" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-800">
              4. Identitas Aplikasi &amp; Parameter Sinkronisasi
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-neutral-700 uppercase mb-1">
                Nama Utama Aplikasi (Header & Login)
              </label>
              <input
                type="text"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                className="w-full p-2.5 border border-neutral-300 rounded-lg text-xs font-bold uppercase text-neutral-900 focus:ring-2 focus:ring-[#064E3B] outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 uppercase mb-1">
                Sub-Judul / Tagline Aplikasi
              </label>
              <input
                type="text"
                value={appSubtitle}
                onChange={(e) => setAppSubtitle(e.target.value)}
                className="w-full p-2.5 border border-neutral-300 rounded-lg text-xs text-neutral-900 focus:ring-2 focus:ring-[#064E3B] outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-700 uppercase mb-1">
                Interval Sinkronisasi Otomatis Database (Detik)
              </label>
              <input
                type="number"
                min="10"
                max="3600"
                value={syncInterval}
                onChange={(e) => setSyncInterval(e.target.value)}
                className="w-full p-2.5 border border-neutral-300 rounded-lg text-xs font-mono text-neutral-900 focus:ring-2 focus:ring-[#064E3B] outline-none"
              />
            </div>
          </div>
        </div>
          </>
        )}

        {/* Submit Actions */}
        <div className="flex items-center justify-end gap-3 pt-2">
          {canEdit ? (
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-8 py-3 bg-[#064E3B] hover:bg-[#043d2e] text-white rounded-xl text-xs font-bold transition-all shadow-md cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4 text-amber-300" />
              <span>
                {saving
                  ? 'Menyimpan Perubahan...'
                  : activeSettingsTab === 'chairman'
                  ? 'Simpan Perubahan'
                  : 'Simpan Seluruh Pengaturan'}
              </span>
            </button>
          ) : (
            <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg text-xs font-medium">
              Anda berada pada mode Baca Saja (Read-Only). Peran Anda tidak memiliki hak akses untuk mengedit Pengaturan Aplikasi.
            </div>
          )}
        </div>
      </form>
    </div>
  );
};
