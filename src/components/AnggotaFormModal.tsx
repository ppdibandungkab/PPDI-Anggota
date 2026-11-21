import React, { useState, useEffect, useMemo, useRef } from 'react';
import { usePPDI } from '../context/PPDIContext';
import { Anggota, AnggotaFullDetail, RiwayatJabatan, StatusAktifJabatan } from '../types/ppdi';
import { calculateAgeAndRetirement, generateNextKTA, generateNIPD, formatDateIndo, formatNIPDDisplay, safeFetchJson } from '../utils/ppdiHelpers';
import { isValidPdfFile, isPdfDataUrl } from '../utils/fileHelpers';
import {
  X,
  Save,
  UserCheck,
  AlertCircle,
  Upload,
  Camera,
  FileText,
  FileCheck,
  Plus,
  Trash2,
  Clock,
  Briefcase,
  User,
  CreditCard,
  Building,
  CheckCircle,
  Eye,
  ChevronRight,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';

interface AnggotaFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editMember?: AnggotaFullDetail | null;
}

export const AnggotaFormModal: React.FC<AnggotaFormModalProps> = ({
  isOpen,
  onClose,
  editMember,
}) => {
  const {
    anggotaList,
    pendaftaranList,
    kecamatanList,
    desaList,
    jabatanList,
    keanggotaanList,
    riwayatList,
    addAnggotaWithJobAndKta,
    updateAnggota,
    addRiwayatJabatan,
    updateRiwayatJabatan,
    deleteRiwayatJabatan,
    currentUser,
    setActiveTab,
  } = usePPDI();

  // Tab State
  const [activeFormTab, setActiveFormTab] = useState<'biodata' | 'riwayat' | 'organisasi'>('biodata');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdSuccessData, setCreatedSuccessData] = useState<{
    nama: string;
    nik: string;
    noKta: string;
    desa: string;
    jabatan: string;
    foto?: string;
  } | null>(null);

  // Form states - Biodata
  const [nik, setNik] = useState('');
  const [niap, setNiap] = useState('');
  const [namaLengkap, setNamaLengkap] = useState('');
  const [gelarDepan, setGelarDepan] = useState('');
  const [gelarBelakang, setGelarBelakang] = useState('');
  const [tempatLahir, setTempatLahir] = useState('Bandung');
  const [tanggalLahir, setTanggalLahir] = useState('1985-05-15');
  const [jenisKelamin, setJenisKelamin] = useState<'L' | 'P'>('L');
  const [agama, setAgama] = useState('Islam');
  const [pendidikanTerakhir, setPendidikanTerakhir] = useState<'SD' | 'SMP' | 'SMA/SMK' | 'D3' | 'S1' | 'S2' | 'S3'>('SMA/SMK');
  const [noHpWa, setNoHpWa] = useState('');
  const [email, setEmail] = useState('');
  const [alamatRumah, setAlamatRumah] = useState('');
  const [statusPernikahan, setStatusPernikahan] = useState<'Kawin' | 'Belum Kawin' | 'Cerai Hidup' | 'Cerai Mati'>('Kawin');
  
  // Photo states
  const [foto, setFoto] = useState('');
  const [fotoFileName, setFotoFileName] = useState('');
  const [uploadingFoto, setUploadingFoto] = useState(false);
  const fotoInputRef = useRef<HTMLInputElement>(null);

  // Initial Job states (used for create or editing primary)
  const [selectedKec, setSelectedKec] = useState<string>('32.04.05');
  const [selectedDesa, setSelectedDesa] = useState<string>('32.04.05.2001');
  const [selectedJabatan, setSelectedJabatan] = useState<number>(2);
  const [periode, setPeriode] = useState<string>('');
  const [noSk, setNoSk] = useState('');
  const [tglSk, setTglSk] = useState('2023-01-10');
  const [tmtJabatan, setTmtJabatan] = useState('2023-02-01');
  const [fileSk, setFileSk] = useState('');
  const [fileSkName, setFileSkName] = useState('');
  const [uploadingSk, setUploadingSk] = useState(false);
  const skInputRef = useRef<HTMLInputElement>(null);

  const [errorMsg, setErrorMsg] = useState('');
  const [nikCheckStatus, setNikCheckStatus] = useState<
    'idle' | 'checking' | 'valid' | 'duplicate' | 'offline-valid'
  >('idle');
  const [dbDuplicateInfo, setDbDuplicateInfo] = useState<{
    id_anggota: string;
    nama_lengkap: string;
    nipd?: string | null;
  } | null>(null);
  const [dbPendingInfo, setDbPendingInfo] = useState<{
    id_pendaftaran: number | string;
    nama_lengkap: string;
    status_approval?: string;
  } | null>(null);
  const latestNikCheckRef = useRef<string>('');
  const [jabatanPengurus, setJabatanPengurus] = useState('Anggota Biasa');

  // Validasi Real-time Lokal: NIK Wajib Unik (Tidak Boleh Duplikat)
  const duplicateNikLocal = useMemo(() => {
    if (!nik || nik.length !== 16) return null;
    return (
      anggotaList.find(
        (m) => m.nik === nik && (!editMember || m.id_anggota !== editMember.anggota.id_anggota)
      ) || null
    );
  }, [nik, anggotaList, editMember]);

  const pendingPendaftaranLocal = useMemo(() => {
    if (!nik || nik.length !== 16) return null;
    return (
      pendaftaranList.find(
        (p) => p.nik === nik && p.status_approval === 'Menunggu'
      ) || null
    );
  }, [nik, pendaftaranList]);

  const duplicateNikMember = duplicateNikLocal || dbDuplicateInfo;
  const pendingNikRegistration = dbPendingInfo || pendingPendaftaranLocal;

  const verifyNikWithDatabase = async (
    targetNik: string,
    options?: { silentStale?: boolean }
  ): Promise<{ valid: boolean; message?: string }> => {
    const cleanNik = targetNik.replace(/\D/g, '').trim();
    if (cleanNik.length !== 16) {
      setNikCheckStatus('idle');
      setDbDuplicateInfo(null);
      setDbPendingInfo(null);
      return {
        valid: false,
        message: 'NIK KTP harus terdiri dari tepat 16 digit angka.',
      };
    }

    const excludeId = editMember?.anggota.id_anggota || '';
    const localDup = anggotaList.find(
      (m) => m.nik === cleanNik && (!excludeId || m.id_anggota !== excludeId)
    );
    if (localDup) {
      setDbDuplicateInfo({
        id_anggota: localDup.id_anggota,
        nama_lengkap: localDup.nama_lengkap,
        nipd: localDup.nipd,
      });
      setNikCheckStatus('duplicate');
      return {
        valid: false,
        message: `NIK ${cleanNik} sudah terdaftar atas nama "${localDup.nama_lengkap}" (ID: ${localDup.id_anggota}). NIK perangkat desa bersifat unik dan tidak boleh duplikat!`,
      };
    }

    latestNikCheckRef.current = cleanNik;
    setNikCheckStatus('checking');

    try {
      const res = await safeFetchJson(
        `/api/anggota/check-nik?nik=${encodeURIComponent(cleanNik)}&excludeId=${encodeURIComponent(excludeId)}`
      );

      if (options?.silentStale && latestNikCheckRef.current !== cleanNik) {
        return { valid: false };
      }

      if (res.ok && res.data?.success) {
        const dup = res.data.duplicateInAnggota || null;
        const pending = res.data.pendingPendaftaran || null;
        setDbPendingInfo(pending);

        if (!res.data.available && dup) {
          setDbDuplicateInfo(dup);
          setNikCheckStatus('duplicate');
          return {
            valid: false,
            message: `NIK ${cleanNik} sudah terdaftar di database atas nama "${dup.nama_lengkap}" (ID: ${dup.id_anggota}). NIK perangkat desa bersifat unik dan tidak boleh duplikat!`,
          };
        }

        setDbDuplicateInfo(null);
        setNikCheckStatus('valid');
        return { valid: true };
      }

      // Fallback apabila server/MySQL sedang offline atau 503
      setDbDuplicateInfo(null);
      setNikCheckStatus('offline-valid');
      return { valid: true };
    } catch {
      if (options?.silentStale && latestNikCheckRef.current !== cleanNik) {
        return { valid: false };
      }
      setDbDuplicateInfo(null);
      setNikCheckStatus('offline-valid');
      return { valid: true };
    }
  };

  // Otomatis cek keunikan NIK ke database secara real-time saat 16 digit terpenuhi
  useEffect(() => {
    if (!isOpen) return;

    if (!nik || nik.length < 16) {
      latestNikCheckRef.current = '';
      setNikCheckStatus('idle');
      setDbDuplicateInfo(null);
      setDbPendingInfo(null);
      return;
    }

    if (duplicateNikLocal) {
      setDbDuplicateInfo({
        id_anggota: duplicateNikLocal.id_anggota,
        nama_lengkap: duplicateNikLocal.nama_lengkap,
        nipd: duplicateNikLocal.nipd,
      });
      setNikCheckStatus('duplicate');
      return;
    }

    setNikCheckStatus('checking');
    const timer = window.setTimeout(() => {
      void verifyNikWithDatabase(nik, { silentStale: true });
    }, 350);

    return () => window.clearTimeout(timer);
  }, [nik, editMember?.anggota.id_anggota, isOpen, duplicateNikLocal]);

  // Validasi kelengkapan form per tab
  const isBiodataValid = useMemo(() => {
    return (
      nik.length === 16 &&
      !duplicateNikMember &&
      nikCheckStatus !== 'checking' &&
      namaLengkap.trim().length > 0 &&
      tempatLahir.trim().length > 0 &&
      Boolean(tanggalLahir) &&
      noHpWa.trim().length >= 8
    );
  }, [nik, duplicateNikMember, nikCheckStatus, namaLengkap, tempatLahir, tanggalLahir, noHpWa]);

  const isRiwayatValid = useMemo(() => {
    const periodeOk = Number(selectedJabatan) !== 10 || ['1', '2', '3'].includes(String(periode));
    return Boolean(selectedDesa) && Boolean(selectedJabatan) && periodeOk;
  }, [selectedDesa, selectedJabatan, periode]);

  const isAllRequiredFieldsFilled = useMemo(() => {
    const periodeOk = Number(selectedJabatan) !== 10 || ['1', '2', '3'].includes(String(periode));
    return (
      nik.length === 16 &&
      !duplicateNikMember &&
      nikCheckStatus !== 'checking' &&
      namaLengkap.trim().length > 0 &&
      tempatLahir.trim().length > 0 &&
      Boolean(tanggalLahir) &&
      noHpWa.trim().length >= 8 &&
      Boolean(selectedDesa) &&
      Boolean(selectedJabatan) &&
      periodeOk &&
      noSk.trim().length > 0
    );
  }, [nik, duplicateNikMember, nikCheckStatus, namaLengkap, tempatLahir, tanggalLahir, noHpWa, selectedDesa, selectedJabatan, periode, noSk]);

  const [isVerificationModalOpen, setIsVerificationModalOpen] = useState(false);

  // Sub-form state: Adding new Riwayat Jabatan to an existing member or secondary appointment
  const [showAddRiwayatForm, setShowAddRiwayatForm] = useState(false);
  const [newRwKec, setNewRwKec] = useState('32.04.05');
  const [newRwDesa, setNewRwDesa] = useState('32.04.05.2001');
  const [newRwJabatan, setNewRwJabatan] = useState<number>(2);
  const [newRwPeriode, setNewRwPeriode] = useState<string>('');
  const [newRwNoSk, setNewRwNoSk] = useState('');
  const [newRwTglSk, setNewRwTglSk] = useState(new Date().toISOString().split('T')[0]);
  const [newRwTmt, setNewRwTmt] = useState(new Date().toISOString().split('T')[0]);
  const [newRwStatus, setNewRwStatus] = useState<StatusAktifJabatan>('Aktif');
  const [newRwKeterangan, setNewRwKeterangan] = useState('Mutasi / Promosi Jabatan');
  const [newRwFileSk, setNewRwFileSk] = useState('');
  const [newRwFileSkName, setNewRwFileSkName] = useState('');
  const [uploadingNewRwSk, setUploadingNewRwSk] = useState(false);
  const newRwSkInputRef = useRef<HTMLInputElement>(null);

  const lockedScopeSessionKeyRef = useRef<string>('');
  const loadedModalSessionKeyRef = useRef<string>('');

  // Lock kecamatan for Admin_Kecamatan ONLY once per modal open session / user scope
  useEffect(() => {
    if (!isOpen) {
      lockedScopeSessionKeyRef.current = '';
      return;
    }
    if (currentUser.role === 'Admin_Kecamatan' && currentUser.id_kecamatan && desaList.length > 0) {
      const scopeKey = `${currentUser.id_user}:${currentUser.role}:${currentUser.id_kecamatan}`;
      if (lockedScopeSessionKeyRef.current === scopeKey) {
        return;
      }
      lockedScopeSessionKeyRef.current = scopeKey;
      setSelectedKec(currentUser.id_kecamatan);
      setNewRwKec(currentUser.id_kecamatan);
      const firstDesa = desaList.find((d) => d.id_kecamatan === currentUser.id_kecamatan);
      if (firstDesa) {
        setSelectedDesa(firstDesa.id_desa);
        setNewRwDesa(firstDesa.id_desa);
      }
    }
  }, [isOpen, currentUser?.id_user, currentUser?.role, currentUser?.id_kecamatan, desaList]);

  // Load existing data ONLY when modal opens or switches edited member
  useEffect(() => {
    if (!isOpen) {
      loadedModalSessionKeyRef.current = '';
      return;
    }

    const sessionKey = editMember ? `edit:${editMember.anggota.id_anggota}` : 'new';
    if (loadedModalSessionKeyRef.current === sessionKey) {
      return;
    }
    loadedModalSessionKeyRef.current = sessionKey;

    if (editMember) {
      const a = editMember.anggota;
      setNik(a.nik);
      setNiap(a.nipd || '');
      setNamaLengkap(a.nama_lengkap);
      setGelarDepan(a.gelar_depan || '');
      setGelarBelakang(a.gelar_belakang || '');
      setTempatLahir(a.tempat_lahir);
      setTanggalLahir(a.tanggal_lahir);
      setJenisKelamin(a.jenis_kelamin);
      setAgama(a.agama);
      setPendidikanTerakhir(a.pendidikan_terakhir);
      setNoHpWa(a.no_hp_wa);
      setEmail(a.email || '');
      setAlamatRumah(a.alamat_rumah);
      setStatusPernikahan(a.status_pernikahan);
      setFoto(a.foto || '');
      setFotoFileName(a.foto ? 'Foto_Tersimpan.jpg' : '');

      if (editMember.jabatanTerkini) {
        setSelectedDesa(editMember.jabatanTerkini.id_desa);
        const desa = desaList.find((d) => d.id_desa === editMember.jabatanTerkini?.id_desa);
        if (desa) setSelectedKec(desa.id_kecamatan);
        setSelectedJabatan(editMember.jabatanTerkini.id_jabatan);
        setPeriode(
          Number(editMember.jabatanTerkini.id_jabatan) === 10 && editMember.jabatanTerkini.periode
            ? String(editMember.jabatanTerkini.periode)
            : ''
        );
        setNoSk(editMember.jabatanTerkini.no_sk_pengangkatan);
        setTglSk(editMember.jabatanTerkini.tgl_sk_pengangkatan);
        setTmtJabatan(editMember.jabatanTerkini.tmt_jabatan);
        setFileSk(editMember.jabatanTerkini.file_sk || '');
        setFileSkName(editMember.jabatanTerkini.file_sk || '');
      }

      const kta = editMember.keanggotaan || keanggotaanList.find((k) => k.id_anggota === editMember.anggota.id_anggota);
      const isInitialKades = editMember.jabatanRef?.kategori_jabatan === 'Kepala Desa' ||
        editMember.jabatanRef?.nama_jabatan?.toLowerCase().includes('kepala desa') ||
        editMember.jabatanRef?.nama_jabatan?.toLowerCase().includes('kades');

      if (kta && kta.jabatan_pengurus) {
        if (isInitialKades && kta.jabatan_pengurus !== 'Anggota Istimewa' && kta.jabatan_pengurus !== 'Penasehat') {
          setJabatanPengurus('Anggota Istimewa');
        } else {
          setJabatanPengurus(kta.jabatan_pengurus);
        }
      } else {
        setJabatanPengurus(isInitialKades ? 'Anggota Istimewa' : 'Anggota Biasa');
      }
    } else {
      // Defaults for new member
      setNik('');
      setNiap('');
      setNamaLengkap('');
      setGelarDepan('');
      setGelarBelakang('');
      setTempatLahir('Bandung');
      setTanggalLahir('1988-06-20');
      setJenisKelamin('L');
      setAgama('Islam');
      setPendidikanTerakhir('SMA/SMK');
      setNoHpWa('0812');
      setEmail('');
      setAlamatRumah('');
      setStatusPernikahan('Kawin');
      setFoto('https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80');
      setFotoFileName('default_avatar.jpg');
      setNoSk(`141.1/Kep.${Math.floor(Math.random() * 80 + 10)}-Desa/${new Date().getFullYear()}`);
      setTglSk(new Date().toISOString().split('T')[0]);
      setTmtJabatan(new Date().toISOString().split('T')[0]);
      setFileSk('');
      setFileSkName('');
      setPeriode('');
      setNewRwPeriode('');
      setJabatanPengurus('Anggota Biasa');
    }
    setErrorMsg('');
    setDbDuplicateInfo(null);
    setDbPendingInfo(null);
    setNikCheckStatus('idle');
    setShowAddRiwayatForm(false);
    setActiveFormTab('biodata');
  }, [editMember?.anggota?.id_anggota, isOpen]);

  // Available desa filtered by kecamatan (robust against dotted or clean codes)
  const availableDesa = useMemo(() => {
    const cleanKec = selectedKec.replace(/\./g, '');
    return desaList.filter((d) => d.id_kecamatan.replace(/\./g, '') === cleanKec);
  }, [desaList, selectedKec]);

  const availableNewRwDesa = useMemo(() => {
    const cleanKec = newRwKec.replace(/\./g, '');
    return desaList.filter((d) => d.id_kecamatan.replace(/\./g, '') === cleanKec);
  }, [desaList, newRwKec]);

  // Keep selectedDesa valid when availableDesa changes
  useEffect(() => {
    if (availableDesa.length > 0) {
      const cleanSelected = selectedDesa.replace(/\./g, '');
      const match = availableDesa.some(
        (d) => d.id_desa === selectedDesa || d.id_desa.replace(/\./g, '') === cleanSelected
      );
      if (!match) {
        setSelectedDesa(availableDesa[0].id_desa);
      }
    }
  }, [availableDesa, selectedDesa]);

  // Real-time calculation of age & retirement status
  const retirementCalc = useMemo(() => {
    return calculateAgeAndRetirement(tanggalLahir);
  }, [tanggalLahir]);

  // Projected No. KTA
  const projectedKta = useMemo(() => {
    if (editMember?.keanggotaan?.no_kta) {
      return editMember.keanggotaan.no_kta;
    }
    return generateNextKTA(selectedKec, selectedDesa, keanggotaanList);
  }, [selectedKec, selectedDesa, keanggotaanList, editMember]);

  // Projected 28-digit NIPD
  const projectedNiap = useMemo(() => {
    const matchedJab = jabatanList.find((j) => Number(j.id_jabatan) === Number(selectedJabatan));
    return generateNIPD({
      tanggalLahir,
      tmtJabatan,
      jenisKelamin,
      idJabatan: selectedJabatan,
      namaJabatan: matchedJab?.nama_jabatan,
      kategoriJabatan: matchedJab?.kategori_jabatan,
      periode: Number(selectedJabatan) === 10 ? (periode ? Number(periode) : 1) : null,
      idKecamatan: selectedKec,
      idDesa: selectedDesa,
    });
  }, [tanggalLahir, tmtJabatan, jenisKelamin, selectedJabatan, periode, selectedKec, selectedDesa, jabatanList]);

  // Member's existing career history
  const memberCareerHistory = useMemo(() => {
    if (!editMember) return [];
    return riwayatList.filter((rw) => rw.id_anggota === editMember.anggota.id_anggota);
  }, [editMember, riwayatList]);

  // Handle Photo Upload (saves to /uploads/foto on server)
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('Ukuran file foto maksimal 5 MB.');
      return;
    }

    setFotoFileName(file.name);
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      setFoto(dataUrl); // Immediate preview
      setErrorMsg('');

      // Upload directly to server /uploads/foto folder
      try {
        setUploadingFoto(true);
        const res = await safeFetchJson('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'foto',
            fileName: file.name,
            fileData: dataUrl,
            nik: nik || 'temp',
          }),
        });
        const json = res.data;
        if (res.ok && json?.success && json.url) {
          setFoto(json.url);
          setFotoFileName(json.fileName);
        }
      } catch (err) {
        console.warn('Foto disimpan di memori pratinjau:', err);
      } finally {
        setUploadingFoto(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Handle Primary SK Upload (saves to /uploads/sk on server, PDF only)
  const handleSkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isValidPdfFile(file)) {
      setErrorMsg('Berkas SK wajib berformat PDF (.pdf). File gambar atau format lain tidak diperbolehkan.');
      e.target.value = '';
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('Ukuran berkas SK maksimal 10 MB.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      if (!isPdfDataUrl(dataUrl)) {
        setErrorMsg('File yang dipilih bukan dokumen PDF (.pdf) yang valid.');
        e.target.value = '';
        return;
      }

      setFileSkName(file.name);
      setFileSk(dataUrl);
      setErrorMsg('');

      // Upload directly to server /uploads/sk folder
      try {
        setUploadingSk(true);
        const res = await safeFetchJson('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'sk',
            fileName: file.name,
            fileData: dataUrl,
            nik: nik || 'sk',
          }),
        });
        const json = res.data;
        if (res.ok && json?.success && json.url) {
          setFileSk(json.url);
          setFileSkName(json.fileName);
        } else if (res.status >= 400 && res.status < 500) {
          setFileSk('');
          setFileSkName('');
          setErrorMsg(json?.message || 'Hanya berkas berformat PDF (.pdf) yang diperbolehkan untuk SK.');
        }
      } catch (err) {
        console.warn('SK disimpan di memori pratinjau:', err);
      } finally {
        setUploadingSk(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // Handle New Riwayat SK Upload (saves to /uploads/sk on server, PDF only)
  const handleNewRwSkUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!isValidPdfFile(file)) {
      setErrorMsg('Berkas SK wajib berformat PDF (.pdf). File gambar atau format lain tidak diperbolehkan.');
      e.target.value = '';
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorMsg('Ukuran berkas SK maksimal 10 MB.');
      e.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      if (!isPdfDataUrl(dataUrl)) {
        setErrorMsg('File yang dipilih bukan dokumen PDF (.pdf) yang valid.');
        e.target.value = '';
        return;
      }

      setNewRwFileSkName(file.name);
      setNewRwFileSk(dataUrl);
      setErrorMsg('');

      // Upload directly to server /uploads/sk folder
      try {
        setUploadingNewRwSk(true);
        const res = await safeFetchJson('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'sk',
            fileName: file.name,
            fileData: dataUrl,
            nik: nik || 'mutasi',
          }),
        });
        const json = res.data;
        if (res.ok && json?.success && json.url) {
          setNewRwFileSk(json.url);
          setNewRwFileSkName(json.fileName);
        } else if (res.status >= 400 && res.status < 500) {
          setNewRwFileSk('');
          setNewRwFileSkName('');
          setErrorMsg(json?.message || 'Hanya berkas berformat PDF (.pdf) yang diperbolehkan untuk SK.');
        }
      } catch (err) {
        console.warn('SK mutasi disimpan di memori pratinjau:', err);
      } finally {
        setUploadingNewRwSk(false);
      }
    };
    reader.readAsDataURL(file);
  };

  if (!isOpen) return null;

  // Handle adding an additional career track directly
  const handleSaveNewRiwayat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editMember) return;

    if (!newRwNoSk.trim()) {
      setErrorMsg('Nomor SK Pengangkatan riwayat baru wajib diisi.');
      return;
    }

    if (Number(newRwJabatan) === 10 && !['1', '2', '3'].includes(String(newRwPeriode))) {
      setErrorMsg('Periode jabatan Kepala Desa wajib dipilih (Periode Ke-1, Ke-2, atau Ke-3).');
      return;
    }

    await addRiwayatJabatan({
      id_anggota: editMember.anggota.id_anggota,
      id_desa: newRwDesa,
      id_jabatan: newRwJabatan,
      periode: Number(newRwJabatan) === 10 ? Number(newRwPeriode) : null,
      no_sk_pengangkatan: newRwNoSk,
      tgl_sk_pengangkatan: newRwTglSk,
      tmt_jabatan: newRwTmt,
      status_aktif: newRwStatus,
      file_sk: newRwFileSk || newRwFileSkName || '',
      keterangan: newRwKeterangan,
    });

    // Reset subform
    setShowAddRiwayatForm(false);
    setNewRwNoSk('');
    setNewRwPeriode('');
    setNewRwFileSk('');
    setNewRwFileSkName('');
    setErrorMsg('');
  };

  // Handle Main Submit
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1. Validation NIK (panjang + duplikat lokal)
    if (!nik || nik.length !== 16) {
      setErrorMsg('NIK KTP harus terdiri dari tepat 16 digit angka.');
      setActiveFormTab('biodata');
      return;
    }
    if (duplicateNikMember) {
      setErrorMsg(
        `NIK ${nik} sudah terdaftar atas nama "${duplicateNikMember.nama_lengkap}". NIK perangkat desa bersifat unik dan tidak boleh duplikat!`
      );
      setActiveFormTab('biodata');
      return;
    }
    // 2. Validation Biodata
    if (!namaLengkap.trim()) {
      setErrorMsg('Nama lengkap perangkat desa wajib diisi.');
      setActiveFormTab('biodata');
      return;
    }
    if (!tempatLahir.trim()) {
      setErrorMsg('Tempat lahir perangkat desa wajib diisi.');
      setActiveFormTab('biodata');
      return;
    }
    if (!tanggalLahir) {
      setErrorMsg('Tanggal lahir perangkat desa wajib diisi.');
      setActiveFormTab('biodata');
      return;
    }
    if (!noHpWa.trim() || noHpWa.trim().length < 8) {
      setErrorMsg('Nomor WhatsApp aktif wajib diisi minimal 8 digit untuk notifikasi organisasi.');
      setActiveFormTab('biodata');
      return;
    }
    // 3. Validation Riwayat Formasi
    if (!selectedDesa) {
      setErrorMsg('Desa Penempatan wajib dipilih.');
      setActiveFormTab('riwayat');
      return;
    }
    if (!selectedJabatan) {
      setErrorMsg('Jabatan SOTK Desa wajib dipilih.');
      setActiveFormTab('riwayat');
      return;
    }
    if (Number(selectedJabatan) === 10 && !['1', '2', '3'].includes(String(periode))) {
      setErrorMsg('Periode jabatan Kepala Desa wajib dipilih (Periode Ke-1, Ke-2, atau Ke-3).');
      setActiveFormTab('riwayat');
      return;
    }

    const effectiveNoSk = noSk.trim() || `141.1/Kep.${Math.floor(Math.random() * 80 + 10)}-Desa/${new Date().getFullYear()}`;
    const rawNiapInput = niap.trim() || projectedNiap;
    const compactNiapDigits = rawNiapInput.replace(/\s+/g, '');
    const effectiveNiap = /^\d{28}$/.test(compactNiapDigits) ? compactNiapDigits : rawNiapInput;

    try {
      setIsSubmitting(true);
      setErrorMsg('');

      // 4. Verifikasi final keunikan NIK langsung ke database sebelum menyimpan
      const nikCheck = await verifyNikWithDatabase(nik);
      if (!nikCheck.valid) {
        setErrorMsg(
          nikCheck.message ||
            `NIK ${nik} sudah terdaftar di database. NIK perangkat desa bersifat unik dan tidak boleh duplikat!`
        );
        setActiveFormTab('biodata');
        return;
      }

      if (editMember) {
        await updateAnggota(
          editMember.anggota.id_anggota,
          {
            nik,
            nipd: effectiveNiap,
            nama_lengkap: namaLengkap.trim().toUpperCase(),
            gelar_depan: gelarDepan ? gelarDepan.trim() : undefined,
            gelar_belakang: gelarBelakang ? gelarBelakang.trim() : undefined,
            tempat_lahir: tempatLahir,
            tanggal_lahir: tanggalLahir,
            jenis_kelamin: jenisKelamin,
            agama,
            pendidikan_terakhir: pendidikanTerakhir,
            no_hp_wa: noHpWa,
            email,
            alamat_rumah: alamatRumah,
            status_pernikahan: statusPernikahan,
            foto: foto || undefined,
          },
          jabatanPengurus
        );

        // Also update primary latest job if modified
        if (editMember.jabatanTerkini) {
          await updateRiwayatJabatan(editMember.jabatanTerkini.id_riwayat, {
            id_desa: selectedDesa,
            id_jabatan: selectedJabatan,
            periode: Number(selectedJabatan) === 10 ? Number(periode) : null,
            no_sk_pengangkatan: effectiveNoSk,
            tgl_sk_pengangkatan: tglSk,
            tmt_jabatan: tmtJabatan,
            file_sk: fileSk || fileSkName || editMember.jabatanTerkini.file_sk,
          });
        }

        onClose();
      } else {
        // Add new member & issue E-KTA
        const result = await addAnggotaWithJobAndKta(
          {
            nik,
            nipd: effectiveNiap,
            nama_lengkap: namaLengkap.trim().toUpperCase(),
            gelar_depan: gelarDepan ? gelarDepan.trim() : undefined,
            gelar_belakang: gelarBelakang ? gelarBelakang.trim() : undefined,
            tempat_lahir: tempatLahir,
            tanggal_lahir: tanggalLahir,
            jenis_kelamin: jenisKelamin,
            agama,
            pendidikan_terakhir: pendidikanTerakhir,
            no_hp_wa: noHpWa,
            email,
            foto: foto || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80',
            alamat_rumah: alamatRumah || `Kabupaten Bandung, Jawa Barat`,
            status_pernikahan: statusPernikahan,
          },
          {
            id_desa: selectedDesa,
            id_jabatan: selectedJabatan,
            periode: Number(selectedJabatan) === 10 ? Number(periode) : null,
            no_sk_pengangkatan: effectiveNoSk,
            tgl_sk_pengangkatan: tglSk,
            tmt_jabatan: tmtJabatan,
            file_sk: fileSk || fileSkName || '',
          },
          jabatanPengurus
        );

        const desaObj = desaList.find(
          (d) => d.id_desa === selectedDesa || d.id_desa.replace(/\./g, '') === selectedDesa.replace(/\./g, '')
        );
        const jabObj = jabatanList.find((j) => j.id_jabatan === selectedJabatan);

        setCreatedSuccessData({
          nama: `${gelarDepan ? gelarDepan + ' ' : ''}${namaLengkap}${gelarBelakang ? ', ' + gelarBelakang : ''}`,
          nik,
          noKta: result?.noKta || projectedKta,
          desa: desaObj ? `Desa ${desaObj.nama_desa}` : 'Kabupaten Bandung',
          jabatan: jabObj?.nama_jabatan || 'Perangkat Desa',
          foto: foto || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80',
        });
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan saat memproses data anggota.');
      setActiveFormTab('biodata');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#111113]/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[92vh] flex flex-col my-4 border border-[#111113]/15 overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#F8F7F4] border-b border-[#111113]/10">
          <div>
            <div className="brand-meta text-[#064E3B] font-semibold">
              {editMember ? 'PENGELOLAAN DATA ANGGOTA' : 'PENDAFTARAN ANGGOTA BARU'}
            </div>
            <h2 className="text-base sm:text-lg font-bold text-[#111113] tracking-tight">
              {editMember ? `Perbarui Profil: ${editMember.anggota.nama_lengkap}` : 'Formulir Induk Perangkat Desa PPDI'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#111113]/50 hover:text-[#111113] hover:bg-neutral-200/50 rounded-lg transition-colors cursor-pointer"
            title="Tutup Form"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {createdSuccessData ? (
          <div className="flex-1 overflow-y-auto p-6 sm:p-8 flex flex-col items-center justify-center text-center space-y-6">
            <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center shadow-inner">
              <CheckCircle className="w-10 h-10 text-emerald-600" />
            </div>

            <div className="space-y-1">
              <div className="brand-meta text-[#064E3B] font-bold text-xs uppercase tracking-wider">
                PENERBITAN ANGGOTA & E-KTA BERHASIL
              </div>
              <h3 className="text-xl font-black text-neutral-900 tracking-tight">
                Perangkat Desa Berhasil Didaftarkan!
              </h3>
              <p className="text-xs text-neutral-500 max-w-md mx-auto">
                Data induk perangkat desa telah tersimpan secara resmi di database. Nomor E-KTA PPDI telah diterbitkan dengan validasi QR Code.
              </p>
            </div>

            {/* KTA Preview Mini Card */}
            <div className="max-w-md w-full bg-gradient-to-br from-emerald-900 via-emerald-800 to-slate-900 text-white rounded-xl p-5 shadow-xl border border-emerald-600/40 text-left relative overflow-hidden">
              <div className="flex items-start justify-between border-b border-emerald-700/60 pb-3 mb-3">
                <div>
                  <span className="text-[10px] text-emerald-300 font-mono tracking-widest block uppercase">PPDI KAB. BANDUNG</span>
                  <span className="text-sm font-bold tracking-tight">KARTU TANDA ANGGOTA DIGITAL</span>
                </div>
                <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                  AKTIF / QR VALID
                </span>
              </div>

              <div className="flex items-center gap-4">
                <img
                  src={createdSuccessData.foto || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&auto=format&fit=crop&q=80'}
                  alt={createdSuccessData.nama}
                  className="w-14 h-18 object-cover rounded-md border-2 border-emerald-400/60 shadow-md shrink-0 bg-neutral-800"
                />
                <div className="space-y-1 text-xs">
                  <div className="font-bold text-sm text-white leading-tight">{createdSuccessData.nama}</div>
                  <div className="text-[11px] text-emerald-200 font-mono">NIK: {createdSuccessData.nik}</div>
                  <div className="text-[11px] text-emerald-300">{createdSuccessData.jabatan} · {createdSuccessData.desa}</div>
                  <div className="pt-1 text-[11px] font-mono text-amber-300 font-bold">
                    No KTA: {createdSuccessData.noKta}
                  </div>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-md pt-2">
              <button
                type="button"
                onClick={() => {
                  onClose();
                  setActiveTab('kta');
                }}
                className="w-full sm:w-auto px-5 py-2.5 bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-bold rounded-lg shadow-md flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <Eye className="w-4 h-4" />
                <span>Lihat / Cetak E-KTA Sekarang</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setCreatedSuccessData(null);
                  setNik('');
                  setNamaLengkap('');
                  setNoSk(`141.1/Kep.${Math.floor(Math.random() * 80 + 10)}-Desa/${new Date().getFullYear()}`);
                  setActiveFormTab('biodata');
                }}
                className="w-full sm:w-auto px-4 py-2.5 bg-white hover:bg-neutral-50 text-neutral-700 text-xs font-semibold rounded-lg border border-neutral-300 cursor-pointer transition-colors"
              >
                + Tambah Anggota Lain
              </button>

              <button
                type="button"
                onClick={onClose}
                className="w-full sm:w-auto px-4 py-2.5 bg-neutral-100 hover:bg-neutral-200 text-neutral-700 text-xs font-medium rounded-lg cursor-pointer transition-colors"
              >
                Selesai & Tutup
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Tab Navigation Controls */}
            <div className="flex border-b border-[#111113]/10 bg-white px-6 pt-2 text-xs font-medium">
              <button
                type="button"
                onClick={() => setActiveFormTab('biodata')}
                className={`pb-3 px-3 border-b-2 flex items-center gap-2 cursor-pointer transition-colors ${
                  activeFormTab === 'biodata'
                    ? 'border-[#064E3B] text-[#064E3B] font-bold'
                    : 'border-transparent text-[#111113]/60 hover:text-[#111113]'
                }`}
              >
                {isBiodataValid ? (
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                ) : (
                  <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0"></span>
                )}
                <User className="w-4 h-4" />
                <span>1. Biodata & Pasfoto</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveFormTab('riwayat')}
                className={`pb-3 px-3 border-b-2 flex items-center gap-2 cursor-pointer transition-colors ${
                  activeFormTab === 'riwayat'
                    ? 'border-[#064E3B] text-[#064E3B] font-bold'
                    : 'border-transparent text-[#111113]/60 hover:text-[#111113]'
                }`}
              >
                {isRiwayatValid ? (
                  <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"></span>
                ) : (
                  <span className="w-2 h-2 rounded-full bg-neutral-300 shrink-0"></span>
                )}
                <Briefcase className="w-4 h-4" />
                <span>2. Riwayat Jabatan & Berkas SK</span>
                {editMember && memberCareerHistory.length > 0 && (
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-100 text-[#064E3B] font-mono">
                    {memberCareerHistory.length}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setActiveFormTab('organisasi')}
                className={`pb-3 px-3 border-b-2 flex items-center gap-2 cursor-pointer transition-colors ${
                  activeFormTab === 'organisasi'
                    ? 'border-[#064E3B] text-[#064E3B] font-bold'
                    : 'border-transparent text-[#111113]/60 hover:text-[#111113]'
                }`}
              >
                <CreditCard className="w-4 h-4" />
                <span>3. Keanggotaan & E-KTA</span>
              </button>
            </div>

            {/* Form Body Container */}
            <form noValidate onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6 text-xs">
          {errorMsg && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 1: BIODATA & PASFOTO                                                  */}
          {/* ========================================================================= */}
          {activeFormTab === 'biodata' && (
            <div className="space-y-6">
              {/* Pasfoto Upload Section */}
              <div className="p-4 rounded-xl bg-[#F8F7F4] border border-[#111113]/10">
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
                  {/* Photo Preview Box */}
                  <div className="relative group shrink-0">
                    <div className="w-24 h-32 rounded-lg bg-neutral-200 border-2 border-dashed border-[#111113]/20 overflow-hidden flex items-center justify-center shadow-xs">
                      {foto ? (
                        <img
                          src={foto}
                          alt="Pasfoto Perangkat"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="flex flex-col items-center justify-center p-2 text-center text-neutral-400">
                          <Camera className="w-6 h-6 mb-1 text-neutral-400" />
                          <span className="text-[10px]">Belum Ada Foto</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Photo Controls */}
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="brand-meta font-bold text-[#064E3B]">UNGGAH PASFOTO RESMI</span>
                      <span className="text-[10px] text-neutral-400 font-mono">(MAKS. 5MB)</span>
                    </div>
                    <p className="text-[11px] text-[#111113]/70 leading-relaxed">
                      Format pasfoto formal perangkat desa (pakaian dinas PDH/Keki dengan latar belakang merah atau biru).
                      Foto ini dicetak otomatis pada Kartu Tanda Anggota (E-KTA) Digital.
                    </p>

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <input
                        type="file"
                        ref={fotoInputRef}
                        accept="image/png, image/jpeg, image/jpg, image/webp"
                        onChange={handlePhotoUpload}
                        className="hidden"
                      />
                      <button
                        type="button"
                        disabled={uploadingFoto}
                        onClick={() => fotoInputRef.current?.click()}
                        className="px-3 py-1.5 bg-[#064E3B] hover:bg-[#043d2e] disabled:opacity-60 text-white rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        <span>{uploadingFoto ? 'Mengunggah...' : 'Pilih Foto dari Perangkat'}</span>
                      </button>

                      {foto && (
                        <button
                          type="button"
                          onClick={() => {
                            setFoto('');
                            setFotoFileName('');
                          }}
                          className="px-3 py-1.5 bg-neutral-200 hover:bg-neutral-300 text-neutral-700 rounded-md text-xs font-medium transition-colors cursor-pointer"
                        >
                          Hapus Foto
                        </button>
                      )}

                      {uploadingFoto && (
                        <span className="text-[11px] font-mono text-emerald-800 flex items-center gap-1 animate-pulse">
                          <span>Menyimpan ke /uploads/foto/...</span>
                        </span>
                      )}

                      {fotoFileName && !uploadingFoto && (
                        <div className="flex flex-col">
                          <span className="text-[11px] font-mono text-[#064E3B] flex items-center gap-1">
                            <CheckCircle className="w-3 h-3 text-emerald-600" />
                            <span className="truncate max-w-[220px] font-semibold">{fotoFileName}</span>
                          </span>
                          <span className="text-[10px] font-mono text-neutral-500">
                            Folder Server: <strong className="text-emerald-700">/uploads/foto/</strong>
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Data Kependudukan Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-neutral-700 font-medium">
                      NIK KTP (16 Digit) <span className="text-red-500">*</span>
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={nikCheckStatus === 'checking'}
                        onClick={async () => {
                          const res = await verifyNikWithDatabase(nik);
                          if (!res.valid && res.message) {
                            setErrorMsg(res.message);
                          } else {
                            setErrorMsg('');
                          }
                        }}
                        className="px-2 py-0.5 text-[10px] bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white rounded font-bold font-mono transition-colors cursor-pointer flex items-center gap-1"
                      >
                        {nikCheckStatus === 'checking' && (
                          <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                        )}
                        <span>Cek Validasi</span>
                      </button>
                      {nikCheckStatus === 'checking' && (
                        <span className="text-[10px] text-amber-700 font-semibold font-mono flex items-center gap-1">
                          <RefreshCw className="w-3 h-3 animate-spin text-amber-600" />
                          <span>Mengecek DB...</span>
                        </span>
                      )}
                      {nik.length === 16 && duplicateNikMember && nikCheckStatus !== 'checking' && (
                        <span className="text-[10px] text-red-700 font-semibold font-mono flex items-center gap-1">
                          <AlertCircle className="w-3 h-3 text-red-600" />
                          <span>Duplikat</span>
                        </span>
                      )}
                      {nik.length === 16 &&
                        !duplicateNikMember &&
                        (nikCheckStatus === 'valid' || nikCheckStatus === 'offline-valid') && (
                          <span className="text-[10px] text-emerald-700 font-semibold font-mono flex items-center gap-1">
                            <CheckCircle className="w-3 h-3 text-emerald-600" />
                            <span>
                              {nikCheckStatus === 'valid' ? 'Unik (Terverifikasi DB)' : 'Unik (Lokal)'}
                            </span>
                          </span>
                        )}
                    </div>
                  </div>
                  <input
                    type="text"
                    maxLength={16}
                    value={nik}
                    onChange={(e) => {
                      setNik(e.target.value.replace(/\D/g, ''));
                      if (errorMsg) setErrorMsg('');
                    }}
                    placeholder="320405xxxxxxxxxx"
                    className={`w-full px-3 py-2 border rounded-lg font-mono focus:outline-hidden focus:ring-1 ${
                      duplicateNikMember
                        ? 'border-red-500 bg-red-50/50 text-red-900 focus:ring-red-600'
                        : nik.length === 16 && (nikCheckStatus === 'valid' || nikCheckStatus === 'offline-valid')
                        ? 'border-emerald-500 bg-emerald-50/20 text-neutral-900 focus:ring-emerald-600'
                        : 'border-neutral-300 focus:ring-emerald-700'
                    }`}
                    required
                  />
                  {duplicateNikMember ? (
                    <div className="mt-1.5 p-2 rounded-md bg-red-50 border border-red-200 text-red-700 text-[11px] flex items-start gap-1.5 leading-tight">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 text-red-600 mt-0.5" />
                      <div>
                        <strong className="block font-bold">NIK Duplikat Tidak Diizinkan!</strong>
                        <span>
                          Sudah terdaftar di database atas nama <strong>{duplicateNikMember.nama_lengkap}</strong> (ID: {duplicateNikMember.id_anggota}).
                        </span>
                      </div>
                    </div>
                  ) : pendingNikRegistration ? (
                    <div className="mt-1.5 p-2 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-[11px] flex items-start gap-1.5 leading-tight">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-600 mt-0.5" />
                      <div>
                        <strong className="block font-bold">NIK Sedang Dalam Antrean Pendaftaran</strong>
                        <span>
                          Terdapat pengajuan pendaftaran berstatus <strong>Menunggu</strong> atas nama <strong>{pendingNikRegistration.nama_lengkap}</strong>.
                        </span>
                      </div>
                    </div>
                  ) : nik.length === 16 && nikCheckStatus === 'valid' ? (
                    <div className="mt-1.5 p-2 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] flex items-center justify-between gap-2 leading-tight">
                      <div className="flex items-center gap-1.5">
                        <CheckCircle className="w-3.5 h-3.5 shrink-0 text-emerald-600" />
                        <span>NIK valid (16 digit) dan tersedia di database anggota.</span>
                      </div>
                      <span className="font-mono font-bold text-[10px]">16/16</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between text-[10px] text-neutral-400 mt-0.5">
                      <span>Kode Wilayah 32.04 Kab. Bandung</span>
                      <span className="font-mono">{nik.length}/16 digit</span>
                    </div>
                  )}
                </div>

                <div className="sm:col-span-3 grid grid-cols-3 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-neutral-700 font-medium mb-1">Gelar Depan</label>
                    <input
                      type="text"
                      value={gelarDepan}
                      onChange={(e) => setGelarDepan(e.target.value)}
                      placeholder="H., Drs."
                      className="w-15 px-2.5 py-2 border border-neutral-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-emerald-700 text-xs font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-neutral-700 font-medium mb-1">
                      Nama Lengkap (Tanpa Gelar) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={namaLengkap}
                      onChange={(e) => {
                        setNamaLengkap(e.target.value.toUpperCase());
                      }}
                      style={{ textTransform: 'uppercase' }}
                      placeholder="CONTOH: ASEP SAEPULOH"
                      className="w-70 px-3 py-2 border border-neutral-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-emerald-700 font-semibold uppercase"
                      required
                    />
                  </div>
                  
                  
                  <div>
                  <label className="block text-neutral-700 font-medium mb-1">Gelar Belakang</label>
                  <input
                    type="text"
                    value={gelarBelakang}
                    onChange={(e) => setGelarBelakang(e.target.value)}
                    placeholder="S.AP, S.IP, M.Si"
                    className="w-35 px-2.5 py-2 border border-neutral-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-emerald-700 text-xs font-mono"
                  />
                  </div>
                </div>

                

                <div>
                  <label className="block text-neutral-700 font-medium mb-1">Tempat Lahir</label>
                  <input
                    type="text"
                    value={tempatLahir}
                    onChange={(e) => setTempatLahir(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-emerald-700"
                    required
                  />
                </div>

                <div>
                  <label className="block text-neutral-700 font-medium mb-1">
                    Tanggal Lahir (Batas Pensiun 60 Tahun) <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={tanggalLahir}
                    onChange={(e) => setTanggalLahir(e.target.value)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-emerald-700"
                    required
                  />
                  {/* Age & Retirement Preview */}
                  <div className="mt-1 text-[11px] text-emerald-800 bg-emerald-50 p-2 rounded-md border border-emerald-200">
                    <span>Usia: <strong>{retirementCalc.usia} Tahun</strong></span>
                    <span className="mx-1.5">·</span>
                    <span>Pensiun: <strong>{retirementCalc.tanggalPurnaTugas}</strong></span>
                    <span className="mx-1.5">·</span>
                    <span className="font-semibold">({retirementCalc.statusPensiun})</span>
                  </div>
                </div>

                <div>
                  <label className="block text-neutral-700 font-medium mb-1">Jenis Kelamin</label>
                  <div className="flex items-center gap-4 py-2">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="jk"
                        value="L"
                        checked={jenisKelamin === 'L'}
                        onChange={() => setJenisKelamin('L')}
                      />
                      <span>Laki-laki (L)</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="radio"
                        name="jk"
                        value="P"
                        checked={jenisKelamin === 'P'}
                        onChange={() => setJenisKelamin('P')}
                      />
                      <span>Perempuan (P)</span>
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-neutral-700 font-medium mb-1">Pendidikan Terakhir</label>
                  <select
                    value={pendidikanTerakhir}
                    onChange={(e) => setPendidikanTerakhir(e.target.value as any)}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-emerald-700"
                  >
                    <option value="SMA/SMK">SMA / SMK Sederajat</option>
                    <option value="D1">Diploma 1 (D1)</option>
                    <option value="D2">Diploma 2 (D2)</option>
                    <option value="D3">Diploma 3 (D3)</option>
                    <option value="S1">Strata 1 (S1) / Sarjana</option>
                    <option value="S2">Strata 2 (S2) / Magister</option>
                    <option value="S3">Strata 3 (S3) / Doktor</option>
                  </select>
                </div>

                <div>
                  <label className="block text-neutral-700 font-medium mb-1">
                    Nomor WhatsApp Aktif <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={noHpWa}
                    onChange={(e) => setNoHpWa(e.target.value)}
                    placeholder="081223344550"
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg font-mono focus:outline-hidden focus:ring-1 focus:ring-emerald-700"
                    required
                  />
                </div>

                <div>
                  <label className="block text-neutral-700 font-medium mb-1">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="perangkat@desa.id"
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-emerald-700"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-neutral-700 font-medium mb-1">Alamat Rumah Tinggal</label>
                  <input
                    type="text"
                    value={alamatRumah}
                    onChange={(e) => setAlamatRumah(e.target.value)}
                    placeholder="Kp. Mekarwangi RT 03/04, Desa Pamekaran, Kab. Bandung"
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-emerald-700"
                  />
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 2: RIWAYAT JABATAN & BERKAS SK                                        */}
          {/* ========================================================================= */}
          {activeFormTab === 'riwayat' && (
            <div className="space-y-6">
              {/* Existing Career History (if in Edit Mode) */}
              {editMember && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-neutral-200">
                    <div>
                      <h3 className="text-xs font-bold text-[#111113] uppercase tracking-wider">
                        Daftar Rekam Jejak / Riwayat Jabatan
                      </h3>
                      <p className="text-[11px] text-neutral-500">
                        Total {memberCareerHistory.length} catatan pengangkatan dan mutasi jabatan
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowAddRiwayatForm(!showAddRiwayatForm)}
                      className="px-3 py-1.5 bg-[#064E3B] hover:bg-[#043d2e] text-white rounded-md text-xs font-semibold flex items-center gap-1.5 cursor-pointer shadow-xs transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>{showAddRiwayatForm ? 'Tutup Form Riwayat' : '+ Tambah Riwayat Baru'}</span>
                    </button>
                  </div>

                  {/* Career List */}
                  {memberCareerHistory.length === 0 ? (
                    <div className="p-4 bg-neutral-50 rounded-lg border border-neutral-200 text-center text-neutral-500 text-xs">
                      Belum ada catatan riwayat jabatan tercatat. Silakan tambahkan melalui tombol di atas.
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {memberCareerHistory.map((rw) => {
                        const desa = desaList.find((d) => d.id_desa === rw.id_desa);
                        const kec = desa ? kecamatanList.find((k) => k.id_kecamatan === desa.id_kecamatan) : undefined;
                        const jab = jabatanList.find((j) => j.id_jabatan === rw.id_jabatan);

                        return (
                          <div
                            key={rw.id_riwayat}
                            className="p-3.5 rounded-lg border border-neutral-200 bg-white hover:border-[#064E3B]/40 transition-colors flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs"
                          >
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-neutral-900 text-xs">
                                  {jab?.nama_jabatan || 'Perangkat Desa'}
                                </span>
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                                    rw.status_aktif === 'Aktif'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : rw.status_aktif === 'Mutasi'
                                      ? 'bg-blue-100 text-blue-800'
                                      : 'bg-neutral-100 text-neutral-700'
                                  }`}
                                >
                                  {rw.status_aktif}
                                </span>
                              </div>

                              <div className="text-[11px] text-neutral-600 flex items-center gap-2">
                                <span>Desa {desa?.nama_desa || rw.id_desa}</span>
                                <span>·</span>
                                <span>Kec. {kec?.nama_kecamatan || '-'}</span>
                              </div>

                              <div className="text-[10px] font-mono text-neutral-500 flex flex-wrap items-center gap-3">
                                <span>No SK: {rw.no_sk_pengangkatan}</span>
                                <span>TMT: {formatDateIndo(rw.tmt_jabatan)}</span>
                                {rw.file_sk && (
                                  <span className="text-[#064E3B] font-semibold flex items-center gap-1">
                                    <FileCheck className="w-3 h-3 text-emerald-600" />
                                    <span>Berkas SK Ada</span>
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 self-end sm:self-center">
                              {rw.file_sk && rw.file_sk.startsWith('data:') && (
                                <a
                                  href={rw.file_sk}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="p-1.5 text-[#064E3B] hover:bg-emerald-50 rounded text-xs flex items-center gap-1 font-mono"
                                  title="Pratinjau Berkas SK"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span>Lihat SK</span>
                                </a>
                              )}

                              <button
                                type="button"
                                onClick={() => {
                                  if (confirm(`Hapus catatan riwayat jabatan: ${jab?.nama_jabatan}?`)) {
                                    deleteRiwayatJabatan(rw.id_riwayat);
                                  }
                                }}
                                className="p-1.5 text-neutral-400 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                                title="Hapus Riwayat Jabatan"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Subform: Add New Riwayat Jabatan (inline) */}
              {showAddRiwayatForm && (
                <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-200 space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-emerald-200">
                    <span className="brand-meta font-bold text-[#064E3B]">
                      TAMBAH CATATAN RIWAYAT JABATAN BARU (MUTASI / PROMOSI)
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAddRiwayatForm(false)}
                      className="text-neutral-500 hover:text-neutral-800 text-xs"
                    >
                      Batal
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-neutral-700 font-medium mb-1">Kecamatan</label>
                      <select
                        disabled={currentUser.role === 'Admin_Kecamatan'}
                        value={newRwKec}
                        onChange={(e) => {
                          setNewRwKec(e.target.value);
                          const f = desaList.find((d) => d.id_kecamatan === e.target.value);
                          if (f) setNewRwDesa(f.id_desa);
                        }}
                        className="w-full px-3 py-2 border border-neutral-300 rounded-lg bg-white"
                      >
                        {kecamatanList.map((k) => (
                          <option key={k.id_kecamatan} value={k.id_kecamatan}>
                            Kec. {k.nama_kecamatan}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-neutral-700 font-medium mb-1">Desa Penempatan</label>
                      <select
                        value={newRwDesa}
                        onChange={(e) => setNewRwDesa(e.target.value)}
                        className="w-full px-3 py-2 border border-neutral-300 rounded-lg bg-white"
                      >
                        {availableNewRwDesa.map((d) => (
                          <option key={d.id_desa} value={d.id_desa}>
                            Desa {d.nama_desa}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-neutral-700 font-medium mb-1">Jabatan Formasi</label>
                      <select
                        value={newRwJabatan}
                        onChange={(e) => {
                          const nextId = Number(e.target.value);
                          setNewRwJabatan(nextId);
                          if (nextId !== 10) setNewRwPeriode('');
                        }}
                        className="w-full px-3 py-2 border border-neutral-300 rounded-lg bg-white"
                      >
                        {jabatanList.map((j) => (
                          <option key={j.id_jabatan} value={j.id_jabatan}>
                            {j.nama_jabatan} ({j.kategori_jabatan})
                          </option>
                        ))}
                      </select>
                    </div>

                    {Number(newRwJabatan) === 10 && (
                      <div>
                        <label className="block text-amber-800 font-semibold mb-1">
                          Periode Kepala Desa <span className="text-red-500">*</span>
                        </label>
                        <select
                          value={newRwPeriode}
                          onChange={(e) => setNewRwPeriode(e.target.value)}
                          className="w-full px-3 py-2 border border-amber-300 rounded-lg bg-amber-50/40"
                          required
                        >
                          <option value="">-- Pilih Periode --</option>
                          <option value="1">Periode Ke-1 (Pertama)</option>
                          <option value="2">Periode Ke-2 (Kedua)</option>
                          <option value="3">Periode Ke-3 (Ketiga)</option>
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="block text-neutral-700 font-medium mb-1">Status Keaktifan</label>
                      <select
                        value={newRwStatus}
                        onChange={(e) => setNewRwStatus(e.target.value as StatusAktifJabatan)}
                        className="w-full px-3 py-2 border border-neutral-300 rounded-lg bg-white"
                      >
                        <option value="Aktif">Aktif</option>
                        <option value="Mutasi">Mutasi</option>
                        <option value="Purna Tugas">Purna Tugas</option>
                        <option value="Diberhentikan">Diberhentikan</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-neutral-700 font-medium mb-1">
                        Nomor SK Pengangkatan <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={newRwNoSk}
                        onChange={(e) => setNewRwNoSk(e.target.value)}
                        placeholder="Contoh: 141.1/Kep.45-Desa/2026"
                        className="w-full px-3 py-2 border border-neutral-300 rounded-lg bg-white font-mono"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-neutral-700 font-medium mb-1">Tanggal SK</label>
                        <input
                          type="date"
                          value={newRwTglSk}
                          onChange={(e) => setNewRwTglSk(e.target.value)}
                          className="w-full px-3 py-2 border border-neutral-300 rounded-lg bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-neutral-700 font-medium mb-1">Terhitung Mulai Tanggal (TMT) Jabatan Perangkat Desa</label>
                        <input
                          type="date"
                          value={newRwTmt}
                          onChange={(e) => setNewRwTmt(e.target.value)}
                          className="w-full px-3 py-2 border border-neutral-300 rounded-lg bg-white"
                        />
                      </div>
                    </div>

                    {/* Upload SK file for this new track */}
                    <div className="sm:col-span-2">
                      <label className="block text-neutral-700 font-medium mb-1">
                        Upload Berkas SK Pengangkatan (Hanya PDF)
                      </label>
                      <div className="flex items-center gap-3">
                        <input
                          type="file"
                          ref={newRwSkInputRef}
                          accept="application/pdf,.pdf"
                          onChange={handleNewRwSkUpload}
                          className="hidden"
                        />
                        <button
                          type="button"
                          disabled={uploadingNewRwSk}
                          onClick={() => newRwSkInputRef.current?.click()}
                          className="px-3 py-2 bg-white border border-neutral-300 hover:border-[#064E3B] disabled:opacity-60 text-neutral-700 text-xs flex items-center gap-1.5 cursor-pointer shadow-2xs rounded-lg"
                        >
                          <Upload className="w-3.5 h-3.5 text-[#064E3B]" />
                          <span>{uploadingNewRwSk ? 'Mengunggah ke Server...' : 'Pilih Berkas SK'}</span>
                        </button>

                        {uploadingNewRwSk && (
                          <span className="text-xs font-mono text-emerald-800 animate-pulse">
                            Menyimpan ke /uploads/sk/...
                          </span>
                        )}

                        {newRwFileSkName && !uploadingNewRwSk ? (
                          <div className="flex flex-col">
                            <span className="text-xs font-mono text-[#064E3B] flex items-center gap-1">
                              <FileCheck className="w-4 h-4 text-emerald-600" />
                              <span className="font-semibold">{newRwFileSkName}</span>
                            </span>
                            <span className="text-[10px] font-mono text-neutral-500">
                              Folder Server: <strong className="text-emerald-700">/uploads/sk/</strong>
                            </span>
                          </div>
                        ) : !uploadingNewRwSk && (
                          <span className="text-xs text-neutral-400">Belum ada file SK dipilih</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <button
                      type="button"
                      onClick={handleSaveNewRiwayat}
                      className="px-4 py-2 bg-[#064E3B] hover:bg-[#043d2e] text-white rounded-md text-xs font-bold cursor-pointer transition-colors shadow-xs"
                    >
                      Simpan Catatan Riwayat Baru
                    </button>
                  </div>
                </div>
              )}

              {/* Primary / Current Appointment Section */}
              <div className="p-4 rounded-xl bg-[#F8F7F4] border border-[#111113]/10 space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-[#111113]/10">
                  <span className="brand-meta font-bold text-[#064E3B]">
                    {editMember ? 'JABATAN TERKINI / UTAMA SAAT INI' : 'FORMASI JABATAN PERTAMA & SK PENGANGKATAN'}
                  </span>
                  {!editMember && (
                    <span className="text-[11px] font-mono text-[#064E3B]">
                      KTA Otomatis: {projectedKta}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-neutral-700 font-medium mb-1">
                      Kecamatan <span className="text-red-500">*</span>
                    </label>
                    <select
                      disabled={currentUser.role === 'Admin_Kecamatan'}
                      value={selectedKec}
                      onChange={(e) => {
                        setSelectedKec(e.target.value);
                        const f = desaList.find((d) => d.id_kecamatan === e.target.value);
                        if (f) setSelectedDesa(f.id_desa);
                      }}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-700 disabled:bg-neutral-100"
                    >
                      {kecamatanList.map((k) => (
                        <option key={k.id_kecamatan} value={k.id_kecamatan}>
                          Kec. {k.nama_kecamatan}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-neutral-700 font-medium mb-1">
                      Desa Penempatan <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={selectedDesa}
                      onChange={(e) => setSelectedDesa(e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-700"
                    >
                      {availableDesa.map((d) => (
                        <option key={d.id_desa} value={d.id_desa}>
                          Desa {d.nama_desa} ({d.id_desa})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-neutral-700 font-medium mb-1">
                      Jabatan SOTK Desa <span className="text-red-500">*</span>
                    </label>
                    <select
                      value={selectedJabatan}
                      onChange={(e) => {
                        const newJabId = Number(e.target.value);
                        setSelectedJabatan(newJabId);
                        if (newJabId !== 10) {
                          setPeriode('');
                        }
                        const matchedJ = jabatanList.find((j) => j.id_jabatan === newJabId);
                        const isKades = matchedJ?.kategori_jabatan === 'Kepala Desa' ||
                          matchedJ?.nama_jabatan?.toLowerCase().includes('kepala desa') ||
                          matchedJ?.nama_jabatan?.toLowerCase().includes('kades');
                        if (isKades) {
                          if (jabatanPengurus !== 'Anggota Istimewa' && jabatanPengurus !== 'Penasehat') {
                            setJabatanPengurus('Anggota Istimewa');
                          }
                        }
                      }}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-700"
                    >
                      {jabatanList.map((j) => (
                        <option key={j.id_jabatan} value={j.id_jabatan}>
                          {j.nama_jabatan} ({j.kategori_jabatan})
                        </option>
                      ))}
                    </select>
                  </div>

                  {Number(selectedJabatan) === 10 && (
                    <div>
                      <label className="block text-amber-900 font-semibold mb-1">
                        Periode Kepala Desa <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={periode}
                        onChange={(e) => setPeriode(e.target.value)}
                        className="w-full px-3 py-2 border border-amber-300 rounded-lg bg-amber-50/50 focus:outline-hidden focus:ring-1 focus:ring-emerald-700"
                        required
                      >
                        <option value="">-- Pilih Periode Kepala Desa --</option>
                        <option value="1">Periode Ke-1 (Pertama)</option>
                        <option value="2">Periode Ke-2 (Kedua)</option>
                        <option value="3">Periode Ke-3 (Ketiga)</option>
                      </select>
                      <span className="text-[10px] text-amber-700 mt-0.5 block">
                        Wajib diisi untuk Kepala Desa (kode NIPD 01{periode || 'X'}).
                      </span>
                    </div>
                  )}

                  <div>
                    <label className="block text-neutral-700 font-medium mb-1">
                      Nomor SK Pengangkatan <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={noSk}
                      onChange={(e) => setNoSk(e.target.value)}
                      placeholder="141.1/Kep.28-Desa/2026"
                      className="w-full px-3 py-2 border border-neutral-300 rounded-lg bg-white font-mono focus:outline-hidden focus:ring-1 focus:ring-emerald-700"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-neutral-700 font-medium mb-1">Tanggal SK</label>
                      <input
                        type="date"
                        value={tglSk}
                        onChange={(e) => setTglSk(e.target.value)}
                        className="w-full px-3 py-2 border border-neutral-300 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-700"
                      />
                    </div>
                    <div>
                      <label className="block text-neutral-700 font-medium mb-1">TMT Jabatan</label>
                      <input
                        type="date"
                        value={tmtJabatan}
                        onChange={(e) => setTmtJabatan(e.target.value)}
                        className="w-full px-3 py-2 border border-neutral-300 rounded-lg bg-white focus:outline-hidden focus:ring-1 focus:ring-emerald-700"
                      />
                    </div>
                  </div>

                  {/* Upload Berkas SK Pengangkatan */}
                  <div>
                    <label className="block text-neutral-700 font-medium mb-1">
                      Upload Berkas SK Pengangkatan (Hanya PDF)
                    </label>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="file"
                          ref={skInputRef}
                          accept="application/pdf,.pdf"
                          onChange={handleSkUpload}
                          className="hidden"
                        />
                        <button
                          type="button"
                          disabled={uploadingSk}
                          onClick={() => skInputRef.current?.click()}
                          className="px-3 py-2 bg-white border border-neutral-300 hover:border-[#064E3B] disabled:opacity-60 text-neutral-800 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                        >
                          <Upload className="w-3.5 h-3.5 text-[#064E3B]" />
                          <span>{uploadingSk ? 'Mengunggah ke Server...' : 'Pilih Berkas SK'}</span>
                        </button>

                        {fileSk && (
                          <button
                            type="button"
                            onClick={() => {
                              setFileSk('');
                              setFileSkName('');
                            }}
                            className="px-2.5 py-2 text-xs text-neutral-500 hover:text-red-700 transition-colors"
                          >
                            Hapus
                          </button>
                        )}

                        {uploadingSk && (
                          <span className="text-xs font-mono text-emerald-800 animate-pulse">
                            Menyimpan ke /uploads/sk/...
                          </span>
                        )}
                      </div>

                      {fileSkName && !uploadingSk ? (
                        <div className="p-2.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center justify-between text-[11px] font-mono">
                          <div className="flex flex-col truncate pr-2">
                            <span className="flex items-center gap-1.5 truncate">
                              <FileCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                              <span className="truncate font-semibold">{fileSkName}</span>
                            </span>
                            <span className="text-[10px] text-neutral-500">
                              Folder Server: <strong className="text-emerald-700">/uploads/sk/</strong>
                            </span>
                          </div>
                          {(fileSk.startsWith('data:') || fileSk.startsWith('/uploads/') || fileSk.startsWith('http')) && (
                            <a
                              href={fileSk}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[#064E3B] font-semibold underline text-[11px] shrink-0 hover:text-[#043d2e]"
                            >
                              Buka File SK
                            </a>
                          )}
                        </div>
                      ) : !uploadingSk && (
                        <span className="text-[10px] text-neutral-400">
                          Format: Hanya berkas PDF (.pdf) resmi (maks 10MB). Tersimpan di folder <code className="text-neutral-600">/uploads/sk/</code>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================================= */}
          {/* TAB 3: KEANGGOTAAN PPDI                                                    */}
          {/* ========================================================================= */}
          {activeFormTab === 'organisasi' && (
            <div className="space-y-6">
              <div className="p-4 rounded-xl bg-[#F8F7F4] border border-[#111113]/10 space-y-4">
                <div className="flex items-center justify-between pb-2 border-b border-[#111113]/10">
                  <span className="brand-meta font-bold text-[#064E3B]">
                    DATA KEORGANISASIAN & NOMOR KTA DIGITAL
                  </span>
                  <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-mono text-[10px] font-semibold">
                    KTA AKTIF
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-neutral-700 font-medium mb-1">
                      Nomor KTA Digital
                    </label>
                    <input
                      type="text"
                      disabled
                      value={projectedKta}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-lg bg-neutral-100 font-mono font-bold text-[#064E3B]"
                    />
                    <span className="text-[10px] text-neutral-500">
                      Format terstandar: 32.04.[KodeKec].[KodeDesa].[NoUrut]
                    </span>
                  </div>

                  <div>
                    <label className="block text-neutral-700 font-medium mb-1">
                      Jabatan Kepengurusan PPDI {(() => {
                        const curJ = jabatanList.find((j) => j.id_jabatan === selectedJabatan);
                        const isKades = curJ?.kategori_jabatan === 'Kepala Desa' ||
                          curJ?.nama_jabatan?.toLowerCase().includes('kepala desa') ||
                          curJ?.nama_jabatan?.toLowerCase().includes('kades');
                        return isKades ? (
                          <span className="text-[11px] font-normal text-amber-700 ml-1">
                            (Khusus Kepala Desa: Anggota Istimewa / Penasehat)
                          </span>
                        ) : null;
                      })()}
                    </label>
                    <select
                      value={jabatanPengurus}
                      onChange={(e) => setJabatanPengurus(e.target.value)}
                      className="w-full px-3 py-2 border border-neutral-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-emerald-700 bg-white"
                    >
                      {(() => {
                        const curJ = jabatanList.find((j) => j.id_jabatan === selectedJabatan);
                        const isKades = curJ?.kategori_jabatan === 'Kepala Desa' ||
                          curJ?.nama_jabatan?.toLowerCase().includes('kepala desa') ||
                          curJ?.nama_jabatan?.toLowerCase().includes('kades');
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
                </div>

                {/* E-KTA Preview Card simulation */}
                <div className="p-3 bg-white rounded-lg border border-neutral-200 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded bg-[#064E3B] text-white flex items-center justify-center font-bold font-mono text-sm">
                      KTA
                    </div>
                    <div>
                      <div className="font-bold text-neutral-900 text-xs">
                        {namaLengkap ? `${gelarDepan ? gelarDepan + ' ' : ''}${namaLengkap}${gelarBelakang ? ', ' + gelarBelakang : ''}` : 'Nama Perangkat Desa'}
                      </div>
                      <div className="text-[11px] font-mono text-neutral-500">
                        No KTA: {projectedKta}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-neutral-400 block font-mono">STATUS KTA</span>
                    <span className="text-xs font-bold text-[#064E3B]">TERVALIDASI QR</span>
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-neutral-700 font-medium">
                      NIPD (28 Digit Sesuai Ketentuan)
                    </label>
                    <button
                      type="button"
                      onClick={() => setNiap(projectedNiap)}
                      className="text-[11px] font-mono text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2 py-0.5 rounded border border-emerald-200 transition-colors"
                    >
                      Generate 28-Digit NIPD
                    </button>
                  </div>
                  <input
                    type="text"
                    value={niap}
                    onChange={(e) => setNiap(e.target.value)}
                    placeholder={projectedNiap}
                    className="w-full px-3 py-2 border border-neutral-300 rounded-lg font-mono focus:outline-hidden focus:ring-1 focus:ring-emerald-700 text-xs"
                  />
                  <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-emerald-50/70 border border-emerald-200/80 px-2.5 py-1.5 text-[11px] font-mono">
                    <span className="text-neutral-600">Tampilan UI View:</span>
                    <strong className="text-emerald-900 tracking-wide">
                      {formatNIPDDisplay(niap.trim() || projectedNiap) || '-'}
                    </strong>
                  </div>
                  <span className="text-[10px] text-neutral-500 font-mono mt-1 block">
                    * 28 digit utuh tanpa spasi: 8 Lahir + 6 TMT + 1 JK + 2 Kode Unsur (01 Kades / 02 Perangkat / 03 Staf) + 1 Periode/Jabatan + 10 Wilayah.
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Footer Navigation & Submit Buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-neutral-200">
            <div className="flex items-center gap-2">
              {activeFormTab !== 'biodata' && (
                <button
                  type="button"
                  onClick={() => {
                    if (activeFormTab === 'organisasi') setActiveFormTab('riwayat');
                    else if (activeFormTab === 'riwayat') setActiveFormTab('biodata');
                  }}
                  className="px-3.5 py-2 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                >
                  <span>← Sebelumnya</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-medium text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
              >
                Batal
              </button>

              {activeFormTab === 'organisasi' ? (
                /* Di FormTab 3. Keanggotaan & E-KTA: tombol berubah menjadi "Simpan" */
                <button
                  type="button"
                  onClick={async () => {
                    // Validasi komprehensif & cek keunikan NIK ke database sebelum simpan
                    if (!nik || nik.length !== 16) {
                      setErrorMsg('NIK KTP harus terdiri dari tepat 16 digit angka.');
                      setActiveFormTab('biodata');
                      return;
                    }
                    const nikCheck = await verifyNikWithDatabase(nik);
                    if (!nikCheck.valid) {
                      setErrorMsg(
                        nikCheck.message ||
                          `NIK ${nik} sudah terdaftar di database. NIK wajib unik dan tidak boleh duplikat!`
                      );
                      setActiveFormTab('biodata');
                      return;
                    }
                    if (!namaLengkap.trim()) {
                      setErrorMsg('Nama lengkap perangkat desa wajib diisi.');
                      setActiveFormTab('biodata');
                      return;
                    }
                    if (!selectedDesa || !selectedJabatan) {
                      setErrorMsg('Desa Penempatan dan Jabatan SOTK wajib dipilih pada tab Riwayat.');
                      setActiveFormTab('riwayat');
                      return;
                    }
                    if (Number(selectedJabatan) === 10 && !['1', '2', '3'].includes(String(periode))) {
                      setErrorMsg('Periode jabatan Kepala Desa wajib dipilih (Periode Ke-1, Ke-2, atau Ke-3) pada tab Riwayat.');
                      setActiveFormTab('riwayat');
                      return;
                    }
                    setErrorMsg('');
                    setIsVerificationModalOpen(true);
                  }}
                  disabled={isSubmitting || nikCheckStatus === 'checking'}
                  className="px-6 py-2.5 text-xs font-bold text-white bg-[#064E3B] hover:bg-[#043d2e] disabled:opacity-60 disabled:cursor-wait rounded-lg transition-all cursor-pointer flex items-center gap-2 shadow-md"
                >
                  {isSubmitting || nikCheckStatus === 'checking' ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>
                        {nikCheckStatus === 'checking'
                          ? 'Memverifikasi NIK...'
                          : editMember
                          ? 'Menyimpan...'
                          : 'Memproses...'}
                      </span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>{editMember ? 'Simpan Perubahan' : 'Simpan Data Anggota'}</span>
                    </>
                  )}
                </button>
              ) : (
                /* Di FormTab 1 & 2: tombol adalah "Selanjutnya →" */
                <button
                  type="button"
                  disabled={activeFormTab === 'biodata' && nikCheckStatus === 'checking'}
                  onClick={async () => {
                    if (activeFormTab === 'biodata') {
                      if (!nik || nik.length !== 16) {
                        setErrorMsg('NIK KTP harus 16 digit angka.');
                        return;
                      }
                      const nikCheck = await verifyNikWithDatabase(nik);
                      if (!nikCheck.valid) {
                        setErrorMsg(
                          nikCheck.message ||
                            `NIK ${nik} sudah terdaftar di database. NIK wajib unik dan tidak boleh duplikat!`
                        );
                        return;
                      }
                      if (!namaLengkap.trim()) {
                        setErrorMsg('Nama lengkap perangkat desa wajib diisi.');
                        return;
                      }
                      setErrorMsg('');
                      setActiveFormTab('riwayat');
                    } else if (activeFormTab === 'riwayat') {
                      if (!selectedDesa) {
                        setErrorMsg('Silakan pilih Desa Penempatan.');
                        return;
                      }
                      if (!selectedJabatan) {
                        setErrorMsg('Silakan pilih Jabatan SOTK Desa.');
                        return;
                      }
                      if (Number(selectedJabatan) === 10 && !['1', '2', '3'].includes(String(periode))) {
                        setErrorMsg('Periode jabatan Kepala Desa wajib dipilih (Periode Ke-1, Ke-2, atau Ke-3).');
                        return;
                      }
                      setErrorMsg('');
                      setActiveFormTab('organisasi');
                    }
                  }}
                  className="px-5 py-2.5 text-xs font-bold text-white bg-[#064E3B] hover:bg-[#043d2e] disabled:opacity-60 disabled:cursor-wait rounded-lg transition-all cursor-pointer flex items-center gap-1.5 shadow-md"
                >
                  {activeFormTab === 'biodata' && nikCheckStatus === 'checking' ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Cek NIK...</span>
                    </>
                  ) : (
                    <>
                      <span>Selanjutnya</span>
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </form>
      </>
    )}
  </div>

  {/* Verification Summary Modal / Popup */}
  {isVerificationModalOpen && (
    <div className="fixed inset-0 z-60 bg-[#111113]/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col border border-[#111113]/20 overflow-hidden">
        <div className="px-6 py-4 bg-[#064E3B] text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-emerald-300" />
            <h3 className="text-sm font-bold uppercase tracking-wider">Verifikasi Rekap Isian Pendaftaran</h3>
          </div>
          <button
            onClick={() => setIsVerificationModalOpen(false)}
            className="text-white/80 hover:text-white p-1 rounded-lg cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4 text-xs font-mono">
          <p className="text-neutral-600 font-sans">
            Harap periksa kembali rekap isian di bawah ini dengan teliti sebelum disimpan atau diterbitkan secara resmi:
          </p>

          <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 space-y-2">
            <div className="font-bold text-[#064E3B] border-b pb-1">1. DATA PRIBADI & KEPENDUDUKAN</div>
            <div className="grid grid-cols-2 gap-2 text-neutral-800">
              <div>NIK: <strong className="font-mono">{nik}</strong></div>
              <div>NIPD: <strong>{formatNIPDDisplay(niap.trim() || projectedNiap) || '-'}</strong></div>
              <div className="col-span-2">Nama Lengkap: <strong>{gelarDepan ? gelarDepan + ' ' : ''}{namaLengkap}{gelarBelakang ? ', ' + gelarBelakang : ''}</strong></div>
              <div>TTL: {tempatLahir}, {formatDateIndo(tanggalLahir)}</div>
              <div>Jenis Kelamin: {jenisKelamin === 'L' ? 'Laki-laki' : 'Perempuan'}</div>
              <div>Agama: {agama}</div>
              <div>Pendidikan: {pendidikanTerakhir}</div>
              <div>No. HP/WA: {noHpWa}</div>
              <div>Email: {email || '-'}</div>
              <div className="col-span-2">Alamat: {alamatRumah || '-'}</div>
            </div>
          </div>

          <div className="p-3 bg-neutral-50 rounded-lg border border-neutral-200 space-y-2">
            <div className="font-bold text-[#064E3B] border-b pb-1">2. PENEMPATAN & JABATAN SOTK</div>
            <div className="grid grid-cols-2 gap-2 text-neutral-800">
              <div>Kecamatan: {kecamatanList.find(k => k.id_kecamatan === selectedKec)?.nama_kecamatan || '-'}</div>
              <div>Desa: {desaList.find(d => d.id_desa === selectedDesa)?.nama_desa || '-'}</div>
              <div className="col-span-2">Jabatan: {jabatanList.find(j => j.id_jabatan === selectedJabatan)?.nama_jabatan || '-'}</div>
              <div className="col-span-2">No. SK: {noSk || '-'}</div>
              <div>Tanggal SK: {formatDateIndo(tglSk)}</div>
              <div>TMT Jabatan: {formatDateIndo(tmtJabatan)}</div>
            </div>
          </div>

          <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 space-y-2">
            <div className="font-bold text-emerald-900 border-b border-emerald-300 pb-1">3. KEORGANISASIAN PPDI & KTA</div>
            <div className="grid grid-cols-2 gap-2 text-emerald-950">
              <div>Jabatan Pengurus: {jabatanPengurus}</div>
              <div>No. KTA: {projectedKta}</div>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-neutral-100 border-t border-neutral-200 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => setIsVerificationModalOpen(false)}
            className="px-4 py-2 text-xs font-semibold text-neutral-700 bg-white border border-neutral-300 hover:bg-neutral-50 rounded-lg transition-colors cursor-pointer"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={async () => {
              setIsVerificationModalOpen(false);
              const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
              await handleSubmit(fakeEvent);
            }}
            className="px-5 py-2 text-xs font-bold text-white bg-[#064E3B] hover:bg-[#043d2e] rounded-lg transition-all cursor-pointer shadow-md flex items-center gap-1.5"
          >
            <Save className="w-4 h-4" />
            <span>Simpan & Terbitkan</span>
          </button>
        </div>
      </div>
    </div>
  )}
</div>
)
};
