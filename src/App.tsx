import React, { useState } from 'react';
import { PPDIProvider, usePPDI } from './context/PPDIContext';
import { PublicRegistrationForm } from './components/PublicRegistrationForm';
import { LoginForm } from './components/LoginForm';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { AnggotaListView } from './components/AnggotaListView';
import { EKTAView } from './components/EKTAView';
import { RetirementAlertView } from './components/RetirementAlertView';
import { ArsipSKView } from './components/ArsipSKView';
import { IuranView } from './components/IuranView';
import { SqlSchemaView } from './components/SqlSchemaView';
import { UserSettingsView } from './components/UserSettingsView';
import { RoleManagementView } from './components/RoleManagementView';
import { AppSettingsView } from './components/AppSettingsView';
import { PendaftaranApprovalView } from './components/PendaftaranApprovalView';
import { AnggotaFormModal } from './components/AnggotaFormModal';
import { AnggotaDetailModal } from './components/AnggotaDetailModal';
import { PublicVerifyModal } from './components/PublicVerifyModal';
import { DbConnectionModal } from './components/DbConnectionModal';
import { DbSettingsView } from './components/DbSettingsView';
import { TelemetrySettingsView } from './components/TelemetrySettingsView';
import { WhatsAppSettingsView } from './components/WhatsAppSettingsView';
import { StatistikWilayahView } from './components/StatistikWilayahView';
import { LogAktivitasView } from './components/LogAktivitasView';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { PustakaRegulasiView } from './components/PustakaRegulasiView';
import { PublicRegulasiModal } from './components/PublicRegulasiModal';
import { AnggotaFullDetail, RegulasiItem } from './types/ppdi';

const MainAppContent: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    isAuthenticated,
    isDbModalOpen,
    setIsDbModalOpen,
    dbStatus,
    isCheckingDb,
    checkDbStatus,
    currentUser,
    isChangePasswordModalOpen,
    closeChangePasswordModal,
    mustChangeDefaultPassword,
  } = usePPDI();

  // Modal states
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isRegistrationModalOpen, setIsRegistrationModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<AnggotaFullDetail | null>(null);
  const [detailMember, setDetailMember] = useState<AnggotaFullDetail | null>(null);
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState(false);
  const [verifyInitialQuery, setVerifyInitialQuery] = useState('');
  const [isPublicRegulasiOpen, setIsPublicRegulasiOpen] = useState(false);
  const [publicRegulasiInitialItem, setPublicRegulasiInitialItem] = useState<RegulasiItem | null>(null);
  const [selectedKtaMemberId, setSelectedKtaMemberId] = useState<string>('');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isSidebarPinned, setIsSidebarPinned] = useState(false);


  // Auto-detect if visitor opened a short URL (/v/:token) or verification link
  React.useEffect(() => {
    if (typeof window !== 'undefined') {
      const pathname = window.location.pathname;
      const search = window.location.search;
      if (pathname.includes('/v/')) {
        const token = pathname.split('/v/')[1]?.split('?')[0]?.split('#')[0];
        if (token) {
          setVerifyInitialQuery(token);
          setIsVerifyModalOpen(true);
        }
      } else if (
        search.includes('v=') ||
        search.includes('token=') ||
        search.includes('verify=') ||
        search.includes('id_anggota=')
      ) {
        const params = new URLSearchParams(search);
        const token = params.get('v') || params.get('token') || params.get('id_anggota');
        if (token) {
          setVerifyInitialQuery(token);
        }
        if (token || params.get('verify')) {
          setIsVerifyModalOpen(true);
        }
      } else if (pathname.includes('/regulasi') || search.includes('regulasi=')) {
        setIsPublicRegulasiOpen(true);
      }
    }
  }, []);

  const handleOpenAddModal = () => {
    setEditingMember(null);
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (member: AnggotaFullDetail) => {
    setEditingMember(member);
    setIsAddModalOpen(true);
  };

  const handleOpenDetailModal = (member: AnggotaFullDetail) => {
    setDetailMember(member);
  };

  const handleSelectForKTA = (member: AnggotaFullDetail) => {
    setSelectedKtaMemberId(member.anggota.id_anggota);
    setActiveTab('ekta');
  };

  const handleOpenVerifyModalWithQuery = (query?: string) => {
    if (query) setVerifyInitialQuery(query);
    setIsVerifyModalOpen(true);
  };

  // Close topmost active App-level modal when pressing Escape
  React.useEffect(() => {
    const handleGlobalEsc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (isChangePasswordModalOpen && !mustChangeDefaultPassword) {
        e.preventDefault();
        closeChangePasswordModal();
      } else if (isVerifyModalOpen) {
        e.preventDefault();
        setIsVerifyModalOpen(false);
      } else if (isPublicRegulasiOpen) {
        e.preventDefault();
        setIsPublicRegulasiOpen(false);
        setPublicRegulasiInitialItem(null);
      } else if (isDbModalOpen) {
        e.preventDefault();
        setIsDbModalOpen(false);
      } else if (detailMember) {
        e.preventDefault();
        setDetailMember(null);
      } else if (isAddModalOpen) {
        e.preventDefault();
        setIsAddModalOpen(false);
        setEditingMember(null);
      } else if (isRegistrationModalOpen) {
        e.preventDefault();
        setIsRegistrationModalOpen(false);
      }
    };

    window.addEventListener('keydown', handleGlobalEsc);
    return () => window.removeEventListener('keydown', handleGlobalEsc);
  }, [
    isChangePasswordModalOpen,
    mustChangeDefaultPassword,
    closeChangePasswordModal,
    isVerifyModalOpen,
    isPublicRegulasiOpen,
    isDbModalOpen,
    detailMember,
    isAddModalOpen,
    isRegistrationModalOpen,
  ]);

  if (!isAuthenticated) {
    return (
      <>
        <LoginForm
          onOpenPublicVerify={() => setIsRegistrationModalOpen(true)}
          onOpenPublicRegulasi={(initialItem) => {
            setPublicRegulasiInitialItem(initialItem || null);
            setIsPublicRegulasiOpen(true);
          }}
        />
        <PublicRegistrationForm
          isOpen={isRegistrationModalOpen}
          onClose={() => setIsRegistrationModalOpen(false)}
        />
        <DbConnectionModal
          isOpen={isDbModalOpen}
          onClose={() => setIsDbModalOpen(false)}
        />
        <PublicVerifyModal
          isOpen={isVerifyModalOpen}
          onClose={() => setIsVerifyModalOpen(false)}
          initialQuery={verifyInitialQuery}
        />
        <PublicRegulasiModal
          isOpen={isPublicRegulasiOpen}
          onClose={() => {
            setIsPublicRegulasiOpen(false);
            setPublicRegulasiInitialItem(null);
          }}
          initialItem={publicRegulasiInitialItem}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F7F4] text-[#111113] flex flex-col font-sans relative selection:bg-[#FDE047] selection:text-[#064E3B]">
      {/* Background dot pattern */}
      <div className="bg-pattern fixed inset-0 pointer-events-none z-0 opacity-60 no-print" />

      {/* Top Header */}
      <Header
        onOpenAddModal={handleOpenAddModal}
        onOpenVerifyModal={() => handleOpenVerifyModalWithQuery()}
        onOpenDbModal={() => setIsDbModalOpen(true)}
        onSelectMemberProfile={handleOpenDetailModal}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />

      {/* Main Body Layout: Sidebar + Main Stage */}
      <div className={`relative z-10 flex-1 max-w-7xl w-full mx-auto flex flex-col md:flex-row print:max-w-none ${detailMember ? 'no-print' : ''}`}>
        {/* Navigation Sidebar */}
        <div className="no-print relative">
          <Sidebar
            onOpenVerifyModal={() => handleOpenVerifyModalWithQuery()}
            isOpen={sidebarOpen}
            setIsOpen={setSidebarOpen}
            isPinned={isSidebarPinned}
            setIsPinned={setIsSidebarPinned}
          />
        </div>

        {/* Content Viewport */}
        <main className={`flex-1 p-3 sm:p-6 lg:p-8 min-w-0 overflow-x-hidden print:p-0 print:overflow-visible ${!isSidebarPinned ? 'md:pl-9 print:pl-0' : ''}`}>
          {activeTab === 'dashboard' && <DashboardView onOpenAddModal={handleOpenAddModal} />}
          {activeTab === 'pendaftaran' && (
            <PendaftaranApprovalView onOpenPublicForm={() => setIsRegistrationModalOpen(true)} />
          )}
          {activeTab === 'anggota' && (
            <AnggotaListView
              onOpenAddModal={handleOpenAddModal}
              onOpenDetailModal={handleOpenDetailModal}
              onOpenEditModal={handleOpenEditModal}
              onSelectForKTA={handleSelectForKTA}
              hasExternalModalOpen={
                isAddModalOpen ||
                Boolean(detailMember) ||
                isVerifyModalOpen ||
                isDbModalOpen ||
                isRegistrationModalOpen ||
                isChangePasswordModalOpen
              }
            />
          )}
          {activeTab === 'ekta' && (
            <EKTAView
              selectedMemberId={selectedKtaMemberId}
              onOpenVerifyModal={handleOpenVerifyModalWithQuery}
            />
          )}
          {activeTab === 'pensiun' && (
            <RetirementAlertView onOpenDetailModal={handleOpenDetailModal} />
          )}
          {activeTab === 'arsip' && <ArsipSKView />}
          {activeTab === 'regulasi' && <PustakaRegulasiView />}
          {activeTab === 'iuran' && <IuranView />}
          {activeTab === 'log-aktivitas' && <LogAktivitasView />}
          {(activeTab === 'settings' || activeTab === 'settings-app') && <AppSettingsView />}
          {activeTab === 'settings-user' && <UserSettingsView />}
          {activeTab === 'settings-role' && <RoleManagementView />}
          {activeTab === 'settings-db' && <DbSettingsView />}
          {activeTab === 'settings-whatsapp' && <WhatsAppSettingsView />}
          {activeTab === 'settings-telemetry' && (
            <TelemetrySettingsView
              onOpenDbModal={() => setIsDbModalOpen(true)}
              onNavigateDbSettings={() => setActiveTab('settings-db')}
              pollIntervalMs={12000}
            />
          )}
          {activeTab === 'skema' && <SqlSchemaView />}
          {activeTab === 'statistik-wilayah' && <StatistikWilayahView />}
        </main>
      </div>

      {/* Public Registration Form Modal (Accessible while logged in as well) */}
      <PublicRegistrationForm
        isOpen={isRegistrationModalOpen}
        onClose={() => setIsRegistrationModalOpen(false)}
      />

      {/* Add / Edit Member Modal */}
      <AnggotaFormModal
        isOpen={isAddModalOpen}
        onClose={() => {
          setIsAddModalOpen(false);
          setEditingMember(null);
        }}
        editMember={editingMember}
      />

      {/* Detail Profile Drawer / Modal */}
      <AnggotaDetailModal
        member={detailMember}
        isOpen={Boolean(detailMember)}
        onClose={() => setDetailMember(null)}
        onSelectForKTA={handleSelectForKTA}
      />

      {/* Database Connection & MySQL Status Modal */}
      <DbConnectionModal
        isOpen={isDbModalOpen}
        onClose={() => setIsDbModalOpen(false)}
      />

      {/* Public KTA Verification Modal & QR Scan Result */}
      <PublicVerifyModal
        isOpen={isVerifyModalOpen}
        onClose={() => setIsVerifyModalOpen(false)}
        initialQuery={verifyInitialQuery}
      />

      {/* Modal Popup Ganti Password Akun - Posisi Ditengah (Otomatis Aktif jika User Menggunakan Password Default) */}
      <ChangePasswordModal
        isOpen={isChangePasswordModalOpen}
        onClose={closeChangePasswordModal}
        targetUser={currentUser}
        requireOldPassword={true}
        isDefaultPasswordMandatory={mustChangeDefaultPassword}
      />
    </div>
  );
};

export default function App() {
  return (
    <PPDIProvider>
      <MainAppContent />
    </PPDIProvider>
  );
}
