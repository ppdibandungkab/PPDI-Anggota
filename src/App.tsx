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
import { StatistikWilayahView } from './components/StatistikWilayahView';
import { LogAktivitasView } from './components/LogAktivitasView';
import { DatabaseStatusIndicator } from './components/DatabaseStatusIndicator';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { AnggotaFullDetail } from './types/ppdi';

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
  const [selectedKtaMemberId, setSelectedKtaMemberId] = useState<string>('');
  const [sidebarOpen, setSidebarOpen] = useState(false);


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
      } else if (search.includes('v=') || search.includes('token=')) {
        const params = new URLSearchParams(search);
        const token = params.get('v') || params.get('token');
        if (token) {
          setVerifyInitialQuery(token);
          setIsVerifyModalOpen(true);
        }
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

  if (!isAuthenticated) {
    return (
      <>
        <LoginForm onOpenPublicVerify={() => setIsRegistrationModalOpen(true)} />
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
      </>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F7F4] text-[#111113] flex flex-col font-sans relative selection:bg-[#FDE047] selection:text-[#064E3B]">
      {/* Background dot pattern */}
      <div className="bg-pattern fixed inset-0 pointer-events-none z-0 opacity-60" />

      {/* Top Header */}
      <Header
        onOpenAddModal={handleOpenAddModal}
        onOpenVerifyModal={() => handleOpenVerifyModalWithQuery()}
        onOpenDbModal={() => setIsDbModalOpen(true)}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
      />

      {/* Main Body Layout: Sidebar + Main Stage */}
      <div className="relative z-10 flex-1 max-w-7xl w-full mx-auto flex flex-col md:flex-row">
        {/* Navigation Sidebar */}
        <div className="no-print relative">
          <Sidebar
            onOpenVerifyModal={() => handleOpenVerifyModalWithQuery()}
            isOpen={sidebarOpen}
            setIsOpen={setSidebarOpen}
          />
        </div>

        {/* Content Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 min-w-0">
          {activeTab === 'dashboard' && <DashboardView />}
          {activeTab === 'pendaftaran' && (
            <PendaftaranApprovalView onOpenPublicForm={() => setIsRegistrationModalOpen(true)} />
          )}
          {activeTab === 'anggota' && (
            <AnggotaListView
              onOpenAddModal={handleOpenAddModal}
              onOpenDetailModal={handleOpenDetailModal}
              onOpenEditModal={handleOpenEditModal}
              onSelectForKTA={handleSelectForKTA}
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
          {activeTab === 'iuran' && <IuranView />}
          {activeTab === 'log-aktivitas' && <LogAktivitasView />}
          {(activeTab === 'settings' || activeTab === 'settings-app') && <AppSettingsView />}
          {activeTab === 'settings-user' && <UserSettingsView />}
          {activeTab === 'settings-role' && <RoleManagementView />}
          {activeTab === 'settings-db' && <DbSettingsView />}
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

      {/* Real-Time Database & Backend Diagnostic Status Indicator */}
      <DatabaseStatusIndicator
        onOpenDbModal={() => setIsDbModalOpen(true)}
        pollIntervalMs={12000}
      />

      {/* Modal Popup Ganti Password Akun - Posisi Ditengah (Otomatis Aktif jika User Menggunakan Password Default PPDIJaya2026) */}
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
